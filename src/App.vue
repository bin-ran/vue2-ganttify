<template>
  <div class="demo-page">
    <header class="demo-head">
      <h1>vue2-ganttify · 时间可视化辅助组件（Vue 2.6）</h1>
      <p class="demo-tips">
        甘特图只是辅助：数据只有“名称/起止时间”是必需的，其他字段全部自定义。
        左侧为 dhtmlx 原生表格（树形展开/收起、双击行打开编辑——由本页自行实现）；
        右侧时间轴：拖动任务条改日期、拖两端改工期、拖进度段改进度；
        中间分割条可拖拽调整宽度。所有操作列按钮均由本页通过 actions 配置。
      </p>
    </header>

    <div class="demo-body">
      <GanttChart
        ref="gantt"
        :tasks="rows"
        :fields="fields"
        :columns="columns"
        @task-click="onTaskClick"
        @task-dblclick="onTaskDblclick"
        @task-drag="onTaskDrag"
      >
        <!-- 工具栏自定义按钮：配合 addTask 代理方法实现“新增” -->
        <template #toolbar-extra>
          <el-button size="mini" type="primary" icon="el-icon-plus" @click="openCreate()">
            新增任务
          </el-button>
        </template>
      </GanttChart>
    </div>

    <footer class="demo-foot">
      <el-tag v-if="lastEvent.type" size="small">{{ lastEvent.type }}</el-tag>
      <span>{{ lastEvent.text }}</span>
    </footer>

    <!-- 本页自己的编辑/新增弹窗（组件不再内置表单，编辑 UI 完全由上层实现） -->
    <el-dialog
      :title="editForm.mode === 'edit' ? '编辑任务' : '新增任务'"
      :visible.sync="editForm.visible"
      width="420px"
      :close-on-click-modal="false"
    >
      <el-form :model="editForm.form" label-width="80px" size="small">
        <el-form-item v-if="editForm.parentName" label="上级任务">
          <el-input :value="editForm.parentName" disabled />
        </el-form-item>
        <el-form-item label="名称">
          <el-input v-model.trim="editForm.form.name" maxlength="50" />
        </el-form-item>
        <el-form-item label="开始日期">
          <el-date-picker v-model="editForm.form.begin" type="date" value-format="yyyy-MM-dd" style="width: 100%" />
        </el-form-item>
        <el-form-item label="结束日期">
          <el-date-picker v-model="editForm.form.end" type="date" value-format="yyyy-MM-dd" style="width: 100%" />
        </el-form-item>
      </el-form>
      <span slot="footer">
        <el-button size="small" @click="editForm.visible = false">取 消</el-button>
        <el-button size="small" type="primary" @click="saveEdit">确 定</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import GanttChart from './components/GanttChart.vue'
import rowsData from './data'

export default {
  name: 'App',
  components: { GanttChart },

  data() {
    return {
      // 业务数据（本页持有；更新走“改本页数据 + 组件代理方法”两条路，见 saveEdit/onDelete）
      rows: rowsData.map((r) => ({ ...r })),
      // 字段映射：只有 startDate/endDate 必填；id/parent/progress 可选
      fields: {
        id: 'id',
        text: 'name',
        startDate: 'begin',
        endDate: 'end',
        parent: 'pid',
        progress: 'percent'
      },
      // 列配置：名称列（树形）+ 开始/结束 + 自定义操作列
      columns: [
        { key: 'name', label: '任务名称', width: 200, tree: true },
        { key: 'begin', label: '开始', width: 100, align: 'center' },
        { key: 'end', label: '结束', width: 100, align: 'center' },
        {
          key: 'ops',
          label: '操作',
          width: 160,
          align: 'center',
          actions: [
            { text: '编辑', handler: (row) => this.openEdit(row) },
            { text: '加子任务', handler: (row) => this.openCreate(row) },
            { text: '删除', handler: (row) => this.onDelete(row) }
          ]
        }
      ],
      lastEvent: { type: '', text: '（点击/拖拽任务条查看事件）' },
      editForm: {
        visible: false,
        mode: 'create', // create | edit | appendChild
        target: null,   // edit 时为原行；appendChild 时为父行
        parentName: '',
        form: { name: '', begin: '', end: '' }
      }
    }
  },

  methods: {
    log(type, text) {
      this.lastEvent = { type, text }
    },

    // ---------- 编辑弹窗（本页自行实现，与组件解耦） ----------
    openEdit(row) {
      this.editForm = {
        visible: true, mode: 'edit', target: row, parentName: '',
        form: { name: row.name, begin: row.begin, end: row.end }
      }
    },

    openCreate(parentRow) {
      const today = this.todayStr()
      this.editForm = {
        visible: true,
        mode: parentRow ? 'appendChild' : 'create',
        target: parentRow || null,
        parentName: parentRow ? parentRow.name : '',
        form: { name: '', begin: today, end: today }
      }
    },

    saveEdit() {
      const f = this.editForm.form
      if (!f.name || !f.begin || !f.end) {
        this.$message.warning('请填写完整')
        return
      }
      const gantt = this.$refs.gantt

      if (this.editForm.mode === 'edit') {
        const target = this.editForm.target
        // 路径一（推荐）：代理方法原地更新，不触发整表重载
        gantt.updateTask({ ...target, name: f.name, begin: f.begin, end: f.end })
        // 本页数据源同步（保持两边一致）
        this.rows = this.rows.map((r) => (r === target ? { ...r, name: f.name, begin: f.begin, end: f.end } : r))
        this.log('update', `已更新「${f.name}」${f.begin} ~ ${f.end}`)
      } else {
        // 路径二：代理方法新增；本页数据源追加（新行对象引用被组件登记，后续可继续 updateTask）
        const row = {
          id: 'n' + Date.now(),
          name: f.name,
          begin: f.begin,
          end: f.end,
          owner: '',
          percent: 0
        }
        if (this.editForm.mode === 'appendChild') row.pid = this.editForm.target.id
        gantt.addTask(row)
        this.rows = [...this.rows, row]
        this.log('add', `已新增「${f.name}」`)
      }
      this.editForm.visible = false
    },

    onDelete(row) {
      this.$confirm(`确定删除「${row.name}」吗？（子任务会一并删除）`, '提示', { type: 'warning' })
        .then(() => {
          this.$refs.gantt.removeTask(row)
          this.rows = this.rows.filter((r) => r !== row)
          this.log('delete', `已删除「${row.name}」`)
        })
        .catch(() => {})
    },

    // ---------- 组件抛出的交互事件 ----------
    onTaskClick(row, task) {
      this.log('task-click', `选中「${row.name}」`)
    },

    // 双击行/任务条 → 本页打开编辑（编辑 UI 完全由上层实现）
    onTaskDblclick(row, task) {
      if (row) this.openEdit(row)
    },

    // 拖拽改期/工期/进度 → 组件只抛事件，本页负责把结果写回数据源
    onTaskDrag({ type, row, startDate, endDate }) {
      if (!row) return
      const patch = type === 'progress'
        ? { ...row }
        : { ...row, begin: startDate, end: endDate }
      this.rows = this.rows.map((r) => (r === row ? patch : r))
      const name = { move: '拖动改期', resize: '调整工期', progress: '更新进度' }[type] || type
      this.log('task-drag', `${name}：「${row.name}」→ ${startDate} ~ ${endDate}`)
    },

    todayStr() {
      const d = new Date()
      const p = (n) => (n < 10 ? '0' + n : '' + n)
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    }
  }
}
</script>

<style>
html, body { margin: 0; height: 100%; }
#app { height: 100%; }

.demo-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.demo-head { padding: 10px 16px 6px; }
.demo-head h1 { margin: 0 0 4px; font-size: 18px; }
.demo-tips { margin: 0; color: #888; font-size: 12px; line-height: 1.6; }
.demo-body { flex: 1; min-height: 0; padding: 0 12px; }
.demo-foot {
  flex: none;
  padding: 6px 16px;
  border-top: 1px solid #e8e8e8;
  font-size: 12px;
  color: #666;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 24px;
  box-sizing: border-box;
}
</style>
