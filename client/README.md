# DSH Agent Network client plugin

无构建依赖的最小 DSH web client 插件骨架。`package.json` 声明 `dsh.client` 注入点与 `exports`，入口为 `client.js`。

## 能力

- 通过独立浮动面板展示可从 `ctx.sessions.list.getSnapshot().byId` 读取的 Agent 列表与在线状态。
- 提供发送消息、创建协作任务两个基础操作。
- 优先探测 DSH 会话对象上的 `sendMessage` / `message` / `createTask` 等 API；不保证这些 API 在所有版本存在。
- 当发送 API 不可用时，不抛错、不修改 app root，而是安全降级为复制文本到剪贴板并在状态区提示。

## 插件规范与降级说明

入口遵循已安装 DSH client 插件格式：导出 `inject` 数组与 `apply(ctx)`，并由 `window` 外部加载器或原生 ESM 加载。`dsh.client.inject` 保持为空数组：它是“先注入哪些插件包”的清单，不是运行时 context service 名称；运行时所需的 `sessions`、`uiWorkspace`、`slots` 由入口的 `inject` 导出声明。当前 UI API/slot renderer 的具体签名可能因 DSH 版本变化，因此没有依赖 React、第三方包或未知 slot 组件工厂；`apply` 使用 feature detection 后将 `<aside>` 与按钮作为独立节点追加到 `document.body`，**不会替换或清空 app root**。当无浏览器 DOM（SSR/测试）时自动 no-op。

## 安装与联调

1. 在 DSH web profile 的插件管理目录中加入本目录（推荐使用绝对路径或本地包管理器的 `file:` 依赖），然后让 profile 重新加载；不要把文件复制到 host/protocol 目录。
2. 确认插件清单包含 `@dsh/agent-network-client`，且目标为 `platform: web`。首次加载后页面右下角应出现 **Agents** 按钮。
3. 点击按钮检查 Agent 列表；若当前 DSH 暴露 `ctx.sessions.list.getSnapshot().byId`，会显示真实 roster，否则显示安全空状态。消息/任务发送同样按能力探测，未提供 API 时会提示并尝试复制内容。
4. HMR 未启用时需重启 DSH web profile；启用 client HMR 时只需触发 profile/plugin reload，再刷新页面验证。

## 与本机 Host 的连接（零配置）

面板默认不再需要手工注入 bridge。加载时依次尝试：

1. `window.__DSH_AGENT_NETWORK_BRIDGE__` / `apply({ agentNetworkBridge })` 里显式配置的 `discoverUrl`；
2. 否则 `window.__DSH_AGENT_NETWORK_PORT__`（缺省 8787）拼出的 `http://127.0.0.1:<port>/api/agent-network/v1/bridge-config`。

Host 只对 loopback 页面返回该配置，内容为 `{ connector: { url, endpoint, token, roles }, protocol }`。拿到后 `bridgeCall` 切到 `transport: "local"`：`POST <endpoint>`，体为 `{ operation, payload }`，令牌放在 `x-agent-network-token`。发现失败时面板保持未配置状态并在状态区说明，不会静默重试到别的端口或路径。

仍然支持完全手工的宿主配置（用于反向代理或自建 adapter）：

```js
window.__DSH_AGENT_NETWORK_BRIDGE__ = {
  url: "<bridge URL>",                 // local 传输必填
  protocolVersion: "dan/0.1",
  transport: "local",                  // 缺省为 "http"
  token: "<连接器令牌>",
  connectorEndpoint: "/api/agent-network/v1/local",
  endpoints: { health: "<path>", message: "<path>", /* …仅 http 传输需要 */ },
  request: async ({ operation, payload }) => ({ /* 自定义 transport */ })
};
```

面板能力：配对创建/复制邀请码、加入申请、审批、权限 scope 与时长（15m/1h/8h/24h/7d）选择、状态与倒计时、过期/撤销自动停止轮询；Connect/health、Discover、消息、任务提交、status/result、cancel 及错误提示。配对 id 与状态写 `localStorage`（键 `dsh-agent-network:pairing`），刷新或重开面板后自动恢复并继续 5 秒轮询，终态（revoked/rejected/expired）自动清理。

样式使用 `--an-*` CSS 变量并跟随 `prefers-color-scheme`，浅色/深色都走宿主配色语义；面板仍是追加到 `document.body` 的独立节点，不替换 app root。

可验证：

```sh
node -e "const p=require('./package.json'); console.log(p.dsh.client, p.exports)"
node --test client.test.mjs
```
