const { defineConfig } = require('@vue/cli-service')

module.exports = defineConfig({
  lintOnSave: false,
  devServer: {
    port: 8090,
    open: false
  },
  // 对 node_modules 里的 dhtmlx-gantt 也走 babel，保证老浏览器兼容
  transpileDependencies: ['dhtmlx-gantt']
})
