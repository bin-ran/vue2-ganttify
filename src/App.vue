<template>
  <div id="app">
    <header class="app-header">
      <h1>DHTMLX Gantt 时间轴 × ElementUI 表格 × Vue 2.6 集成示例</h1>
      <p class="tips">
        左侧为 dhtmlx 原生表格（树形展开/收起、行选中、双击编辑）；右侧时间轴：拖动任务条改日期、拖两端改工期、
        拖进度段改进度、双击任务条编辑；中间分割条可拖拽调整宽度
      </p>
    </header>

    <main class="app-main">
      <GanttChart ref="gantt" :tasks="tasks" @gantt-event="onGanttEvent" />
    </main>

    <footer class="app-footer">
      <template v-if="lastEvent">
        <span class="tag">{{ lastEvent.type }}</span>{{ lastEvent.message }}
      </template>
      <template v-else>对甘特图做任意拖拽 / 编辑操作，这里会显示变更记录（事件明细见控制台）</template>
    </footer>
  </div>
</template>

<script>
import GanttChart from './components/GanttChart.vue'
import demoTasks from './data'

export default {
  name: 'App',
  components: { GanttChart },
  data() {
    return {
      tasks: demoTasks,
      lastEvent: null
    }
  },
  methods: {
    onGanttEvent(evt) {
      this.lastEvent = evt
      console.log(`[gantt:${evt.type}]`, evt.data)
    }
  }
}
</script>

<style>
html, body { height: 100%; margin: 0; padding: 0; }

#app {
  height: 100%;
  display: flex;
  flex-direction: column;
  font-family: 'PingFang SC', 'Microsoft YaHei', Arial, sans-serif;
  color: #333;
}

.app-header {
  flex: none;
  padding: 12px 20px 10px;
  background: #fff;
  border-bottom: 1px solid #eee;
}
.app-header h1 { margin: 0 0 6px; font-size: 18px; }
.app-header .tips { margin: 0; font-size: 12px; color: #888; }

/* 关键：给甘特图一个可计算的确定高度 */
.app-main { flex: 1; min-height: 0; }

.app-footer {
  flex: none;
  padding: 8px 20px;
  min-height: 20px;
  font-size: 13px;
  color: #555;
  background: #fafafa;
  border-top: 1px solid #e8e8e8;
}
.app-footer .tag {
  display: inline-block;
  padding: 1px 8px;
  margin-right: 8px;
  background: #3f8cff;
  border-radius: 10px;
  color: #fff;
  font-size: 12px;
}
</style>
