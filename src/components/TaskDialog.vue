<template>
  <el-dialog
    :title="title"
    :visible="visible"
    width="460px"
    :close-on-click-modal="false"
    @close="cancel"
  >
    <el-form ref="form" :model="form" :rules="rules" label-width="80px" size="small">
      <el-form-item v-if="mode === 'appendChild'" label="上级任务">
        <el-input :value="parentName" disabled />
      </el-form-item>

      <el-form-item label="任务名称" prop="text">
        <el-input v-model.trim="form.text" placeholder="请输入任务名称" maxlength="50" />
      </el-form-item>

      <el-form-item label="开始日期" prop="start">
        <el-date-picker
          v-model="form.start"
          type="date"
          value-format="yyyy-MM-dd"
          placeholder="选择开始日期"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="结束日期" prop="end">
        <el-date-picker
          v-model="form.end"
          type="date"
          value-format="yyyy-MM-dd"
          placeholder="选择结束日期（含当天）"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="进度">
        <el-slider v-model="form.progress" :min="0" :max="100" show-input input-size="mini" />
      </el-form-item>
    </el-form>

    <span slot="footer">
      <el-button size="small" @click="cancel">取 消</el-button>
      <el-button size="small" type="primary" @click="save">确 定</el-button>
    </span>
  </el-dialog>
</template>

<script>
export default {
  name: 'TaskDialog',

  props: {
    visible: Boolean,
    // create：新增顶层任务 | appendChild：为某行添加子任务 | edit：编辑
    mode: { type: String, default: 'create' },
    // edit 时为被编辑行；appendChild 时为父行
    task: { type: Object, default: null },
    parentName: { type: String, default: '' }
  },

  data() {
    return {
      form: { text: '', start: '', end: '', progress: 0 },
      rules: {
        text: [{ required: true, message: '请输入任务名称', trigger: 'blur' }],
        start: [{ required: true, message: '请选择开始日期', trigger: 'change' }],
        end: [
          { required: true, message: '请选择结束日期', trigger: 'change' },
          {
            validator: (rule, value, cb) => {
              if (value && this.form.start && new Date(value) < new Date(this.form.start)) {
                return cb(new Error('结束日期不能早于开始日期'))
              }
              cb()
            },
            trigger: 'change'
          }
        ]
      }
    }
  },

  computed: {
    title() {
      if (this.mode === 'edit') return '编辑任务'
      if (this.mode === 'appendChild') return `添加子任务（上级：${this.parentName}）`
      return '新增任务'
    }
  },

  watch: {
    visible(v) {
      if (!v) return
      this.$nextTick(() => {
        if (this.mode === 'edit' && this.task) {
          this.form = {
            text: this.task.text,
            start: this.task.start,
            end: this.task.end,
            progress: this.task.progress || 0
          }
        } else {
          const today = this.todayStr()
          this.form = { text: '', start: today, end: today, progress: 0 }
        }
        this.$refs.form && this.$refs.form.clearValidate()
      })
    }
  },

  methods: {
    todayStr() {
      const d = new Date()
      const p = (n) => (n < 10 ? '0' + n : '' + n)
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    },
    cancel() {
      this.$emit('update:visible', false)
    },
    save() {
      this.$refs.form.validate((valid) => {
        if (!valid) return
        this.$emit('save', { ...this.form })
      })
    }
  }
}
</script>
