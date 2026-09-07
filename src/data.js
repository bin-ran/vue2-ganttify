/**
 * 示例数据
 *
 * 任务字段：
 *   id / text / start_date('YYYY-MM-DD'，与组件里 date_format 一致)
 *   duration(天数) / progress(0~1) / parent(父任务 id) / open(默认展开)
 *   type 省略时：有子任务的节点自动按“项目(汇总)”渲染（组件里开了 auto_types）
 *
 * 依赖字段：
 *   id / source / target / type
 */
export default {
  data: [
    { id: 1, text: '一期：核心功能', start_date: '2026-09-01', duration: 12, progress: 0.5, open: true },
    { id: 2, text: '需求调研', start_date: '2026-09-01', duration: 4, progress: 1, parent: 1 },
    { id: 3, text: '交互原型', start_date: '2026-09-04', duration: 4, progress: 0.8, parent: 1 },
    { id: 4, text: '前后端联调', start_date: '2026-09-09', duration: 4, progress: 0.2, parent: 1 },

    { id: 5, text: '二期：上线准备', start_date: '2026-09-14', duration: 9, progress: 0, open: true },
    { id: 6, text: '测试回归', start_date: '2026-09-14', duration: 5, progress: 0, parent: 5 },
    { id: 7, text: '发布上线', start_date: '2026-09-21', duration: 2, progress: 0, parent: 5 },
    { id: 8, text: '上线评审会', start_date: '2026-09-23', duration: 1, progress: 0, parent: 5 }
  ]
}
