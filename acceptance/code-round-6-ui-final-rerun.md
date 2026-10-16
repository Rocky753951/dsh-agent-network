# Round 6 Client UI 最终独立复验（更新）

**最终评分：10/10，通过。**

## 当前工作树证据

- `node --check client.js && node client.test.mjs`：通过。
- fetch/callback 均识别 `ok:false`、`response.ok:false` 与多层 error envelope，并保留稳定 `code/body`。
- `formatBridgeError` 支持 nested `body.response.error` code/message。
- `timeoutMs` 透传 AbortController，默认 10 秒；超时映射 `BRIDGE_TIMEOUT`，网络异常映射 `BRIDGE_NETWORK_ERROR`，timer finally 清理。
- submit/status/result/cancel 均在 unwrap 后检查嵌套 `result.error`，以稳定错误提示拒绝显示为 `OK`；submit 同样拒绝嵌套错误。
- `showResult` 对循环对象安全 fallback 为 `[Unserializable result]`，并限制 4000 字符。
- 正式 task 字段、task_id、DOM/XSS、root/no-DOM、clipboard 与 callback/endpoint 约束均通过。

## 评分

| 项目 | 得分 |
|---|---:|
| 深层 response/error 与 HTTP200 业务错误 | 2/2 |
| timeoutMs/BRIDGE_TIMEOUT | 2/2 |
| task submit/status/result/cancel 错误与 unwrap | 2/2 |
| showResult 循环安全与结果限长 | 2/2 |
| DOM/transport/回归测试 | 2/2 |
| **合计** | **10/10** |

此前 9/10 的唯一扣分项（task 内嵌 `result.error` 可能显示 `OK`）已在当前源码修复：task 操作与 submit 均显式抛出带 code 的错误。
