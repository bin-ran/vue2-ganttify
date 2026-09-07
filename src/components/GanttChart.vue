<template>
  <div class="gantt-wrapper">
    <!-- 工具栏 -->
    <div class="gantt-toolbar">
      <div class="tb-group">
        <span class="tb-label">时间轴</span>
        <button
          v-for="item in zoomLevels"
          :key="item.key"
          class="tb-btn"
          :class="{ active: zoom === item.key }"
          @click="setZoom(item.key)"
        >{{ item.label }}</button>
      </div>
      <div class="tb-group">
        <button
          class="tb-btn"
          :class="{ active: showLinks }"
          @click="toggleLinks"
        >{{ showLinks ? '隐藏依赖线' : '显示依赖线' }}</button>
        <button class="tb-btn" @click="toggleSkin">{{ skin === 'dark' ? '浅色主题' : '深色主题' }}</button>
        <button class="tb-btn primary" @click="addTask">＋ 新增任务</button>
        <button class="tb-btn" @click="exportSnapshot">导出 JSON</button>
      </div>
    </div>

    <!-- gantt 容器：必须有确定高度（由父级 flex 布局给出） -->
    <div ref="ganttEl" class="gantt-container"></div>
  </div>
</template>

<script>
import { Gantt } from 'dhtmlx-gantt'
// v10 起皮肤/语言/扩展全部打进主包，只需引一个 css（老教程里的 locale/ext 单文件引入方式已过时）
import 'dhtmlx-gantt/codebase/dhtmlxgantt.css'

export default {
  name: 'GanttChart',

  props: {
    /**
     * 结构：{ data: Task[], links: Link[] }
     * 注意：拖拽产生的变更保存在 gantt 实例内部，不会自动写回这个 prop；
     * 取全量数据请用 getSnapshot()（对接后端保存时调用）。
     */
    tasks: { type: Object, required: true }
  },

  data() {
    return {
      zoom: 'day',
      skin: 'material',
      showLinks: true,
      zoomLevels: [
        { key: 'quarter', label: '季' },
        { key: 'month', label: '月' },
        { key: 'day', label: '日' }
      ]
    }
  },

  watch: {
    // 父组件整体替换 tasks 对象（引用变化）时重新加载
    tasks(val) {
      if (!this.gantt) return
      this.gantt.clearAll()
      this.gantt.parse(val)
    }
  },

  mounted() {
    // 每个组件实例用独立 gantt 实例（社区版支持多实例），
    // 不用全局单例，路由切换/多开页面互不污染
    this.gantt = Gantt.getGanttInstance()
    this.initGantt()
    this.gantt.parse(this.tasks)
    this.bindEvents()
  },

  beforeDestroy() {
    // 必须销毁，否则二次进入页面会出现实例与事件残留（最常见的坑）
    if (this.gantt) {
      this.gantt.destructor()
      this.gantt = null
    }
  },

  methods: {
    initGantt() {
      const g = this.gantt

      // ---- 插件（v10 社区版内置，init 前开启）----
      g.plugins({
        tooltip: true,             // 任务条悬停提示
        quick_info: true,          // 点击任务条的快捷信息面板
        drag_timeline: true,       // 按住空白时间轴拖动平移
        keyboard_navigation: true  // 键盘操作
      })

      // ---- 中文与皮肤 ----
      g.i18n.setLocale('cn')
      g.setSkin(this.skin) // 可选：material / terrace / dark / meadow / broadway / skyblue / contrast

      // ---- 基础配置 ----
      g.config.date_format = '%Y-%m-%d' // 与数据中的日期字符串格式一致
      g.config.fit_tasks = true         // 数据超出当前时间轴范围时自动扩展
      g.config.row_height = 36
      g.config.bar_height = 20
      g.config.auto_types = true        // 有子任务的节点自动按“项目”汇总
      g.config.open_tree_initially = true

      // ---- 拖拽能力（社区版全部免费）----
      g.config.drag_move = true     // 拖动任务条 → 修改起止日期
      g.config.drag_resize = true   // 拖动任务条两端 → 修改工期
      g.config.drag_progress = true // 拖动任务条里的深色进度段 → 修改进度
      g.config.drag_links = true    // 任务条两端圆点拖拽 → 创建依赖线
      g.config.show_links = true    // 依赖线显示开关（工具栏的显示/隐藏切换就是改它）
      g.config.order_branch = true  // 左侧树内拖动 → 排序/改变层级
      g.config.order_branch_free = true

      // 注意：auto_scheduling（自动排程）、关键路径、资源面板、基线都是 PRO 收费功能，
      // 社区版没有这些能力，保持默认关闭，不要开对应开关。

      // ---- 左侧表格列 ----
      g.config.columns = [
        { name: 'text', label: '任务名称', tree: true, width: 220, resize: true },
        { name: 'start_date', label: '开始日期', align: 'center', width: 90, resize: true },
        { name: 'end_date', label: '结束日期', align: 'center', width: 90, resize: true },
        { name: 'duration', label: '工期', align: 'center', width: 60, resize: true },
        { name: 'add', label: '', width: 44 } // 行内“+”快捷新增子任务
      ]

      // ---- 双击/新增时的编辑弹窗（灯箱）----
      g.config.lightbox.sections = [
        { name: 'description', height: 38, map_to: 'text', type: 'textarea', focus: true },
        { name: 'time', height: 72, map_to: 'auto', type: 'duration' }
      ]

      // ---- 周末底色 + “今天”列高亮 ----
      // 社区版没有 marker 今日线插件（PRO），改用 templates 高亮所在列，零风险且自动随缩放重绘
      // 注意：必须在 init() 之前赋值，v10 初始化时会捕获当时的模板函数
      const isWeekend = (date) => date.getDay() === 0 || date.getDay() === 6
      const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
      const isToday = (date) => startOfDay(date) === startOfDay(new Date())
      const cellClass = (date) => (isToday(date) ? 'today' : isWeekend(date) ? 'weekend' : '')
      g.templates.scale_cell_class = cellClass     // 表头刻度格
      g.templates.timeline_cell_class = (item, date) => cellClass(date) // 时间轴列

      this.applyZoom(this.zoom)

      g.init(this.$refs.ganttEl)
    },

    /** 时间轴缩放：切换两级刻度 */
    applyZoom(level) {
      const scales = {
        quarter: [
          { unit: 'year', step: 1, format: '%Y' },
          { unit: 'quarter', step: 1, format: (date) => `Q${Math.floor(date.getMonth() / 3) + 1}` }
        ],
        month: [
          { unit: 'month', step: 1, format: '%Y年%m月' },
          { unit: 'day', step: 1, format: '%d' }
        ],
        day: [
          { unit: 'month', step: 1, format: '%Y年%m月' },
          { unit: 'day', step: 1, format: (date) => `${date.getDate()}日` }
        ]
      }[level]

      this.gantt.config.scales = scales
      this.gantt.config.scale_height = 48
      // init 完成后才有 $root，避免初始化前调 render 报错
      if (this.gantt.$root) this.gantt.render()
    },

    /** 转发 gantt 事件给父组件 */
    emitEvent(type, message, data) {
      this.$emit('gantt-event', { type, message, data })
    },

    bindEvents() {
      const g = this.gantt
      const fmt = g.date.date_to_str('%Y-%m-%d')

      // 任务拖拽结束：move=移动 resize=两端缩放 progress=进度
      g.attachEvent('onAfterTaskDrag', (id, mode) => {
        const task = g.getTask(id)
        const name = { move: '拖动改期', resize: '调整工期', progress: '更新进度' }[mode] || mode
        this.emitEvent(
          'task-drag',
          `${name}：「${task.text}」→ ${fmt(task.start_date)} ~ ${fmt(task.end_date)}`,
          task
        )
      })

      // 灯箱保存（新增）
      g.attachEvent('onAfterTaskAdd', (id, task) => {
        this.emitEvent('task-add', `新增任务：「${task.text}」`, task)
      })

      // 灯箱保存（编辑）
      g.attachEvent('onAfterTaskUpdate', (id, task) => {
        this.emitEvent('task-update', `任务已更新：「${task.text}」`, task)
      })

      g.attachEvent('onAfterTaskDelete', (id, task) => {
        this.emitEvent('task-delete', `删除任务：「${task.text}」`, task)
      })

      // 拖拽圆点创建依赖线成功后
      g.attachEvent('onAfterLinkAdd', (id, link) => {
        const typeText = { 0: '完成-开始', 1: '开始-开始', 2: '完成-完成', 3: '开始-完成' }[link.type]
        const from = g.getTask(link.source)
        const to = g.getTask(link.target)
        this.emitEvent(
          'link-add',
          `新增依赖：「${from.text}」→「${to.text}」（${typeText}）`,
          link
        )
      })

      g.attachEvent('onAfterLinkDelete', (id, link) => {
        this.emitEvent('link-delete', '删除了一条依赖线', link)
      })

      // 删除前二次确认（返回 false 则取消删除）
      g.attachEvent('onBeforeTaskDelete', () => window.confirm('确定删除该任务（含子任务）吗？'))
    },

    /** 工具栏：新增任务（打开灯箱） */
    addTask() {
      this.gantt.createTask()
    },

    /** 工具栏：时间轴缩放 */
    setZoom(level) {
      this.zoom = level
      this.applyZoom(level)
    },

    /** 工具栏：显示/隐藏依赖线（隐藏后连线与拖拽创建点一并隐藏） */
    toggleLinks() {
      this.showLinks = !this.showLinks
      this.gantt.config.show_links = this.showLinks
      this.gantt.render()
      this.emitEvent('links-toggle', this.showLinks ? '显示依赖线' : '隐藏依赖线', { showLinks: this.showLinks })
    },

    /** 工具栏：主题切换 */
    toggleSkin() {
      this.skin = this.skin === 'dark' ? 'material' : 'dark'
      this.gantt.setSkin(this.skin)
    },

    /** 工具栏：全量数据打印到控制台 */
    exportSnapshot() {
      const snapshot = this.getSnapshot()
      console.log('[Gantt 全量数据]', JSON.stringify(snapshot, null, 2))
      this.emitEvent(
        'snapshot',
        `全量数据已打印到控制台（${snapshot.data.length} 个任务 / ${snapshot.links.length} 条依赖）`,
        snapshot
      )
    },

    /** 对外方法：取全量数据（父组件通过 $refs.gantt.getSnapshot() 调用，对接后端保存） */
    getSnapshot() {
      return this.gantt.serialize()
    }
  }
}
</script>

<style>
/* 甘特图内部 DOM 是动态生成的，样式不要加 scoped */
.gantt-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
}

.gantt-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid #e8e8e8;
  flex: none;
}

.tb-group { display: flex; align-items: center; gap: 8px; }
.tb-label { color: #888; font-size: 13px; }

.tb-btn {
  padding: 4px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
  line-height: 20px;
  color: #333;
}
.tb-btn:hover { border-color: #3f8cff; color: #3f8cff; }
.tb-btn.active { background: #3f8cff; border-color: #3f8cff; color: #fff; }
.tb-btn.primary { background: #3f8cff; border-color: #3f8cff; color: #fff; }
.tb-btn.primary:hover { opacity: 0.85; }

/* 容器占满剩余高度 */
.gantt-container { flex: 1; min-height: 0; width: 100%; }

/* 周末底色 / 今天列高亮 */
.gantt-wrapper .weekend { background-color: #f4f6f9; }
.gantt-wrapper .today { background-color: rgba(255, 92, 92, 0.10); }
.gantt-wrapper .gantt_scale_cell.today { color: #ff5c5c; font-weight: 600; }
</style>
