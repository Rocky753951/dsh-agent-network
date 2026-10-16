# Round 3.1 Client UI 代码复验

**评分：8/10；部分通过，正式 task 流程仍有阻断。**

## 通过项

- `node --check client.js` 通过；`client.test.mjs` bridge 配置测试通过（含 callback-only configured）。README 已补 callback adapter、显式 endpoints 与 task 流程说明。
- DOM/XSS：静态模板固定；roster/discover 动态内容使用 `textContent`；结果使用 `textContent`，4000 字节/字符截断；不替换 app root；无 DOM 时 no-op。
- `globalThis.navigator?.clipboard?.writeText` 已避免裸 `navigator`；失败有用户提示。
- fetch/adapter：callback 优先，显式 endpoint 才构造 URL；响应 JSON 解析失败有 fallback；HTTP 错误提取稳定 code/message；runtime dispatch 在 bridge 未配置时作为后备。
- UI 已支持 health/discover、message/task submit、status/result、cancel，错误均在状态区处理。

## 正式协议阻断

1. `buildTaskPayload()` 仍缺正式 `task.submit` 必填字段 **`objective`**。它发送 `task_id/input/idempotency_key/deadline/required_capabilities/write_scopes`，但 Host formal contract 要求 `objective`；因此真实 `/api/agent-network/v1/rpc` 会返回 `invalid_envelope`，task submit 无法完成。
2. `task_id` 读取只检查 submit 响应顶层 `result.task_id/result.taskId`。正式 DAN response 常见结构为 `body.result` 或其他 adapter 包装，未解包时 UI 会显示 accepted 但 task ID 为空，后续 status/cancel 报“Enter a task ID”。logic 已观察此 `task_id undefined` 风险。
3. status/result/cancel 虽同时发送 `task_id` 与 `taskId`，但 submit response 也应统一从正式 response envelope 解包，并验证 task_id 非空后再显示 accepted。

## 次要风险

- fetch 没有 AbortController/超时；挂起 bridge 可能长时间占用 UI。
- callback adapter 的 endpoint 可为空是合理设计，但 README/测试尚未覆盖正式 response envelope、reject、超时和 XSS/DOM 行为。
- `JSON.stringify(value)` 理论上遇到循环对象会抛异常，应在 showResult 中兜底。

## 评分

| 项目 | 得分 |
|---|---:|
| ESM/DOM/XSS/root/no-DOM | 2/2 |
| navigator/fetch/adapter 错误处理 | 2/2 |
| 显式 endpoint/callback/runtime 优先级 | 2/2 |
| UI 流程覆盖与结果限长 | 1/1 |
| 正式 task schema/envelope 互操作 | 1/3 |
| **合计** | **8/10** |

与 logic-acceptance Round 3.1 评分 8/10 对齐。修复 `objective`、response envelope 解包与 task_id 必填校验，并增加正式字段测试后再放行。
