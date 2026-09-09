<template>
  <div class="gantt-wrapper">
    <!-- 工具栏（ElementUI） -->
    <div class="gantt-toolbar">
      <div class="tb-left">
        <el-radio-group v-model="zoom" size="mini" @change="applyZoom">
          <el-radio-button
            v-for="item in zoomLevels"
            :key="item.key"
            :label="item.key"
          >{{ item.label }}</el-radio-button>
        </el-radio-group>
      </div>
      <div class="tb-right">
        <el-button size="mini" @click="toggleSkin">{{ skin === 'dark' ? '浅色主题' : '深色主题' }}</el-button>
        <el-button v-if="!readonly" size="mini" type="primary" icon="el-icon-plus" @click="openCreate()">新增任务</el-button>
        <el-button size="mini" icon="el-icon-download" @click="exportSnapshot">导出 JSON</el-button>
        <!-- 预留：使用方追加自定义工具栏按钮 -->
        <slot name="toolbar-extra"></slot>
      </div>
    </div>

    <!-- gantt 本体：原生 grid + timeline 在容器内；resizer 视图是 PRO 功能，
         社区版用自绘分割条（拖动调 setGridWidth，双击复位） -->
    <div class="gantt-host" :class="{ resizing: resizing }">
      <div ref="ganttEl" class="gantt-inner"></div>
      <div
        ref="resizerEl"
        class="grid-resizer"
        :style="{ left: (innerTableWidth - 3) + 'px' }"
        title="拖动调整表格宽度，双击恢复默认"
        @mousedown="onResizerMousedown"
        @dblclick="resetResizer"
      ></div>
    </div>

    <!-- 编辑/新增弹窗（替代 dhtmlx 灯箱） -->
    <TaskDialog
      :visible.sync="dialog.visible"
      :mode="dialog.mode"
      :task="dialog.task"
      :parent-name="dialog.parentName"
      @save="onDialogSave"
    />
  </div>
</template>

<script>
import { Gantt } from 'dhtmlx-gantt'
// v10 起皮肤/语言/扩展全部打进主包，只需引一个 css（lib 构建时会抽取进组件库 css）
import 'dhtmlx-gantt/codebase/dhtmlxgantt.css'
import TaskDialog from './TaskDialog.vue'

// 内置 grid 列的默认文案（columns 不传时使用全默认列）
const DEFAULT_LABELS = {
  text: '任务名称',
  start: '开始',
  end: '结束',
  duration: '工期',
  progress: '进度',
  ops: '操作'
}

// 操作列默认动作（columns 的 ops 列可用 actions 覆盖）
const DEFAULT_OPS_ACTIONS = [
  { name: 'edit', text: '编辑' },
  { name: 'append', text: '加子任务' },
  { name: 'remove', text: '删除' }
]

// 甘特引擎所需的语义字段 → 默认数据字段名（可用 fields prop 覆盖）
const DEFAULT_FIELDS = {
  id: 'id',
  text: 'text',
  startDate: 'start_date',
  endDate: 'end_date',
  duration: 'duration',
  progress: 'progress',
  parent: 'parent'
}
// 语义字段 → gantt 引擎字段名
const GANTT_KEY = {
  text: 'text',
  startDate: 'start_date',
  endDate: 'end_date',
  duration: 'duration',
  progress: 'progress',
  parent: 'parent'
}

export default {
  name: 'GanttChart',

  components: { TaskDialog },

  props: {
    /**
     * 甘特数据：{ data: Task[] }（无依赖线概念）
     * 字段名默认为 id/text/start_date/end_date/duration/progress/parent，
     * 非标准字段名通过 fields prop 映射
     */
    tasks: { type: Object, required: true },

    /** 字段映射：语义字段 → 使用方数据字段名，如 { id: 'taskId', text: 'name', ... } */
    fields: { type: Object, default: null },

    /** grid 列配置：{ key, label, width, align, format }；
     *  key 为内置类型 text/start/end/duration/progress 时用内置模板，
     *  key 为 ops 时渲染操作按钮（actions: [{name:'edit'|'append'|'remove',text}
     *  或 {text, handler:(task)=>{}}]），其余 key 直接渲染任务的同名字段；
     *  不传使用全默认列 */
    columns: { type: Array, default: null },

    /** 行高（同时作用于 grid 与时间轴任务条） */
    rowHeight: { type: Number, default: 36 },
    /** 任务条高度 */
    barHeight: { type: Number, default: 20 },
    /** 刻度区高度（两级表头） */
    scaleHeight: { type: Number, default: 48 },
    /** 皮肤：material / dark 等 */
    skin: { type: String, default: 'material' },
    /** 初始缩放：quarter / month / day */
    zoom: { type: String, default: 'day' },
    /** 初始 grid 宽度（原生 resizer 可拖拽，拖完 emit update:tableWidth） */
    tableWidth: { type: Number, default: 520 },
    readonly: { type: Boolean, default: false },
    /** 逃生舱：浅合并覆盖 gantt.config 任意配置项（在组件内置配置之后应用） */
    ganttOptions: { type: Object, default: null }
  },

  data() {
    return {
      zoomLevels: [
        { key: 'quarter', label: '季' },
        { key: 'month', label: '月' },
        { key: 'day', label: '日' }
      ],
      // 内部镜像（props 只作初始值，变更走 .sync 事件）
      zoom: this.zoom,
      skin: this.skin,
      innerTableWidth: this.tableWidth,
      resizing: false,
      // 编辑弹窗状态
      dialog: { visible: false, mode: 'create', task: null, parentName: '' }
    }
  },

  computed: {
    /** 语义字段 → 数据字段名的映射表 */
    fieldMap() {
      return Object.assign({}, DEFAULT_FIELDS, this.fields || {})
    },
    /** 把使用方数据按字段映射归一化成 gantt 引擎所需结构 */
    normalizedTasks() {
      const f = this.fieldMap
      const src = this.tasks || {}
      const data = (src.data || []).map((t) => {
        const row = { id: t[f.id] }
        // 语义字段映射
        Object.keys(GANTT_KEY).forEach((k) => {
          const v = t[f[k]]
          if (v !== undefined) row[GANTT_KEY[k]] = v
        })
        // 其余自定义字段透传（供 grid 自定义列/模板使用）；
        // type 不透传——组件已移除里程碑概念，防止外部数据重新引入
        Object.keys(t).forEach((k) => {
          if (k.charCodeAt(0) === 36 || k === 'type' || k in row || t[k] === undefined) return
          row[k] = t[k]
        })
        return row
      })
      return { data }
    }
  },

  watch: {
    tableWidth(val) {
      this.innerTableWidth = val
    },
    // 父组件整体替换 tasks 对象（引用变化）时重新加载
    tasks(val) {
      if (!this.gantt) return
      this.gantt.clearAll()
      this.gantt.parse(this.normalizedTasks)
      this.ensureTimeRange()
    }
  },

  created() {
    // 非响应式内部标记
    this._delConfirm = false
    this._defaultTableWidth = this.tableWidth
  },

  mounted() {
    // 每个组件实例用独立 gantt 实例（社区版支持多实例）
    try {
      this.gantt = Gantt.getGanttInstance()
      this.initGantt()
      this.gantt.parse(this.normalizedTasks)
      this.ensureTimeRange()
      this.bindEvents()
    } catch (e) {
      // 初始化失败不拖垮整个应用；错误带上堆栈便于排查
      // eslint-disable-next-line no-console
      console.error('[GanttChart] 初始化失败：', e && e.stack || e)
    }
  },

  beforeDestroy() {
    this.teardownResizer()
    if (this._opsClickHandler && this.$refs.ganttEl) {
      this.$refs.ganttEl.removeEventListener('click', this._opsClickHandler)
    }
    // 销毁 gantt 实例（防止二次进入实例残留）
    if (this.gantt) {
      this.gantt.destructor()
      this.gantt = null
    }
  },

  methods: {
    initGantt() {
      const g = this.gantt

      // ---- 插件（v10 社区版内置，init 前开启）----
      // 不开 quick_info：其“编辑”按钮走 dhtmlx 灯箱，与 el-dialog 方案冲突
      g.plugins({
        tooltip: true,        // 任务条悬停提示
        drag_timeline: true   // 按住空白时间轴拖动平移
      })

      // ---- 中文与皮肤 ----
      g.i18n.setLocale('cn')
      g.setSkin(this.skin)

      // ---- 基础配置 ----
      g.config.date_format = '%Y-%m-%d' // 与数据中的日期字符串格式一致
      g.config.row_height = this.rowHeight
      g.config.bar_height = Math.max(10, Math.min(this.barHeight, this.rowHeight - 12))
      g.config.auto_types = true        // 有子任务的节点自动按“项目”汇总
      g.config.open_tree_initially = true
      g.config.readonly = !!this.readonly
      g.config.grid_width = this.innerTableWidth

      // ---- 原生布局：grid + timeline 共享滚动条（resizer 视图是 PRO 功能，社区版不可用）----
      g.config.layout = {
        css: 'gantt_container',
        rows: [
          {
            cols: [
              { view: 'grid', scrollX: 'scrollHor', scrollY: 'scrollVer' },
              { view: 'timeline', scrollX: 'scrollHor', scrollY: 'scrollVer' },
              { view: 'scrollbar', id: 'scrollVer' }
            ]
          },
          { view: 'scrollbar', id: 'scrollHor', height: 20 }
        ]
      }

      // ---- 拖拽能力（社区版全部免费）----
      g.config.drag_move = true     // 拖动任务条 → 修改起止日期
      g.config.drag_resize = true   // 拖动任务条两端 → 修改工期
      g.config.drag_progress = true // 拖动任务条里的深色进度段 → 修改进度
      g.config.drag_links = false   // 显式关闭依赖线拖拽（dhtmlx 默认 true，会在任务条两端渲染连接点）
      g.config.show_links = false   // 不渲染任何依赖线

      // ---- 周末底色 + “今天”列高亮 ----
      // 注意：必须在 init() 之前赋值，v10 初始化时会捕获当时的模板函数
      const isWeekend = (date) => date.getDay() === 0 || date.getDay() === 6
      const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
      const isToday = (date) => startOfDay(date) === startOfDay(new Date())
      const cellClass = (date) => (isToday(date) ? 'today' : isWeekend(date) ? 'weekend' : '')
      g.templates.scale_cell_class = cellClass     // 表头刻度格
      g.templates.timeline_cell_class = (item, date) => cellClass(date) // 时间轴列

      this.applyZoom(this.zoom)
      this.applyColumns()

      // ---- 逃生舱：使用方浅合并覆盖 gantt.config ----
      if (this.ganttOptions) {
        Object.keys(this.ganttOptions).forEach((key) => {
          g.config[key] = this.ganttOptions[key]
        })
      }

      // 用户未显式指定 start_date/end_date 时由组件管理时间轴范围（见 ensureTimeRange）；
      // 此时须关掉 fit_tasks，否则每次数据变化 dhtmlx 会把范围缩回任务数据边界，留白失效
      this._autoRange = !(g.config.start_date || g.config.end_date)
      if (this._autoRange && !(this.ganttOptions && 'fit_tasks' in this.ganttOptions)) {
        g.config.fit_tasks = false
      }

      g.init(this.$refs.ganttEl)
      // 列宽总和可能超过 grid_width，以实际渲染宽度为准（resizer 定位依赖它）
      this.$nextTick(() => {
        const el = this.$refs.ganttEl && this.$refs.ganttEl.querySelector('.gantt_grid')
        if (el) this.innerTableWidth = Math.round(el.getBoundingClientRect().width)
      })
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
      this.gantt.config.scale_height = this.scaleHeight
      // init 完成后才有 $root，避免初始化前调 render 报错
      if (this.gantt.$root) this.gantt.render()
    },

    /**
     * columns prop → dhtmlx 原生 grid 列：
     * - key: text/start/end/duration/progress 用内置模板（start/end 显示“含当天”的结束语义），
     *   其余 key 直接渲染任务同名字段
     * - format(task)：自定义单元格文本（dhtmlx template）
     * - tree: 仅 text 列默认开启（树形展开箭头）
     */
    applyColumns() {
      const g = this.gantt
      const fmt = g.date.date_to_str('%Y-%m-%d')
      let list = Array.isArray(this.columns) && this.columns.length ? this.columns : [
        { key: 'text', label: DEFAULT_LABELS.text, width: 200 },
        { key: 'start', label: DEFAULT_LABELS.start, width: 90, align: 'center' },
        { key: 'end', label: DEFAULT_LABELS.end, width: 90, align: 'center' },
        { key: 'duration', label: DEFAULT_LABELS.duration, width: 60, align: 'center' },
        { key: 'progress', label: DEFAULT_LABELS.progress, width: 80, align: 'center' },
        { key: 'ops', label: DEFAULT_LABELS.ops, width: 145, align: 'center' }
      ]
      list = list.map((c) => (typeof c === 'string' ? { key: c } : (c || {})))
      // readonly 不渲染操作列
      if (this.readonly) list = list.filter((c) => c.key !== 'ops')
      // 解析操作列动作（内置 edit/append/remove 或自定义 handler）
      const opsItem = list.find((c) => c.key === 'ops')
      this._opsActions = (opsItem && Array.isArray(opsItem.actions) && opsItem.actions.length
        ? opsItem.actions
        : DEFAULT_OPS_ACTIONS
      ).filter((a) => a && ['edit', 'append', 'remove'].indexOf(a.name) !== -1 || (a && typeof a.handler === 'function'))
      g.config.columns = list.map((c) => {
        const col = c
        const key = col.key
        const name = key === 'start' ? 'start_date' : key === 'end' ? 'end_date' : key
        const def = {
          name,
          label: col.label || DEFAULT_LABELS[key] || key,
          width: col.width || 90,
          align: col.align || (key === 'text' ? 'left' : 'center'),
          tree: key === 'text' ? true : undefined,
          template: typeof col.format === 'function' ? col.format : null
        }
        if (!def.template && key === 'ops') {
          def.template = (t) => this._opsActions
            .map((a, i) => `<button type="button" class="gantt-ops-btn ops-${a.name}" data-ops-action="${i}">${a.text}</button>`)
            .join('')
        } else if (!def.template && key !== 'text') {
          if (key === 'start') def.template = (t) => fmt(t.start_date)
          else if (key === 'end') def.template = (t) => fmt(new Date(t.end_date.getTime() - 86400000))
          else if (key === 'duration') def.template = (t) => (t.duration == null ? '' : String(t.duration))
          else if (key === 'progress') def.template = (t) => Math.round((t.progress || 0) * 100) + '%'
          else def.template = (t) => (t[key] == null ? '' : String(t[key]))
        }
        Object.keys(def).forEach((k) => {
          if (def[k] === undefined) delete def[k]
        })
        return def
      })
    },

    /**
     * 时间轴两侧留白：默认范围贴着任务数据边界（最晚任务的日期即右边界），
     * 滚动条/任务条往右拖到数据边界就会被顶住。这里把范围扩到
     * [最早任务所在月初, 最晚任务月末+2 个月]，只外扩不收缩；
     * 用户通过 ganttOptions 显式指定 start_date/end_date 时不接管
     */
    ensureTimeRange() {
      const g = this.gantt
      if (!g || !this._autoRange) return
      let min = null
      let max = null
      g.eachTask((t) => {
        if (!t.start_date) return
        const end = t.end_date || t.start_date
        if (!min || t.start_date < min) min = t.start_date
        if (!max || end > max) max = end
      })
      if (!min || !max) return
      const wantStart = new Date(min.getFullYear(), min.getMonth(), 1)
      const wantEnd = new Date(max.getFullYear(), max.getMonth() + 2, 1)
      const curS = g.config.start_date
      const curE = g.config.end_date
      if (curS && curE && curS <= wantStart && curE >= wantEnd) return
      const keep = g.getScrollState()
      g.config.start_date = curS && curS < wantStart ? curS : wantStart
      g.config.end_date = curE && curE > wantEnd ? curE : wantEnd
      g.render()
      g.scrollTo(keep.x, keep.y)
    },

    // ---------- 事件绑定 ----------
    bindEvents() {
      const g = this.gantt
      const fmt = g.date.date_to_str('%Y-%m-%d')

      // ---- gantt 变更 → 事件回传 ----
      g.attachEvent('onAfterTaskDrag', (id, mode) => {
        const task = g.getTask(id)
        const name = { move: '拖动改期', resize: '调整工期', progress: '更新进度' }[mode] || mode
        this.emitEvent(
          'task-drag',
          `${name}：「${task.text}」→ ${fmt(task.start_date)} ~ ${fmt(task.end_date)}`,
          task
        )
      })

      g.attachEvent('onAfterTaskAdd', (id, task) => {
        this.emitEvent('task-add', `新增任务：「${task.text}」`, task)
        this.ensureTimeRange()
      })

      g.attachEvent('onAfterTaskUpdate', (id, task) => {
        this.emitEvent('task-update', `任务已更新：「${task.text}」`, task)
        this.ensureTimeRange()
      })

      g.attachEvent('onAfterTaskDelete', (id, task) => {
        this.emitEvent('task-delete', `删除任务：「${task.text}」`, task)
      })

      // ---- 交互 ----
      // 点击任务条/行 → 事件回传（dhtmlx 原生会选中该行）
      g.attachEvent('onTaskClick', (id, task) => {
        this.emitEvent('task-click', `选中任务：「${task.text}」`, task)
        return true
      })

      // 双击任务条/行 → 打开 el-dialog 编辑（返回 false 阻止默认灯箱）
      g.attachEvent('onTaskDblClick', (id) => {
        if (!this.readonly) this.openEdit(g.getTask(id))
        return false
      })

      // 双保险：任何灯箱打开请求一律拦截（编辑统一走 el-dialog）
      g.attachEvent('onBeforeLightbox', () => false)

      // 删除确认（键盘 Delete 等入口都走这里；MessageBox 是异步的，
      // 因此先同步返回 false 拦截，确认后再带标记执行真正的删除）
      g.attachEvent('onBeforeTaskDelete', (id) => {
        if (this._delConfirm) return true
        const task = g.getTask(id)
        this.confirmDelete(task.text, id)
        return false
      })

      // ---- 操作列按钮（事件委托挂在容器上，grid 重建后依然有效）----
      this._opsClickHandler = (e) => {
        const btn = e.target && e.target.closest ? e.target.closest('[data-ops-action]') : null
        if (!btn || !this.gantt || this.readonly) return
        const id = this.gantt.locate(e)
        if (id == null) return
        const task = this.gantt.getTask(id)
        const action = (this._opsActions || [])[Number(btn.getAttribute('data-ops-action'))]
        if (!action) return
        if (action.name === 'edit') this.openEdit(task)
        else if (action.name === 'append') this.openCreate(task)
        else if (action.name === 'remove') this.confirmDelete(task.text, id)
        else if (typeof action.handler === 'function') action.handler(task)
      }
      this.$refs.ganttEl.addEventListener('click', this._opsClickHandler)
    },

    // ---------- 分割条拖拽：调整原生 grid 宽度 ----------
    onResizerMousedown(e) {
      if (this.readonly) return
      e.preventDefault()
      this._dragStartX = e.clientX
      this._dragStartW = this.innerTableWidth
      this.resizing = true
      document.addEventListener('mousemove', this.onResizerMove)
      document.addEventListener('mouseup', this.onResizerMouseup)
    },

    onResizerMove(e) {
      const host = this.$refs.resizerEl && this.$refs.resizerEl.parentElement
      const max = host ? host.clientWidth - 240 : 1200
      const next = this._dragStartW + (e.clientX - this._dragStartX)
      const target = Math.min(max, Math.max(200, Math.round(next)))
      if (this.gantt) {
        // v10 无 setGridWidth：改 config 后 setSizes 重排；实际宽度以 DOM 为准
        this.gantt.config.grid_width = target
        this.gantt.setSizes()
        const el = this.$refs.ganttEl.querySelector('.gantt_grid')
        if (el) this.innerTableWidth = Math.round(el.getBoundingClientRect().width)
      }
    },

    onResizerMouseup() {
      this.resizing = false
      this.teardownResizer()
      this.$emit('update:tableWidth', this.innerTableWidth)
      this.emitEvent('table-resize', `表格宽度调整为 ${this.innerTableWidth}px`, { tableWidth: this.innerTableWidth })
    },

    resetResizer() {
      this.innerTableWidth = this._defaultTableWidth
      if (this.gantt) {
        this.gantt.config.grid_width = this.innerTableWidth
        this.gantt.setSizes()
      }
      this.$emit('update:tableWidth', this.innerTableWidth)
    },

    teardownResizer() {
      document.removeEventListener('mousemove', this.onResizerMove)
      document.removeEventListener('mouseup', this.onResizerMouseup)
    },

    // ---------- 工具栏 ----------
    toggleSkin() {
      this.skin = this.skin === 'dark' ? 'material' : 'dark'
      if (this.gantt) this.gantt.setSkin(this.skin)
    },

    exportSnapshot() {
      const snapshot = this.getSnapshot()
      console.log('[Gantt 全量数据]', JSON.stringify(snapshot, null, 2))
      this.emitEvent(
        'snapshot',
        `全量数据已打印到控制台（${snapshot.data.length} 个任务）`,
        snapshot
      )
    },

    // ---------- 编辑弹窗 ----------
    openCreate(parentTask) {
      if (this.readonly) return
      this.dialog = {
        visible: true,
        mode: parentTask ? 'appendChild' : 'create',
        task: parentTask || null,
        parentName: parentTask ? parentTask.text : ''
      }
    },

    openEdit(task) {
      if (this.readonly || !task) return
      const f = this.gantt.date.date_to_str('%Y-%m-%d')
      this.dialog = {
        visible: true,
        mode: 'edit',
        parentName: '',
        // 交给表单的视图模型：日期串（结束含当天）+ 整数进度
        task: {
          id: task.id,
          type: task.type || 'task',
          text: task.text,
          start: f(task.start_date),
          end: f(new Date(task.end_date.getTime() - 86400000)),
          progress: Math.round((task.progress || 0) * 100)
        }
      }
    },

    onDialogSave(form) {
      const g = this.gantt
      const d = this.dialog

      if (d.mode === 'edit') {
        g.updateTask(d.task.id, {
          text: form.text,
          start_date: form.start,
          duration: this.diffDays(form.start, form.end) + 1, // 结束日期含当天
          progress: form.progress / 100
        })
      } else {
        const item = {
          text: form.text,
          start_date: form.start,
          duration: this.diffDays(form.start, form.end) + 1,
          progress: form.progress / 100
        }
        if (d.mode === 'appendChild' && d.task) item.parent = d.task.id
        g.addTask(item)
      }

      d.visible = false
    },

    /** 删除确认（异步确认后带标记执行真正删除） */
    confirmDelete(text, id) {
      if (this.readonly) return
      this.$confirm(`确定删除任务「${text}」吗？（子任务会一并删除）`, '提示', { type: 'warning' })
        .then(() => {
          this._delConfirm = true
          this.gantt.deleteTask(id)
          this._delConfirm = false
        })
        .catch(() => {})
    },

    diffDays(start, end) {
      return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000)
    },

    /** 转发 gantt 事件给父组件 */
    emitEvent(type, message, data) {
      this.$emit('gantt-event', { type, message, data })
    },

    /** 对外方法：取 gantt 实例（进阶用法，直接调 dhtmlx API） */
    getInstance() {
      return this.gantt
    },

    /** 对外方法：取全量数据（对接后端保存） */
    getSnapshot() {
      return this.gantt ? this.gantt.serialize() : { data: [] }
    }
  }
}
</script>

<style>
/* 甘特图内部 DOM 大量动态生成，样式不要加 scoped */
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
.tb-right { display: flex; align-items: center; gap: 10px; }
.tb-label { color: #888; font-size: 13px; }

/* gantt 本体（grid + timeline）撑满剩余空间；resizer 绝对定位在 grid 右缘 */
.gantt-host {
  flex: 1;
  min-height: 0;
  position: relative;
}
.gantt-inner {
  width: 100%;
  height: 100%;
}
.grid-resizer {
  position: absolute;
  top: 0;
  bottom: 20px; /* 让出底部横向滚动条 */
  width: 6px;
  margin-left: 0;
  cursor: col-resize;
  z-index: 1;
  background: transparent;
  transition: background 0.15s;
}
.grid-resizer:hover,
.gantt-host.resizing .grid-resizer {
  background: #3f8cff;
}
.gantt-host.resizing {
  user-select: none;
}

/* 操作列按钮 */
.gantt-ops-btn {
  border: none;
  background: transparent;
  color: #3f8cff;
  cursor: pointer;
  font-size: 12px;
  padding: 0 4px;
}
.gantt-ops-btn:hover { text-decoration: underline; }
.gantt-ops-btn.ops-remove { color: #f56c6c; }

/* 周末底色 / 今天列高亮 */
.gantt-wrapper .weekend { background-color: #f4f6f9; }
.gantt-wrapper .today { background-color: rgba(255, 92, 92, 0.10); }
.gantt-wrapper .gantt_scale_cell.today { color: #ff5c5c; font-weight: 600; }
</style>
