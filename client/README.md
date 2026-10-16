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

## Host bridge 状态

当前版本不硬编码或默认接通 8787 Host bridge：client 不会猜测端口、协议路径、RPC schema 或改动 host/protocol 目录。接入通过宿主显式配置的 endpoint 或外部 request adapter 完成：

```js
// 在加载插件前由宿主注入；两项都必须是字符串且非空
window.__DSH_AGENT_NETWORK_BRIDGE__ = {
  url: "<由宿主配置的 bridge URL>",
  protocolVersion: "<已冻结的协议版本>",
  // 每个 path 都必须由宿主/冻结契约明确提供；插件不会推断
  endpoints: { health: "<health path>", discover: "<discover path>", message: "<message path>", submit: "<submit path>", status: "<status path>", cancel: "<cancel path>", "invite.create": "<invite.create path>", "join.request": "<join.request path>", approve: "<approve path>", "session.open": "<session.open path>", revoke: "<revoke path>" }
};
```

也可通过 `apply({ agentNetworkBridge: { url, protocolVersion, endpoints } })` 传入。面板提供配对创建/复制脱敏邀请、加入申请、审批、权限 scope 与时长选择、双方确认、实时状态/剩余时间、过期与撤销，同时保留 Connect/health、Discover、消息、任务提交（accepted）、status/result、cancel 及错误提示；配置 bridge 后优先走 bridge，避免静默改走 runtime。仅当 URL、协议版本和对应 endpoint path 显式配置后才发起 fetch；callback adapter 可在无 URL 时接管 transport，但仍要求协议版本。Host formal RPC 仍由**外部 adapter/宿主**负责映射与鉴权，插件不假设 REST schema；adapter 必须把 formal response 放在 `result` 时仍可由插件解包 task_id，并透传 lease/result_hash/error.code。当前目录提供 Node 配置/信封测试，不伪装成浏览器 DOM E2E；浏览器验收需在真实 DSH Web profile 中点击上述流程。

可验证：

```sh
node --input-type=module -e "import('./client.js').then(m => console.log(m.inject, typeof m.apply))"
node -e "const p=require('./package.json'); console.log(p.dsh.client, p.exports)"
node client.test.mjs
```
