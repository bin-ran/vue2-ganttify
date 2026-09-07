# DHTMLX Gantt 时间轴 × ElementUI 表格 × Vue 2.6.14 集成示例

左侧任务列表用 **ElementUI `el-table`（树形表格）**，右侧时间轴用 **`dhtmlx-gantt@10`**（社区版，MIT 协议可商用），编辑弹窗用 **`el-dialog + el-form`** 替代 dhtmlx 自带灯箱。

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

## 集成到现有工程

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
- **两侧行高必须严格对齐**（本示例统一 36px：`gantt.config.row_height = 36` + el-table td 覆写），否则纵向滚动同步会错位。
- **纵向滚动同步用“数值差 > 1px 才动作”的防回环写法**，不要用互斥锁标志（scroll 事件时序不可控）。
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
