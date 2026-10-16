# Round 6 Client UI 最终复验（当前工作树）

- `node client.test.mjs`：通过。
- `node --check client.js`：通过。
- 结论：**10/10，通过**。

## 证据

- callback-only 与 endpoint 配置通过；`timeoutMs` 透传且可配置，默认 10s。
- callback/fetch transport 统一识别顶层与多层 `ok:false`/`error` envelope；HTTP 200 nested `{response:{ok:false,error}}` 测试通过。
- 错误 code/message/body 保留；`formatBridgeError` 支持 `body.response.error.code/message`。
- AbortError 映射 `BRIDGE_TIMEOUT`，普通网络失败映射 `BRIDGE_NETWORK_ERROR`。
- `buildTaskPayload` 包含独立 task_id、objective、input、idempotency_key、future deadline、required_capabilities、write_scopes；task_id 与幂等键独立生成。
- status/result/cancel 统一 `unwrapTaskResult`；nested result 的 task_id/status/cancelled 可展示。
- submit 响应缺 task_id 会拒绝，不误报 accepted；`showResult` 对循环 JSON 安全降级为 `[Unserializable result]`。
- `client.test.mjs` 覆盖 callback nested error、timeout 配置、formal task fields、nested unwrap、独立 ID；helper/bridge 集成通过。

## 评分

| 项目 | 得分 |
|---|---:|
| formal task fields/ID | 2/2 |
| callback/endpoint/bridge 优先 | 2/2 |
| nested result/status/cancel | 2/2 |
| nested errors/timeout/safe rendering | 2/2 |
| automated config/bridge evidence | 2/2 |
| **总分** | **10/10** |

Round5/旧 Round6 报告的深层 error code、HTTP200 nested ok:false、timeout 透传及循环结果缺口均已修复；本报告取代旧评分。