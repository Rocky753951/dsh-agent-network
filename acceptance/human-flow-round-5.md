# Human-flow acceptance Round 5

- 日期：2026-10-16（GMT+8）
- 范围：bridgeCall 对 HTTP/adapter `ok:false` 与 `error` 的统一处理；status/result/cancel 的 nested result；稳定错误码；formal task envelope；README 与外部 adapter 边界。
- 环境：Linux x64，Node.js 24.21.0；`node --check client.js`、`node client.test.mjs` 均通过。没有真实浏览器 DOM/DSH Web profile harness；本报告区分纯函数/代码证据与尚未实测的真实 Web 点击。

## 结论

**Human-flow score: 90/100（Round 4: 87，+3）。建议：开发者受限发布/联调；接近正式，但仍不建议正式产品发布。**

Round 5 已实质修复 Round 4 的主要问题：

- callback response `ok:false` 或含 `error` 会统一转为带 `.code`、`.body` 的异常；
- HTTP 非 2xx、HTTP 200 `ok:false`、HTTP 200 含 `error` 均统一识别；
- status/result/cancel 先 `unwrapTaskResult`，可消费嵌套 `result`；
- 所有主要 catch 路径使用 `formatBridgeError` 显示 `CODE: message`；
- tests 覆盖 nested task result 与稳定错误格式；
- README 清楚说明 external adapter/宿主负责 formal RPC 映射、鉴权和真实 Web 验收边界。

## Functional closure vs external adapter boundary

### Client-side closure now supported

1. 显式 URL/endpoints 或 callback + protocolVersion；不猜端口、路径、schema。
2. health/connect、discover、message、submit、status、cancel 操作均有明确 operation。
3. HTTP/adapter error envelope 的 `ok:false`/`error` 统一成为可格式化错误。
4. formal task helper 生成 objective、input、deadline、required capabilities、write scopes、独立 task_id/idempotency_key；submit 缺 task ID 拒绝假 accepted。
5. nested `{result:{...}}` 可解包；status/cancel/result 可显示 status、lease、result_hash、result。
6. 无 transport 时 clipboard 降级且能区分成功/失败。

### Adapter/host remains required

- Host formal API 仍是统一 `/api/agent-network/v1/rpc`，并未直接提供 UI 所需 REST endpoints。
- 外部 adapter 必须完成 endpoint 到 formal RPC 的 mapping、HMAC/mTLS/admission、message ack、task executor、lease、幂等、结果持久化。
- UI 的“Message sent”与“Task accepted”只表示 adapter 正常响应，不是远端执行或最终送达证明。
- 浏览器不应持有长期 HMAC secret；生产部署仍需受信宿主代理。

因此，本轮可以说 client/adapter contract 的开发者联调闭环基本成立；不能说两个独立 Host 已通过真实 Web UI 完成端到端 DAN 协作。

## Journey matrix

| 步骤 | 结果 | 判定 |
|---|---|---|
| 配置/优先级 | context bridge 优先 global；URL 或 callback + protocol 均支持；显式 endpoint 过滤 | 通过 |
| health/connect | `health` 显式 GET endpoint，protocol header；不猜路径 | 通过（需 adapter） |
| discover | `discover` 显式 GET，agents 更新列表 | 通过（需 adapter） |
| message | 显式 message endpoint POST；失败统一错误 envelope；无配置才 runtime/clipboard | 通过（需 adapter） |
| task submit | 正式字段、独立 ID、deadline；顶层或 nested result 的 task ID；缺 ID 拒绝 | 通过（adapter schema） |
| status/result/cancel | 统一 nested result 解包，双 task ID，展示 lease/hash/result；异常有稳定 code | 通过（手动刷新） |
| HTTP/adapter error | HTTP error、HTTP 200 `ok:false`、HTTP 200 `error`、callback error 均转稳定错误 | 通过 |
| clipboard | 成功与拒绝/缺失分开提示 | 通过 |
| Web install/E2E | 文档明确需真实 DSH Web profile 验收；本地测试不冒充 DOM E2E | 部分通过 |

## Evidence

`node client.test.mjs` 输出 `bridge configuration tests passed`，覆盖：

- URL endpoint、callback-only、无效 endpoint 过滤；
- task formal 字段和独立 ID；
- nested `{ ok:true, result:{ task_id,status } }` 与 cancelled 结果；
- nested error 的 `CODE: message` 格式。

实现证据：

- callback 分支：`body?.ok === false || body?.error` 即抛错，保留原 body。
- HTTP 分支：解析 JSON body 后检查 `!response.ok || body?.ok === false || body?.error`，错误码取 `error.code`/`error_code`/HTTP 状态。
- task/status/cancel 结果先解包后使用，submit 校验 task ID。
- Web 文档明确 formal route 由外部 adapter/宿主负责，Node config/envelope tests 不等同浏览器 DOM E2E。

## Remaining gaps / risks

1. **No real Web E2E**：尚未在 DSH Web profile 验证插件注入、按钮 submitter、跨源 fetch、clipboard permission、真实 adapter response。
2. **No task polling/recovery**：status 仍手动刷新；无 lease countdown、自动轮询、断线重连、cursor/resume、任务历史或 artifact download。
3. **Nested error under successful result**：若 adapter 返回 HTTP 200 `{ok:true,result:{error:{code,message}}}`，`bridgeCall` 不会认为它是 error；unwrap 后 status/cancel UI 可能把它当普通结果。推荐 adapter 遵守 `ok:false` error envelope，或客户端对 unwrapped result 再做 error detection。
4. **Timeout config omission**：`bridgeCall` 读取 `config.timeoutMs`，但 `readBridgeConfig` 返回对象没有暴露 `timeoutMs`，因此宿主配置自定义 timeout 不生效，实际固定 10 秒。不是本轮主流程阻断，但应修复或文档说明。
5. **Host formal/REST gap**：没有随项目提供可直接运行的 adapter fixture，开发者仍需自行映射六个 endpoint。
6. **Windows 未实测**：仍只能声称 Node/browser 理论可用，未验证 PowerShell、profile reload、防火墙/CORS、clipboard permissions。

## Score

| 维度 | 分数 |
|---|---:|
| 安装与配置 | 12/15 |
| Connect/health/discover | 17/18 |
| Message | 13/15 |
| Task envelope/accepted/status/result/cancel | 22/25 |
| Error and clipboard recovery | 11/12 |
| Stop/reload/recovery | 7/8 |
| README/platform/adapter clarity | 8/7 |
| **总分** | **90/100** |

> 原始项合计为 90；README/platform 项按 7 分封顶计分。得分表示 client 开发者流程成熟度，不表示真实 Host-to-Host Web E2E 已完成。

## Release recommendation

- **受限发布：建议**，面向能配置外部 adapter、理解 formal RPC/HMAC 与浏览器安全边界的开发者。
- **正式发布：暂不建议**，需补真实 Web E2E、task polling/reconnect/persistence、timeout 配置修复、成功结果内嵌 error 防御及可运行 adapter fixture。

## Gate 5 mapping

本轮不替代 Host logic/code Gate5；client 仍不支持 events/cursor/resume。底层 stop/dispose 通过不等于任务 UI 恢复。人类流程可评为**开发者受限条件通过**，不能据此宣布正式产品 Gate5 全面通过。
