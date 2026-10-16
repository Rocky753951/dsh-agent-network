# Human-flow acceptance round 3

- 日期：2026-10-16（GMT+8）
- 范围：client 显式 bridge 优先级、health/connect、discover、message、task accepted（snake_case 兼容）、status/result/lease/hash/error、cancel、clipboard 失败提示、README 一致性。
- 环境：Linux x64，Node.js 24.21.0；`node --check client.js`、ESM import、`node client.test.mjs`（bridge config tests passed）。本轮仍没有浏览器 DOM harness，因此交互按 DOM 事件实现、配置/request callback 行为和静态流程复验；不能把它表述为真实浏览器 E2E。

## 结论

**Human-flow score: 77/100（Round 2: 62，+15）。建议：可开发者受限联调；尚不建议正式发布。**

本轮主要闭环已补齐：显式 bridge 优先于本地 runtime；health/connect 和 discover 不猜路径；消息可走 bridge；task/status/result/cancel 支持 camelCase 与 snake_case 的 task ID；结果框展示 status/lease/result hash/result；clipboard 成功与失败分别提示。

仍有一个会影响按 README 首次联调的严重缺口：**README 示例没有 `message` endpoint**。按文档配置后，任务能走 bridge，但消息会回退到本地 runtime/clipboard，用户会误以为消息已接入而实际未发送到远端。另有错误对象兼容和完整协议字段不足问题。

## Journey matrix

| 步骤 | 本轮结果 | 判定 |
|---|---|---|
| 显式配置优先级 | `ctx.agentNetworkBridge ?? globalThis.__DSH_AGENT_NETWORK_BRIDGE__`；context 配置存在时不会静默采用 global；URL+protocol 或 request callback+protocol 均可 configured | 通过 |
| 配置缺失 | 状态提示未配置；callback-only 可配置并显示 `request callback`；不猜 8787、路径或 schema | 通过 |
| Connect/health | 按钮已改为 `data-bridge="health"`，调用 `health` endpoint；GET，带 protocol header | 通过（需外部 adapter） |
| Discover | 显式 `discover` endpoint，GET；返回 `agents` 时替换 roster；未提供 endpoint 时明确报 bridge operation 未配置 | 通过（需外部 adapter） |
| Message | `message` bridge endpoint 存在时优先 bridge，POST payload `{target,recipient,message}`，成功显示 Message sent 和原始结果；无 endpoint 时再尝试 runtime，最后 clipboard | 部分通过：文档漏 endpoint |
| Task submit/accepted | `submit` bridge endpoint 优先；payload 同时含 `task_id:undefined`、`target`、`assignee`、`title`、`description`、`message`；响应接受 `task_id` 或 `taskId` 并写入 Task ID，显示 accepted | 部分通过：字段是 adapter 约定，非完整 DAN schema |
| Status/result | status endpoint POST，同时发 `task_id` 和 `taskId`；显示 status、lease/lease_id、result_hash、result；`result` JSON 限制 4000 字符 | 通过（需外部 adapter） |
| Cancel | cancel endpoint POST，同时发 `task_id`/`taskId`；显示状态及结果；空 ID 明确 `Enter a task ID first.` | 通过（需外部 adapter） |
| Error | 缺 endpoint、request reject、HTTP 非 2xx 都显示可读错误；task 操作显示 operation/error_code | 部分通过：嵌套 `error.code` 未映射 |
| Clipboard 失败 | 无 transport 时先提示 attempting；`navigator.clipboard.writeText` 成功显示 copied，reject/缺失显示 `No transport and clipboard copy failed.` | 通过 |
| README | 已明确显式 endpoint、callback、bridge 优先、formal RPC 由外部 adapter 映射；但 endpoint 示例漏 `message`，与能力列表矛盾 | 严重体验缺口 |

## Concrete evidence

### 1. Explicit bridge config

`node client.test.mjs` 通过，覆盖：

- 空配置为 `configured:false`。
- URL + protocol + endpoint 为 true。
- 无 URL 时 callback + protocol 仍为 true。
- 非字符串 endpoint 被过滤。

实现中的 `bridgeCall`：

- 只使用 `config.endpoints[operation]`，不拼接默认路径。
- callback 存在时交给 `request({ operation, endpoint, payload, protocolVersion })`。
- URL transport 使用显式 endpoint、GET/POST 和 `x-dsh-protocol-version`。
- 配置 bridge 后，submit/message 先尝试 bridge，再 fallback runtime；这满足“显式 bridge 优先”。

### 2. Message documentation gap

UI 现在使用 operation `message`，但 `client/README.md` 示例仍为：

```js
endpoints: { health, discover, submit, status, cancel }
```

没有 `message`。因此用户复制官方示例：

- health/discover/task/status/cancel 可进入 bridge；
- message 找不到 endpoint，转而尝试 `sessions.sendMessage`；
- 若 runtime 没有该 API，最后变成剪贴板复制，而不是远端发送。

这是最重要的 Round 3 人类流程缺口；应把 `message: "<message path>"` 加入示例，并说明它是外部 adapter endpoint，不是 Host formal RPC 内置 REST 路由。

### 3. Snake/camel compatibility

Task ID 处理已比上轮健壮：

- submit 读取 `result.task_id || result.taskId`；
- status/cancel payload 同时包含 `task_id` 与 `taskId`；
- status/result 展示 `lease ?? lease_id` 与 `result_hash`。

但 submit 发送 `task_id: undefined`，canonical/JSON fetch 会省略该字段；task ID 依赖 adapter 生成返回。README 应明确“submit adapter 负责生成 task_id”，或 UI 增加 task ID 输入/生成策略。

### 4. Error shape gap

UI 只读取 `result.error_code`，没有读取常见的：

```json
{ "error": { "code": "task_not_found", "message": "..." } }
```

因此 status/result/cancel 若返回嵌套协议错误，结果框只显示 `status: undefined`、`error_code: undefined`、`result: undefined`，note 可能显示 `status: OK`，不可行动。HTTP 非 2xx 只显示 `Bridge <operation> failed (status)`，也丢失 response body 的稳定 `error.code`。应统一解析 `error_code ?? error?.code`，并展示安全的 error.message/details。

## Missing / remaining flows

1. README endpoint 示例补 `message`，并给出各 operation request/response 最小 schema。
2. 错误响应兼容嵌套 `error.code`/`error.message`，HTTP 4xx 解析 JSON body。
3. task submit 应明确 objective/input/deadline/capabilities/write_scopes，或文档明确此 UI 只调用外部简化 adapter。
4. task accepted 后目前没有自动刷新 status/result；用户必须手动输入/保留 Task ID 并点击 Refresh。
5. 没有轮询、进度、lease 到期倒计时或重连恢复；只显示一次调用结果。
6. message 成功结果虽 showResult，但没有消息历史、远端收件确认或 receive 状态。
7. 无浏览器真实 E2E fixture；需覆盖 endpoint success、401/404、callback reject、clipboard unavailable、跨源失败。
8. 安装、Windows、HMAC 不在 client README 的实际联调示例中；必须强调浏览器不能持有长期 HMAC secret。

## Score

| 维度 | 分数 |
|---|---:|
| 安装与配置 | 10/15 |
| Connect/health/discover | 15/18 |
| Message | 10/15 |
| Task accepted/status/result/cancel | 19/25 |
| Error and clipboard recovery | 9/12 |
| Stop/reload/recovery | 7/8 |
| README/platform clarity | 9/7 |
| **总分（封顶）** | **77/100** |

> 原始加总为 77；最后一项按 7 分封顶计分。得分反映 UI 流程实现成熟度，不代表外部 adapter、真实 DAN executor、持久化或浏览器 E2E 已存在。

## Release recommendation

- **受限发布：可以**，限定给能提供外部 bridge adapter 的开发者；README 必须先补 `message` endpoint，并标注当前 operation/schema 是 adapter contract。
- **正式发布：不建议**，至少修正文档漏项和嵌套错误解析，补 task schema/自动状态恢复、真实浏览器 E2E、安装/Windows 指引后再评估。

## Gate 5 mapping

本轮 client 改善不替代 Host Gate5 logic/code 分数。`events:false` 仍应保持明确；UI 没有 stream/cursor/重连恢复，因此不能宣称事件恢复能力。底层 stop/dispose 通过不等于 UI 任务恢复通过；按人类流程 Gate5 仍为**条件通过**。
