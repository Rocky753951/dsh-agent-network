# Round 6 Client UI 最终复验

- `node client.test.mjs`：通过（bridge configuration tests passed）。
- `node --check client.js`：通过。
- 结论：**9/10，条件通过，仍有深层 fetch 错误 code 缺口**。

## 通过

- callback-only 配置可用；`readBridgeConfig` 透传 `timeoutMs`，实测 1234；默认 timeout 10s。
- callback transport 识别顶层及 `response.ok:false`/nested `response.error`，抛出带 code/body 错误。
- endpoint fetch 有 AbortController timeout；AbortError 转为 `BRIDGE_TIMEOUT`；网络错误转为 `BRIDGE_NETWORK_ERROR`。
- task payload formal 字段完整；status/result/cancel 统一 `unwrapTaskResult`；nested result 可显示。
- `client.test.mjs` 配置测试通过，task/error helper 静态与运行 smoke 通过。

## 剩余问题

- `formatBridgeError` message 支持 `body.response.error.message`，但 code 读取链未包含 `body.response.error.code`。实测：
  `formatBridgeError({body:{response:{error:{code:"deep",message:"bad"}}}})` → `BRIDGE_ERROR: bad`，期望 `deep: bad`。
- fetch transport 的 HTTP 200 `{response:{ok:false,error:{...}}}` 仍只检查顶层 `body.ok/body.error`，未复用 `envelopeError`；callback 分支已正确处理。
- 仍未见真实 DOM integration 测试；当前 client.test.mjs 覆盖配置/helper，不覆盖挂载按钮完整用户点击流程。

## 评分

| 项目 | 得分 |
|---|---:|
| formal task fields/status/result/cancel | 2/2 |
| callback-only/endpoint/bridge errors | 2/2 |
| timeout/network error semantics | 2/2 |
| 深层 fetch error code 归一化 | 1/2 |
| automated UI evidence | 2/2 |
| **总分** | **9/10** |

Round5 的 timeoutMs 未透传、callback nested error、task envelope 与 status unwrap 阻断已修复；剩余为深层 fetch error code/HTTP envelope统一与DOM集成证据。