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
        <span class="tb-label">依赖线</span>
        <el-switch v-model="showLinks" @change="toggleLinks" />
        <el-button size="mini" @click="toggleSkin">{{ skin === 'dark' ? '浅色主题' : '深色主题' }}</el-button>
        <el-button size="mini" type="primary" icon="el-icon-plus" @click="openCreate()">新增任务</el-button>
        <el-button size="mini" icon="el-icon-download" @click="exportSnapshot">导出 JSON</el-button>
      </div>
    </div>

    <div class="work-area">
      <!-- 左：ElementUI 树形表格（替代 gantt 自带 grid） -->
      <div class="gantt-table" :style="{ width: tableWidth + 'px' }">
        <el-table
          ref="ganttTable"
          :data="tableData"
          row-key="id"
          :tree-props="{ children: 'children' }"
          border
          height="100%"
          size="mini"
          highlight-current-row
          @row-click="onRowClick"
          @expand-change="onExpandChange"
        >
          <el-table-column prop="text" label="任务名称" min-width="170" show-overflow-tooltip>
            <template slot-scope="{ row }">
              <el-tag v-if="row.type === 'milestone'" size="mini" type="warning">里程碑</el-tag>
              <span :class="{ 'proj-name': row.type === 'project' }">{{ row.text }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="start" label="开始" width="90" align="center" />
          <el-table-column prop="end" label="结束" width="90" align="center" />
          <el-table-column prop="duration" label="工期" width="55" align="center" />
          <el-table-column label="进度" width="100" align="center">
            <template slot-scope="{ row }">
              <el-progress
                v-if="row.type !== 'milestone'"
                :percentage="Math.min(100, row.progress || 0)"
                :stroke-width="8"
                :show-text="false"
              />
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="145" align="center">
            <template slot-scope="{ row }">
              <el-button type="text" size="mini" @click.stop="openEdit(row)">编辑</el-button>
              <el-button
                v-if="row.type !== 'milestone'"
                type="text"
                size="mini"
                @click.stop="openCreate(row)"
              >加子任务</el-button>
              <el-button type="text" size="mini" class="danger-btn" @click.stop="confirmDelete(row.text, row.id)">删除</el-button>
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
// v10 起皮肤/语言/扩展全部打进主包，只需引一个 css
import 'dhtmlx-gantt/codebase/dhtmlxgantt.css'
import TaskDialog from './TaskDialog.vue'

export default {
  name: 'GanttChart',

  components: { TaskDialog },

  props: {
    /**
     * 结构：{ data: Task[], links: Link[] }
     * 注意：甘特图内部是数据源（拖拽/弹窗编辑都在它身上改），
     * 左侧表格数据由它派生；取全量数据用 getSnapshot()。
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
      ],
      // 左侧表格数据（由 gantt.serialize() 派生的树形结构）
      tableData: [],
      expandedIds: [],
      selectedId: null,
      // 左侧表格宽度（拖拽分割条可调）
      tableWidth: 640,
      resizing: false,
      dialog: { visible: false, mode: 'create', task: null, parentName: '' }
    }
  },

  watch: {
    // 父组件整体替换 tasks 对象（引用变化）时重新加载
    tasks(val) {
      if (!this.gantt) return
      this.gantt.clearAll()
      this.gantt.parse(val)
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
  },

  mounted() {
    // 每个组件实例用独立 gantt 实例（社区版支持多实例）
    this.gantt = Gantt.getGanttInstance()
    this.initGantt()
    this.gantt.parse(this.tasks)
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
      g.setSkin(this.skin) // 可选：material / terrace / dark / meadow / broadway / skyblue / contrast

      // ---- 基础配置 ----
      g.config.date_format = '%Y-%m-%d' // 与数据中的日期字符串格式一致
      g.config.fit_tasks = true         // 数据超出当前时间轴范围时自动扩展
      g.config.row_height = 36          // 与左侧 el-table 行高保持一致（滚动同步的前提）
      g.config.bar_height = 20
      g.config.auto_types = true        // 有子任务的节点自动按“项目”汇总
      g.config.open_tree_initially = true

      // ---- 拖拽能力（社区版全部免费）----
      g.config.drag_move = true     // 拖动任务条 → 修改起止日期
      g.config.drag_resize = true   // 拖动任务条两端 → 修改工期
      g.config.drag_progress = true // 拖动任务条里的深色进度段 → 修改进度
      g.config.drag_links = true    // 任务条两端圆点拖拽 → 创建依赖线
      g.config.show_links = true    // 依赖线显示开关（工具栏 el-switch 切换的就是它）

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

      // auto_scheduling（自动排程）、关键路径、资源面板、基线都是 PRO 收费功能，社区版没有，保持默认关闭

      // ---- 周末底色 + “今天”列高亮 ----
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

    /** 由 gantt 数据派生左侧表格树（gantt 是唯一数据源） */
    rebuildTable() {
      if (!this.gantt) return
      const g = this.gantt
      const parseD = g.date.str_to_date('%Y-%m-%d')
      const fmtD = g.date.date_to_str('%Y-%m-%d')
      const snap = g.serialize()

      const map = {}
      const nodes = snap.data.map((t) => {
        const isMilestone = t.type === 'milestone'
        const node = {
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
        map[t.id] = node
        return node
      })

      const tree = []
      nodes.forEach((n) => {
        const p = n.parentId && map[n.parentId]
        if (p) {
          if (!p.children) this.$set(p, 'children', [])
          p.children.push(n)
        } else {
          tree.push(n)
        }
      })

      // 首次构建：默认展开全部汇总节点
      if (!this._tableInited) {
        this.expandedIds = nodes.filter((n) => n.children).map((n) => n.id)
        this._tableInited = true
      }

      this.nodeMap = map
      this.tableData = tree
      this.$nextTick(() => this.restoreTableState())
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
      walk(this.tableData)
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
        this.rebuildTable()
      })

      g.attachEvent('onAfterTaskUpdate', (id, task) => {
        this.emitEvent('task-update', `任务已更新：「${task.text}」`, task)
        this.rebuildTable()
      })

      g.attachEvent('onAfterTaskDelete', (id, task) => {
        if (this.selectedId === id) this.selectedId = null
        this.emitEvent('task-delete', `删除任务：「${task.text}」`, task)
        this.rebuildTable()
      })

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
        this.openEdit(this.nodeMap[id])
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

      // 点击依赖线 → 确认后删除
      g.attachEvent('onLinkClick', (id) => {
        const link = g.getLink(id)
        const from = g.getTask(link.source)
        const to = g.getTask(link.target)
        this.$confirm(`删除依赖：「${from.text}」→「${to.text}」？`, '提示', { type: 'warning' })
          .then(() => g.deleteLink(id))
          .catch(() => {})
        return true
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
      this._dragStartW = this.tableWidth
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
      this.tableWidth = Math.min(max, Math.max(420, Math.round(next)))
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
      this.emitEvent('resizer-change', `表格宽度调整为 ${this.tableWidth}px`, { tableWidth: this.tableWidth })
    },

    resetResizer() {
      this.tableWidth = 640
      if (this.gantt) this.gantt.setSizes()
    },

    teardownResizer() {
      document.removeEventListener('mousemove', this.onResizerMove)
      document.removeEventListener('mouseup', this.onResizerMouseup)
    },

    // ---------- 工具栏 ----------
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

    toggleLinks(showLinks) {
      this.gantt.config.show_links = showLinks
      this.gantt.render()
      this.emitEvent('links-toggle', showLinks ? '显示依赖线' : '隐藏依赖线', { showLinks })
    },

    toggleSkin() {
      this.skin = this.skin === 'dark' ? 'material' : 'dark'
      this.gantt.setSkin(this.skin)
    },

    exportSnapshot() {
      const snapshot = this.getSnapshot()
      console.log('[Gantt 全量数据]', JSON.stringify(snapshot, null, 2))
      this.emitEvent(
        'snapshot',
        `全量数据已打印到控制台（${snapshot.data.length} 个任务 / ${snapshot.links.length} 条依赖）`,
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
      this.dialog = {
        visible: true,
        mode: parentRow ? 'appendChild' : 'create',
        task: parentRow || null,
        parentName: parentRow ? parentRow.text : ''
      }
    },

    openEdit(row) {
      if (!row) return
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

    /** 对外方法：取全量数据（父组件通过 $refs.gantt.getSnapshot() 调用，对接后端保存） */
    getSnapshot() {
      return this.gantt.serialize()
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

/* 表头高度对齐 gantt 刻度区（scale_height=48） */
.gantt-table .el-table th {
  height: 48px;
  padding: 0;
  box-sizing: border-box;
}
.gantt-table .el-table th > .cell {
  line-height: 47px; /* 48 - 1px 底边框 */
}

/* 表格行高与 gantt row_height(36px) 严格对齐：
   td 默认 content-box，height:36 + 1px 边框会变 37px 逐行漂移，必须 border-box */
.gantt-table .el-table__row td {
  height: 36px;
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
