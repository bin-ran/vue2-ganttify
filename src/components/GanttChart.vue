<template>
  <div class="gantt-wrapper" :class="{ resizing: resizing }" :style="cssVars">
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

    <div class="work-area">
      <!-- 左：ElementUI 树形表格（替代 gantt 自带 grid） -->
      <div class="gantt-table" :style="{ width: innerTableWidth + 'px' }">
        <el-table
          ref="ganttTable"
          :data="rows"
          row-key="id"
          :tree-props="{ children: 'children' }"
          border
          height="100%"
          size="mini"
          highlight-current-row
          @row-click="onRowClick"
          @expand-change="onExpandChange"
        >
          <el-table-column
            v-for="col in visibleColumns"
            :key="col.key"
            :prop="col.key === 'ops' ? undefined : col.key"
            :label="col.label"
            :width="col.width"
            :min-width="col.minWidth"
            :align="col.align"
            :sortable="col.sortable"
            :show-overflow-tooltip="col.tooltip"
          >
            <!-- 单个作用域插槽模板 + 内部分支：Vue2 里同名多个 <template slot-scope>
                 只有第一个生效，不能拆成多个模板做 v-if 链 -->
            <template slot-scope="scope">
              <!-- 使用方可通过 #col-<key> 覆盖任意列（含内置列）的渲染 -->
              <slot
                v-if="$scopedSlots['col-' + col.key]"
                :name="'col-' + col.key"
                v-bind="scope"
              ></slot>
              <template v-else-if="col.key === 'text'">
                <el-tag v-if="scope.row.type === 'milestone'" size="mini" type="warning">里程碑</el-tag>
                <span :class="{ 'proj-name': scope.row.type === 'project' }">{{ scope.row.text }}</span>
              </template>
              <el-progress
                v-else-if="col.key === 'progress' && scope.row.type !== 'milestone'"
                :percentage="Math.min(100, scope.row.progress || 0)"
                :stroke-width="8"
                :show-text="false"
              />
              <span v-else-if="col.key === 'progress'">-</span>
              <template v-else-if="col.key === 'ops'">
                <el-button type="text" size="mini" @click.stop="openEdit(scope.row)">编辑</el-button>
                <el-button
                  v-if="scope.row.type !== 'milestone'"
                  type="text"
                  size="mini"
                  @click.stop="openCreate(scope.row)"
                >加子任务</el-button>
                <el-button type="text" size="mini" class="danger-btn" @click.stop="confirmDelete(scope.row.text, scope.row.id)">删除</el-button>
              </template>
              <template v-else>
                {{ col.format ? col.format(scope.row) : scope.row[col.key] }}
              </template>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 拖拽分割条：调整左侧表格宽度（双击恢复默认） -->
      <div
        class="gantt-resizer"
        title="拖动调整表格宽度，双击恢复默认"
        @mousedown="onResizerMousedown"
        @dblclick="resetResizer"
      ></div>

      <!-- 右：dhtmlx 只渲染时间轴（自定义 layout 隐藏自带 grid） -->
      <div ref="ganttEl" class="gantt-timeline"></div>
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

// 内置列的默认文案/宽度（columns 不传时使用全默认列）
const DEFAULT_LABELS = {
  text: '任务名称',
  start: '开始',
  end: '结束',
  duration: '工期',
  progress: '进度',
  ops: '操作'
}
const DEFAULT_MIN_WIDTHS = {
  text: 170,
  start: 90,
  end: 90,
  duration: 55,
  progress: 100,
  ops: 145
}

// 甘特引擎所需的语义字段 → 默认数据字段名（可用 fields prop 覆盖）
const DEFAULT_FIELDS = {
  id: 'id',
  text: 'text',
  startDate: 'start_date',
  endDate: 'end_date',
  duration: 'duration',
  progress: 'progress',
  parent: 'parent',
  type: 'type'
}
// 语义字段 → gantt 引擎字段名
const GANTT_KEY = {
  text: 'text',
  startDate: 'start_date',
  endDate: 'end_date',
  duration: 'duration',
  progress: 'progress',
  parent: 'parent',
  type: 'type'
}

export default {
  name: 'GanttChart',

  components: { TaskDialog },

  props: {
    /**
     * 结构：{ data: Task[] }（无依赖线概念）
     * gantt 实例是唯一数据源：表格数据由它派生；
     * 取全量数据用 getSnapshot()。
     */
    tasks: { type: Object, required: true },
    /** 行高（px），与左侧表格行高自动对齐 */
    rowHeight: { type: Number, default: 36 },
    /** 任务条高度（px），自动限制在行高内 */
    barHeight: { type: Number, default: 20 },
    /** 刻度区高度（px），表头随之对齐 */
    scaleHeight: { type: Number, default: 48 },
    /** 主题：material / terrace / dark / meadow / broadway / skyblue / contrast（初始值） */
    skin: { type: String, default: 'material' },
    /** 初始时间轴缩放：quarter / month / day */
    zoom: { type: String, default: 'day' },
    /** 左侧表格初始宽度（支持 .sync） */
    tableWidth: { type: Number, default: 640 },
    /** 只读模式：禁用全部拖拽/编辑/新增删除 */
    readonly: { type: Boolean, default: false },
    /**
     * 甘特数据字段映射：把使用方的数据字段名映射到组件所需的语义字段。
     * 可映射键：id / text / startDate / endDate / duration / progress / parent / type
     * 缺省使用默认名（id/text/start_date/end_date/duration/progress/parent/type）
     */
    fields: { type: Object, default: null },
    /**
     * 外部表格数据：[{ [fields.id]: 任务id, ...任意自定义字段 }]
     * 行序与外部一致；日期/工期/进度等以 gantt 为权威合并；
     * gantt 变更后 emit 'table-data-change' 回传合并行（内容无变化不重复回传）
     */
    tableData: { type: Array, default: null },
    /**
     * 左侧表格列配置，缺省为内置 6 列。
     * key 为内置类型时保留专门渲染：text(树列+里程碑标签) / start / end / duration /
     * progress(进度条) / ops(编辑/加子任务/删除，readonly 时自动隐藏)；
     * key 为其他值时渲染任务数据里的同名字段（自定义字段会透传），
     * 任意列均可用作用域插槽 #col-<key>="{ row }" 覆盖渲染。
     * 列项：{ key, label, width, minWidth, align, sortable, tooltip, format(row)=>String }
     */
    columns: { type: Array, default: null },
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
      // 左侧表格数据（由 gantt 数据 + 外部 tableData 合并派生的树形结构）
      rows: [],
      expandedIds: [],
      selectedId: null,
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
        Object.keys(GANTT_KEY).forEach((k) => {
          const v = t[f[k]]
          if (v !== undefined) row[GANTT_KEY[k]] = v
        })
        return row
      })
      return { data }
    },
    /** 原始源数据按 id 索引（透传自定义字段用） */
    sourceById() {
      const f = this.fieldMap
      const map = {}
      ;((this.tasks || {}).data || []).forEach((t) => {
        map[t[f.id]] = t
      })
      return map
    },
    /** 行高/刻度高度以 CSS 变量下发，保证两侧严格对齐 */
    cssVars() {
      return {
        '--g-row-h': this.rowHeight + 'px',
        '--g-scale-h': this.scaleHeight + 'px'
      }
    },
    /** 归一化后的表格列配置 */
    visibleColumns() {
      const list = Array.isArray(this.columns) && this.columns.length ? this.columns : [
        { key: 'text' }, { key: 'start' }, { key: 'end' },
        { key: 'duration' }, { key: 'progress' }, { key: 'ops' }
      ]
      return list
        .map((c) => (typeof c === 'string' ? { key: c } : c))
        .filter((c) => c && c.key)
        .map((c) => ({
          key: c.key,
          label: c.label || DEFAULT_LABELS[c.key] || c.key,
          width: c.width,
          minWidth: c.width ? undefined : (c.minWidth || DEFAULT_MIN_WIDTHS[c.key] || 80),
          align: c.align || (c.key === 'text' ? 'left' : 'center'),
          sortable: !!c.sortable,
          tooltip: c.tooltip !== undefined ? !!c.tooltip : c.key === 'text',
          format: typeof c.format === 'function' ? c.format : null
        }))
        .filter((c) => !(c.key === 'ops' && this.readonly))
    }
  },

  watch: {
    tableWidth(val) {
      this.innerTableWidth = val
    },
    // 外部表格数据变化：仅重算合并行（gantt 仍是日期/进度的权威，不回灌引擎）
    tableData() {
      this.rebuildTable()
    },
    // 父组件整体替换 tasks 对象（引用变化）时重新加载
    tasks(val) {
      if (!this.gantt) return
      this.gantt.clearAll()
      this.gantt.parse(this.normalizedTasks)
      this.ensureTimeRange()
      this.rebuildTable()
    }
  },

  created() {
    // 非响应式内部标记
    this._delConfirm = false
    this._tableInited = false
    this.nodeMap = {}
    this._raf = null
    this._scrollLock = null
    this._defaultTableWidth = this.tableWidth
  },

  mounted() {
    // 每个组件实例用独立 gantt 实例（社区版支持多实例）
    this.gantt = Gantt.getGanttInstance()
    this.initGantt()
    this.gantt.parse(this.normalizedTasks)
    this.ensureTimeRange()
    this.rebuildTable()
    this.bindEvents()
  },

  beforeDestroy() {
    // 移除拖拽/滚动监听 + 销毁 gantt 实例（防止二次进入实例残留）
    this.teardownResizer()
    if (this._raf) cancelAnimationFrame(this._raf)
    clearTimeout(this._scrollLockTimer)
    if (this._tableScrollEl) {
      this._tableScrollEl.removeEventListener('scroll', this._onTableScroll)
      this._tableScrollEl = null
    }
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
      g.config.fit_tasks = true         // 数据超出当前时间轴范围时自动扩展
      g.config.row_height = this.rowHeight
      g.config.bar_height = Math.max(10, Math.min(this.barHeight, this.rowHeight - 12))
      g.config.auto_types = true        // 有子任务的节点自动按“项目”汇总
      g.config.open_tree_initially = true
      g.config.readonly = !!this.readonly

      // ---- 拖拽能力（社区版全部免费）----
      g.config.drag_move = true     // 拖动任务条 → 修改起止日期
      g.config.drag_resize = true   // 拖动任务条两端 → 修改工期
      g.config.drag_progress = true // 拖动任务条里的深色进度段 → 修改进度
      g.config.drag_links = false   // 显式关闭依赖线拖拽（dhtmlx 默认 true，会在任务条两端渲染连接点）
      g.config.show_links = false   // 不渲染任何依赖线

      // ---- 左侧 grid 由 ElementUI el-table 替代，这里只渲染时间轴 ----
      g.config.layout = {
        css: 'gantt_container',
        rows: [
          {
            cols: [
              { view: 'timeline', scrollX: 'scrollHor', scrollY: 'scrollVer' },
              { view: 'scrollbar', id: 'scrollVer' }
            ]
          },
          { view: 'scrollbar', id: 'scrollHor', height: 20 }
        ]
      }

      // ---- 周末底色 + “今天”列高亮 ----
      // 注意：必须在 init() 之前赋值，v10 初始化时会捕获当时的模板函数
      const isWeekend = (date) => date.getDay() === 0 || date.getDay() === 6
      const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
      const isToday = (date) => startOfDay(date) === startOfDay(new Date())
      const cellClass = (date) => (isToday(date) ? 'today' : isWeekend(date) ? 'weekend' : '')
      g.templates.scale_cell_class = cellClass     // 表头刻度格
      g.templates.timeline_cell_class = (item, date) => cellClass(date) // 时间轴列

      this.applyZoom(this.zoom)

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
     * 由 gantt 数据 + 外部 tableData 派生左侧表格行：
     * - 未传 tableData：行 = gantt 派生字段 + tasks 自定义字段透传
     * - 传入 tableData：行 = 外部行（保留字段与行序）+ gantt 权威字段合并（按 fields.id 匹配），
     *   外部行没有的新任务自动追加；gantt 变更后回传 'table-data-change'
     */
    rebuildTable() {
      if (!this.gantt) return
      const g = this.gantt
      const parseD = g.date.str_to_date('%Y-%m-%d')
      const fmtD = g.date.date_to_str('%Y-%m-%d')
      const snap = g.serialize()

      // 1) gantt 权威字段（归一化名：id/text/type/start/end/duration/progress）
      const fieldsById = {}
      snap.data.forEach((t) => {
        const isMilestone = t.type === 'milestone'
        fieldsById[t.id] = {
          id: t.id,
          text: t.text,
          type: t.type || 'task',
          start: t.start_date,
          // serialize 的 end_date 是“排他”结束；表格展示“含当天”的结束日期
          end: isMilestone ? t.start_date : fmtD(new Date(parseD(t.end_date).getTime() - 86400000)),
          duration: t.duration,
          progress: Math.round((t.progress || 0) * 100),
          parentId: t.parent || 0
        }
      })

      // 2) 行来源：外部 tableData（保留外部字段与行序）或 gantt 派生 + tasks 自定义字段透传
      const external = Array.isArray(this.tableData) ? this.tableData : null
      let flatRows = []
      if (external) {
        const known = {}
        external.forEach((row) => {
          if (!row) return
          const f = fieldsById[row[this.fieldMap.id]]
          if (!f) return
          known[f.id] = true
          flatRows.push(Object.assign({}, row, f))
        })
        // 外部行里没有的新任务（如弹窗新增）自动追加
        snap.data.forEach((t) => {
          if (!known[t.id]) flatRows.push(Object.assign({}, fieldsById[t.id]))
        })
      } else {
        flatRows = snap.data.map((t) => {
          const node = Object.assign({}, fieldsById[t.id])
          const src = this.sourceById[t.id]
          if (src) {
            Object.keys(src).forEach((k) => {
              if (k.charCodeAt(0) === 36 || k in node) return
              node[k] = src[k]
            })
          }
          return node
        })
      }

      // 3) 树形化（父子关系以 gantt 为准）
      const byId = {}
      flatRows.forEach((r) => { byId[r.id] = r })
      const tree = []
      flatRows.forEach((r) => {
        const f = fieldsById[r.id]
        const p = f && f.parentId && byId[f.parentId]
        if (p) {
          if (!p.children) this.$set(p, 'children', [])
          p.children.push(r)
        } else {
          tree.push(r)
        }
      })

      // 4) 首次构建：默认展开全部汇总节点
      if (!this._tableInited) {
        this.expandedIds = flatRows.filter((r) => r.children).map((r) => r.id)
        this._tableInited = true
      }

      this.nodeMap = byId
      this.rows = tree
      this.emitTableDataChange(flatRows)
      this.$nextTick(() => this.restoreTableState())
    },

    /** 外部传入 tableData 时，gantt 变更后回传合并行（内容未变化不重复回传，避免循环） */
    emitTableDataChange(flatRows) {
      if (!Array.isArray(this.tableData)) return
      const key = JSON.stringify(flatRows, (k, v) => (k === 'children' ? undefined : v))
      if (key === this._lastRowsKey) return
      this._lastRowsKey = key
      this.$emit('table-data-change', JSON.parse(key))
    },

    /** 重建表格后恢复展开/选中状态 */
    restoreTableState() {
      const table = this.$refs.ganttTable
      if (!table) return
      const walk = (nodes) => {
        nodes.forEach((n) => {
          if (n.children && n.children.length && this.expandedIds.indexOf(n.id) !== -1) {
            table.toggleRowExpansion(n, true)
          }
          if (n.children) walk(n.children)
        })
      }
      walk(this.rows)
      if (this.selectedId && this.nodeMap[this.selectedId]) {
        table.setCurrentRow(this.nodeMap[this.selectedId])
      }
    },

    bindEvents() {
      const g = this.gantt
      const fmt = g.date.date_to_str('%Y-%m-%d')

      // ---- gantt 变更 → 同步表格 ----
      g.attachEvent('onAfterTaskDrag', (id, mode) => {
        const task = g.getTask(id)
        const name = { move: '拖动改期', resize: '调整工期', progress: '更新进度' }[mode] || mode
        this.emitEvent(
          'task-drag',
          `${name}：「${task.text}」→ ${fmt(task.start_date)} ~ ${fmt(task.end_date)}`,
          task
        )
        this.rebuildTable()
      })

      g.attachEvent('onAfterTaskAdd', (id, task) => {
        this.emitEvent('task-add', `新增任务：「${task.text}」`, task)
        this.ensureTimeRange()
        this.rebuildTable()
      })

      g.attachEvent('onAfterTaskUpdate', (id, task) => {
        this.emitEvent('task-update', `任务已更新：「${task.text}」`, task)
        this.ensureTimeRange()
        this.rebuildTable()
      })

      g.attachEvent('onAfterTaskDelete', (id, task) => {
        if (this.selectedId === id) this.selectedId = null
        this.emitEvent('task-delete', `删除任务：「${task.text}」`, task)
        this.rebuildTable()
      })

      // ---- 交互联动 ----
      // 点击任务条 → 左侧表格选中对应行
      g.attachEvent('onTaskClick', (id) => {
        const node = this.nodeMap[id]
        if (node) {
          this.selectedId = id
          this.$refs.ganttTable.setCurrentRow(node)
        }
        return true
      })

      // 双击任务条 → 打开 el-dialog 编辑（返回 false 阻止默认灯箱）
      g.attachEvent('onTaskDblClick', (id) => {
        if (!this.readonly) this.openEdit(this.nodeMap[id])
        return false
      })

      // 双保险：任何灯箱打开请求一律拦截（编辑统一走 el-dialog）
      g.attachEvent('onBeforeLightbox', () => false)

      // 删除确认（表格删除按钮与键盘 Delete 都走这里；MessageBox 是异步的，
      // 因此先同步返回 false 拦截，确认后再带标记执行真正的删除）
      g.attachEvent('onBeforeTaskDelete', (id) => {
        if (this._delConfirm) return true
        const task = g.getTask(id)
        this.confirmDelete(task.text, id)
        return false
      })

      // ---- 纵向滚动同步：gantt → el-table ----
      // 注意：dhtmlx 的 scrollTo 过程中会发出“过期中间值”的 onGanttScroll 事件，
      // 直接双向同步会乒乓打架（实测两边互相拉扯最后停在 0），必须加滚动锁：
      // 一方发起同步后 50ms 内抑制另一方的回传。
      g.attachEvent('onGanttScroll', (left, top) => {
        if (this._scrollLock === 'table') return true
        this._scrollLock = 'gantt'
        const w = this.getTableScrollEl()
        if (w && Math.abs(w.scrollTop - top) > 1) w.scrollTop = top
        this.refreshScrollLock()
        return true
      })

      // ---- 纵向滚动同步：el-table → gantt ----
      const wrapper = this.getTableScrollEl()
      if (wrapper) {
        this._onTableScroll = (e) => {
          if (this._scrollLock === 'gantt') return
          this._scrollLock = 'table'
          const st = g.getScrollState()
          if (Math.abs((st.y || 0) - e.target.scrollTop) > 1) {
            g.scrollTo(st.x, e.target.scrollTop)
          }
          this.refreshScrollLock()
        }
        wrapper.addEventListener('scroll', this._onTableScroll)
        this._tableScrollEl = wrapper
      }
    },

    /** 滚动锁：50ms 内抑制反向回传，避免两侧行高/钳位差异引发乒乓 */
    refreshScrollLock() {
      clearTimeout(this._scrollLockTimer)
      this._scrollLockTimer = setTimeout(() => {
        this._scrollLock = null
      }, 50)
    },

    getTableScrollEl() {
      const table = this.$refs.ganttTable
      return table && table.$el ? table.$el.querySelector('.el-table__body-wrapper') : null
    },

    // ---------- 分割条拖拽：调整表格/时间轴宽度比例 ----------
    onResizerMousedown(e) {
      e.preventDefault()
      this._dragStartX = e.clientX
      this._dragStartW = this.innerTableWidth
      this.resizing = true
      // 拖拽期间禁用两块区域的鼠标事件：避免光标划过 gantt 内部 iframe 时丢失 mousemove
      document.addEventListener('mousemove', this.onResizerMove)
      document.addEventListener('mouseup', this.onResizerMouseup)
    },

    onResizerMove(e) {
      const rect = this.$el.getBoundingClientRect()
      // 左侧最小 420，右侧至少留 420 给时间轴
      const max = rect.width - 420
      const next = this._dragStartW + (e.clientX - this._dragStartX)
      this.innerTableWidth = Math.min(max, Math.max(420, Math.round(next)))
      // rAF 节流：拖动过程中让 gantt 重排（时间轴宽度变化）
      if (!this._raf) {
        this._raf = requestAnimationFrame(() => {
          this._raf = null
          if (this.gantt) this.gantt.setSizes()
        })
      }
    },

    onResizerMouseup() {
      this.resizing = false
      this.teardownResizer()
      if (this.gantt) this.gantt.setSizes()
      this.$emit('update:tableWidth', this.innerTableWidth)
      this.emitEvent('resizer-change', `表格宽度调整为 ${this.innerTableWidth}px`, { tableWidth: this.innerTableWidth })
    },

    resetResizer() {
      this.innerTableWidth = this._defaultTableWidth
      if (this.gantt) this.gantt.setSizes()
      this.$emit('update:tableWidth', this.innerTableWidth)
    },

    teardownResizer() {
      document.removeEventListener('mousemove', this.onResizerMove)
      document.removeEventListener('mouseup', this.onResizerMouseup)
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

    // ---------- 表格交互 ----------
    onRowClick(row) {
      this.selectedId = row.id
      this.gantt.selectTask(row.id)
      this.emitEvent('row-click', `选中任务：「${row.text}」`, row)
    },

    onExpandChange(row, expanded) {
      // 注意：树形表格 expand-change 的第二参是“该行是否展开”的布尔值；
      // 普通展开行表格才是展开行数组。两种形态都兼容。
      const isExpand = Array.isArray(expanded)
        ? expanded.some((r) => r.id === row.id)
        : !!expanded
      if (isExpand) {
        if (this.expandedIds.indexOf(row.id) === -1) this.expandedIds.push(row.id)
      } else {
        this.expandedIds = this.expandedIds.filter((id) => id !== row.id)
      }
      // 表格展开/收起 → 同步 gantt 的折叠状态（影响时间轴上子任务条的显示）
      if (isExpand) {
        this.gantt.open(row.id)
      } else {
        this.gantt.close(row.id)
      }
    },

    // ---------- 编辑弹窗 ----------
    openCreate(parentRow) {
      if (this.readonly) return
      this.dialog = {
        visible: true,
        mode: parentRow ? 'appendChild' : 'create',
        task: parentRow || null,
        parentName: parentRow ? parentRow.text : ''
      }
    },

    openEdit(row) {
      if (this.readonly || !row) return
      this.dialog = { visible: true, mode: 'edit', task: row, parentName: '' }
    },

    onDialogSave(form) {
      const g = this.gantt
      const d = this.dialog

      if (d.mode === 'edit') {
        const patch = { text: form.text }
        // 里程碑只改名称（日期在时间轴上拖动调整）
        if (d.task.type !== 'milestone') {
          patch.start_date = form.start
          patch.duration = this.diffDays(form.start, form.end) + 1 // 结束日期含当天
          patch.progress = form.progress / 100
        }
        g.updateTask(d.task.id, patch)
      } else {
        const item = {
          text: form.text,
          start_date: form.start,
          duration: this.diffDays(form.start, form.end) + 1,
          progress: form.progress / 100
        }
        if (d.mode === 'appendChild') item.parent = d.task.id
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
/* 甘特图与表格内部 DOM 大量动态生成，样式不要加 scoped */
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

/* 中部工作区：左表格 + 右时间轴 */
.work-area {
  flex: 1;
  min-height: 0;
  display: flex;
}

.gantt-table {
  flex: none;
  min-height: 0;
}
.gantt-timeline {
  flex: 1;
  min-width: 0;
}

/* 拖拽分割条：调整表格/时间轴宽度比例 */
.gantt-resizer {
  flex: none;
  width: 5px;
  cursor: col-resize;
  background: #ececec;
  transition: background 0.15s;
}
.gantt-resizer:hover,
.gantt-wrapper.resizing .gantt-resizer {
  background: #3f8cff;
}
/* 拖拽期间：禁用文本选中；两块区域 pointer-events 置空，
   防止光标划过 gantt 内部 iframe（resize watcher）时 mousemove 丢失 */
.gantt-wrapper.resizing {
  cursor: col-resize;
  user-select: none;
}
.gantt-wrapper.resizing .gantt-table,
.gantt-wrapper.resizing .gantt-timeline {
  pointer-events: none;
}

/* 表头高度对齐 gantt 刻度区（scale_height） */
.gantt-table .el-table th {
  height: var(--g-scale-h);
  padding: 0;
  box-sizing: border-box;
}
.gantt-table .el-table th > .cell {
  line-height: calc(var(--g-scale-h) - 1px); /* 减 1px 底边框 */
}

/* 表格行高与 gantt row_height 严格对齐：
   td 默认 content-box，height + 1px 边框会逐行漂移，必须 border-box */
.gantt-table .el-table__row td {
  height: var(--g-row-h);
  padding-top: 0;
  padding-bottom: 0;
  box-sizing: border-box;
}
.proj-name { font-weight: 600; }
.danger-btn.el-button--text { color: #f56c6c; }

/* 周末底色 / 今天列高亮 */
.gantt-wrapper .weekend { background-color: #f4f6f9; }
.gantt-wrapper .today { background-color: rgba(255, 92, 92, 0.10); }
.gantt-wrapper .gantt_scale_cell.today { color: #ff5c5c; font-weight: 600; }
</style>
