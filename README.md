# DHTMLX Gantt 时间轴 × ElementUI 表格 × Vue 2.6.14 集成示例

左侧任务列表用 **ElementUI `el-table`（树形表格）**，右侧时间轴用 **`dhtmlx-gantt@10`**（社区版，MIT 协议可商用），编辑弹窗用 **`el-dialog + el-form`** 替代 dhtmlx 自带灯箱。

本仓库同时是一个**可安装的组件库包**（见下方「组件库使用」），`src/` 即库源码，演示页与库共用同一份组件。

## 运行

环境要求：Node >= 14（Vue CLI 5 官方要求 `^12.0.0 || >= 14.0.0`，Node 16/18/20/22/24 均实测可用）。

```bash
npm install
npm run serve   # 开发：http://localhost:8090
npm run build   # 构建
```

依赖：`vue@2.6.14` + `element-ui@2.15.14`（peer 要求 vue ^2.5.17，2.6.14 满足）+ `dhtmlx-gantt@^10`。

## 演示功能（全部为社区版免费能力）

- 左侧 el-table：树形展开/收起（与时间轴折叠双向同步）、行点击 ↔ 任务条选中联动、进度列（el-progress）、操作列（编辑 / 加子任务 / 删除）
- **表格/时间轴分割条可拖拽**调整宽度比例（双击分割条恢复默认宽度）
- 右侧时间轴：拖动任务条改日期、拖两端改工期、拖进度段改进度、任务条边缘圆点拖拽创建依赖线（4 种类型）、点击依赖线确认删除
- 双击任务条或表格“编辑” → el-dialog 表单（el-date-picker / el-slider，带校验），删除确认用 ElMessageBox
- 时间轴季/月/日缩放、周末底色、今日列高亮、依赖线显示开关（el-switch）、深色主题切换
- 两侧纵向滚动互相同步（行高严格对齐 36px）
- 事件全部转发到父组件，`getSnapshot()` 输出全量 JSON 对接后端

## 架构说明

**gantt 实例是唯一数据源**：左侧表格数据由 `gantt.serialize()` 派生（`rebuildTable()`），所有变更（拖拽、弹窗编辑、删除）先落在 gantt 身上，再重建表格并恢复展开/选中状态。这样不用维护两份数据的双向 diff，逻辑最不易错。

```
tasks prop ──parse──▶ gantt 实例 ──serialize──▶ el-table 树形数据
                          ▲                          │
                          └──── addTask/updateTask/deleteTask ◀── el-dialog / 表格操作列
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

Vue.use(ElementUI) // el-table/el-dialog 由全局注册提供，库本身不内嵌 ElementUI
```

```vue
<GanttChart
  :tasks="tasks"
  :fields="fields"
  :table-data="tableRows"
  :columns="columns"
  :show-links.sync="showLinks"
  :table-width.sync="tableWidth"
  :gantt-options="{ /* 浅合并覆盖 gantt.config 任意项 */ }"
  @gantt-event="onGanttEvent"
  @table-data-change="onRowsChange"
>
  <template #col-owner="{ row }">
    <el-tag size="mini">{{ row.owner }}</el-tag>
  </template>
</GanttChart>
```

- **Props**：`tasks`(必填)、`fields`(字段映射)、`tableData`(外部表格行)、`columns`(列配置)、`rowHeight=36`、`barHeight=20`、`scaleHeight=48`、`skin='material'`、`zoom='day'`、`showLinks`(.sync)、`tableWidth`(.sync)、`readonly`、`ganttOptions`
- **事件**：`gantt-event`(`{type,message,data}`)、`table-data-change`(合并后全量行)、`update:showLinks` / `update:tableWidth`
- **方法(refs)**：`getSnapshot()`、`getInstance()`
- **插槽**：`toolbar-extra` + 任意列 `#col-<key>="{ row }"`

#### fields 字段映射（数据契约通用化）

使用方的甘特数据字段名不必叫 `text/start_date/...`，通过 `fields` 映射即可：

```js
// 后端数据：{ taskId, name, begin, days, percent, pid, kind }
fields: {
  id: 'taskId', text: 'name', startDate: 'begin', duration: 'days',
  progress: 'percent', parent: 'pid', type: 'kind'
}
```

#### columns 列配置

columns 缺省为内置 6 列（任务名称/开始/结束/工期/进度/操作）。列项：

```js
{ key: 'text', label: '任务名称', minWidth: 170 }  // key 为内置类型，保留专门渲染
{ key: 'owner', label: '负责人', width: 90 }       // key 为任务数据字段（含外部字段）
{ key: 'ops', label: '操作', width: 145 }          // 操作列（readonly 时自动隐藏）
```

- 内置类型：`text`(树列+里程碑标签) / `start` / `end` / `duration` / `progress`(进度条) / `ops`
- 自定义字段列：渲染 `row[key]`，可用 `format: row => string` 格式化，或作用域插槽 `#col-<key>` 覆盖（内置列也可覆盖）

#### tableData 外部表格数据

```js
tableData: [{ taskId: 'T1', owner: '张三' }, ...]  // fields.id 对应任务 id
```

- 行序与外部一致；日期/工期/进度等以 gantt 为权威合并进同一行；外部字段透传
- gantt 变更（拖拽/编辑/增删）后 emit `table-data-change`（全量合并行，内容无变化不重复回传），使用方可直接持久化
- 外部行没有的新任务（如弹窗新增）自动追加到表格

以上能力已在独立消费工程（webpack5 + npm 包安装 + 非标准字段名 + fields 映射 + 自定义列 + 作用域插槽）中端到端验证。

## 集成到现有工程（源码方式，不想装包时）

1. 安装依赖：`npm install dhtmlx-gantt@^10 element-ui@2.15.14`
2. 拷贝 `src/components/GanttChart.vue` + `src/components/TaskDialog.vue`（仅依赖 element-ui）
3. 用法：

```vue
<GanttChart ref="gantt" :tasks="tasks" @gantt-event="onGanttEvent" />
<!-- 取全量数据：this.$refs.gantt.getSnapshot() -->
```

`tasks` 结构见 `src/data.js` 顶部注释。

## 关键实现点（踩坑提示）

- **必须用 `Gantt.getGanttInstance()` 创建独立实例**，并在 `beforeDestroy` 里 `destructor()`。直接用全局 `gantt` 单例 + 不销毁，路由二次进入会出现实例叠加、事件重复触发。
- **隐藏 gantt 自带 grid 用自定义 `gantt.config.layout`**（只保留 `timeline` + 滚动条视图），不要用 `grid_width: 0` 的老办法。
- **两侧行高必须严格对齐**（本示例统一 36px）：① `gantt.config.row_height = 36`；② el-table 的 td 默认 content-box，`height:36px` 加上 1px 边框会变 37px 逐行漂移，必须覆写 `box-sizing: border-box`；③ 表头高度也要与 `scale_height`(48px) 对齐，否则整体差一个常数偏移。
- **纵向滚动同步必须加滚动锁**：dhtmlx 的 `scrollTo` 过程中会发出“过期中间值”的 `onGanttScroll` 事件，裸双向同步会乒乓打架（实测两边互相拉扯最后停在 0）。解法：一方发起同步后 50ms 内抑制另一方的回传（`_scrollLock` + 定时释放）。
- **树形表格 `expand-change` 的第二参是布尔值**（该行是否展开）；普通展开行表格才是展开行数组——两种形态要兼容，否则直接 `expandedRows.map` 报 TypeError。
- **分割条拖拽期间给两块区域加 `pointer-events: none`**：gantt 容器内有一个用于监听尺寸变化的 iframe（resize watcher），光标划过它会导致 document 上的 mousemove 丢失、拖拽中断。
- **el-dialog 替代灯箱**：`onBeforeLightbox` 返回 false 全局拦截；`quick_info` 插件不要开（它的编辑按钮走灯箱，会打架）。
- **dhtmlx 事件要同步返回值**，而 ElMessageBox 是异步的——删除确认的正确姿势：`onBeforeTaskDelete` 先返回 false 拦截，确认后带 `_delConfirm` 标记调 `g.deleteTask(id)`。
- **`templates.*` 赋值必须放在 `init()` 之前**（v10 初始化时会捕获当时的模板函数）。
- **`addTaskLayer` 回调是逐任务调用的**，签名 `(task, timeline, config, viewport)`，需返回 DOM 元素。
- **`date_format` 要和数据里的日期字符串格式一致**（示例统一 `%Y-%m-%d`）；注意 gantt 的 `end_date` 是“排他”结束，给用户展示/编辑用“含当天”的日期时要做 ±1 天换算。
- **z-index**：el-dialog 默认从 2000 起自增，与 dhtmlx 自带弹层错开使用即无冲突；若需叠加，给 el-dialog 传 `:z-index` 调高。

## 版本与协议注意

- **务必用 dhtmlx-gantt@10+**：10.0 起社区版从 GPLv2 改为 **MIT**；v9 及以前的 npm 包是 GPLv2 标注，商用语义不同。
- v10 打包方式与老教程差异较大：皮肤/32 种语言（含中文 `gantt.i18n.setLocale('cn')`）/扩展全部打进主包，不再有 `codebase/locale/`、`codebase/ext/` 单文件；插件统一用 `gantt.plugins({ ... })` 开启。
- **PRO 收费功能**（社区版没有，别开开关）：自动排程 `auto_scheduling`、关键路径、资源面板/资源直方图、基线、拆分任务、marker 今日线插件（示例改用 templates 高亮“今天”所在列）。
