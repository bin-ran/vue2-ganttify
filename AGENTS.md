# AGENTS.md — Agent 交接文档

> 本文档面向接手本项目的 AI Agent / 新开发者。读完即可独立开展工作和回归验证。
> 最后更新：2026-09-07，对应提交 `6c392fa`（main，未推送远端）。

## 1. 项目定位

**DHTMLX Gantt 社区版(MIT) × ElementUI el-table × Vue 2.6.14 甘特图组件库**。
本仓库既是可运行的 demo，也是 npm 包本体：`dhtmlx-gantt-vue2@0.1.0`（private），
消费方通过 tarball 安装，只依赖 peer：`vue@2.6.14` / `element-ui@2.15.14` / `dhtmlx-gantt@^10.0.0`。

⚠️ 版本红线：dhtmlx-gantt 必须 **≥10.0**（10.0 起 GPLv2 → MIT，社区版才可商用）。
⚠️ 用户项目是 Vue **2.6.14**，禁止引入 Vue3-only 特性。

## 2. 目录结构

```
src/
  components/GanttChart.vue   # 核心组件：时间轴 + el-table 双栏、分割条拖拽、滚动同步、
                              # fields/tableData/columns 数据契约、编辑弹窗联动
  components/TaskDialog.vue   # 新增/编辑任务弹窗（替代 dhtmlx 自带灯箱）
  index.js                    # install + 具名导出（lib 入口）
  App.vue / data.js / main.js # demo 外壳与示例数据
scripts/
  verify.js                   # demo 回归脚本（对齐/内容/拖拽/留白/滚动同步断言）
  consumer-generic-verify.js  # 消费工程回归脚本（自定义列/字段映射/外部行）
  README.md                   # 如何搭建运行环境（puppeteer-core + Chrome）
README.md                     # 面向使用方的组件文档（API 完整）
lib/ dist/                    # 构建产物（gitignore）
```

## 3. 架构核心决策（不要轻易推翻）

1. **gantt 实例是唯一数据源**：左侧表格由 `gantt.serialize()` 派生（`rebuildTable()`）；
   传入 `tableData` 时行序/附加字段由外部提供、日期/进度以 gantt 为权威合并，
   变更后 emit `table-data-change` 全量回传（`_lastRowsKey` JSON 指纹去重防循环）。
2. **三层通用数据契约**（组件不绑定任何业务字段名）：
   - `fields`：使用方字段名 → 语义字段（id/text/startDate/endDate/duration/progress/parent）映射
   - `tableData`：外部表格行
   - `columns`：列配置；内置 key `text/start/end/duration/progress/ops` 保留专门渲染，
     任意列可用作用域插槽 `#col-<key>` 覆盖
3. **依赖线与里程碑已整体移除**（用户明确要求）：数据格式仅 `{ data: Task[] }`，
   字段映射无 `type`，`drag_links=false`/`show_links=false` 显式关闭。
4. **时间轴范围自管**（`ensureTimeRange()`）：默认范围贴数据边界会"顶住"拖拽，
   扩到 [最早任务月初, 最晚任务月末+2 个月]，只外扩不收缩；
   自管时必须关 `fit_tasks`（否则每次数据变化缩回数据边界）；
   使用方经 `ganttOptions` 显式给 `start_date`/`end_date` 时不接管。
5. **多实例**：`Gantt.getGanttInstance()` 每组件实例独立实例，`beforeDestroy` 调 `destructor()`。
6. **灯箱拦截**：`onBeforeLightbox` 一律 return false，编辑统一走 el-dialog（quick_info 插件不能开）。

## 4. API 速览（详见 README.md）

- Props：`tasks`(必填) `fields` `tableData` `columns` `rowHeight=36` `barHeight=20`
  `scaleHeight=48` `skin='material'` `zoom='day'` `tableWidth=.sync` `readonly` `ganttOptions`
- 事件：`gantt-event`(`{type,message,data}`) `table-data-change`(全量合并行)
  `update:tableWidth`
- 方法(refs)：`getSnapshot()` `getInstance()`
- 插槽：`toolbar-extra` + 任意列 `#col-<key>="{ row }"`

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
# 起静态服务（http-server），跑完 taskkill 清理
cd <dist目录> && npx --yes http-server -p 8129 -c-1 -s &
node verify.js                    # demo，端口 8129，exit 2=失败
node consumer-generic-verify.js   # 消费工程，端口 8130
```

**纪律：任何改动交付前必须跑通上述两条验证链（构建零报错 + 断言全 PASS + 控制台零错误）。**

## 6. 踩坑清单（全部实测，改代码前先读）

1. `templates.*` 必须在 `gantt.init()` **之前**赋值，否则被捕获为默认值
2. `addTaskLayer` 是逐任务回调（返回 DOM），不是传容器
3. el-table td 必须 `box-sizing: border-box`，否则 36px 行高逐行漂移；表头高度对齐 `scale_height`
4. 双向滚动同步必须加 50ms `_scrollLock`：dhtmlx `scrollTo` 过程中会发出"过期中间值"的
   onGanttScroll 事件，不加锁两边乒乓
5. ElementUI 树形表格 `expand-change` 第二参是**布尔**（普通展开行表格才是数组）
6. Vue2 中 el-table-column 内放**多个** `<template slot-scope>` + v-if/v-else-if 链，
   只有第一个生效（其余分支不注册）→ 表格全空白；必须**单个** slot-scope 模板 + 内部 v-if 链
7. 改配置类需求要写**显式值**而不是删配置行（`drag_links` 默认 true，删行≠关闭）
8. `fit_tasks=true` 会在每次数据变化后把时间轴范围缩回任务数据边界，自管范围时必须关掉
9. puppeteer 断言必须查**单元格文本**，只查行数/几何会漏检"全空白"类回归

## 7. 协作约定（用户明确要求）

- **git 只提交不推送**：任何远端同步操作（push/PR/force push）一律禁止，提醒用户自行执行
- **不要自动提交**：改动完成后正常交付（构建+验证+汇报），用户说"提交"才 `git commit`
- 提交信息：中文 Conventional Commits（feat/fix/refactor/...），按工作项拆分提交，
  每个提交独立可构建
- 交流用中文；先给结论再给细节；不确定就说不确定
- 不可逆操作（删除/重置/覆盖）先确认

## 8. Git 历史（main，均未推送）

```
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

- 工作区干净，全部已提交；远端未推送
- 已验证能力：树形表格双向联动、拖拽改期/工期/进度、双击编辑（el-dialog）、
  分割条拖拽、双向滚动同步、季/月/日缩放、今日高亮、周末底色、深色主题、
  fields 映射、外部 tableData、columns 自定义列 + 作用域插槽
- 已移除：依赖线（含工具栏开关）、里程碑
- scripts/ 下两个验证脚本的运行时副本在 D:/tmp/gantt-verify（含 puppeteer-core 依赖），
  D:/tmp/lib-consumer 为消费工程——**两者都在临时目录，丢失时按 scripts/README.md 重建**，
  脚本本体以本仓库 scripts/ 为准
