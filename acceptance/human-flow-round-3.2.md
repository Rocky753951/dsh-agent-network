# Human-flow acceptance Round 3.2

- 日期：2026-10-16（GMT+8）
- 范围：Round 3 修复复验：README message endpoint、HTTP 错误 body/error.code/error.message、结果限长、正式 task payload、snake_case/camelCase、缺 task_id 拒绝、clipboard 失败提示。
- 环境：Linux x64，Node.js 24.21.0；`node --check client.js`、`node client.test.mjs` 均通过。没有浏览器 DOM harness，本轮对真实 DOM 点击仍以代码路径审查和可导出的纯函数测试为主，未将其宣称为浏览器 E2E。

## 结论

**Human-flow score: 84/100（Round 3: 77，+7）。建议：开发者受限联调；仍不建议正式发布。**

本轮已修复 Round 3 的主要文档与 task contract 缺口：README 已补 `message` endpoint；`buildTaskPayload` 生成独立 `task_id`、`idempotency_key`、未来 deadline、input、required_capabilities、write_scopes；submit 响应缺 task ID 时拒绝并显示错误；HTTP 非 2xx 会读取 body 的嵌套 `error.message`/`error.code`；结果文本限 4000 字符；clipboard 成功/失败均有明确提示。

仍有两项人类流程缺口：

1. **错误 code 已解析但未向用户显示**：`bridgeCall` 将 code 放入 `error.code`，而 UI catch 只渲染 `error.message`；task status/cancel 结果又只读取 `result.error_code`，不读取嵌套 `error.code`。用户仍看不到稳定错误码，无法按文档/协议快速诊断。
2. **仍是外部 adapter 闭环，不是可直接使用的 DAN UI**：Host formal route 仍是统一 RPC；README 明确 UI endpoint 由外部 adapter 映射。没有 adapter 时 UI 不能实际连两个 Host，也没有自动 status 轮询、lease 倒计时、重连恢复。

## Flow matrix

| 流程 | 复验结果 | 判定 |
|---|---|---|
| 显式 bridge 优先 | `ctx.agentNetworkBridge` 优先于 global 配置；bridge 配置后 submit/message 先走 bridge，只有未配置 operation 才 fallback runtime | 通过 |
| health/connect、discover | health 按显式 endpoint GET；discover 按显式 endpoint GET 并渲染 agents；不猜端口/路径 | 通过（需 adapter） |
| message | README 已补 `message` endpoint；显式 endpoint 时 POST `{target,recipient,message}`，成功展示结果；无 endpoint 才 runtime/clipboard | 通过（需 adapter） |
| task submit accepted | `buildTaskPayload` 生成独立 task_id/idempotency_key、deadline、input、capabilities/scopes；支持 task_id/taskId 响应；缺 task ID 抛错，不显示假 accepted | 通过（adapter schema） |
| status/result | 发送 `task_id` + `taskId`；展示 status、lease/lease_id、result_hash、result；JSON 结果最多 4000 字符 | 部分通过：手动刷新，无轮询/恢复 |
| cancel | 发送双命名 task ID；空 ID 提示；状态结果展示 | 部分通过：嵌套错误码未展示 |
| HTTP 错误 | JSON body 解析，message 优先 `error.message`/`message`，code 解析 `error.code`/`error_code`/HTTP 状态 | 部分通过：解析后 UI 丢 code |
| callback 错误 | callback-only + protocol 可配置；request 接收 operation/endpoint/payload/protocolVersion | 通过 |
| clipboard | 无 transport 时先提示 attempting；成功显示 copied；拒绝或 API 缺失显示 failed | 通过 |
| 文档 | message endpoint 已补；明确 endpoint/callback、bridge 优先及外部 adapter 责任 | 基本通过 |

## Evidence

### Tests and helper

`client/client.test.mjs` 现通过并覆盖：空配置、URL endpoint、callback-only、无效 endpoint 过滤、task 必需字段、task ID 与 idempotency key 独立生成。`buildTaskPayload({target:'agent-a', text:'do work'})` 返回：

- `task_id`
- `input`
- `idempotency_key`
- `deadline`
- `required_capabilities: []`
- `write_scopes: []`
- target/assignee/title/description/message adapter 字段

UI 对 submit 响应执行 `if (!(result?.task_id || result?.taskId)) throw new Error("Task submit response missing task_id.")`，避免把没有可追踪 ID 的响应误报为 accepted。

### Error handling gap

`bridgeCall` 的 HTTP 错误代码确已解析：

```js
error.message = body.error.message ?? body.message ?? fallback;
error.code = body.error.code ?? body.error_code ?? `HTTP_${status}`;
```

但调用处为：

```js
catch (error) { note.textContent = `Bridge ${operation} error: ${error.message}`; }
```

因此用户看不到 `error.code`。task status/cancel 结果展示对象也使用 `result?.error_code`，若 adapter 返回标准 `{error:{code,message}}`，则 `error_code` 为空，结果框无法给出稳定 code。建议统一 `error.code ?? error.error_code ?? error.error?.code`，并在 note 中显示安全格式 `CODE: message`。

### Result limiting

`showResult` 使用 JSON pretty print，超过 4000 字符截断并追加 `…`，避免大结果淹没面板；这是合理的 UI 背压，但没有下载/展开完整 artifact 的路径。

## Remaining gaps

1. UI 仍没有浏览器可执行的 DOM E2E；应加入轻量 DOM fixture，验证 Connect/Discover/message/task/status/cancel 与 clipboard 分支。
2. 外部 adapter endpoint 的 response schema 尚未提供可复制示例；Host formal RPC 不直接实现这些 REST endpoint。
3. 错误 code 应显示给用户，并保留 retryable/retry-after 等安全诊断信息。
4. task accepted 后没有自动 status/result 轮询、lease 到期提示或重连恢复。
5. message 没有远端 ack/收件历史；“Message sent”只表示 adapter 成功响应。
6. callback 可能返回 HTTP-style `{ok:false,error}` 且不抛异常；UI 对 submit 会以缺 task_id 报错，但 message/status/cancel 可能展示“sent/OK”或空结果，需统一 envelope 处理。
7. Windows 仍未实测；安装/浏览器 profile/CORS/HMAC secret 边界仍需端到端说明。

## Score

| 维度 | 分数 |
|---|---:|
| 安装与配置 | 10/15 |
| Connect/health/discover | 15/18 |
| Message | 11/15 |
| Task payload/accepted/status/result/cancel | 20/25 |
| Error and clipboard recovery | 7/12 |
| Stop/reload/recovery | 7/8 |
| README/platform clarity | 7/7 |
| **总分** | **84/100** |

## Release recommendation

- **受限发布：可以**，限于能提供并理解外部 bridge adapter 的开发者；必须把 adapter schema、错误 envelope 和 Host formal RPC 映射写清楚。
- **正式发布：不建议**，至少显示稳定错误码、统一 callback/HTTP 错误 envelope、补 DOM E2E、任务自动恢复/轮询、Windows 验证后再评估。

## Gate 5 mapping

本轮不改变 Host logic/code Gate5 分数。client 仍不实现 events/cursor/resume，不能宣称 stream 恢复；Host stop/dispose 通过也不等于 UI 任务状态恢复。人类流程维度可视为**条件通过**，不应作为完整正式发布门禁通过证据。
