/**
 * vue2-ganttify 组件库入口
 *
 * 使用方式一：整库注册
 *   import Vue2Ganttify from 'vue2-ganttify'
 *   Vue.use(Vue2Ganttify)
 *
 * 使用方式二：按需引入
 *   import { GanttChart } from 'vue2-ganttify'
 *   export default { components: { GanttChart } }
 *
 * 别忘了引入样式：
 *   import 'element-ui/lib/theme-chalk/index.css'
 *   import 'vue2-ganttify/lib/vue2-ganttify.css'
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
