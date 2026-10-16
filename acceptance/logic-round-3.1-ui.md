# Round 3.1 Client task.submit 快速复验

- `node --check client.js`：通过。
- 结论：**8/10，未通过，阻断仍在**。

## 已修复/通过

- task payload 新增 `input`、`idempotency_key`（crypto.randomUUID fallback）、未来 deadline、`required_capabilities: []`、`write_scopes: []`。
- bridge 优先、callback/endpoint transport、Promise await、status/result/cancel/error/fallback 逻辑保持通过。

## 仍然阻断

当前 line 131 task payload **没有 `task_id` 字段**。虽然移除了 `task_id: undefined`，但 formal DAN `task.submit` 要求发起方生成并发送非空 `task_id`；Host 不会替 UI 自动补齐。`idempotency_key` 不能替代 `task_id`。因此正式 Host 仍会返回 `invalid_envelope`，Create task 无法进入 queued/accepted 闭环。

应使用独立 `task_id: requestId()`（或 ULID），同时保留独立 idempotency_key，并在响应缺 task_id 时显示错误而非“Task accepted”。

评分维持：配置/transport 4/4、task 正式字段 1/3、错误/fallback 3/3，总 **8/10**。