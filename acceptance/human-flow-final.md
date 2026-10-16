# Human-flow acceptance — final client review

- 日期：2026-10-16（GMT+8）
- 范围：最终 client bridge 流程、health/connect、discover、message、formal task submit/accepted、status/result/lease/hash、cancel、nested error envelope、timeout、clipboard、文档与外部 adapter 边界。
- 环境：Linux x64，Node.js 24.21.0；`node --check client.js`、`node client.test.mjs` 均通过（bridge configuration tests passed）。没有真实浏览器 DOM/DSH Web profile，故明确区分代码/纯函数证据与未实测 Web E2E。

## Final conclusion

**Human-flow score: 92/100。建议开发者受限发布/联调；不建议直接正式产品发布。**

最终修复已解决此前主要流程问题：

- `timeoutMs` 从显式配置透传，默认 10 秒；AbortError 映射稳定 `BRIDGE_TIMEOUT`；网络错误映射 `BRIDGE_NETWORK_ERROR`。
- fetch 与 callback 均识别 `ok:false`、顶层 `error`、`response.error`、`body.error`，抛出带 code/body 的错误。
- status/result/cancel 统一解包 nested `result`；错误 catch 显示 `CODE: message`。
- task helper 生成 objective、input、deadline、capabilities、scopes、独立合法 `task_id`/`idempotency_key`；submit 缺 task ID 不接受。
- showResult 对不可序列化对象安全降级并限长。
- README 明确 Host formal RPC 由 external adapter/宿主映射，Node 测试不冒充浏览器 E2E。

## Functional closure vs external adapter boundary

### Client closure supported

1. 显式 URL/endpoints 或 callback + protocolVersion；不猜端口、路径、协议。
2. health/connect、discover、message、submit、status、cancel 六项 operation 有明确调用路径。
3. HTTP/adapter 错误 envelope 可转换为稳定错误码和消息；超时、网络失败可区分。
4. task submit 形成可追踪/幂等的 payload，支持 top-level 或 nested `result` task ID。
5. status/cancel 发送 `task_id` 与 `taskId`，显示状态、lease、result hash、结果。
6. 无 transport 时 clipboard 成功/失败均有明确反馈。

### Adapter/host responsibility remains explicit

- Host 内建 formal API 是统一 `/api/agent-network/v1/rpc`，不是 UI 直接调用的六个 REST endpoint。
- External adapter/宿主必须负责 endpoint→formal RPC 映射、鉴权/HMAC、peer admission、真实 message ack、task executor、lease、幂等和持久化。
- UI “Message sent”/“Task accepted”只代表 adapter response 成功，不等于远端最终送达/执行完成。
- 长期 HMAC secret 不应进入浏览器 bundle；真实部署需受信宿主代理。

## User journey matrix

| 步骤 | 最终结果 | 判定 |
|---|---|---|
| 安装/配置 | README 给出 profile/plugin 注入与显式 bridge 示例；支持 callback-only + protocol | 开发者可用 |
| Connect/health | health endpoint 明确 GET、protocol header、timeout | 通过（需 adapter） |
| Discover | 显式 discover endpoint 更新 agents roster | 通过（需 adapter） |
| Message | 显式 message endpoint 优先；无配置才 runtime/clipboard | 通过（需 adapter） |
| Task submit | formal 字段、独立 ID、deadline；nested response 支持；无 ID 拒绝 | 通过（需 adapter） |
| Accepted/status/result | 自动填 Task ID；status 手动刷新；展示 lease/hash/result，结果限长 | 部分通过：无轮询 |
| Cancel | 双命名 task ID；成功结果和异常 code/message 可显示 | 通过（手动操作） |
| Timeout/recovery | configurable timeout 透传；timeout→`BRIDGE_TIMEOUT`；network→`BRIDGE_NETWORK_ERROR` | 通过 |
| Clipboard fallback | API 缺失/拒绝分别提示 | 通过 |
| Web E2E | README 诚实说明需真实 DSH Web profile 验收；本轮未实测 | 未完成 |

## Evidence

`node client.test.mjs` 通过，覆盖：

- callback-only 配置与 `timeoutMs:25` 透传；
- nested `result` task/cancelled 解包；
- `formatBridgeError` 稳定码；
- callback 返回 `response.ok:false` + nested error 时 `bridgeCall` 拒绝。

代码证据：

- `readBridgeConfig` 返回合法正数 timeout，默认 10000ms。
- fetch `AbortController` 超时抛 `BRIDGE_TIMEOUT`；非 Abort 网络异常抛 `BRIDGE_NETWORK_ERROR`。
- `envelopeError` 检查 `body.error`、`body.response.error`、`body.body.error`；HTTP 与 callback 均检查对应 `ok:false`。
- `showResult` 捕获 JSON stringify 异常，使用 `[Unserializable result]`，并限制 4000 字符。

## Residual risks

1. **No browser E2E**：未验证实际 DSH Web 注入、DOM submitter、clipboard permission、跨源/CORS、真实 adapter responses。
2. **No automatic task recovery**：status 是手动刷新，无 polling、lease countdown、reconnect/cursor resume、history 或 artifact download。
3. **Nested error inside successful result**：若 adapter 返回 `{ok:true,result:{error:{code,message}}}`，`envelopeError` 不检查 `result.error`；应约束 adapter 使用 `ok:false`，或客户端对解包结果再判错。该边界已在文档中由 adapter contract 负责，但可继续加防御。
4. **No runnable adapter fixture**：用户仍需自行提供六项 endpoint 到 formal RPC 的映射。
5. **Windows 未实测**：只能声明理论 Node/browser 可运行，不能宣称 Windows 已验证。

## Score

| 维度 | 分数 |
|---|---:|
| 安装与配置 | 12/15 |
| Connect/health/discover | 18/18 |
| Message | 14/15 |
| Task/status/result/cancel | 23/25 |
| Error/clipboard/timeout | 11/12 |
| Stop/reload/recovery | 7/8 |
| README/adapter/platform clarity | 7/7 |
| **总分** | **92/100** |

## Release recommendation

- **受限发布：建议**，面向能运行真实 DSH Web profile、提供 external adapter、理解 HMAC/formal RPC 边界的开发者。
- **正式发布：暂不建议**，先补真实浏览器 E2E、可运行 adapter fixture、任务 polling/reconnect/persistence、Windows 验证，并决定是否防御 `result.error`。

## Gate 5 mapping

本报告不替代 Host logic/code Gate5。client 没有 events/cursor/resume；Host stop/dispose 通过不等于 UI 任务恢复通过。人类流程结论为**开发者受限条件通过**，不能据此宣称正式产品 Gate5 全面通过。
