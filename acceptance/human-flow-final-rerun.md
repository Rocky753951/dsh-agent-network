# Human-flow acceptance — final current-tree rerun

- 日期：2026-10-16（GMT+8）
- 范围：深层 `response.error` code/message、HTTP 200 `response.ok:false`、timeout 链路、task submit/status/result/cancel、外部 adapter 边界。
- 环境：Linux x64，Node.js 24.21.0；`node --check client.js` 与 `node client.test.mjs` 通过。另运行 callback 深层错误和 fake-fetch timeout 黑盒脚本；没有真实浏览器 DOM/DSH Web profile。

## 结论

**Human-flow score: 93/100。建议开发者受限发布/联调；不建议直接正式产品发布。**

当前工作树已确认最终修复有效：

- `formatBridgeError` 支持 `body.response.error.code/message`；
- callback/fetch 的 `envelopeError` 识别顶层、`response.error`、`body.error`；
- HTTP 200 `response.ok:false` 与 nested error 会抛出带稳定 code/body 的错误；
- timeoutMs 透传，AbortController 超时返回 `BRIDGE_TIMEOUT`；
- task payload、nested result 解包、缺 task ID 拒绝、status/result/cancel 双 task ID 保持通过。

## Executed evidence

1. `node --check client.js && node client.test.mjs`：通过，输出 `bridge configuration tests passed`。
2. 测试新增覆盖：
   - `formatBridgeError({ body:{response:{error:{code:'NESTED_BAD',message:'bad'}}}})` → `NESTED_BAD: bad`；
   - callback 返回 `{response:{ok:false,error:{code:'NESTED_BAD',message:'bad'}}}`，`bridgeCall` reject；
   - `timeoutMs:25` 从 config 保留。
3. 额外黑盒脚本：
   - callback 深层错误输出 `callback DEEP_BAD DEEP_BAD: deep bad`；
   - fake fetch 延迟超过 10ms 输出 `timeout BRIDGE_TIMEOUT BRIDGE_TIMEOUT: Bridge request timed out.`。

## Human journey matrix

| 流程 | 当前结果 | 判定 |
|---|---|---|
| 显式配置/优先级 | context bridge 优先 global；URL/endpoints 或 callback+protocol；不猜端口/路径 | 通过 |
| Connect/health | health 显式 GET、协议 header、可配置 timeout | 通过（需 adapter） |
| Discover | 显式 discover GET，agents 更新 roster | 通过（需 adapter） |
| Message | 显式 message endpoint 优先；无配置时 runtime/clipboard fallback | 通过（需 adapter） |
| Task submit | formal 字段、独立 task/idempotency、deadline/capabilities/scopes；顶层或 nested result task ID；缺 ID 拒绝 | 通过（需 adapter） |
| Status/result/cancel | 解包 nested result、双 task ID、显示状态/lease/hash/result；手动刷新 | 部分通过：无轮询 |
| Error | 顶层/deep response/body error、HTTP 200 response.ok:false、callback reject 均可显示 `CODE: message` | 通过 |
| Timeout | 显式 timeoutMs 生效；默认 10s；稳定 `BRIDGE_TIMEOUT`；network error 有独立 code | 通过 |
| Clipboard | 成功与失败分别提示 | 通过 |
| 真实 Web | 文档明确 Node 测试不等于 Web E2E；本轮未实测 | 未完成 |

## Adapter boundary

此 client 的功能闭环是“显式 adapter contract”闭环，不是内建 Host-to-Host UI 闭环。Host formal API 仍需由外部 adapter 映射到 `health/discover/message/submit/status/cancel`；adapter/宿主负责 formal RPC、HMAC/mTLS、peer admission、真实送达/执行、lease、幂等、持久化。UI 的 “Message sent”/“Task accepted”只代表 adapter response，不代表远端最终执行完成。

## Remaining risks

- 没有真实浏览器 DOM E2E：未验证 DSH Web 注入、实际 submitter、clipboard 权限、CORS 和真实 adapter。
- 没有 task 自动 polling、lease countdown、断线恢复、cursor/resume、历史或 artifact 下载。
- 若 adapter 返回 HTTP 200 `{ok:true,result:{error:{code,message}}}`，当前 envelopeError 只检查外层；应约束 adapter 对错误使用 `ok:false`，或继续对解包结果做错误判定。
- 没有可直接运行的 adapter fixture；Windows 仍未实测。

## Score

| 维度 | 分数 |
|---|---:|
| 安装与配置 | 12/15 |
| Connect/health/discover | 18/18 |
| Message | 14/15 |
| Task/status/result/cancel | 23/25 |
| Error/clipboard/timeout | 12/12 |
| Stop/reload/recovery | 7/8 |
| README/adapter/platform clarity | 7/7 |
| **总分** | **93/100** |

## Release recommendation

- **受限发布：建议**，面向可提供 external adapter、理解 formal RPC/HMAC 边界的开发者。
- **正式发布：暂不建议**，需补真实 Web E2E、adapter fixture、任务 polling/reconnect/persistence、Windows 验证，并决定是否防御 `result.error`。

Gate5 角度：client 不支持 events/cursor/resume；Host stop/dispose 通过不等于 UI 任务恢复通过。人类流程结论为**开发者受限条件通过**，不能据此宣布正式产品全面通过。
