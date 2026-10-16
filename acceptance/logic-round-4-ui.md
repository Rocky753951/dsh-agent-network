# Round 4 Client UI 逻辑复验

- `node --check client.js`：通过。
- helper smoke：`buildTaskPayload`、`unwrapTaskResult`、`formatBridgeError`。
- 结论：**8/10，部分通过**。

## 通过

- `buildTaskPayload` 生成独立合法 `task_id`、`objective`、`input`、`idempotency_key`、未来 deadline、required_capabilities、write_scopes；不再发送 undefined task_id。
- `unwrapTaskResult({ok:true,result:{...}})` 正确取出嵌套 result。
- endpoint 非 2xx 解析 body.error.code/message；`formatBridgeError` 可显示 `state_conflict: ...` 等常规嵌套错误。
- submit 已调用 payload builder，等待响应并拒绝缺 task_id 的响应；submit 错误显示格式化 code/message。

## 缺口

1. **status/result/cancel UI 尚未使用 `unwrapTaskResult`**：line 136 直接读取 `result.status/result_hash/result.result`。正式 Host response 是 `{ok:true,result:{task_id,status,result_hash}}`，因此按钮会显示 `OK`/空字段，取消错误成功状态不能正确呈现；需在 task 操作中先 `const taskResult = unwrapTaskResult(result)`，再显示 status/result_hash/result。
2. `formatBridgeError` 未处理 callback 返回/抛出的更深包装 `{response:{error:{code,message}}}`；普通 HTTP body.error 已通过。建议统一归一化 response/error/body.error。
3. 未见 DOM 自动化测试；当前仅 node syntax/helper smoke。

## 评分（10分）

| 项目 | 得分 |
|---|---:|
| formal task envelope/task_id/objective | 2/2 |
| callback/endpoint transport与错误格式化 | 2/2 |
| submit accepted/task_id/缺失响应拒绝 | 2/2 |
| status/result/cancel nested unwrap与状态显示 | 1/2 |
| DOM/流程自动化证据 | 1/2 |
| **总分** | **8/10** |

Round3 的 task_id/formal payload 阻断已修复；当前剩余为状态/取消结果嵌套展示与自动化测试证据。