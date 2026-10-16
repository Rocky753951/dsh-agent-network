# Round 3 Client UI 逻辑复验

- 日期：2026-10-16（GMT+8）
- 范围：`client/client.js`；覆盖 callback-only、endpoint transport、bridge 优先、Promise await、task_id、结果状态、错误处理与 fallback。
- `node --check client.js`：通过。
- 结论：**8/10，部分通过；task submit 正式闭环仍阻断。**

## 已通过

1. **callback-only 配置**：`readBridgeConfig` 接受 `request` callback + protocolVersion，即使无 URL/endpoints；`bridgeCall` 将 operation/endpoint/payload/protocolVersion 交给 callback并 await。
2. **endpoint transport**：仅使用显式 endpoint 与 URL；health/discover 用 GET，其余 POST；带 protocol version header；非 2xx 抛出可见错误。
3. **bridge 优先**：submit/message 在 bridge configured 且 operation endpoint 或 callback 存在时先走 bridge，不再绕过到 runtime dispatch；bridge Promise rejection 会显示错误且不降级为“sent”。
4. **Promise await/fallback**：runtime dispatch 已 async/await；无 transport 时 clipboard await，成功/失败分别提示。
5. **task 状态展示**：status/result/cancel 传递 `task_id`/`taskId`，展示 status、lease、result_hash、error_code、result；错误提示包含 operation。

## 阻断

- **task.submit 没有生成合法 task_id**：submit payload 明确设置 `task_id: undefined`，JSON.stringify 会省略该字段；正式 DAN task.submit 要求发起方 task_id。即使 endpoint transport/callback 正常，Host 合同会返回 `invalid_envelope`，UI 无法完成“Create task→accepted”。必须由 client 生成 UUID/ULID 或要求用户输入，并确保发送 `task_id`。
- task submit payload 也未携带正式合同要求的 `input`、`idempotency_key`、`deadline`、`required_capabilities`、`write_scopes`；当前仅 target/assignee/title/description，无法直接对接现有 formal Host。
- 未见 client 目录自动化 DOM/config 测试；当前证据主要为静态审查与 node syntax check。

## 评分（10分）

| 项目 | 得分 |
|---|---:|
| callback-only/显式配置/无猜测 | 2/2 |
| endpoint transport 与 bridge 优先 | 2/2 |
| task submit/status/result/cancel 正式字段闭环 | 1/3 |
| Promise await 与错误提示 | 2/2 |
| runtime/clipboard fallback | 1/1 |
| **总分** | **8/10** |

## Human-flow 交叉结论

相较 Round2，callback-only、bridge 优先、Promise rejection、结果展示与 clipboard 反馈已修复；但正式用户流程仍在 Create task 步骤失败，因为 task_id 与必需 task 字段缺失。故 human-flow 仍不通过，待生成 task_id 并补齐正式 task.submit payload 与 DOM/config 回归测试后重验。
