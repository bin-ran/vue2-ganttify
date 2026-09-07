/* 甘特图集成验证 v2：
   1) 对齐度量（表头/行高/主体起始位置）
   2) 分割条拖拽
   3) 滚动同步（table->gantt 与 gantt->table 双向，经 __vue__ 拿到 gantt 实例）
   4) 错误捕获带堆栈定位 */
const puppeteer = require('puppeteer-core')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const URL = process.env.TARGET_URL || 'http://127.0.0.1:8129/'

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1600,900']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 900 })
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const loc = msg.location()
      errors.push(`[console.error] ${msg.text()} @ ${loc.url}:${loc.lineNumber}`)
    }
  })
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.stack || e.message}`))

  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 })
  await page.waitForSelector('.gantt_task_line', { timeout: 15000 })
  await new Promise((r) => setTimeout(r, 500)) // 等 expand-change/restore 完成，看错误是否复现

  // ---- 1) 对齐度量 ----
  const m = await page.evaluate(() => {
    const r = (el) => (el ? el.getBoundingClientRect() : null)
    const th = document.querySelector('.gantt-table .el-table th')
    const rows = [...document.querySelectorAll('.gantt-table .el-table__row')]
    const scale = document.querySelector('.gantt_task_scale')
    const bodyWrapper = document.querySelector('.gantt-table .el-table__body-wrapper')
    const dataArea = document.querySelector('.gantt_data_area')
    const pitches = []
    for (let i = 1; i < Math.min(rows.length, 5); i++) {
      pitches.push(Math.round((rows[i].getBoundingClientRect().top - rows[i - 1].getBoundingClientRect().top) * 100) / 100)
    }
    // 单元格内容断言（防止插槽分支失效导致整表空白）
    const cellText = [...document.querySelectorAll('.gantt-table .el-table__row')]
      .map((tr) => tr.textContent.trim())
    return {
      tableHeaderH: r(th) && Math.round(r(th).height * 100) / 100,
      ganttScaleH: r(scale) && Math.round(r(scale).height * 100) / 100,
      tableRowH: rows[0] && Math.round(r(rows[0]).height * 100) / 100,
      tableRowPitches: pitches,
      tableBodyTop: r(bodyWrapper) && Math.round(r(bodyWrapper).top * 100) / 100,
      ganttDataTop: r(dataArea) && Math.round(r(dataArea).top * 100) / 100,
      rowsRendered: rows.length,
      cellText
    }
  })
  console.log('== 对齐度量 ==', JSON.stringify(m))
  const okHeader = Math.abs(m.tableHeaderH - m.ganttScaleH) < 0.5
  const okRow = Math.abs(m.tableRowH - 36) < 0.5 && m.tableRowPitches.every((p) => Math.abs(p - 36) < 0.5)
  const okPaneTop = Math.abs((m.tableBodyTop - m.tableHeaderH) - (m.ganttDataTop - m.ganttScaleH)) < 1.5
  const okCells = m.cellText.length === 8 &&
    m.cellText.some((t) => t.includes('一期：核心功能')) &&
    m.cellText.some((t) => t.includes('需求调研')) &&
    m.cellText.some((t) => t.includes('2026-09-01')) &&
    m.cellText.some((t) => t.includes('编辑'))
  console.log(`表头对齐: ${okHeader ? 'PASS' : 'FAIL'} | 行高36: ${okRow ? 'PASS' : 'FAIL'} | 主体起始: ${okPaneTop ? 'PASS' : 'FAIL'} | 单元格内容: ${okCells ? 'PASS' : 'FAIL'}`)

  // ---- 2) 分割条拖拽 ----
  const drag = await (async () => {
    const handle = await page.$('.gantt-resizer')
    const box = await handle.boundingBox()
    const grab = { x: box.x + box.width / 2, y: box.y + 300 }
    const before = await page.evaluate(() => ({
      tableW: document.querySelector('.gantt-table').getBoundingClientRect().width,
      timelineW: document.querySelector('.gantt-timeline').getBoundingClientRect().width
    }))
    await page.mouse.move(grab.x, grab.y)
    await page.mouse.down()
    await page.mouse.move(grab.x + 150, grab.y, { steps: 10 })
    await page.mouse.up()
    await new Promise((r) => setTimeout(r, 300))
    const after = await page.evaluate(() => ({
      tableW: document.querySelector('.gantt-table').getBoundingClientRect().width,
      timelineW: document.querySelector('.gantt-timeline').getBoundingClientRect().width
    }))
    return { before, after }
  })()
  const okDrag = Math.abs(drag.after.tableW - drag.before.tableW - 150) < 2 &&
    Math.abs(drag.after.timelineW - drag.before.timelineW + 150) < 2
  console.log(`== 分割条拖拽 == ${JSON.stringify(drag)} -> ${okDrag ? 'PASS' : 'FAIL'}`)

  // ---- 2.5) 依赖线已移除：悬停任务条不应出现连接点/连线手势 ----
  const linkProbe = await (async () => {
    const bar = await page.$('.gantt_task_line')
    await bar.hover()
    await new Promise((r) => setTimeout(r, 300))
    const pts = await page.evaluate(() => ({
      points: document.querySelectorAll('.gantt_link_point').length,
      lines: document.querySelectorAll('.gantt_task_link').length
    }))
    await page.mouse.move(10, 300) // 移开鼠标
    return pts
  })()
  const okNoLinks = linkProbe.points === 0 && linkProbe.lines === 0
  console.log(`== 依赖线残留检查 == ${JSON.stringify(linkProbe)} -> ${okNoLinks ? 'PASS' : 'FAIL'}`)

  // ---- 2.6) 时间轴留白：范围应超出任务数据边界（数据最晚 09-23），能滚到 10 月 ----
  const range = await page.evaluate(() => {
    const vm = document.getElementById('app').__vue__.$children.find((c) => c.gantt)
    const g = vm.gantt
    const f = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
    g.scrollTo(99999, g.getScrollState().y) // 滚到最右
    const cells = [...document.querySelectorAll('.gantt_scale_cell')].map((c) => c.textContent)
    const months = cells.filter((t) => /年\d+月/.test(t))
    return { start: f(g.config.start_date), end: f(g.config.end_date), lastMonth: months[months.length - 1] || '' }
  })
  const okRange = range.end >= '2026-10-25' && range.lastMonth.includes('2026年10月')
  console.log(`== 时间轴留白 == ${JSON.stringify(range)} -> ${okRange ? 'PASS' : 'FAIL'}`)

  // ---- 3) 滚动同步：缩到 480 高迫使表格可滚 ----
  // 契约：任意时刻两侧滚动位置一致（各自可能被钳位，但必须相等）
  await page.setViewport({ width: 1600, height: 480 })
  await new Promise((r) => setTimeout(r, 600)) // 等 el-table doLayout / gantt watcher 重排
  const scroll = await page.evaluate(async () => {
    const vm = document.getElementById('app').__vue__.$children.find((c) => c.gantt)
    const g = vm.gantt
    const w = document.querySelector('.gantt-table .el-table__body-wrapper')
    const out = { tableScrollable: w.scrollHeight > w.clientHeight }
    if (!out.tableScrollable) return out

    // table -> gantt：设 72 会被钳位到表格最大行程，gantt 应跟随同一位置
    w.scrollTop = 72
    await new Promise((r) => setTimeout(r, 250))
    out.step1 = { tableTop: w.scrollTop, ganttY: g.getScrollState().y }

    // gantt -> table：反向设一个中间值
    g.scrollTo(g.getScrollState().x, 3)
    await new Promise((r) => setTimeout(r, 250))
    out.step2 = { ganttY: g.getScrollState().y, tableTop: w.scrollTop }

    // 归零
    w.scrollTop = 0
    await new Promise((r) => setTimeout(r, 250))
    out.step3 = { tableTop: w.scrollTop, ganttY: g.getScrollState().y }
    return out
  })
  const s1ok = scroll.step1 && Math.abs(scroll.step1.tableTop - scroll.step1.ganttY) < 2 && scroll.step1.tableTop > 0
  const s2ok = scroll.step2 && Math.abs(scroll.step2.tableTop - scroll.step2.ganttY) < 2
  const s3ok = scroll.step3 && Math.abs(scroll.step3.tableTop - scroll.step3.ganttY) < 2 && scroll.step3.tableTop === 0
  console.log(`== 滚动同步 == ${JSON.stringify(scroll)} -> table→gantt: ${s1ok ? 'PASS' : 'FAIL'} | gantt→table: ${s2ok ? 'PASS' : 'FAIL'} | 归零: ${s3ok ? 'PASS' : 'FAIL'}`)

  await page.setViewport({ width: 1600, height: 900 })
  await new Promise((r) => setTimeout(r, 500))
  await page.screenshot({ path: 'D:/tmp/gantt-verify/shot.png' })

  console.log('== 页面错误(含堆栈) ==')
  console.log(errors.length ? errors.join('\n---\n') : 'none')
  await browser.close()

  const okScroll = s1ok && s2ok && s3ok
  if (!okHeader || !okRow || !okPaneTop || !okCells || !okDrag || !okScroll || !okNoLinks || !okRange) process.exit(2)
})().catch((e) => { console.error('FATAL', e); process.exit(1) })
