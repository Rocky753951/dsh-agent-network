# Round 4 Client UI 代码复验

**评分：8/10；status/result/cancel 正式 response envelope 仍有阻断。**

## 通过项

- `node --check client.js && node client.test.mjs`：通过。
- `buildTaskPayload` 已补齐正式字段：`task_id`、`objective`、`input`、`idempotency_key`、`deadline`、`required_capabilities`、`write_scopes`；task/idempotency ID 独立生成。
- `unwrapTaskResult` 支持嵌套 `result`，submit 缺少 task_id 时显式报错，不再静默显示 accepted；submit 同时发送正式字段与兼容字段。status/cancel 同时发送 `task_id`/`taskId`，但其响应尚未统一解包。
- `formatBridgeError` 统一提取 nested error code/message；HTTP 非 2xx 与非 JSON 响应均有稳定 fallback，不回显堆栈。
- callback adapter 优先于 fetch endpoint；callback-only 配置可用；fetch 仅使用显式 endpoint、协议版本 header，不猜端口/路径。
- 结果通过 `textContent` 展示并限制 4000 字符；动态 roster/discover 使用 `textContent`；固定模板无用户 HTML 注入；不替换 app root、无 DOM no-op；clipboard 使用 `globalThis.navigator?.`。

## 剩余扣分

1. **status/result/cancel 未解包正式 response envelope**：按钮处理直接读取 `result.status`、`result.result`、`result.error_code`；若正式 adapter 返回 `{ result: { status, result_hash, result } }` 或 `{ body: { result: ... } }`，UI显示 `OK`/空结果，无法准确呈现状态、result 或错误。应统一对三类操作调用 `unwrapTaskResult`（并支持 body envelope），再渲染白名单字段。
2. **错误包装层级不完整**：`formatBridgeError` 支持 `error/body.error`，但未统一处理成功 HTTP 中携带 `{ body: { ok:false,error } }` 或 callback 返回 formal response 的 envelope；不能仅依据 HTTP 200 判断成功。
3. **缺 fetch/adapter 与 DOM 集成测试**：当前 `client.test.mjs` 仅覆盖纯配置、payload、unwrap、error helper；未模拟 callback rejection、HTTP 401/409/500、空/非 JSON body、fetch URL/method/header、status/cancel nested response、结果截断与 XSS DOM。
4. `showResult` 对循环对象调用 `JSON.stringify` 可能抛异常；fetch 也没有 AbortController/超时。

## 评分

| 项目 | 得分 |
|---|---:|
| error parsing/稳定错误提示 | 2/2 |
| 结果字段/限长 | 1/2 |
| callback/endpoint transport | 2/2 |
| DOM/XSS/root/navigator 安全 | 2/2 |
| 测试覆盖与健壮性 | 1/2 |
| **合计** | **8/10** |

Round 4 正式 task 字段阻断已解除；建议补齐 fetch/DOM 集成测试后满分复验。
