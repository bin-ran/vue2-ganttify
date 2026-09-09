# scripts/ — 回归验证脚本

两个 puppeteer 回归脚本（源码正本）。运行时需要一个装了 `puppeteer-core` 的工作目录
（下文以 `<verify-dir>` 指代，放哪都行）。

## 脚本

| 脚本 | 目标 | 端口 | 断言内容 |
|---|---|---|---|
| `verify.js` | demo 构建产物 | 8129 | grid 表头/行数/树形箭头、单元格文本、操作列动作(本页弹窗/确认框)、双击事件→上层编辑弹窗、自绘分割条拖拽、无依赖线残留、时间轴留白、grid↔timeline 纵向同步 |
| `consumer-generic-verify.js` | 消费工程构建产物 | 8130 | 最小契约（无 id/平铺/仅起止映射）、8 行、自定义字段列、平铺无箭头、操作列自定义动作(透传字段)、双击事件 |

断言失败 `process.exit(2)`；控制台报错也会判失败。

## 环境搭建

```bash
mkdir -p <verify-dir> && cd <verify-dir>
npm init -y && npm i puppeteer-core
# 拷入本目录两个脚本
cp <repo>/scripts/*.js .
```

前置条件：

- Chrome：脚本按 `CHROME_PATH` 环境变量 → 常见安装位（Program Files / LocalAppData）
  的顺序解析；都不满足时设置 `CHROME_PATH` 指向 chrome.exe
- 消费工程 `<consumer-dir>`（webpack5 + vue-loader15，安装 tarball 的干净消费方；
  结构参考仓库 AGENTS.md 第 5 节）

## 运行

```bash
# 1) 起静态服务（python 比 npx http-server 快且稳；后台进程易随 shell 退出被杀，尽量同会话内跑完）
python -m http.server 8129 --bind 127.0.0.1 --directory <repo>/dist &
python -m http.server 8130 --bind 127.0.0.1 --directory <consumer-dir>/dist &

# 2) 跑断言
cd <verify-dir>
node verify.js
node consumer-generic-verify.js

# 3) 清理
netstat -ano | grep ":8129 "
taskkill //PID <pid> //T //F   # 8130 同理；//T 因为 PID 可能是子进程
```
