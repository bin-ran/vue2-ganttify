/**
 * 消费工程回归验证（dhtmlx 原生 grid 版）
 * 断言：自定义列（无"工期"有"负责人"）、8 行、自定义字段列(format)渲染、
 *       字段映射日期、任务条数量、控制台零报错
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
  const logs = []
  page.on('console', (m) => { logs.push(m.text()); if (m.type() === 'error') errors.push(m.text()) })
  await page.setViewport({ width: 1600, height: 800 })
  await page.goto('http://127.0.0.1:8130', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await new Promise((r) => setTimeout(r, 2500))

  const m = await page.evaluate(() => {
    const heads = [...document.querySelectorAll('.gantt_grid_head_cell')].map((c) => c.textContent.trim())
    const rows = [...document.querySelectorAll('.gantt_grid_data .gantt_row')]
    const rowTexts = rows.map((r) => r.textContent.trim())
    const ownerCells = rows.map((r) => {
      const cells = r.querySelectorAll('.gantt_cell')
      return cells[1] ? cells[1].textContent.trim() : ''
    })
    const barDates = [...document.querySelectorAll('.gantt_task_line')].map((b) => b.getAttribute('aria-label') || '')
    return {
      heads, rows: rows.length, ownerCells, rowTexts, bars: barDates.length,
      firstBarText: (barDates.find((t) => t.includes('一期')) || '').slice(0, 60)
    }
  })
  console.log(JSON.stringify({ heads: m.heads, rows: m.rows, ownerCells: m.ownerCells, rowTexts: m.rowTexts, bars: m.bars }, null, 2))

  // ---- 操作列：自定义按钮渲染 + handler 触发（含透传字段）+ 内置编辑弹窗 ----
  const opsProbe = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    // 点击会触发 grid 重渲染，必须每次重新查询节点（旧节点已脱离 DOM）
    const freshRow = () => document.querySelector('.gantt_grid_data .gantt_row')
    const byText = (t) => [...freshRow().querySelectorAll('[data-ops-action]')].find((b) => b.textContent.trim() === t)
    const detail = byText('详情')
    if (detail) detail.click()
    await wait(300)
    const edit = byText('编辑')
    let editTitle = null
    if (edit) {
      edit.click(); await wait(400)
      const w = document.querySelector('.el-dialog__wrapper')
      editTitle = w && w.style.display !== 'none' ? (document.querySelector('.el-dialog__title') || {}).textContent || '' : null
      const c = [...document.querySelectorAll('.el-dialog__footer button')].find((b) => b.textContent.includes('取'))
      if (c) c.click(); await wait(300)
    }
    const btns = [...freshRow().querySelectorAll('[data-ops-action]')].map((b) => b.textContent.trim())
    return { btns, editTitle }
  })
  const okOpsLog = logs.some((t) => t.includes('[consumer] 详情') && t.includes('owner='))
  const okOps = okOpsLog && opsProbe.editTitle === '编辑任务' && opsProbe.btns.join('|') === '编辑|详情'
  console.log(`操作列: ${okOps ? 'PASS' : 'FAIL'} | ${JSON.stringify(opsProbe)} | handler日志: ${okOpsLog ? 'PASS' : 'FAIL'}`)

  const okHeader = m.heads.join('|') === '任务名称|负责人|开始|结束|操作' // 自定义列（无工期、无进度）
  const okRows = m.rows === 8
  const okBars = m.bars >= 6
  const okOwner = m.ownerCells.filter((t) => t).length >= 8 // 自定义字段经透传进引擎
  const okDate = m.firstBarText.includes('2026-09-01')
  const okCells = m.rowTexts.length === 8 && m.rowTexts.every((t) => t.includes('2026-09-'))
  console.log(`表头(自定义列): ${okHeader ? 'PASS' : 'FAIL'} | 行数8: ${okRows ? 'PASS' : 'FAIL'} | 任务条: ${okBars ? 'PASS' : 'FAIL'} | 自定义字段列(owner): ${okOwner ? 'PASS' : 'FAIL'} | 字段映射日期: ${okDate ? 'PASS' : 'FAIL'} | 内容: ${okCells ? 'PASS' : 'FAIL'}`)

  if (!okHeader || !okRows || !okBars || !okOwner || !okDate || !okCells || !okOps || errors.length) {
    console.log('== 页面错误 ==\n' + (errors.join('\n') || 'none'))
    process.exit(2)
  }
  console.log('== 页面错误 ==\nnone')
  await browser.close()
  process.exit(0)
})().catch((e) => { console.error(e); process.exit(1) })
