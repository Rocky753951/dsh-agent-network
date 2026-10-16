# Human-flow acceptance Round 4

- 日期：2026-10-16（GMT+8）
- 范围：显式 bridge、health/connect、discover、message、formal task envelope、unwrap result、status/result/lease/hash/error、cancel、clipboard、README 与外部 adapter 边界。
- 环境：Linux x64，Node.js 24.21.0；`node --check client.js`、`node client.test.mjs` 均通过。没有真实浏览器 DOM/DSH Web profile harness，因此 UI 点击闭环仍以实现路径与纯函数测试为证据，未将 Node 测试冒充 Web E2E。

## 结论

**Human-flow score: 87/100（Round 3.2: 84，+3）。建议：可开发者受限发布/联调；不建议正式产品发布。**

本轮已完成 Round 3.2 的主要修复：

- `formatBridgeError` 统一格式化嵌套错误为 `CODE: message`，health/discover、submit/message、task status/cancel 的异常路径使用该格式；
- formal task helper 生成 objective、合法独立 `task_id`、独立 `idempotency_key`、input、deadline、required capabilities、write scopes；
- formal adapter 若把 task response 放在 `result` 中，submit 会 `unwrapTaskResult`，并拒绝缺少 task ID 的 accepted 假响应；
- README 明确 external adapter/宿主负责 formal RPC 映射、鉴权和 REST operation，并明确当前测试不是浏览器 DOM E2E。

## Functional closure vs adapter boundary

### UI/plugin actually provides

1. 显式配置优先于 global 配置；支持 URL + endpoint 或 callback + protocolVersion；不猜默认端口、路径、RPC schema。
2. health/connect 和 discover 使用显式 operation；discover 响应 `agents` 可更新 roster。
3. 配置 message endpoint 时，消息优先走 bridge；无 endpoint 才尝试本地 runtime，最后安全降级 clipboard。
4. task submit 生成可追踪、可幂等的 formal-ish payload，并兼容顶层/`result` 包装的 task ID。
5. status/cancel 同时发送 `task_id` 与 `taskId`；结果框显示 status、lease/lease_id、result_hash、result，且限长。
6. transport reject/HTTP 非 2xx 异常可显示 code + message；clipboard 成功与失败有不同提示。

### External adapter/host must provide

1. `health`, `discover`, `message`, `submit`, `status`, `cancel` endpoint 或等价 request callback；Host 自身 formal 路由仍是统一 `/api/agent-network/v1/rpc`，并不直接提供这些 REST endpoint。
2. HMAC/mTLS/凭据、peer admission、DAN envelope 映射、task 执行器、lease、幂等和结果持久化。
3. 对 task submit 返回 task ID（顶层或 `result.task_id/taskId`），对 status/result 返回 lease/hash/最终状态。
4. message 的实际远端送达/ack、任务 accepted 与执行结果；UI 文案“sent/accepted”只代表 adapter 成功返回，不代表远端执行完成。
5. 浏览器真实配置、CORS/代理和安全密钥边界。不能把长期 HMAC secret 放入 client bundle。

**因此本轮不能宣称“两个独立 Host 通过 UI 已端到端完成 DAN 任务”。可以宣称 client 已具备清晰、显式的 adapter contract 和开发者联调流程。**

## Journey matrix

| 步骤 | 结果 | 判定 |
|---|---|---|
| 配置/优先级 | context bridge 覆盖 global；URL+protocol 或 callback+protocol 可用；缺配置明确提示 | 通过 |
| Connect/health | health operation 显式 endpoint GET，带 protocol header；Connect/health 命名一致 | 通过（需 adapter） |
| Discover | 显式 discover GET，agents 更新 roster；不猜路径 | 通过（需 adapter） |
| Message | 显式 message endpoint 优先；成功展示结果；无 transport 时 runtime→clipboard fallback | 通过（需 adapter） |
| Task submit | payload 包含 task_id、objective、input、idempotency_key、deadline、capabilities、scopes；响应可顶层或 result 包装；无 ID 拒绝 | 通过（需 adapter） |
| Accepted→status/result | 自动填 Task ID；status 手动刷新，显示 lease/hash/result；无自动轮询或恢复 | 部分通过 |
| Cancel | payload 双 task ID；异常路径显示格式化 code/message；正常返回的嵌套 error 对象仍未统一识别 | 部分通过 |
| Error recovery | fetch HTTP 错误 body 的 error.code/message 能格式化；callback reject 同样格式化；无 retry/reconnect 动作 | 部分通过 |
| Clipboard | API 缺失/拒绝时显示 “No transport and clipboard copy failed.” | 通过 |
| README | endpoint 示例、adapter responsibility、formal RPC mapping、Web E2E boundary 均明确 | 通过（开发者文档） |

## Evidence from tests/code

`node client.test.mjs` 输出 `bridge configuration tests passed`，覆盖：

- URL endpoint 与 callback-only 配置；
- 非字符串 endpoint 过滤；
- task 必需字段和独立 ID；
- `unwrapTaskResult({result:{task_id}})`；
- `formatBridgeError({error:{code,message}})` 输出 `CODE: message`。

代码路径确认：

- `bridgeCall` HTTP 非 2xx 解析 JSON body，构造带 `.code` 的 Error；UI catch 使用 `formatBridgeError`。
- submit 对响应先 `unwrapTaskResult`，再要求 task_id/taskId。
- `buildTaskPayload` 的 `task_id` 与 idempotency key 分别随机生成，deadline 为未来 30 分钟。
- README 明确 Node 配置/信封测试不等于真实浏览器 DOM E2E。

## Remaining gaps / risks

### A. status/cancel 的 HTTP 200 error envelope

status/cancel 正常路径的 note 仍只读取 `result?.error_code`，结果框也只写 `error_code: result?.error_code`。如果 adapter 返回 HTTP 200：

```json
{"error":{"code":"lease_expired","message":"lease expired"}}
```

而不是 HTTP 4xx，`bridgeCall` 不会 throw；UI 可能显示 `status: OK`，并丢失嵌套错误 code/message。建议对所有 operation 统一 `unwrap/error envelope`，检测 `ok:false` 或 `error` 后调用 `formatBridgeError`。

### B. Web E2E / lifecycle

没有真实 DOM harness；无法证实实际 DSH Web 注入、焦点、按钮 submitter、clipboard 权限、跨源 fetch。也没有 task polling、lease 倒计时、reconnect/cursor resume、历史消息或完整 result artifact 下载。

### C. Formal contract boundary

UI task helper 已接近 formal task.submit，但额外的 target/assignee/title/description/message 字段和简化 input 仍需 adapter 映射；客户端不是 DAN signer，也不应直接承担长期密钥。Host 的统一 formal RPC 与 UI endpoints 的关系必须保持文档中的外部 adapter 说明。

## Score

| 维度 | 分数 |
|---|---:|
| 安装与配置 | 11/15 |
| Connect/health/discover | 16/18 |
| Message | 12/15 |
| Task envelope/accepted/status/result/cancel | 21/25 |
| Error and clipboard recovery | 9/12 |
| Stop/reload/recovery | 7/8 |
| README/platform/adapter clarity | 7/7 |
| **总分** | **87/100** |

## Release recommendation

- **受限发布：建议**，面向能提供外部 adapter、理解 formal RPC/HMAC 边界的开发者；README 已足够支持初步联调。
- **正式发布：不建议**，需先统一 HTTP 200 error envelope、补真实浏览器 DOM E2E、任务轮询/lease/reconnect/持久化和 Windows 实测。

## Gate 5 mapping

本轮 UI 改善不替代 Host logic/code Gate5。UI 仍明确不支持 events/cursor/resume；Host stop/dispose 测试通过不等于 UI 任务恢复通过。按人类流程，Gate5 可视为**开发者受限条件通过**，不能据此宣布完整产品正式发布。
