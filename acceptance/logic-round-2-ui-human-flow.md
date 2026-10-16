# Round 2 Client UI / Human-flow 复验

- 日期：2026-10-16（GMT+8）
- `node --check client.js`：通过。
- 范围：client 目录；不修改 Host/协议实现。
- 结论：**UI/流程 6/10，部分通过；不能宣称真实用户流程完成**。

## 已通过

- `readBridgeConfig` 只读取显式 URL、protocolVersion、endpoint paths；不猜默认端口、路径或协议。
- Connect/health、Discover、submit、status、cancel 均走显式 operation endpoint；HTTP 非 2xx 有可见错误提示。
- 面板具备 Connect/health、Discover、目标/文本、Create task、task ID、Refresh status/result、Cancel 控件；不替换 app root。
- runtime sessions roster/fallback 有能力探测；Node-only 环境不伪称浏览器能力。

## 阻断/扣分

1. `request` callback-only 配置被判 `configured:false`：`readBridgeConfig` 仍强制 URL+protocolVersion，违背“显式 URL/version/endpoints 或 request 回调”二选一接入契约；callback transport 无法工作。
2. task/message 提交优先调用 runtime `dispatch`，即使 bridge 已显式配置也可能绕过真实 Host；且 dispatch 不 await Promise/rejection，UI 可能错误显示“sent”。
3. task UI 仅把 bridge 返回的 `taskId` 写入输入框，status/result/cancel 假设 endpoint 返回简单 `{status,result}`；未展示 lease、result_hash、错误 code/可重试建议等正式协议字段。
4. clipboard fallback 无论写入成功与否都提示“copied”，失败没有可行动反馈；runtime API 缺失时 message 无 bridge `message` 调用，只复制文本。
5. 当前未提供 client DOM/config 测试，README 联调示例为声明性证据；缺少 callback、非 2xx、Promise rejection、缺 endpoint、真实 task response 的自动化回归。

## 评分（10分）

| 项目 | 得分 |
|---|---:|
| 显式配置/无猜测 | 2/2 |
| Connect/health/Discover 流程 | 1/2 |
| task submit/status/result/cancel | 2/3 |
| 错误提示与协议结果呈现 | 1/2 |
| runtime/Node/browser fallback | 0/1 |
| **总分** | **6/10** |

## Human-flow 交叉结论

相较 `human-flow-round-1.md`，真实 bridge 配置、Connect/Discover、任务控件和错误提示已补齐，阻断从“完全未接通”降为“配置回调/transport选择、结果呈现与fallback可靠性缺口”。用户仍不能稳定完成“显式配置 → Connect → Discover → submit → accepted/status/result → cancel/error recovery”闭环，因此流程验收暂不通过。
