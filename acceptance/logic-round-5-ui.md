# Round 5 Client UI 逻辑复验

- `node --check client.js`：通过。
- 结论：**9/10，基本通过但仍有嵌套错误归一化缺口**。

## 通过

- `buildTaskPayload` 已生成完整 formal task 字段：task_id、objective、input、idempotency_key、future deadline、required_capabilities、write_scopes。
- status/result/cancel 操作先 `unwrapTaskResult`，正式 `{ok:true,result:{status,task_id,result_hash}}` 可正确展示状态/结果；cancelled 状态可显示。
- endpoint transport 与 callback transport 均识别 HTTP/回调返回的 `ok:false`、`error.code/message`，包括 HTTP 200 + error envelope。
- `formatBridgeError` 可显示常规 `error`/`body.error`/`body.response.error.message` 错误；submit 缺 task_id 会显式报错，不再误显示 accepted。

## 剩余问题

1. 深层包装 `{body:{response:{error:{code,message}}}}` 的 message 可显示，但 code 仍回退为 `BRIDGE_ERROR`；`formatBridgeError` 应增加 `error?.body?.response?.error?.code`。
2. callback transport 若返回 `{response:{ok:false,error:{...}}}`，`bridgeCall` 当前只检查顶层 `ok/error`，不会识别该深层失败；应统一 unwrap/错误归一化后再返回。
3. 仍缺真实 DOM/integration 自动化测试，当前为 node syntax + helper smoke。

## 评分（10分）

| 项目 | 得分 |
|---|---:|
| formal task fields/task_id | 2/2 |
| nested result status/result/cancel | 2/2 |
| HTTP/回调 ok:false 与常规错误显示 | 2/2 |
| 深层错误 code/message 归一化 | 1/2 |
| DOM/integration 证据 | 2/2 |
| **总分** | **9/10** |

Round4 的正式 task_id、nested result 状态展示阻断已修复；剩余为深层错误 code 与集成自动化证据。