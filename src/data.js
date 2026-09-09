/**
 * 业务数据示例：字段名完全自定义（name/begin/end/pid/percent/owner），
 * 组件通过 fields 映射只认 起始/结束 时间，其余字段透传进引擎供列与 actions 使用。
 *
 * - begin/end：开始/结束日期（含当天）——组件唯一必需的两个字段
 * - id：业务主键（经 fields.id 映射；不配置映射时组件用行下标当内部 id）
 * - pid：父级 id（经 fields.parent 映射；不配置则为平铺列表，无展开箭头）
 * - percent：进度，值域 0~1（经 fields.progress 映射；不配置则任务条无进度段）
 */
export default [
  { id: 1, name: '一期：核心功能', begin: '2026-09-01', end: '2026-09-12', pid: 0, percent: 0.5, owner: '张三' },
  { id: 2, name: '需求调研', begin: '2026-09-01', end: '2026-09-04', pid: 1, percent: 1, owner: '李四' },
  { id: 3, name: '交互原型', begin: '2026-09-04', end: '2026-09-07', pid: 1, percent: 0.5, owner: '王五' },
  { id: 4, name: '前后端联调', begin: '2026-09-09', end: '2026-09-12', pid: 1, percent: 0.2, owner: '赵六' },
  { id: 5, name: '二期：上线准备', begin: '2026-09-14', end: '2026-09-23', pid: 0, percent: 0, owner: '张三' },
  { id: 6, name: '测试回归', begin: '2026-09-14', end: '2026-09-18', pid: 5, percent: 0, owner: '李四' },
  { id: 7, name: '发布上线', begin: '2026-09-21', end: '2026-09-22', pid: 5, percent: 0, owner: '王五' }
]
