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
        <el-button size="mini" icon="el-icon-download" @click="exportSnapshot">导出 JSON</el-button>
        <!-- 使用方追加自定义工具栏按钮（如“新增”，配合 addTask 代理方法） -->
        <slot name="toolbar-extra"></slot>
      </div>
    </div>

    <!-- gantt 本体：原生 grid + timeline 在容器内；resizer 视图是 PRO 功能，
         社区版用自绘分割条（拖动调 config.grid_width + setSizes，双击复位） -->
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
  </div>
</template>

<script>
import { Gantt } from 'dhtmlx-gantt'
// v10 起皮肤/语言/扩展全部打进主包，只需引一个 css（lib 构建时会抽取进组件库 css）
import 'dhtmlx-gantt/codebase/dhtmlxgantt.css'

// 内置便捷列的默认文案（仅 start/end；其余列由使用方配置业务字段）
const DEFAULT_LABELS = {
  start: '开始',
  end: '结束'
}

/**
 * 字段映射（组件唯一的数据契约）：
 * - startDate / endDate 必填（有默认字段名），结束时间为“含当天”语义
 * - id 可选：业务主键字段；不传则用行下标作内部 id
 * - text 可选：任务显示名（悬停 tooltip/无障碍标签）；不传则 tooltip 显示起止日期
 * - parent 可选：传了才有树形展开/收起（值需对应 id 映射的内部 id）
 * - progress 可选：时间轴条内进度段，值域 0~1（引擎语义）
 */
const DEFAULT_FIELDS = {
  id: null,
  text: null,
  startDate: 'start_date',
  endDate: 'end_date',
  parent: null,
  progress: null
}
// 语义字段 → gantt 引擎字段名
const GANTT_KEY = {
  text: 'text',
  startDate: 'start_date',
  endDate: 'end_date',
  parent: 'parent',
  progress: 'progress'
}
// 引擎保留字段：透传时跳过（业务字段撞名会被遮蔽，展示请换字段名或用内置列 key）
const ENGINE_KEYS = ['id', 'start_date', 'end_date', 'duration', 'parent', 'progress', 'type']

export default {
  name: 'GanttChart',

  props: {
    /**
     * 业务行数组：每行至少包含开始/结束时间（经 fields 映射），
     * 其余字段任意，会透传进引擎供 columns 自定义列与 actions 读取
     */
    tasks: { type: Array, required: true },

    /** 字段映射：{ id?, text?, startDate, endDate, parent?, progress? } */
    fields: { type: Object, default: null },

    /**
     * grid 列配置：{ key, label, width, align, tree, format }；
     * - key 为 start/end 时用内置模板（“含当天”语义换算）
     * - key 为 ops 时渲染操作列，actions: [{ text, handler(row, task) }]
     *   全部由使用方定义，组件不内置任何动作；配置了 actions 才渲染该列
     * - 其余 key 直接渲染任务的同名字段（含透传的业务字段）
     * - 不传时只显示 开始/结束 两列
     */
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
    /**
     * 任务条上显示的文字（tooltip 同步使用）：
     * - 不传：自动——text 映射 → 第一条业务列的值 → 空
     * - 字符串：任务对象上的字段名，如 "name"
     * - 函数：(task) => string，完全自定义（可拼接多个字段）
     * - false：不显示条上文字
     */
    barText: { type: [String, Function, Boolean], default: undefined },
    /** 初始 grid 宽度（自绘分割条可拖拽，拖完 emit update:tableWidth） */
    tableWidth: { type: Number, default: 220 },
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
      resizing: false
    }
  },

  computed: {
    /** 字段映射表（合并默认值） */
    fieldMap() {
      return Object.assign({}, DEFAULT_FIELDS, this.fields || {})
    },
    /**
     * 业务行数组 → 引擎任务数组：
     * - id：fields.id 映射，缺省用行下标
     * - 起止时间 → start_date + duration（结束“含当天”，+1 天）
     * - parent/progress 可选映射
     * - 其余业务字段透传（供 columns/actions 读取）；
     *   映射过的源字段与 type 不透传（type 是引擎保留字段）
     */
    normalizedTasks() {
      const f = this.fieldMap
      const arr = Array.isArray(this.tasks) ? this.tasks : []
      const data = arr.map((t, index) => {
        const row = { id: this.internalIdOf(t, index) }
        row.start_date = t[f.startDate]
        row.duration = this.diffDays(t[f.startDate], t[f.endDate]) + 1 // 结束含当天
        if (f.text && t[f.text] != null) row.text = t[f.text]
        if (f.parent && t[f.parent] != null) row.parent = t[f.parent]
        if (f.progress && t[f.progress] != null) row.progress = t[f.progress]
        Object.keys(t).forEach((k) => {
          if (k.charCodeAt(0) === 36 || k in row || t[k] === undefined) return
          if (ENGINE_KEYS.indexOf(k) !== -1) return // 引擎保留字段不透传
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
    // 父组件整体替换 tasks 数组（引用变化）时重新加载；
    // 行内数据的局部修改请使用 updateTask 代理方法（避免整表重载）
    tasks() {
      if (!this.gantt) return
      this.loadTasks()
    }
  },

  created() {
    // 非响应式内部标记
    this._allowDelete = false
    this._defaultTableWidth = this.tableWidth
    this._rowsById = {}       // 内部 id → 原始业务行
    this._opsActions = []
  },

  mounted() {
    // 每个组件实例用独立 gantt 实例（社区版支持多实例）
    try {
      this.gantt = Gantt.getGanttInstance()
      this.initGantt()
      this.loadTasks()
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
      // 不开 quick_info：其“编辑”按钮走 dhtmlx 灯箱，与“上层自行处理编辑”的定位冲突
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
      g.config.open_tree_initially = true
      g.config.readonly = !!this.readonly
      g.config.grid_width = this.innerTableWidth
      // 有子任务的节点自动按“项目”汇总（仅当使用树形时有意义，平铺数据无影响）
      g.config.auto_types = true

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
      g.config.drag_progress = true // 拖动任务条里的深色进度段 → 修改进度（需要 progress 映射）
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
      const tipFmt = g.date.date_to_str('%Y-%m-%d')
      const resolveBarText = (task) => {
        // barText prop 显式指定优先；否则回退链：text 映射 → 主列值（如任务名称列）→ 空
        const b = this.barText
        if (b === false || b === '') return ''
        if (typeof b === 'function') {
          const out = b(task)
          return out == null ? '' : String(out)
        }
        if (typeof b === 'string' && b) return task[b] == null ? '' : String(task[b])
        if (task.text != null && task.text !== '') return String(task.text)
        const k = this._primaryColKey
        if (k && task[k] != null && String(task[k]) !== '') return String(task[k])
        return ''
      }
      g.templates.task_text = (start, end, task) => resolveBarText(task)
      g.templates.tooltip_text = (start, end, task) => {
        const label = resolveBarText(task)
        return label || (tipFmt(start) + ' ~ ' + tipFmt(new Date(end.getTime() - 86400000)))
      }

      this.applyZoom(this.zoom)
      this.applyColumns()

      // ---- 逃生舱：使用方浅合并覆盖 gantt.config ----
      if (this.ganttOptions) {
        Object.keys(this.ganttOptions).forEach((key) => {
          g.config[key] = this.ganttOptions[key]
        })
      }

      // 使用方未显式指定 start_date/end_date 时由组件管理时间轴范围（见 ensureTimeRange）；
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
     * - key 为 start/end：内置模板（“含当天”语义换算）
     * - key 为 ops：操作列，按钮由 actions 配置渲染，点击经事件委托分发
     * - 其余 key：渲染任务同名字段（含透传的业务字段），format(task) 自定义文本
     * - tree: true 的列渲染树形展开箭头（需配合 fields.parent）
     */
    applyColumns() {
      const g = this.gantt
      const fmt = g.date.date_to_str('%Y-%m-%d')
      let list = Array.isArray(this.columns) && this.columns.length ? this.columns : [
        { key: 'start', label: DEFAULT_LABELS.start, width: 90, align: 'center' },
        { key: 'end', label: DEFAULT_LABELS.end, width: 90, align: 'center' }
      ]
      list = list.map((c) => (typeof c === 'string' ? { key: c } : (c || {})))
      // readonly 不渲染操作列
      if (this.readonly) list = list.filter((c) => c.key !== 'ops')
      // 解析操作列动作：全部由使用方定义（handler(row, task)），组件不内置动作
      const opsItem = list.find((c) => c.key === 'ops')
      this._opsActions = (opsItem && Array.isArray(opsItem.actions) ? opsItem.actions : [])
        .filter((a) => a && typeof a.handler === 'function' && a.text != null)
      g.config.columns = list.map((col) => {
        const key = col.key
        const name = key === 'start' ? 'start_date' : key === 'end' ? 'end_date' : key
        const def = {
          name,
          label: col.label || DEFAULT_LABELS[key] || key,
          width: col.width || 90,
          align: col.align || 'left',
          tree: col.tree === true || undefined,
          template: typeof col.format === 'function' ? col.format : null
        }
        if (!def.template && key === 'ops') {
          def.template = (t) => this._opsActions
            .map((a, i) => `<button type="button" class="gantt-ops-btn" data-ops-action="${i}">${a.text}</button>`)
            .join('')
        } else if (!def.template && key === 'start') {
          def.template = (t) => fmt(t.start_date)
        } else if (!def.template && key === 'end') {
          def.template = (t) => fmt(new Date(t.end_date.getTime() - 86400000))
        }
        Object.keys(def).forEach((k) => {
          if (def[k] === undefined) delete def[k]
        })
        return def
      })
      // 主列 = 第一条非 ops 列：任务条文字在无 text 映射时回退显示它的值
      const primary = list.find((c) => c.key !== 'ops')
      this._primaryColKey = primary ? primary.key : null
    },

    /** 载入业务行：parse + 重建 内部id→业务行 映射 + 时间轴留白 */
    loadTasks() {
      const g = this.gantt
      g.clearAll()
      g.parse(this.normalizedTasks)
      const f = this.fieldMap
      const map = {}
      ;(Array.isArray(this.tasks) ? this.tasks : []).forEach((t, index) => {
        map[String(this.internalIdOf(t, index))] = t
      })
      this._rowsById = map
      this.ensureTimeRange()
    },

    /** 内部 id → 原始业务行 */
    rowById(id) {
      return this._rowsById[String(id)]
    },

    /**
     * 业务行 → 内部 id：fields.id 映射优先；无映射（或业务 id 为空/0）用 行下标+1。
     * 注意不能为 0——dhtmlx 以 parent=0 表示根节点，id=0 会形成自身父子环
     */
    internalIdOf(t, index) {
      const f = this.fieldMap
      if (f.id) {
        const v = t[f.id]
        if (v != null && v !== 0 && v !== '') return v
      }
      return index + 1
    },

    /** 业务行 → 内部 id：优先 fields.id 映射，否则按对象引用匹配（addTask 会登记） */
    findInternalId(row) {
      const f = this.fieldMap
      if (f.id && row && row[f.id] != null && row[f.id] !== 0 && row[f.id] !== '') return row[f.id]
      if (!row) return null
      const key = Object.keys(this._rowsById).find((k) => this._rowsById[k] === row)
      return key == null ? null : key
    },

    /** 业务行 → 引擎任务项（起止时间换算为 start_date + duration） */
    buildTaskItem(row) {
      const f = this.fieldMap
      const item = {}
      if (f.id && row[f.id] != null && row[f.id] !== 0 && row[f.id] !== '') item.id = row[f.id]
      item.start_date = row[f.startDate]
      item.duration = this.diffDays(row[f.startDate], row[f.endDate]) + 1 // 结束含当天
      if (f.text && row[f.text] != null) item.text = row[f.text]
      if (f.parent && row[f.parent] != null) item.parent = row[f.parent]
      if (f.progress && row[f.progress] != null) item.progress = row[f.progress]
      Object.keys(row).forEach((k) => {
        if (k.charCodeAt(0) === 36 || k in item || row[k] === undefined) return
        if (ENGINE_KEYS.indexOf(k) !== -1) return // 引擎保留字段不透传
        item[k] = row[k]
      })
      return item
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

      // 拖拽改期/工期/进度结束 → 抛给上层（含“含当天”的起止日期串）
      g.attachEvent('onAfterTaskDrag', (id, mode) => {
        const task = g.getTask(id)
        this.$emit('task-drag', {
          type: mode, // move / resize / progress
          row: this.rowById(id),
          task,
          startDate: fmt(task.start_date),
          endDate: fmt(new Date(task.end_date.getTime() - 86400000))
        })
      })

      // 拖拽可能把任务推到已渲染范围之外 → 外扩时间轴（不发事件）
      g.attachEvent('onAfterTaskUpdate', () => {
        this.ensureTimeRange()
      })

      // 单击行/任务条
      g.attachEvent('onTaskClick', (id, task) => {
        this.$emit('task-click', this.rowById(id), task)
        return true
      })

      // 双击行/任务条 → 事件抛给上层，编辑 UI 由上层实现（返回 false 同时拦掉默认灯箱）
      g.attachEvent('onTaskDblClick', (id) => {
        const task = g.getTask(id)
        this.$emit('task-dblclick', this.rowById(id), task)
        return false
      })

      // 灯箱始终拦截（编辑 UI 由上层实现）
      g.attachEvent('onBeforeLightbox', () => false)

      // 删除只允许经由 removeTask 代理方法（_allowDelete 标记），
      // 键盘 Delete 等隐式入口一律拦截——删除是业务动作，不应有默认行为
      g.attachEvent('onBeforeTaskDelete', () => this._allowDelete === true)

      // ---- 操作列按钮（事件委托挂在容器上，grid 重建后依然有效）----
      this._opsClickHandler = (e) => {
        const btn = e.target && e.target.closest ? e.target.closest('[data-ops-action]') : null
        if (!btn || !this.gantt || this.readonly) return
        const id = this.gantt.locate(e)
        if (id == null) return
        const action = this._opsActions[Number(btn.getAttribute('data-ops-action'))]
        if (!action) return
        action.handler(this.rowById(id), this.gantt.getTask(id))
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
    },

    // ---------- 引擎代理方法（供上层自定义操作/工具栏调用） ----------
    /**
     * 新增一行：row 为业务行（含起止时间字段），翻译后塞入引擎。
     * 无 fields.id 时引擎自动分配内部 id（返回值可拿到）。
     * 返回内部 id；注意同时自行维护上层的数据源。
     */
    addTask(row) {
      if (!this.gantt || !row) return null
      const task = this.gantt.addTask(this.buildTaskItem(row))
      this._rowsById[String(task.id)] = row
      this.ensureTimeRange()
      return task.id
    },

    /**
     * 更新一行业：row 为业务行（含起止时间字段）。
     * fields.id 已配置时按业务 id 定位；否则按对象引用匹配（必须传原行对象）。
     */
    updateTask(row) {
      if (!this.gantt || !row) return false
      const id = this.findInternalId(row)
      if (id == null) return false
      this.gantt.updateTask(id, this.buildTaskItem(row))
      this.ensureTimeRange()
      return true
    },

    /** 删除一行：定位规则同 updateTask；不会弹确认——确认逻辑属于上层 */
    removeTask(row) {
      if (!this.gantt || !row) return false
      const id = this.findInternalId(row)
      if (id == null) return false
      this._allowDelete = true
      this.gantt.deleteTask(id)
      this._allowDelete = false
      delete this._rowsById[String(id)]
      return true
    },

    diffDays(start, end) {
      return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000)
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

/* 周末底色 / 今天列高亮 */
.gantt-wrapper .weekend { background-color: #f4f6f9; }
.gantt-wrapper .today { background-color: rgba(255, 92, 92, 0.10); }
.gantt-wrapper .gantt_scale_cell.today { color: #ff5c5c; font-weight: 600; }
</style>
