/**
 * 标准 Vue CLI 项目验证（ganttify-vue-app，Vue 2.6.14 + npm 源安装 vue2-ganttify）
 * 断言：表头/行数(5)/平铺、操作列(编辑/删除)、双击→本页编辑弹窗、删除流(确认+行数变化)、
 *       工具栏新增弹窗、控制台零报错
 */
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const REPO_PKG = require('D:/pi/vue2-ganttify/package.json')
const PKG_VERSION = require('D:/tmp/ganttify-vue-app/node_modules/vue2-ganttify/package.json').version
const CHROME = process.env.CHROME_PATH ||
  ['C:/Program Files/Google/Chrome/Application/chrome.exe',
   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
   process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe'
  ].find((p) => p && fs.existsSync(p))

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new', args: ['--window-size=1680,900'], protocolTimeout: 120000
  })
  const page = await browser.newPage()
  const errors = []
  const logs = []
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 150)))
  page.on('console', (m) => { logs.push(m.text()); if (m.type() === 'error') errors.push(m.text().slice(0, 150)) })
  await page.setViewport({ width: 1600, height: 800 })
  await page.goto('http://127.0.0.1:8132', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await new Promise((r) => setTimeout(r, 3000))

  const m = await page.evaluate(() => {
    const vm = document.querySelector('.gantt-wrapper').__vue__
    const g = vm.gantt
    const heads = [...document.querySelectorAll('.gantt_grid_head_cell')].map((c) => c.textContent.trim())
    const rows = [...document.querySelectorAll('.gantt_grid_data .gantt_row')]
    const rowTexts = rows.map((r) => r.textContent.trim())
    const barTexts = [...document.querySelectorAll('.gantt_task_line')].map((b) => b.textContent.trim())
    const toolbarBtns = [...document.querySelectorAll('.gantt-toolbar button')].map((b) => b.textContent.trim())
    const zoomBtns = [...document.querySelectorAll('.gantt-toolbar .el-radio-button')].map((b) => b.textContent.trim())
    return {
      toolbarBtns, zoomBtns,
      heads, rows: rows.length, rowTexts, engineCount: g ? g.getTaskCount() : 0,
      treeIcons: document.querySelectorAll('.gantt_tree_icon').length,
      barTexts
    }
  })
  console.log(JSON.stringify({ heads: m.heads, rows: m.rows, engineCount: m.engineCount, treeIcons: m.treeIcons }, null, 2))

  const okVer = PKG_VERSION === REPO_PKG.version // 与仓库版本联动，不再硬编码
  const okHeader = m.heads.join('|') === '任务名称|开始|结束|操作'
  const okRows = m.rows === 5 && m.engineCount === 5
  const okFlat = m.treeIcons === 0
  const okCells = m.rowTexts.every((t) => t.includes('2026-09-')) // 业务列含开始日期
  // 缩放切换器两种合法形态：隐藏（zoomLevels=[]）或配置子集（如 月|日）；无内置深色/导出按钮
  const zoomMode = m.zoomBtns.join('|')
  const okToolbar = !m.toolbarBtns.some((t) => t.includes('深色') || t.includes('JSON')) &&
    (zoomMode === '' || zoomMode === '月|日' || zoomMode === '季|月|日')
  const okBarText = m.barTexts.length > 0 && m.barTexts.every((t) => t.includes(' · ')) &&
    m.barTexts.every((t) => !t.includes('undefined')) // barText 函数形态：名称 · 负责人，且无 undefined

  // ---- 交互流 ----
  const flow = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    const dlgTitle = () => {
      const w = document.querySelector('.el-dialog__wrapper')
      return w && w.style.display !== 'none' ? (document.querySelector('.el-dialog__title') || {}).textContent || '' : null
    }
    const closeDlg = () => {
      const c = [...document.querySelectorAll('.el-dialog__footer button')].find((b) => b.textContent.includes('取'))
      if (c) c.click()
    }
    const freshRow = () => document.querySelector('.gantt_grid_data .gantt_row')
    const out = {}

    // 1) 双击行 → 上层编辑弹窗
    freshRow().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await wait(400)
    out.dblTitle = dlgTitle()
    closeDlg(); await wait(400)

    // 2) 操作列“编辑” → 弹窗
    const editBtn = [...freshRow().querySelectorAll('[data-ops-action]')].find((b) => b.textContent.trim() === '编辑')
    if (editBtn) { editBtn.click(); await wait(400); out.editTitle = dlgTitle(); closeDlg(); await wait(400) }

    // 3) 操作列“删除” → 确认框 → 确认 → 行数 4
    const delBtn = [...freshRow().querySelectorAll('[data-ops-action]')].find((b) => b.textContent.trim() === '删除')
    if (delBtn) {
      delBtn.click(); await wait(400)
      out.confirmSeen = !!document.querySelector('.el-message-box')
      const ok = [...document.querySelectorAll('.el-message-box__btns button')].find((b) => b.textContent.includes('确'))
      if (ok) ok.click(); await wait(500)
      out.rowsAfterDelete = document.querySelectorAll('.gantt_grid_data .gantt_row').length
    }

    // 4) 工具栏“新增” → 弹窗 → 取消
    const addBtn = [...document.querySelectorAll('.gantt-toolbar button')].find((b) => b.textContent.includes('新增'))
    if (addBtn) { addBtn.click(); await wait(400); out.addTitle = dlgTitle(); closeDlg(); await wait(300) }
    return out
  })
  console.log('flow:', JSON.stringify(flow))
  const logsTxt = logs.join('\n')

  const okDbl = flow.dblTitle === '编辑任务'
  const okEdit = flow.editTitle === '编辑任务'
  const okDel = flow.confirmSeen === true && flow.rowsAfterDelete === 4 // 删除提示在页脚 DOM（last.type=delete）
  const okAdd = flow.addTitle === '新增任务'

  console.log(`包版本: ${okVer ? 'PASS' : 'FAIL'}(${PKG_VERSION}) | 表头: ${okHeader ? 'PASS' : 'FAIL'} | 行数5: ${okRows ? 'PASS' : 'FAIL'} | 平铺: ${okFlat ? 'PASS' : 'FAIL'} | 内容: ${okCells ? 'PASS' : 'FAIL'} | 任务条文字: ${okBarText ? 'PASS' : 'FAIL'} | 工具栏: ${okToolbar ? 'PASS' : 'FAIL'}(${m.zoomBtns.join('/')})`)
  console.log(`双击弹窗: ${okDbl ? 'PASS' : 'FAIL'} | 编辑动作: ${okEdit ? 'PASS' : 'FAIL'} | 删除流: ${okDel ? 'PASS' : 'FAIL'} | 新增弹窗: ${okAdd ? 'PASS' : 'FAIL'}`)

  if (!okVer || !okHeader || !okRows || !okFlat || !okCells || !okBarText || !okToolbar || !okDbl || !okEdit || !okDel || !okAdd || errors.length) {
    console.log('== 页面错误 ==\n' + (errors.join('\n') || 'none'))
    process.exit(2)
  }
  console.log('== 页面错误 ==\nnone')
  await browser.close()
  process.exit(0)
})().catch((e) => { console.error(e); process.exit(1) })
