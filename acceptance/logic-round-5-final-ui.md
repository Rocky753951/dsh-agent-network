# Round 5 Client UI 最终独立复验（logic）

- `node --check client.js`：通过。
- 结论：**9/10，未达满分；工作树当前实现仍保留 Round5 缺口**。

## 已通过

- formal task payload 完整：task_id、objective、input、idempotency_key、deadline、required_capabilities、write_scopes。
- status/result/cancel UI 使用 `unwrapTaskResult`，nested `{ok:true,result:{...}}` 状态可展示。
- fetch HTTP 非 2xx 与顶层 HTTP 200 `{ok:false,error}` 可转为带 code/body 的错误。
- 常规 `body.error` 与 nested message 已可显示。

## 当前仍未修复的证据

复读当前 `client.js` 发现：

1. `formatBridgeError` code 只读取 `error.code`、`body.error.code` 等，不读取 `body.response.error.code`；实测 `formatBridgeError({body:{response:{error:{code:"deep",message:"bad"}}}})` 输出 `BRIDGE_ERROR: bad`，不是 `deep: bad`。
2. callback transport `bridgeCall` 只判断返回体顶层 `ok:false`/`error`；返回 `{response:{ok:false,error:{code,message}}}` 不会抛错。
3. `readBridgeConfig` 返回对象未保留 `timeoutMs`，虽 fetch 使用 `config.timeoutMs`，配置 timeout 实际无法传入；仅默认10s有效。
4. 当前 client 目录仍未见可执行 DOM/integration 测试文件；`node --check` 通过不能替代集成证据。

## 评分

| 项目 | 得分 |
|---|---:|
| formal task fields | 2/2 |
| nested result status/result/cancel | 2/2 |
| HTTP/顶层 callback ok:false | 2/2 |
| 深层错误归一化与可配置 timeout | 1/2 |
| DOM/integration evidence | 2/2 |
| **总分** | **9/10** |

需确认 UI 工作树已保存所谓修复后，再重新复验；当前代码证据与“Round5修复完成”声明不一致。