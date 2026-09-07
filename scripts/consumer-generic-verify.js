/* 干净消费工程验证（通用数据契约版）：
   fields 字段映射 + 外部 tableData + 自定义 columns + 作用域插槽 */
const puppeteer = require('puppeteer-core')
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1600,900']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 900 })
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

  await page.goto(process.env.TARGET_URL || 'http://127.0.0.1:8130/', { waitUntil: 'networkidle0', timeout: 30000 })
  await page.waitForSelector('.gantt_task_line', { timeout: 15000 })
  await new Promise((r) => setTimeout(r, 600))

  const m = await page.evaluate(() => {
    const headers = [...document.querySelectorAll('.gantt-table .el-table th')].map((th) => th.textContent.trim())
    const rows = document.querySelectorAll('.gantt-table .el-table__row').length
    const bars = document.querySelectorAll('.gantt_task_line').length
    const rowTexts = [...document.querySelectorAll('.gantt-table .el-table__row')].map((tr) => tr.textContent.trim())
    const ownerCells = [...document.querySelectorAll('.gantt-table .el-table__row')].map(
      (tr) => { const c = tr.querySelectorAll('.el-table__cell')[1]; return c ? c.textContent.trim() : '' }
    )
    const barDates = [...document.querySelectorAll('.gantt_task_line')].map((b) => b.getAttribute('aria-label') || '')
    return {
      headers,
      rows,
      bars,
      ownerCells,
      rowTexts,
      firstBarText: (barDates.find((t) => t.includes('一期')) || '').slice(0, 60),
      tableW: Math.round(document.querySelector('.gantt-table').getBoundingClientRect().width)
    }
  })
  console.log('== 通用数据契约检查 ==')
  console.log(JSON.stringify(m, null, 2))

  const okHeader = m.headers.includes('任务名称') && m.headers.includes('负责人') && !m.headers.includes('工期')
  const okRows = m.rows === 8
  const okBars = m.bars >= 6
  const okOwner = m.ownerCells.filter((t) => t).length >= 8
  const okDate = m.firstBarText.includes('2026-09-01') // 字段映射后日期正确
  const okCells = m.rowTexts.length === 8 &&
    m.rowTexts.every((t) => t.includes('2026-09-')) && // 每行日期列有内容（非插槽分支也生效）
    m.rowTexts.some((t) => t.includes('2026-09-23')) && // 里程碑行
    m.rowTexts.every((t) => t.includes('编辑'))         // 操作列有内容
  console.log(`表头(自定义列): ${okHeader ? 'PASS' : 'FAIL'} | 行数8: ${okRows ? 'PASS' : 'FAIL'} | 任务条: ${okBars ? 'PASS' : 'FAIL'} | 外部行字段(owner): ${okOwner ? 'PASS' : 'FAIL'} | 字段映射日期: ${okDate ? 'PASS' : 'FAIL'} | 全列内容: ${okCells ? 'PASS' : 'FAIL'}`)

  await page.screenshot({ path: 'D:/tmp/gantt-verify/consumer-generic-shot.png' })
  console.log('== 页面错误 ==')
  console.log(errors.length ? errors.join('\n') : 'none')
  await browser.close()
  if (!okHeader || !okRows || !okBars || !okOwner || !okDate || !okCells || errors.length) process.exit(2)
})().catch((e) => { console.error('FATAL', e); process.exit(1) })
