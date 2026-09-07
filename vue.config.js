const { defineConfig } = require('@vue/cli-service')

// 组件库构建：npm run build:lib（vue-cli-service build --target lib）
const isLibBuild = process.argv.includes('--target') && process.argv.includes('lib')

module.exports = defineConfig({
  lintOnSave: false,
  devServer: {
    port: 8090,
    open: false
  },
  // 对 node_modules 里的 dhtmlx-gantt 也走 babel，保证老浏览器兼容
  transpileDependencies: ['dhtmlx-gantt'],
  // 库构建产物输出到 lib/，避免与演示应用 dist/ 冲突
  outputDir: isLibBuild ? 'lib' : 'dist',
  configureWebpack: (config) => {
    if (!isLibBuild) return
    // vue-cli lib 模式已外置 vue；补充外置 element-ui 与 dhtmlx-gantt，
    // 避免打包出第二份实例（Vue/DHTMLX 双实例会导致响应式与甘特图状态错乱）
    const extras = {
      'element-ui': {
        root: 'ELEMENT',
        commonjs: 'element-ui',
        commonjs2: 'element-ui',
        amd: 'element-ui'
      },
      'dhtmlx-gantt': {
        root: 'dhtmlx-gantt',
        commonjs: 'dhtmlx-gantt',
        commonjs2: 'dhtmlx-gantt',
        amd: 'dhtmlx-gantt'
      }
    }
    if (Array.isArray(config.externals)) {
      config.externals.push(extras)
    } else if (config.externals) {
      config.externals = [config.externals, extras]
    } else {
      config.externals = [extras]
    }
  }
})
