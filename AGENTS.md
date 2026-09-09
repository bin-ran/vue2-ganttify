# AGENTS.md — Agent 交接文档

> 本文档面向接手本项目的 AI Agent / 新开发者。读完即可独立开展工作和回归验证。
> 最后更新：2026-09-07（改版：左侧表格回归 dhtmlx 原生 grid）。

## 1. 项目定位

**Vue 2.6 时间可视化辅助组件**（底层 DHTMLX Gantt 社区版 MIT × Vue 2.6.14）。
组件是**辅助工具**：业务数据只要有开始/结束时间即可挂甘特视图；名称、进度、层级、
操作、编辑 UI 全部由上层定义。
本仓库既是可运行的 demo，也是 npm 包本体：`dhtmlx-gantt-vue2@0.1.0`（private），
消费方通过 tarball 安装，只依赖 peer：`vue@2.6.14` / `element-ui@2.15.14`（仅工具栏与弹窗）/
`dhtmlx-gantt@^10.0.0`。

⚠️ 版本红线：dhtmlx-gantt 必须 **≥10.0**（10.0 起 GPLv2 → MIT，社区版才可商用）。
⚠️ 用户项目是 Vue **2.6.14**，禁止引入 Vue3-only 特性。

## 2. 目录结构

```
src/
  components/GanttChart.vue   # 核心组件：dhtmlx 原生 grid+timeline 布局、自绘分割条、
                              # fields/columns 数据契约、时间轴留白、el-dialog 编辑联动
  components/TaskDialog.vue   # 新增/编辑任务弹窗（替代 dhtmlx 自带灯箱）
  index.js                    # install + 具名导出（lib 入口）
  App.vue / data.js / main.js # demo 外壳与示例数据
scripts/
  verify.js                   # demo 回归脚本（grid 内容/分割条拖拽/无依赖线/留白/纵向同步）
  consumer-generic-verify.js  # 消费工程回归脚本（自定义列/字段映射/自定义字段透传）
  README.md                   # 如何搭建运行环境（puppeteer-core + Chrome）
README.md                     # 面向使用方的组件文档（API 完整）
lib/ dist/                    # 构建产物（gitignore）
```

## 3. 架构核心决策（不要轻易推翻）

1. **左侧表格就是 dhtmlx 原生 grid**（用户明确要求，已废弃 el-table 混合方案）：
   `gantt.config.layout` 为 grid + timeline 双视图共享 `scrollVer/scrollHor` 滚动条，
   不存在第二份数据、不需要滚动同步与行高对齐。gantt 实例是唯一数据源。
2. **数据契约（稳定契约，最小必填）**：
   - `tasks` 收**业务行数组**（不是 dhtmlx 的 {data,links} 包装）
   - `fields`：必填只有 `startDate`/`endDate`（结束含当天，内部换算 duration）；
     可选 `id`（缺省=行下标+1，业务 id 为空/0 降级）、`text`（tooltip/aria 显示名，
     缺省 tooltip 显示起止日期）、`parent`（不传=平铺无箭头）、`progress`（0~1，不传无进度段）
   - 映射之外的业务字段**透传**进引擎（引擎保留字段
     id/start_date/end_date/duration/parent/progress/type 除外）
   - `columns`：不传只显示开始/结束两列；key 直接用业务字段名；内置便捷 key 仅
     start/end；`format(task)` = 原生 template；`ganttOptions.columns` 完全接管
   - **操作列 actions 全部由上层定义**：`{text, handler(row, task)}`，组件不内置动作；
     按钮经**事件委托**（容器 click + `gantt.locate(e)`）触发
3. **编辑 UI 完全由上层实现**：内置 el-dialog 已移除（TaskDialog.vue 已删除）；
   双击行/条 → emit `task-dblclick(row, task)`；键盘 Delete 默认拦截
   （删除只能走 `removeTask(row)` 代理方法，`_allowDelete` 标记放行）；
   dhtmlx 灯箱始终拦截。数据更新两条路：代理方法 updateTask/addTask/removeTask
   （不触发整表重载）或替换 tasks 数组引用（重载）。
4. **依赖线与里程碑已整体移除**：`drag_links=false`/`show_links=false` 显式关闭
   （默认 true，删配置行≠关闭）；fields 无 type/parent 等预设语义。
4. **分割条是自绘的**：layout 的 `resizer` 视图是 **PRO 功能**（社区版报
   `getPrevSibling is not a function`）。自绘 div 绝对定位在 grid 右缘，
   拖动时 `config.grid_width = w; gantt.setSizes()`；grid 实际宽度以 DOM 实测为准
   （会被列宽总和顶住），v10 没有 `setGridWidth/getGridWidth` 实例方法。
5. **时间轴范围自管**（`ensureTimeRange()`）：默认范围贴数据边界会"顶住"拖拽，
   扩到 [最早任务月初, 最晚任务月末+2 个月]，只外扩不收缩；
   自管时必须关 `fit_tasks`（否则每次数据变化缩回数据边界）；
   使用方经 `ganttOptions` 显式给 `start_date`/`end_date` 时不接管。
6. **多实例**：`Gantt.getGanttInstance()` 每组件实例独立实例，`beforeDestroy` 调 `destructor()`。
7. **灯箱拦截**：`onBeforeLightbox` 一律 return false，编辑统一走 el-dialog（quick_info 插件不能开）；
   删除确认走 `onBeforeTaskDelete` 拦截 + `_delConfirm` 标记模式（ElMessageBox 异步）。

## 4. API 速览（详见 README.md）

- Props：`tasks`(业务行数组, 必填) `fields` `columns` `rowHeight=36` `barHeight=20`
  `scaleHeight=48` `skin='material'` `zoom='day'` `tableWidth=220`(.sync) `readonly` `ganttOptions`
- 事件（具名）：`task-click(row,task)` `task-dblclick(row,task)`
  `task-drag({type,row,task,startDate,endDate})` `update:tableWidth`
- 方法(refs)：`getSnapshot()` `getInstance()` `addTask(row)` `updateTask(row)` `removeTask(row)`
- 插槽：`toolbar-extra`

## 5. 构建与验证流程（每次改动的标准闭环）

```bash
# demo 构建（产出 dist/）
npm run build
# 组件库构建（产出 lib/*.common/umd/umd.min + css）
npm run build:lib
# 打 tarball
npm pack   # → dhtmlx-gantt-vue2-0.1.0.tgz
```

消费工程验证（D:/tmp/lib-consumer，webpack5+vue-loader15 干净工程）：

```bash
# ⚠️ 关键坑：file:/tarball 内容变了 npm install 不会重新解包，必须手动：
rm -rf node_modules/dhtmlx-gantt-vue2
mkdir -p node_modules/dhtmlx-gantt-vue2
tar -xzf /d/pi/dhtmlx-gantt-vue2-demo/dhtmlx-gantt-vue2-0.1.0.tgz \
    -C node_modules/dhtmlx-gantt-vue2 --strip-components=1
npm run build
```

puppeteer 回归（环境搭建见 scripts/README.md）：

```bash
# 起静态服务（python http.server 比 npx http-server 快且稳），跑完 taskkill 清理
python -m http.server 8129 --bind 127.0.0.1 --directory "D:/pi/dhtmlx-gantt-vue2-demo/dist" &
python -m http.server 8130 --bind 127.0.0.1 --directory "D:/tmp/lib-consumer/dist" &
node verify.js                    # demo，端口 8129，exit 2=失败
node consumer-generic-verify.js   # 消费工程，端口 8130
```

**纪律：任何改动交付前必须跑通上述两条验证链（构建零报错 + 断言全 PASS + 控制台零错误）。**

调试技巧：组件 mounted 里有 try/catch（初始化失败打 `[GanttChart] 初始化失败` + 堆栈），
但生产构建堆栈是压缩过的——排查 dhtmlx 内部错误用 `npm run serve`（dev 构建，可读堆栈）。

## 6. 踩坑清单（全部实测，改代码前先读）

1. `templates.*` 必须在 `gantt.init()` **之前**赋值，否则被捕获为默认值
2. **layout 的 `resizer` 视图是 PRO 功能**：社区版直接抛
   `getPrevSibling is not a function`（`_legacyGridResizerClass`），用自绘分割条替代
3. **v10 没有 `setGridWidth/getGridWidth` 实例方法**：改 `config.grid_width` + `setSizes()`；
   grid 实际渲染宽度会被**列宽总和**顶住，取宽度用 DOM 实测
4. **改配置要写显式值而不是删配置行**：`drag_links` 默认 true，删行≠关闭
5. **`fit_tasks=true` 会在每次数据变化后把时间轴范围缩回数据边界**，自管范围时必须关掉
6. **`addTaskLayer` 是逐任务回调**（返回 DOM），不是传容器
7. puppeteer 断言必须查**单元格文本**，只查行数/几何会漏检"全空白"类回归
8. 排查 dhtmlx 内部报错用 dev server（`npm run serve`），生产构建堆栈是压缩的；
   Vue 组件里的错误走 console.error 而非 pageerror，监听要分开
9. 临时目录起静态服务用 `python -m http.server`（npx http-server 冷启动慢且后台进程易被杀）；
   杀端口用 `taskkill //PID <pid> //T //F`（netstat 的 PID 可能是子进程）
10. **grid 点击会触发重渲染（selectTask）**：puppeteer 里点过一次后，之前捕获的行/按钮节点
   已脱离 DOM，再 `.click()` 派发在游离节点上永远到不了容器监听器——每次点击前必须
   重新查询节点（verify 脚本里的 `freshRow()` 模式）
11. **内部 id 不能为 0**：dhtmlx 以 parent=0 表示根节点，id=0 的任务会形成自身父子环
   （parse 报 Cyclic reference、页面挂死）。行下标 id 必须 +1；业务 id 为空/0 时降级
12. **映射源字段会被消耗成引擎字段**（如 begin → start_date+duration）：
   业务字段若与引擎保留字段撞名（start_date/end_date/duration/...）不透传；
   业务列想显示原始值就用业务字段名做 column key（透传后可用）

## 7. 协作约定（用户明确要求）

- **git 只提交不推送**：任何远端同步操作（push/PR/force push）一律禁止，提醒用户自行执行
- **不要自动提交**：改动完成后正常交付（构建+验证+汇报），用户说"提交"才 `git commit`
- 提交信息：中文 Conventional Commits（feat/fix/refactor/...），按工作项拆分提交，
  每个提交独立可构建
- 交流用中文；先给结论再给细节；不确定就说不确定
- 不可逆操作（删除/重置/覆盖）先确认

## 8. Git 历史（main，均未推送）

```
1885bfc refactor: 定位改为时间可视化辅助组件，数据契约最小化一次到位
3517f60 refactor: 左侧表格回归 dhtmlx 原生 grid，移除 el-table 混合方案
b3dde17 docs: 补充 Agent 交接文档（AGENTS.md）
a3f5456 test: 收编 puppeteer 回归脚本入仓并补环境重建指引
6c392fa refactor: 移除里程碑概念
feab1f9 feat: 时间轴两侧留白，修复拖到数据边界被顶住
2616554 fix: 显式关闭依赖线拖拽——dhtmlx 默认 drag_links=true，删除配置行不生效
9a89ae5 refactor: 移除依赖线能力及工具栏开关
87674ee fix: 修复表格单元格全部空白——Vue2 同名多个 slot-scope 模板仅首个生效
4a77b06 feat: 数据契约通用化——fields 字段映射、外部 tableData、columns 列配置
2128e33 feat: 封装为可复用组件库(lib 构建 + npm 包)，补充组件级 props/方法/插槽
26d04f9 feat: 表格/时间轴分割条可拖拽；修复行高不对齐与滚动同步乒乓
7e3fbb5 feat: 左侧任务表格替换为 ElementUI el-table，el-dialog 替代自带灯箱
9c1f073 feat: DHTMLX Gantt 社区版(MIT) × Vue 2.6.14 集成示例
```

## 9. 当前状态与待办

- 已完成（辅助组件改版）：tasks 收业务行数组；fields 瘦身（必填仅起止，id/text/parent/progress
  可选）；内置 el-dialog 移除（TaskDialog 删除）、双击/操作列全事件化；
  actions 全部上层定义；事件拆具名；键盘 Delete 默认拦截
- 已验证能力：树形展开/收起、行点击/双击联动、拖拽改期/工期/进度、双击编辑（el-dialog）、
  自绘分割条拖宽、季/月/日缩放、今日高亮、周末底色、深色主题、按住空白平移、
  fields 映射、自定义字段透传、columns 自定义列、时间轴留白
- 待办：本改版尚未提交（等用户指示）；README/AGENTS/scripts 文档已同步新架构
- scripts/ 下两个验证脚本的运行时副本在 D:/tmp/gantt-verify（含 puppeteer-core 依赖），
  D:/tmp/lib-consumer 为消费工程——**两者都在临时目录，丢失时按 scripts/README.md 重建**，
  脚本本体以本仓库 scripts/ 为准（注意：仓库内副本需与临时目录运行版保持同步）
