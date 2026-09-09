# scripts/ — 回归验证脚本

两个 puppeteer 脚本与项目验证基建的源码副本。**运行时环境**在 `D:/tmp/gantt-verify/`
（临时目录，含 node_modules；丢失时按下文重建，脚本从本目录拷回）。

## 脚本

| 脚本 | 目标 | 端口 | 断言内容 |
|---|---|---|---|
| `verify.js` | demo 构建产物 | 8129 | grid 表头/行数/树形箭头、单元格文本、操作列动作(本页弹窗/确认框)、双击事件→上层编辑弹窗、自绘分割条拖拽、无依赖线残留、时间轴留白、grid↔timeline 纵向同步 |
| `consumer-generic-verify.js` | 消费工程构建产物 | 8130 | 最小契约（无 id/平铺/仅起止映射）、8 行、自定义字段列、平铺无箭头、操作列自定义动作(透传字段)、双击事件 |

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
# 1) 起静态服务（python 比 npx http-server 快且稳；后台进程易随 shell 退出被杀，尽量同会话内跑完）
python -m http.server 8129 --bind 127.0.0.1 --directory "D:/pi/dhtmlx-gantt-vue2-demo/dist" &
python -m http.server 8130 --bind 127.0.0.1 --directory "D:/tmp/lib-consumer/dist" &

# 2) 跑断言
cd /d/tmp/gantt-verify
node verify.js
node consumer-generic-verify.js

# 3) 清理
netstat -ano | grep LISTENING | grep ":8129 "
taskkill //PID <pid> //T //F   # 8130 同理；//T 因为 PID 可能是子进程
```
