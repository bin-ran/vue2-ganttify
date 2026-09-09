# DHTMLX Gantt（社区版 MIT）× Vue 2.6.14 甘特图组件

基于 **`dhtmlx-gantt@10`**（社区版，MIT 协议可商用）封装的 Vue 2.6 组件：左侧为 dhtmlx **原生 grid 表格**（树形展开/收起、行选中），右侧时间轴支持拖拽改期/工期/进度，编辑弹窗用 `el-dialog + el-form` 替代 dhtmlx 自带灯箱。组件不绑定业务字段名（`fields` 映射），列可配置（`columns`）。

本仓库同时是一个**可安装的组件库包**（见下方「组件库使用」），`src/` 即库源码，演示页与库共用同一份组件。

## 运行

环境要求：Node >= 14（Vue CLI 5 官方要求 `^12.0.0 || >= 14.0.0`，Node 16/18/20/22/24 均实测可用）。

```bash
npm install
npm run serve   # 开发：http://localhost:8090
npm run build   # 构建
```

依赖：`vue@2.6.14` + `element-ui@2.15.14`（工具栏/弹窗用）+ `dhtmlx-gantt@^10`。

## 演示功能（全部为社区版免费能力）

- 左侧原生 grid：树形展开/收起、行点击/双击联动、列随 `columns` 配置
- **grid/时间轴分割条可拖拽**调整宽度（社区版 resizer 视图不可用，为自绘实现；双击恢复默认）
- 双击任务条 → el-dialog 表单（el-date-picker / el-slider，带校验），删除确认用 ElMessageBox
- 时间轴季/月/日缩放、周末底色、今日列高亮、深色主题切换
- 按住空白时间轴拖动平移；grid 与 timeline 由 dhtmlx 原生布局共享滚动条（天然同步）
- 事件全部转发到父组件，`getSnapshot()` 输出全量 JSON 对接后端

## 架构说明

**gantt 实例是唯一数据源**：grid 与 timeline 都是 gantt 自己的视图，不存在第二份数据；
所有变更（拖拽、弹窗编辑、删除）先落在 gantt 身上，事件转发给父组件，
`getSnapshot()` 随时可取全量数据。

```
tasks prop（经 fields 映射归一化）──parse──▶ gantt 实例（grid + timeline 视图）
                          ▲                        │
                          └── addTask/updateTask/deleteTask ◀── el-dialog / 键盘删除
```

## 组件库使用

### 构建与发布

```bash
npm run build:lib   # 产出 lib/dhtmlx-gantt-vue2.{common.js,umd.js,umd.min.js,css}（vue/element-ui/dhtmlx-gantt 均为外部依赖，不重复打包）
npm pack            # 得到 tarball；正式发布前去掉 package.json 的 private
```

### 在其他工程使用（Vue 2.6 + ElementUI）

```bash
npm install dhtmlx-gantt-vue2-0.1.0.tgz   # 或发布后的包名
```

```js
import Vue from 'vue'
import ElementUI from 'element-ui'
import 'element-ui/lib/theme-chalk/index.css'
import { GanttChart } from 'dhtmlx-gantt-vue2'
import 'dhtmlx-gantt-vue2/lib/dhtmlx-gantt-vue2.css'

Vue.use(ElementUI) // 工具栏按钮/el-dialog 由全局注册提供，库本身不内嵌 ElementUI
```

```vue
<GanttChart
  :tasks="tasks"
  :fields="fields"
  :columns="columns"
  :table-width.sync="tableWidth"
  :gantt-options="{ /* 浅合并覆盖 gantt.config 任意项 */ }"
  @gantt-event="onGanttEvent"
/>
```

- **Props**：`tasks`(必填)、`fields`(字段映射)、`columns`(列配置)、`rowHeight=36`、`barHeight=20`、`scaleHeight=48`、`skin='material'`、`zoom='day'`、`tableWidth=520`(.sync)、`readonly`、`ganttOptions`
- **事件**：`gantt-event`(`{type,message,data}`，type 含 task-add/update/delete/drag/click、table-resize、snapshot)、`update:tableWidth`
- **方法(refs)**：`getSnapshot()`、`getInstance()`
- **插槽**：`toolbar-extra`（工具栏右侧追加自定义按钮）

#### fields 字段映射（数据契约通用化）

使用方的甘特数据字段名不必叫 `text/start_date/...`，通过 `fields` 映射即可：

```js
// 后端数据：{ taskId, name, begin, days, percent, pid }
fields: {
  id: 'taskId', text: 'name', startDate: 'begin', duration: 'days',
  progress: 'percent', parent: 'pid'
}
```

映射之外的字段（如 `owner`）会**透传进 gantt 任务对象**，供自定义列渲染；
`type` 字段不透传（组件已移除里程碑概念，防止外部数据重新引入）。

#### columns 列配置

columns 缺省为内置 5 列（任务名称/开始/结束/工期/进度）。列项：

```js
{ key: 'text', label: '任务名称', width: 200 }                        // 树列（展开箭头）
{ key: 'start', label: '开始', width: 90, align: 'center' }           // 内置模板
{ key: 'owner', label: '负责人', width: 80, format: (task) => task.owner || '' }  // 自定义字段列
```

- 内置 key：`text` / `start` / `end` / `duration` / `progress`（内置模板；
  `start/end` 展示“含当天”语义，自动做 ±1 天换算）/ `ops`（操作列）
- 自定义 key：渲染任务的同名字段（自定义字段经 fields 透传后可直接用），
  `format(task) => string` 即 dhtmlx 原生 `template`
- **操作列（ops）**：默认列已含 `ops`（编辑 / 加子任务 / 删除），`readonly` 自动隐藏；
  可用 `actions` 自定义动作：

```js
{ key: 'ops', label: '操作', width: 150, actions: [
  { name: 'edit', text: '编辑' },              // 内置：打开编辑弹窗
  { name: 'append', text: '加子任务' },        // 内置：以该行为父级新增
  { name: 'remove', text: '删除' },            // 内置：删除确认
  { name: 'detail', text: '详情', handler: (task) => console.log(task) }  // 自定义
] }
```

  `handler` 拿到的是 gantt 任务对象（fields 透传的自定义字段可直接读）；
  内置 `edit`/`remove` 复用组件内置的 el-dialog 编辑与删除确认
- 需要完全原生控制时，直接用 `ganttOptions.columns` 传 dhtmlx 原生列配置（优先级最高）

以上能力已在独立消费工程（webpack5 + npm 包安装 + 非标准字段名 + fields 映射 + 自定义列）中端到端验证。

## 集成到现有工程（源码方式，不想装包时）

1. 安装依赖：`npm install dhtmlx-gantt@^10 element-ui@2.15.14`
2. 拷贝 `src/components/GanttChart.vue` + `src/components/TaskDialog.vue`
3. 用法：

```vue
<GanttChart ref="gantt" :tasks="tasks" @gantt-event="onGanttEvent" />
<!-- 取全量数据：this.$refs.gantt.getSnapshot() -->
```

`tasks` 结构见 `src/data.js` 顶部注释。

## 关键实现点（踩坑提示）

- **必须用 `Gantt.getGanttInstance()` 创建独立实例**，并在 `beforeDestroy` 里 `destructor()`。直接用全局 `gantt` 单例 + 不销毁，路由二次进入会出现实例叠加、事件重复触发。
- **layout 的 `resizer` 视图是 PRO 功能**：社区版渲染 resizer 直接报 `getPrevSibling is not a function`。示例用自绘分割条（绝对定位在 grid 右缘）+ `config.grid_width = w; gantt.setSizes()` 实现同样的拖拽体验。
- **grid 实际宽度会被列宽总和顶住**：`grid_width` 小于列宽之和时 dhtmlx 按列宽和渲染，因此分割条位置/回传宽度要以 DOM 实测为准，不能用配置值。
- **v10 没有 `setGridWidth/getGridWidth` 实例方法**（旧教程常见），改 `config.grid_width` + `setSizes()`；量宽度用 `querySelector('.gantt_grid')`。
- **自定义字段进引擎**：`normalizedTasks` 在字段映射之外把其余字段透传（`type` 除外），原生 grid 的自定义列模板才能取到 `task.owner` 之类的外部字段。
- **el-dialog 替代灯箱**：`onBeforeLightbox` 返回 false 全局拦截；`quick_info` 插件不要开（它的编辑按钮走灯箱，会打架）。
- **dhtmlx 事件要同步返回值**，而 ElMessageBox 是异步的——删除确认的正确姿势：`onBeforeTaskDelete` 先返回 false 拦截，确认后带 `_delConfirm` 标记调 `g.deleteTask(id)`。
- **`templates.*` 赋值必须放在 `init()` 之前**（v10 初始化时会捕获当时的模板函数）。
- **`date_format` 要和数据里的日期字符串格式一致**（示例统一 `%Y-%m-%d`）；注意 gantt 的 `end_date` 是“排他”结束，给用户展示/编辑用“含当天”的日期时要做 ±1 天换算。
- **依赖线与里程碑已整体移除**：数据格式仅 `{ data: Task[] }`；`drag_links=false`/`show_links=false` 必须显式设置（`drag_links` 默认 true，删配置行≠关闭）。
- **时间轴范围自管**：默认范围贴数据边界，拖到最晚任务就被顶住；`ensureTimeRange()` 扩到 [最早任务月初, 最晚任务月末+2 个月]，只外扩不收缩；自管时关 `fit_tasks`（否则数据一变范围缩回数据边界）。
- **z-index**：el-dialog 默认从 2000 起自增，与 dhtmlx 自带弹层错开使用即无冲突。

## 版本与协议注意

- **务必用 dhtmlx-gantt@10+**：10.0 起社区版从 GPLv2 改为 **MIT**；v9 及以前的 npm 包是 GPLv2 标注，商用语义不同。
- v10 打包方式与老教程差异较大：皮肤/32 种语言（含中文 `gantt.i18n.setLocale('cn')`）/扩展全部打进主包，不再有 `codebase/locale/`、`codebase/ext/` 单文件；插件统一用 `gantt.plugins({ ... })` 开启。
- **PRO 收费功能**（社区版没有，别开开关）：自动排程 `auto_scheduling`、关键路径、资源面板/资源直方图、基线、拆分任务、marker 今日线插件（示例改用 templates 高亮“今天”所在列）、**layout 的 `resizer` 视图**。
