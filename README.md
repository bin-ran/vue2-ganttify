# vue2-ganttify

**Vue 2.6 甘特图辅助组件**：基于 `dhtmlx-gantt@10`（社区版，MIT 可商用）。定位是**辅助工具**——当你的业务数据有“开始/结束时间”时，用它把时间轴视图挂到数据上。组件不预设业务语义：名称、进度、层级、操作、编辑 UI 全部由上层定义。

## 运行（本仓库 = demo + 组件库源码）

```bash
npm install
npm run serve       # 开发：http://localhost:8090
npm run build       # demo 构建
npm run build:lib   # 组件库构建 → lib/
npm pack            # tarball
```

依赖：`vue@2.6.14` + `element-ui@2.15.14`（工具栏用）+ `dhtmlx-gantt@^10`（≥10 才是 MIT）。

## 数据契约（稳定契约，一次定稳）

### 必填：只有开始/结束时间

```js
:tasks="[
  { begin: '2026-09-01', end: '2026-09-05', name: '需求评审', owner: '张三' },
  ...
]"
:fields="{ startDate: 'begin', endDate: 'end' }"
```

`fields` 全部字段：

| 语义 | 必填 | 缺省读 | 说明 |
|---|---|---|---|
| `startDate` | ✅ | `start_date` | 开始时间 |
| `endDate` | ✅ | `end_date` | 结束时间（**含当天**语义，组件内部换算 duration） |
| `id` | — | 行下标+1 | 业务主键映射；业务 id 为空/0 时降级为行下标 |
| `text` | — | 无 | 任务显示名（悬停 tooltip/无障碍标签）；不传则 tooltip 显示起止日期 |
| `parent` | — | 无 | 传了才有树形展开/收起（值需对应内部 id）；不传为平铺列表 |
| `progress` | — | 无 | 时间轴条内进度段，值域 0~1；不传则无进度段 |

映射之外的业务字段**全部透传**进引擎，列与 actions 可直接读取（引擎保留字段 `id/start_date/end_date/duration/parent/progress/type` 除外）。

### 任务条文字：barText（可指定显示内容）

```js
:bar-text="name"                                    // 显示任务上的 name 字段
:bar-text="(task) => task.name + ' · ' + task.owner" // 函数完全自定义
:bar-text="false"                                   // 不显示条上文字
```

不传时自动回退：`fields.text` 映射 → columns 第一条业务列的值 → 空（保证不出现 "undefined"）。tooltip 同步使用该文字，无文字时显示起止日期。

### columns：列完全由上层定义

```js
:columns="[
  { key: 'name', label: '任务名称', width: 180, tree: true },  // tree:true 渲染展开箭头（需 fields.parent）
  { key: 'begin', label: '开始', width: 90 },
  { key: 'owner', label: '负责人', width: 80, format: (task) => task.owner || '' },
  { key: 'ops', label: '操作', width: 160, actions: [...] }
]"
```

- 不传 `columns`：只显示 开始/结束 两列
- 内置便捷 key 只有 `start`/`end`（日期格式化 + 含当天换算）；其余 key 直接渲染 `task[key]`
- `format(task) => string`：dhtmlx 原生 template
- 进阶：`ganttOptions.columns` 直接传 dhtmlx 原生列配置（优先级最高）

### 操作列 actions：全部由上层定义

```js
{ key: 'ops', label: '操作', actions: [
  { text: '指派', handler: (row, task) => console.log(row.owner, task.start_date) },
  { text: '延期', handler: (row, task) => api.delay(row.id) }
] }
```

- 组件**不内置任何动作**（编辑/删除都是业务动作，由上层实现）
- `handler(row, task)`：`row` 是原始业务行对象，`task` 是引擎任务对象
- 配了 `actions` 才渲染操作列；`readonly` 时自动隐藏

### 编辑 UI：完全由上层实现

组件**不内置任何表单**（v1 的 el-dialog 已移除）：

- 双击行/任务条 → emit `task-dblclick(row, task)` → 上层打开自己的编辑器
- 更新数据两条路：
  1. **代理方法（推荐，不触发整表重载）**：`this.$refs.gantt.updateTask(row)` / `addTask(row)` / `removeTask(row)`
  2. 替换 `tasks` 数组引用（触发重载）
- 键盘 Delete 默认禁用（删除是业务动作，走你自己的确认流程）

## 组件 API

**Props**：`tasks`(Array, 必填)、`fields`、`columns`、`rowHeight=36`、`barHeight=20`、`scaleHeight=48`、`skin='material'`、`zoom='day'`、`tableWidth=220`(.sync)、`readonly`、`ganttOptions`（浅合并覆盖 gantt.config 任意项）

**事件（具名）**：
- `task-click(row, task)` / `task-dblclick(row, task)`
- `task-drag({ type: 'move'|'resize'|'progress', row, task, startDate, endDate })`
- `update:tableWidth`

**方法(refs)**：`getInstance()`、`getSnapshot()`、`addTask(row)`、`updateTask(row)`、`removeTask(row)`

**插槽**：`toolbar-extra`（工具栏右侧，如自定义“新增”按钮配合 `addTask`）

## 内置能力（纯甘特层，无需配置）

拖拽改期/工期/进度（结束即 emit 事件）、季/月/日缩放、今日列高亮、周末底色、深色主题、按住空白时间轴平移、grid/timeline 分割条拖拽（双击复位）、时间轴范围自适应留白、任务条悬停 tooltip。

已移除：依赖线、里程碑、内置编辑表单。

## 最小示例

```vue
<GanttChart
  ref="gantt"
  :tasks="rows"
  :fields="{ startDate: 'begin', endDate: 'end' }"
  :columns="columns"
  @task-dblclick="openMyEditor"
>
  <template #toolbar-extra>
    <el-button size="mini" type="primary" @click="openCreate">新增</el-button>
  </template>
</GanttChart>
```

## 验证

`scripts/` 内含两套 puppeteer 回归脚本（demo :8129 / 消费工程 :8130），环境搭建见 `scripts/README.md`；架构与踩坑清单见 `AGENTS.md`。
