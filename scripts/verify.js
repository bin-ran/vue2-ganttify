/**
 * demo 回归验证（辅助组件版：原生 grid + 自定义 actions + 上层接管编辑）
 * 断言：grid 表头/行数/树形箭头、操作列(本页自定义动作)、双击事件→本页编辑弹窗、
 *       删除确认、自绘分割条拖拽、无依赖线残留、时间轴留白、grid↔timeline 纵向同步、控制台零报错
 * 用法：先起静态服务（dist → 8129），node verify.js；失败 exit 2
 */
const puppeteer = require('puppeteer-core')
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new', args: ['--window-size=1680,900']
  })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await page.setViewport({ width: 1600, height: 800 })
  await page.goto('http://127.0.0.1:8129', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await new Promise((r) => setTimeout(r, 2500))

  // ---- 1) grid 结构与内容 ----
  const m = await page.evaluate(() => {
    const vm = document.querySelector('.gantt-wrapper').__vue__
    const g = vm.gantt
    const heads = [...document.querySelectorAll('.gantt_grid_head_cell')].map((c) => c.textContent.trim())
    const rows = document.querySelectorAll('.gantt_grid_data .gantt_row')
    const rowTexts = [...rows].map((r) => r.textContent.trim())
    const f = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
    return {
      heads, rowTexts, taskCount: g ? g.getTaskCount() : null,
      treeIcons: document.querySelectorAll('.gantt_tree_icon').length,
      range: g && g.config.start_date ? { start: f(g.config.start_date), end: f(g.config.end_date) } : null
    }
  })
  const okHeader = m.heads.join('|') === '任务名称|开始|结束|操作'
  const okRows = m.rowTexts.length === 7
  const okTree = m.treeIcons > 0 // demo 配了 fields.parent → 树形
  const okCells = m.rowTexts.some((t) => t.includes('一期：核心功能')) &&
    m.rowTexts.some((t) => t.includes('需求调研')) &&
    m.rowTexts.some((t) => t.includes('2026-09-01'))
  console.log(`表头: ${okHeader ? 'PASS' : 'FAIL'} | 行数7: ${okRows ? 'PASS' : 'FAIL'} | 树形: ${okTree ? 'PASS' : 'FAIL'} | 单元格内容: ${okCells ? 'PASS' : 'FAIL'} | ${JSON.stringify(m.heads)}`)

  // ---- 2) 操作列（本页自定义动作）+ 双击事件 → 本页编辑弹窗 ----
  const opsProbe = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    const freshRow = () => document.querySelector('.gantt_grid_data .gantt_row')
    // 点击会触发 grid 重渲染，每次必须重新查询节点（旧节点已脱离 DOM）
    const byText = (t) => [...freshRow().querySelectorAll('[data-ops-action]')].find((b) => b.textContent.trim() === t)
    const btns = [...freshRow().querySelectorAll('[data-ops-action]')].map((b) => b.textContent.trim())
    const dlgTitle = () => {
      const w = document.querySelector('.el-dialog__wrapper')
      return w && w.style.display !== 'none' ? (document.querySelector('.el-dialog__title') || {}).textContent || '' : null
    }
    const close = () => {
      const c = [...document.querySelectorAll('.el-dialog__footer button')].find((b) => b.textContent.includes('取'))
      if (c) c.click()
    }
    // 编辑（actions → 本页弹窗）
    let editTitle = null
    const eb = byText('编辑')
    if (eb) { eb.click(); await wait(400); editTitle = dlgTitle(); close(); await wait(400) }
    // 加子任务（actions → 本页弹窗，带上级名）
    let appendTitle = null
    const ab = byText('加子任务')
    if (ab) { ab.click(); await wait(400); appendTitle = dlgTitle(); close(); await wait(400) }
    // 删除（actions → 本页确认框）
    let confirmSeen = false
    const db = byText('删除')
    if (db) {
      db.click(); await wait(400)
      confirmSeen = !!document.querySelector('.el-message-box')
      const cc = document.querySelector('.el-message-box__btns button')
      if (cc) cc.click(); await wait(300)
    }
    // 双击任务条 → 组件 emit task-dblclick → 本页弹窗
    const bar = document.querySelector('.gantt_task_line')
    bar.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await wait(400)
    const dblTitle = dlgTitle()
    close(); await wait(300)
    return { btns, editTitle, appendTitle, confirmSeen, dblTitle }
  })
  const okOps = opsProbe.btns.join('|') === '编辑|加子任务|删除' &&
    opsProbe.editTitle === '编辑任务' && (opsProbe.appendTitle || '').includes('新增任务') &&
    opsProbe.confirmSeen && opsProbe.dblTitle === '编辑任务'
  console.log(`== 操作列/双击 == ${JSON.stringify(opsProbe)} -> ${okOps ? 'PASS' : 'FAIL'}`)

  // ---- 3) 自绘分割条拖拽：grid 宽度变化 ----
  const drag = await (async () => {
    const before = await page.evaluate(() => ({
      gridW: Math.round(document.querySelector('.gantt_grid').getBoundingClientRect().width),
      resizerX: Math.round(document.querySelector('.grid-resizer').getBoundingClientRect().x)
    }))
    await page.mouse.move(before.resizerX, 300)
    await page.mouse.down()
    await page.mouse.move(before.resizerX + 150, 300, { steps: 10 })
    await page.mouse.up()
    await new Promise((r) => setTimeout(r, 300))
    const after = await page.evaluate(() => ({
      gridW: Math.round(document.querySelector('.gantt_grid').getBoundingClientRect().width)
    }))
    return { before, after }
  })()
  const okDrag = drag.after.gridW - drag.before.gridW >= 100
  console.log(`== 分割条拖拽 == ${JSON.stringify(drag)} -> ${okDrag ? 'PASS' : 'FAIL'}`)

  // ---- 4) 依赖线已移除：悬停任务条无连接点/连线 ----
  const linkProbe = await (async () => {
    const bar = await page.$('.gantt_task_line')
    await bar.hover()
    await new Promise((r) => setTimeout(r, 300))
    const pts = await page.evaluate(() => ({
      points: document.querySelectorAll('.gantt_link_point').length,
      lines: document.querySelectorAll('.gantt_task_link').length
    }))
    await page.mouse.move(10, 300)
    return pts
  })()
  const okNoLinks = linkProbe.points === 0 && linkProbe.lines === 0
  console.log(`== 依赖线残留检查 == ${JSON.stringify(linkProbe)} -> ${okNoLinks ? 'PASS' : 'FAIL'}`)

  // ---- 5) 时间轴留白：能滚到数据边界之外（数据最晚 09-23）----
  const range = await page.evaluate(() => {
    const g = document.querySelector('.gantt-wrapper').__vue__.gantt
    g.scrollTo(99999, g.getScrollState().y)
    const cells = [...document.querySelectorAll('.gantt_scale_cell')].map((c) => c.textContent)
    const months = cells.filter((t) => /年\d+月/.test(t))
    const f = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
    return { start: f(g.config.start_date), end: f(g.config.end_date), lastMonth: months[months.length - 1] || '' }
  })
  const okRange = range.end >= '2026-10-25' && range.lastMonth.includes('2026年10月')
  console.log(`== 时间轴留白 == ${JSON.stringify(range)} -> ${okRange ? 'PASS' : 'FAIL'}`)

  // ---- 6) 纵向同步（原生共享滚动条）：缩矮视口迫使内容可滚 ----
  await page.setViewport({ width: 1600, height: 340 })
  await new Promise((r) => setTimeout(r, 600))
  const scroll = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    const g = document.querySelector('.gantt-wrapper').__vue__.gantt
    const snap = () => {
      const gr = document.querySelector('.gantt_grid_data .gantt_row')
      const tr = document.querySelector('.gantt_task_bg .gantt_task_row')
      return {
        gridTop: gr ? Math.round(gr.getBoundingClientRect().top * 100) / 100 : null,
        taskTop: tr ? Math.round(tr.getBoundingClientRect().top * 100) / 100 : null
      }
    }
    const base = snap()
    g.scrollTo(0, 30); await wait(250)
    const step1 = snap()
    g.scrollTo(0, 0); await wait(250)
    const step2 = snap()
    return { base, step1, step2 }
  })
  const align = (s) => s.gridTop != null && s.taskTop != null && Math.abs(s.gridTop - s.taskTop) < 2
  const okScroll = align(scroll.base) && align(scroll.step1) && align(scroll.step2) &&
    scroll.step1.gridTop < scroll.base.gridTop
  console.log(`== 纵向同步 == ${JSON.stringify(scroll)} -> ${okScroll ? 'PASS' : 'FAIL'}`)

  // ---- 截图存档 ----
  await page.screenshot({ path: 'D:/tmp/gantt-verify/shot.png' })

  if (!okHeader || !okRows || !okTree || !okCells || !okOps || !okDrag || !okNoLinks || !okRange || !okScroll || errors.length) {
    console.log('== 页面错误 ==\n' + (errors.join('\n') || 'none'))
    process.exit(2)
  }
  console.log('== 页面错误 ==\nnone')
  await browser.close()
  process.exit(0)
})().catch((e) => { console.error(e); process.exit(1) })
