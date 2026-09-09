/**
 * 消费工程回归验证（最小契约版）：
 * 数据无 id（内部用行下标）、平铺（无 fields.parent）、fields 只有起止时间；
 * 断言：自定义列（任务名称/负责人/操作）、8 行、平铺无树形箭头、
 *       操作列自定义动作 handler（透传字段可读）、双击事件、任务条、控制台零报错
 */
const puppeteer = require('puppeteer-core')
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new', args: ['--window-size=1680,900']
  })
  const page = await browser.newPage()
  const errors = []
  const logs = []
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e)))
  page.on('console', (m) => { logs.push(m.text()); if (m.type() === 'error') errors.push(m.text()) })
  await page.setViewport({ width: 1600, height: 800 })
  await page.goto('http://127.0.0.1:8130', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await new Promise((r) => setTimeout(r, 2500))

  const m = await page.evaluate(() => {
    const engineCount = document.querySelector('.gantt-wrapper').__vue__.gantt.getTaskCount()
    const heads = [...document.querySelectorAll('.gantt_grid_head_cell')].map((c) => c.textContent.trim())
    const rows = [...document.querySelectorAll('.gantt_grid_data .gantt_row')]
    const rowTexts = rows.map((r) => r.textContent.trim())
    const ownerCells = rows.map((r) => {
      const cells = r.querySelectorAll('.gantt_cell')
      return cells[1] ? cells[1].textContent.trim() : ''
    })
    const barDates = [...document.querySelectorAll('.gantt_task_line')].map((b) => b.getAttribute('aria-label') || '')
    return {
      heads, rows: rows.length, ownerCells, rowTexts, bars: barDates.length, engineCount,
      treeIcons: document.querySelectorAll('.gantt_tree_icon').length,
      firstBarText: (barDates[0] || '').slice(0, 60)
    }
  })
  console.log(JSON.stringify({ heads: m.heads, rows: m.rows, ownerCells: m.ownerCells, bars: m.bars, treeIcons: m.treeIcons }, null, 2))

  const okHeader = m.heads.join('|') === '任务名称|负责人|操作'
  const okRows = m.rows === 8
  const okFlat = m.treeIcons === 0 // 无 fields.parent → 平铺无展开箭头
  const okBars = m.engineCount === 8 && m.bars >= 5 // 任务条按视口渲染（smart rendering），引擎计数须为 8
  const okOwner = m.ownerCells.filter((t) => t).length >= 8
  const okDate = m.firstBarText.includes('2026-09-01')

  // ---- 操作列：自定义动作 handler（透传字段可读）+ 双击事件 ----
  const opsProbe = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    // 点击会触发 grid 重渲染，每次必须重新查询节点（旧节点已脱离 DOM）
    const freshRow = () => document.querySelector('.gantt_grid_data .gantt_row')
    const byText = (t) => [...freshRow().querySelectorAll('[data-ops-action]')].find((b) => b.textContent.trim() === t)
    const btns = [...freshRow().querySelectorAll('[data-ops-action]')].map((b) => b.textContent.trim())
    const assign = byText('指派')
    if (assign) assign.click()
    await wait(300)
    // 双击行 → 组件 emit task-dblclick → 上层（本页只打印）
    const rowEl = document.querySelector('.gantt_grid_data .gantt_row')
    rowEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await wait(300)
    return { btns }
  })
  const okAssign = logs.some((t) => t.includes('[consumer] 指派') && t.includes('owner'))
  const okDbl = logs.some((t) => t.includes('[consumer] task-dblclick') && t.includes('begin'))
  const okOps = opsProbe.btns.join('|') === '指派|延期一天'
  console.log(`操作列: ${okOps ? 'PASS' : 'FAIL'} | ${JSON.stringify(opsProbe)} | handler(含透传字段): ${okAssign ? 'PASS' : 'FAIL'} | 双击事件: ${okDbl ? 'PASS' : 'FAIL'}`)

  const owners = ['张三', '李四', '王五', '赵六']
  const okCells = m.rowTexts.length === 8 && m.rowTexts.every((t) => owners.some((o) => t.includes(o)))
  console.log(`表头(自定义列): ${okHeader ? 'PASS' : 'FAIL'} | 行数8: ${okRows ? 'PASS' : 'FAIL'} | 平铺: ${okFlat ? 'PASS' : 'FAIL'} | 任务条: ${okBars ? 'PASS' : 'FAIL'} | 负责人列: ${okOwner ? 'PASS' : 'FAIL'} | 起止日期: ${okDate ? 'PASS' : 'FAIL'} | 内容: ${okCells ? 'PASS' : 'FAIL'}`)

  if (!okHeader || !okRows || !okFlat || !okBars || !okOwner || !okDate || !okCells || !okOps || !okAssign || !okDbl || errors.length) {
    console.log('== 页面错误 ==\n' + (errors.join('\n') || 'none'))
    process.exit(2)
  }
  console.log('== 页面错误 ==\nnone')
  await browser.close()
  process.exit(0)
})().catch((e) => { console.error(e); process.exit(1) })
