# Human-flow acceptance round 1

- 日期：2026-10-16（GMT+8）
- 评审角色：真实用户流程验收（独立于 logic/code 评分）
- 范围：安装、配置、启动两个节点、发现/连接、消息、任务提交/接受/执行/结果/取消、错误恢复、停止重启、Windows 说明，以及 Demo/formal 边界。
- 测试环境：Linux x64，Node.js 24.21.0，HTTP loopback；`dsh-agent-network/host`；未使用浏览器自动化。测试命令 `cd dsh-agent-network/host && npm test`：20/20 pass；`node --check` 与 client ESM 导入检查通过。

## Executive summary

**Human-flow score: 42/100。建议：仅限开发者受限预览，不建议正式发布。**

核心原因不是底层合同测试失败，而是普通用户没有一条从安装到双节点协作的可完成路径：client 插件目前不连接 Host bridge，面板不能发现/连接远端节点，也不能展示远端任务状态、结果或取消；正式协议需要手写 HMAC envelope/UUID/配置，没有 CLI、配置示例或双节点启动教程。

- **阻断（正式发布）**：用户无法通过产品 UI 完成跨节点发现/连接；消息和任务按钮调用的是不保证存在的本地 DSH runtime API，而不是 Host bridge；任务执行/结果/取消没有用户流程。
- **严重缺失**：安装和密钥/节点身份配置不完整；双节点启动没有操作步骤；错误恢复没有 UI 引导；Windows 只可推断 Node 可用，没有明确支持边界和命令。
- **体验问题**：状态文本是英文且偏开发者术语；配置成功仍显示 `transport pending contract`；发送失败统一降级复制文本，未确认剪贴板成功；空目标、未连接、超时、权限错误没有可行动提示。

## User journey and evidence

| 步骤 | 用户动作/预期 | 实测结果 | 判定 |
|---|---|---|---|
| 1. 安装 | 找到包、执行安装、知道加载到哪个 profile | 根 README 只有源码目录和快速验证；client README 要求手工放入 DSH web profile 插件目录，未给实际 profile 路径、安装命令、卸载/版本兼容矩阵 | **严重缺失** |
| 2. 配置节点 | 配置 node ID、端口、HMAC、peer | host README 仅展示 `port`/`contract.hmac` 片段；没有双节点完整配置文件、密钥生成/权限、A/B 对端绑定示例；默认 8787 仅 loopback 且未认证 | **严重缺失** |
| 3. 启动两个节点 | 启动 A/B 并看到健康状态 | 可通过直接调用 `new AgentNetworkServer({host:'127.0.0.1', port:0})` 启动，但没有面向用户的启动命令或第二节点编排。`apply` 的 `server.ready` 可观测，端口冲突测试通过 | **可用但开发者专用** |
| 4. 发现/连接 | UI 展示 peer、握手、在线/离线 | client 只从 `ctx.sessions.list.getSnapshot().byId` 读本地会话；README 明确“尚未接通 8787 Host bridge”，配置后仍是 `transport pending contract`。formal RPC 有 HMAC，但没有 UI discovery/connect/handshake 流程 | **阻断** |
| 5. 发送消息 | 选择 B、发送、看到送达/失败 | 直接 formal RPC 可成功：`message.send` 返回 HTTP 200、`ok:true`、`accepted:true, queued:true`。但 client 的 `dispatch` 只探测 `sessions.sendMessage/message` 等运行时 API，不发 bridge 请求；没有送达/接收界面或 ack 历史 | **阻断（用户路径）** |
| 6. 提交任务 | 填目标和 objective，看到 queued/lease | 直接 formal RPC `task.submit` 返回 `queued`、`lease_id`、`lease_expires_at`；UI“Create task”只尝试本地 API，没有 objective/input/capability/deadline/write scope 表单，也不显示 lease | **严重缺失** |
| 7. 接受/执行 | B 接受并执行，看到 running/progress | 直接 formal RPC `task.accept` 返回 `running`；执行并非网络服务自动执行，需外部调用 `task.result`。`describe` 明确 `events:false`，无进度流；没有 worker/执行器或 UI 指引 | **严重缺失** |
| 8. 结果 | A 看到成功结果和 hash | 直接 `task.result` 返回 `succeeded` 和 `result_hash`，但 UI 没有任务列表、结果查看、重试/下载；只能由调用方编程处理 response | **阻断（用户路径）** |
| 9. 取消 | 运行中取消，看到唯一终态 | 直接 `task.cancel` 支持 AbortSignal，测试验证取消后不可再 result；取消已 succeeded 任务得到 HTTP 409 `state_conflict`。UI没有取消按钮、竞态说明或最终状态展示 | **严重缺失** |
| 10. 错误恢复 | 错误可理解、可行动、能重试 | formal 错误码稳定（如 `404 task_not_found`、`409 state_conflict`、`401 unauthorized`），但 UI 不显示这些响应。client 发送失败统一写“no send API; copied to clipboard instead”，不区分网络、认证、权限、任务状态；复制失败也没有反馈。重试 helper 仅代码级，无用户可操作重试 | **严重缺失** |
| 11. 停止/重启 | 停止后状态明确，重启可恢复 | host tests 证明 stop/restart、端口冲突、dispose 句柄释放；但 `stop()` 清空 queues，且任务/结果仅内存（除 replay 去重记录外），重启后没有任务快照/恢复说明；用户没有停止命令或状态页面 | **体验问题/严重缺失** |
| 12. Windows | 用户知道是否支持及如何运行 | 文档未说明 Windows 支持、PowerShell 命令、Node 版本、路径/端口防火墙、Ctrl-C 行为。代码使用 Node built-ins/127.0.0.1，理论上可运行，但未实测，不能宣称兼容 | **严重缺失** |

## Executed end-to-end evidence

### Direct dual-node formal flow

启动两个独立 loopback `AgentNetworkServer`，为 B 配置 `nodeId`、A→B HMAC key binding，发送 canonical JSON 到 `/api/agent-network/v1/rpc`：

1. `describe`：HTTP **200**, `ok:true`, `capabilities:["rpc","tasks"]`, `events:false`。
2. `message.send`：HTTP **200**, `ok:true`, `accepted:true`, `queued:true`。
3. `task.submit`：HTTP **200**, `status:"queued"`, 返回 lease。
4. `task.accept`：HTTP **200**, `status:"running"`。
5. `task.result`：HTTP **200**, `status:"succeeded"`, 返回 `result_hash`。
6. 对已成功任务 `task.cancel`：HTTP **409**, `state_conflict`；这是可解释的协议结果，但没有 UI 呈现。
7. 未知任务 `task.accept`：HTTP **404**, `task_not_found`；错误稳定但仍需调用方编程处理。

首次按 README 的“非空 session”直觉使用 `session_id:"human-session"` 时，formal route 返回 HTTP **400 `invalid_envelope`**，原因是冻结合同实际要求 UUID/ULID。该要求只在 PROTOCOL 合同细节中出现，没有用户级示例，属于可避免的首次使用失败。

### Demo API flow

README 中的 `/register`、`/send`、`/receive` 可完成注册、排队、轮询收取；host smoke test 也通过。但这是未认证 demo/adapter API，不是可连接两个正式节点的用户流程。`host/README.md` 将 `/dan/0.1/rpc` 与正式 DAN 语义并列，容易让用户误以为 demo namespace 已等价于冻结合同；实际正式合同 canonical route 是 `/api/agent-network/v1/rpc`，且必须 HMAC。

## Missing flows and concrete product gaps

1. **安装向导**：缺 package/profile 安装命令、卸载、兼容版本、加载成功验证。
2. **节点配置向导**：缺 node_id/instance_id 生成、peer allowlist、HMAC 密钥生成与存储权限、端口冲突处理。
3. **双节点启动/连接**：缺 A/B 两终端完整示例、hello/welcome 握手、在线状态和断线重连。
4. **真实 client transport**：当前明确 pending，不应把 Agents 面板理解为网络面板。
5. **任务 UI**：缺 objective/input/deadline/capability/scope 字段、队列/租约/running/result/cancelled/failed/expired 展示。
6. **执行责任边界**：没有说明谁执行 task、如何报告 `task.result`、结果 artifact 如何取回。
7. **错误恢复**：缺可操作 retry/copy diagnostics/reconnect/renew lease；错误码没有映射到用户语言。
8. **持久化**：stop 会清队列；任务业务状态不提供重启恢复路径。
9. **Windows 文档**：缺 PowerShell、路径、信任防火墙、端口、信号与编码说明。
10. **Demo/formal 分层**：需把 demo API 标成“单 Host 本地 smoke”，formal API 标成“尚无可用 UI transport”，避免误导。

## Windows risk assessment

- **潜在可运行项**：实现主要使用 `node:http`、`node:crypto`、URL/fetch 和相对 ESM 导入，未见 POSIX-only shell 或 Unix socket 依赖；loopback 地址通常可在 Windows 使用。
- **未验证风险**：Node 版本和 fetch 要求未写明；PowerShell 的 JSON quoting、环境变量/密钥注入、路径分隔符、端口被防火墙/其他进程占用、Ctrl-C/进程退出、UTF-8 canonical body 均无实机证据。
- **发布结论**：只能写“理论上 Node.js 环境可运行，Windows 未验证”，不能写“Windows supported”。

## Score

| 维度 | 分数 |
|---|---:|
| 安装与配置 | 5/15 |
| 双节点启动、发现、连接 | 5/20 |
| 消息流程 | 6/15 |
| 任务全生命周期 | 10/25 |
| 错误恢复与可理解性 | 5/10 |
| 停止/重启 | 6/8 |
| Windows 与文档 | 2/7 |
| **总分** | **42/100** |

## Gate 5 mapping

本报告不替代 logic/code 的 Gate5 分数。已存在的 20/20 自动测试和既有报告支持底层 P5-3/P5-4/P5-6；`describe.events:false` 也符合“未实现 stream 时不得虚报 cursor”的门槛。**但从人类流程角度，Gate5 的可用性影响为条件不通过/不应据此宣称用户可用**：P5-2 没有用户可见的 stream/cursor/recovery 操作，P5-6 的 host dispose 通过不等于 client 面板卸载、状态恢复和业务任务持久化通过。建议 Gate5 联合报告明确区分“协议资源门禁通过”与“端到端产品流程未就绪”。

## Release recommendation

- **受限发布：可以**，仅面向熟悉 Node/HTTP/HMAC、能直接调用 formal RPC 的开发者；必须显著标注 demo/formal 边界、loopback-only、未接通 client bridge、events=false、Windows 未验证。
- **正式发布：不建议**，至少在真实 bridge transport、双节点配置/连接向导、任务状态/结果/取消 UI、错误恢复、安装和 Windows 文档补齐并完成一条浏览器端 E2E 后再评估。
