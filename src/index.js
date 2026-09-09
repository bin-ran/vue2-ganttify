/**
 * dhtmlx-gantt-vue2 组件库入口
 *
 * 使用方式一：整库注册
 *   import DhtmlxGanttVue from 'dhtmlx-gantt-vue2'
 *   Vue.use(DhtmlxGanttVue)
 *
 * 使用方式二：按需引入
 *   import { GanttChart } from 'dhtmlx-gantt-vue2'
 *   export default { components: { GanttChart } }
 *
 * 别忘了引入样式：
 *   import 'element-ui/lib/theme-chalk/index.css'
 *   import 'dhtmlx-gantt-vue2/lib/dhtmlx-gantt-vue2.css'
 */
import GanttChart from './components/GanttChart.vue'
import pkg from '../package.json'

const version = pkg.version

const components = [GanttChart]

const install = (Vue) => {
  components.forEach((component) => {
    Vue.component(component.name, component)
  })
}

// 支持script标签引入时自动安装（CDN/UMD 场景）
if (typeof window !== 'undefined' && window.Vue) {
  install(window.Vue)
}

export { install, version, GanttChart }

export default {
  version,
  install
}
