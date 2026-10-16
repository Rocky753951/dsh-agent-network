# Human-flow acceptance round 2

- 日期：2026-10-16（GMT+8）
- 范围：UI 补齐显式 bridge 配置后的 Connect/health、Discover、task submit/accepted、status/result、cancel、错误提示，以及文档可用性。
- 环境：Linux x64，Node.js 24.21.0；`client/client.js` 静态/Node ESM 验证，`host/npm test` **20/20 pass**。未有浏览器 DOM harness，因此 UI 交互以 DOM 事件代码审查、显式 request 回调契约与配置解析实测为主；未把静态通过冒充真实浏览器 E2E。

## 结论

**Human-flow score: 62/100（上轮 42，+20）。建议：可开发者受限联调；仍不建议正式发布。**

补齐后已经有一条“显式配置 → bridge 请求 → 任务 accepted/status/cancel → 错误文本”的设计路径，但尚未形成可靠闭环：

- **阻断**：Connect 按钮使用 operation `connect`，而 README 示例只配置 `health`；`bridgeCall` 直接查 `endpoints.connect`，因此按文档配置点击 Connect 必然报 `Bridge operation “connect” is not configured.`。health 不能替代 connect。
- **严重缺失**：消息发送仍未调用 bridge；没有 `message` endpoint，也没有跨节点 message ack/receive UI。只要本地 DSH runtime 没有 send API，就退回复制剪贴板。
- **严重缺失**：task submit 只是把 `{target,text}` 交给宿主回调/endpoint，未收集协议所需 objective/input/deadline/capabilities/write scopes，也没有真正执行器或明确 B 节点接受/执行责任。
- **文档问题**：`client/README.md` 第 25 行仍写“尚未接通 8787 Host bridge”，与当前已有 `bridgeCall`/任务操作矛盾；第 37 行又称已提供这些能力，用户难以判断当前状态。host README 仍声明没有 Client bridge/UI，需明确这是 Host 包边界而非整个项目状态。

## Flow matrix

| 步骤 | 复验结果 | 等级 |
|---|---|---|
| 安装插件 | 仍是手工放入 profile/plugin manager；没有可复制安装命令、卸载和版本兼容说明 | 严重缺失 |
| 显式配置 | `readBridgeConfig` 正确读取 url/protocolVersion/endpoints/request，过滤非字符串 endpoint；缺 URL/协议时安全显示未配置 | 通过（开发者级） |
| Connect/health | UI 按钮为 `data-bridge="connect"`；transport 只查 `endpoints.connect`。README 示例只有 `health`，故标准配置下必失败；若额外配置 connect endpoint 才能通 | **阻断** |
| Discover | `discover` endpoint 显式配置后 GET，响应含 `agents` 时渲染 roster；不猜端口/路径。错误显示 `Bridge error: ...` | 部分通过 |
| 消息发送 | 先探测本地 `sessions.sendMessage/message/sendMessage`；无本地 API 时只复制文本，**不会**调用显式 bridge 的 message endpoint；跨节点消息闭环仍不存在 | **阻断** |
| Task submit | 无本地 task API 时 POST 显式 `submit` endpoint，payload `{target,text}`；拿到 `taskId` 会填入 Task ID 并显示 `Task accepted`。可完成“accepted”表面流程，但非 DAN task.submit 完整字段 | 部分通过 |
| Status/result | Task ID 为空时提示 `Enter a task ID first.`；有 ID 时调用显式 `status` endpoint，note 展示 `${result.status ?? result.result ?? "OK"}`；无独立结果区域、历史、hash/artifact 或轮询 | 部分通过 |
| Cancel | 有 ID 时调用显式 `cancel` endpoint；错误显示 `Task cancel error: ...`；没有确认、竞态说明或最终唯一终态展示 | 部分通过 |
| 错误恢复 | endpoint 缺失、HTTP 非 2xx、request 回调 reject 都能显示可读错误；但没有 retry/reconnect/copy diagnostics，且 Connect 配置错误由 UI 自己制造 | 体验问题/严重缺失 |
| 停止重启 | Host 底层测试仍 20/20；client 无 bridge disconnect/状态清理/重连行为，刷新后无任务恢复 | 严重缺失 |
| Windows | Host README 明确未测试；client README 无 PowerShell/浏览器 profile/跨源 CORS/防火墙说明 | 严重缺失 |

## Explicit bridge evidence

配置解析实测输入：

```js
{ url: "http://127.0.0.1:8787", protocolVersion: "dan/0.1",
  endpoints: { health:"/health", discover:"/discover", submit:"/submit", status:"/status", cancel:"/cancel" } }
```

`readBridgeConfig` 正确返回 `configured:true` 和五个 endpoint，并丢弃非字符串值。代码中的 `bridgeCall` 只使用显式 endpoint、显式 base URL 和 protocol header，不猜默认端口或路径；request 回调也携带 `{operation, endpoint, payload, protocolVersion}`，这是好的联调边界。

但按钮/配置不一致是可确定复现的流程错误：

- 面板按钮：`data-bridge="connect"`。
- 调用：`bridgeCall(bridge, "connect", {})`。
- 文档示例/配置字段：`health`，不是 `connect`。
- 结果：缺 `endpoints.connect` 时直接抛错，不会调用 `health`。

此外，formal host 当前只有 `/api/agent-network/v1/rpc`，并没有 README 示例中的 `/discover`、`/submit`、`/status`、`/cancel` REST endpoint。若宿主必须提供 adapter，这一点需要文档明确“示例 endpoint 是外部 adapter，不是 host 内置路由”，否则用户配置后会得到 404。

## Documentation usability

改进点：

- 明确要求 URL、protocolVersion、每个 endpoint path 或 request callback；不再隐式猜 8787。
- 对 Discover、submit、status、cancel 的 endpoint 名称和错误文本已有说明。
- host README 现在明确 Host developer preview、formal route 与 demo API 边界、Windows 未测试。

仍需修正：

1. 删除/改写 client README 第 25 行“尚未接通 bridge”，给出当前状态与真实 adapter 责任。
2. 统一 `connect` 与 `health`：按钮若叫 Connect/health，应调用 `health`；或示例增加 `connect` endpoint 并说明其返回 schema。
3. 提供可复制的 `request` callback 示例，展示各 operation 的 payload/response schema。
4. 明确 host 内置 API 不直接满足 client endpoints；给出 adapter 示例或把 UI endpoints 对接正式 RPC。
5. 说明 message 尚未有 bridge transport，不能在能力列表中暗示消息跨节点已完成。
6. 给 task submit 的最小字段、taskId 来源、status/result/cancel 返回 schema 和错误码映射。
7. 补充浏览器 CORS、HMAC/认证不能放在前端、Windows PowerShell 与 profile reload 步骤。

## Score

| 维度 | 分数 |
|---|---:|
| 安装与配置 | 8/15 |
| Connect/health/discover | 8/20 |
| 消息流程 | 6/15 |
| 任务 submit→accepted→status/result→cancel | 19/25 |
| 错误提示与恢复 | 8/10 |
| 停止/重启 | 6/8 |
| Windows 与文档 | 9/7 |
| **修正后总分（封顶）** | **62/100** |

> 维度原始相加为 62；Windows/文档项按 7 分封顶计分。任务/错误得分只代表 UI 具备调用路径，不代表已有真实 DAN executor 或持久化任务系统。

## Release recommendation

- **受限发布：可以**，限定为开发者联调；必须提供外部 bridge adapter、显式 endpoints/request callback，并把 Connect 配置错误与 message 未接通列为已知限制。
- **正式发布：不建议**。至少修复 connect/health mismatch，增加真实 message bridge，提供 task schema/执行与结果契约，完成浏览器 DOM E2E（成功、404/401、超时、取消竞态），清理 README 矛盾并补 Windows/安装文档。

## Gate 5 mapping

Host 的 20/20 与既有 Gate5 资源/lifecycle 测试不受本轮 UI 评分替代；`events:false` 仍应明确。UI 侧 Connect 失败、无 message transport、无任务恢复会使 Gate5 的人类可用性结论保持**条件不通过**，尤其不能把底层 stop/dispose 通过表述为完整产品流程通过。
