# DHTMLX Gantt 社区版 × Vue 2.6.14 集成示例

开源可拖拽甘特图方案：`dhtmlx-gantt@10`（社区版，**MIT 协议，可商用**）+ Vue 2.6.14。

## 运行

环境要求：Node >= 14（Vue CLI 5 官方要求 `^12.0.0 || >= 14.0.0`，Node 16/18/20/22/24 均实测可用）。

```bash
npm install
npm run serve   # 开发：http://localhost:8090
npm run build   # 构建
```

## 演示功能（全部为社区版免费能力）

- 拖动任务条 → 修改起止日期；拖两端 → 修改工期；拖深色进度段 → 修改进度
- 任务条边缘圆点拖拽 → 创建依赖线（4 种类型），点依赖线可删除；工具栏可一键显示/隐藏依赖线
- 左侧树内拖动 → 行排序 / 改变父子层级
- 双击任务 → 灯箱编辑；行内 `+` / 工具栏 → 新增
- 项目（汇总）任务、里程碑、进度条、tooltip、快捷信息面板
- 时间轴季/月/日缩放、周末底色、今日列高亮（templates 实现）、深色主题切换
- 事件全部转发到父组件，`getSnapshot()` 输出全量 JSON 对接后端

## 集成到现有工程

1. 安装依赖：`npm install dhtmlx-gantt@^10`
2. 拷贝 `src/components/GanttChart.vue`（自包含，无其他依赖）
3. 用法：

```vue
<GanttChart
  ref="gantt"
  :tasks="tasks"
  @gantt-event="onGanttEvent"
/>
<!-- 取全量数据：this.$refs.gantt.getSnapshot() -->
```

`tasks` 结构见 `src/data.js` 顶部注释。

## 关键实现点（踩坑提示）

- **必须用 `Gantt.getGanttInstance()` 创建独立实例**，并在 `beforeDestroy` 里 `destructor()`。
  直接用全局 `gantt` 单例 + 不销毁，路由二次进入会出现实例叠加、事件重复触发。
- **容器必须有确定高度**。示例用 flex 布局（`flex: 1; min-height: 0`），父级链路上每一层都要有高度。
- **依赖线开关**：`gantt.config.show_links`（默认 `true`），改后调 `gantt.render()` 生效；隐藏后连线与两端的拖拽创建点一并隐藏。
- **甘特图内部 DOM 是动态生成的**，相关样式不要加 `scoped`。
- **`date_format` 要和数据里的日期字符串格式一致**（示例统一 `%Y-%m-%d`）。
- 拖拽产生的变更保存在 gantt 实例内部，**不会自动写回 `tasks` prop**；持久化统一走 `getSnapshot()`（内部是 `gantt.serialize()`）。
- 对接后端增量保存：在 `bindEvents()` 的各 `onAfterXxx` 事件里调接口即可；也可用官方 `dataProcessor`（REST 风格）。

## 版本与协议注意

- **务必用 dhtmlx-gantt@10+**：10.0 起社区版从 GPLv2 改为 **MIT**；v9 及以前的 npm 包是 GPLv2 标注，商用语义不同。
- v10 打包方式与老教程差异较大：皮肤/32 种语言（含中文 `gantt.i18n.setLocale('cn')`）/扩展全部打进主包，不再有 `codebase/locale/`、`codebase/ext/` 单文件；插件统一用 `gantt.plugins({ ... })` 开启。
- **`templates.*` 赋值必须放在 `init()` 之前**：v10 初始化时会捕获当时的模板函数，之后赋值不生效（本示例的周末/今日高亮因此放在 init 前）。
- **`addTaskLayer` 回调是逐任务调用的**：签名 `(task, timeline, config, viewport)`，需返回 DOM 元素；不要把它当成“传容器给你画一次”的 API（常见误用会直接抛错中断初始化）。
- **PRO 收费功能**（社区版没有，别开开关）：自动排程 `auto_scheduling`、关键路径、资源面板/资源直方图、基线、拆分任务、marker 今日线插件（示例改用 templates 高亮“今天”所在列）。
- 今日列高亮、周末底色这类个性化渲染，社区版可用 `templates` / `addTaskLayer` 自由实现。
