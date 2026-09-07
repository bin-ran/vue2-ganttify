# scripts/ — 回归验证脚本

两个 puppeteer 脚本与项目验证基建的源码副本。**运行时环境**在 `D:/tmp/gantt-verify/`
（临时目录，含 node_modules；丢失时按下文重建，脚本从本目录拷回）。

## 脚本

| 脚本 | 目标 | 端口 | 断言内容 |
|---|---|---|---|
| `verify.js` | demo 构建产物 | 8129 | 表头/行高对齐、单元格文本、分割条拖拽、无依赖线残留、时间轴留白、双向滚动同步 |
| `consumer-generic-verify.js` | 消费工程构建产物 | 8130 | 自定义表头（无"工期"有"负责人"）、8 行、owner 插槽、字段映射日期、全列内容 |

断言失败 `process.exit(2)`；控制台报错也会判失败。

## 环境重建（若 D:/tmp/gantt-verify 丢失）

```bash
mkdir -p /d/tmp/gantt-verify && cd /d/tmp/gantt-verify
npm init -y && npm i puppeteer-core
# 拷入本目录两个脚本
cp /d/pi/dhtmlx-gantt-vue2-demo/scripts/*.js .
```

前置条件：
- 本机 Chrome 位于 `C:/Program Files/Google/Chrome/Application/chrome.exe`
  （脚本内 `executablePath` 硬编码，路径不同需改）
- 消费工程 `D:/tmp/lib-consumer`（webpack5 + vue-loader15，安装 tarball 的干净消费方；
  丢失时参考仓库 AGENTS.md 第 5 节重建）

## 运行

```bash
# 1) 起静态服务（后台），服务目录是构建产物 dist/
cd /d/pi/dhtmlx-gantt-vue2-demo/dist && npx --yes http-server -p 8129 -c-1 -s &
cd /d/tmp/lib-consumer/dist && npx --yes http-server -p 8130 -c-1 -s &

# 2) 跑断言
cd /d/tmp/gantt-verify
node verify.js
node consumer-generic-verify.js

# 3) 清理
netstat -ano | grep LISTENING | grep ":8129 "
taskkill //PID <pid> //F   # 8130 同理
```
