# DSH Agent Network 逻辑功能验收 — Round 1

- 时间：2026-10-15（GMT+8）
- 范围：按 `PROTOCOL.md` 第 11 节 DAN/0.1 冻结合同；不把 Demo API 回归当作协议合规。
- 结论：**37/100，不通过（打回）**。

## 执行证据

### 1. Demo 回归（仅作基线）

在 `host/` 执行 `npm test`：**5/5 pass**，包括 register/send/receive、health、未知 Agent、adapter ping/HMAC、双 loopback Host 的 message.send + message_id 去重。该结果只能证明当前原型回归，不证明 DAN/0.1 合规。

### 2. 协议路由与封套

手工 HTTP 探针启动两个（其中本轮核心为 Host B）loopback server：

- `POST /api/agent-network/v1/rpc`：**404**（冻结合同必需路由未实现）。
- `POST /dan/0.1/rpc`：返回 200，证明的是旧 alias，不是冻结路由。
- 缺字段请求在旧 alias 返回 400，但错误只为 `{code: "invalid request_id"}`，没有完整错误对象，也未按固定 `invalid_envelope` 码归类。
- 实现 `validateEnvelope` 未强制 `seq`、`method` 顶层字段、额外顶层字段拒绝、canonical JSON、nonce、auth.alg/ts 等冻结字段；TTL 下限实现为 1ms，合同要求 1000ms。

### 3. 消息发送/接收与重复消息

- Demo `/send` -> `/receive` 入队、drain 行为通过现有测试。
- DAN adapter 的同一 `message_id` 第二次 dispatch 返回缓存 response，重复消息在内存进程内去重通过。
- 但冻结合同要求 `message.send` 携带非空 `idempotency_key`、记录请求 hash/response 并在重启后保持；实现只按内存 `message_id` 去重，未实现幂等键、冲突码或持久化。因此仅部分通过。

### 4. HMAC 错误 key

- 现有 smoke 测试：配置 required HMAC 时错误 secret 被拒绝（测试观察到 HTTP 400、封套 error `unauthorized`），行为方向正确。
- 但合同要求 401，且实现签名输入仅为 `canonical(unsigned)`，缺少 `DAN/0.1\\nPOST\\n/api/agent-network/v1/rpc\\n` 前缀；未实现冻结的 `alg=HS256`、key_id 授权绑定、ts ±300s、nonce 防重放。故安全验收不通过。

### 5. 双实例 smoke

两个独立 `AgentNetworkServer` 均可启动并通过旧 `/dan/0.1/rpc` 完成 HMAC `message.send`，重复 message_id 返回同一响应，错误 key 被拒绝。这是有效的 loopback smoke 证据；但没有 hello/welcome 双向握手、正式路由、跨实例 session 建立、task.submit/result，不能满足冻结合同最低验收标准。

### 6. 错误码与边界

手工探针观察：

- 正式路由未知；未知路径/方法返回 404，但 body 为非协议错误对象。
- 协议错误/认证错误在旧 RPC 路由统一以 HTTP 400 返回，成功以 200 返回；未实现 401/403/409/413/408/429/503 与封套码一致映射。
- body/request 大小上限、过期消息有初步实现；但 body JSON 字节计算、请求超限处理、canonical/NaN/-0/重复键、deadline/队列/并发等冻结边界未完整覆盖。

## 评分明细

| 项目 | 得分 | 说明 |
|---|---:|---|
| 必需路由与协议封套 | 5/25 | 旧 alias 可 dispatch；正式 v1 路由 404，严格封套缺失 |
| 消息发送/接收 | 12/15 | Demo 队列与 message.send 基础行为可用 |
| 重复消息/幂等 | 7/15 | 进程内 message_id cache；无 idempotency_key/conflict/持久化 |
| HMAC 与错误 key | 5/15 | 错 key 方向正确；签名域和 401/nonce/ts 不合约 |
| 双实例 smoke/握手 | 5/15 | 两 Host 旧 alias smoke；无 hello/welcome、task 闭环 |
| 错误码与边界 | 3/15 | 初步拒绝和大小/TTL检查；HTTP/封套映射及边界不足 |
| **总计** | **37/100** | **不通过** |

## 打回项（必须修复后重验）

1. 实现并仅以冻结合同为准支持 `POST /api/agent-network/v1/rpc`；不要用 `/dan/0.1/rpc` alias 冒充合规。
2. 实现 hello/welcome 双向握手与 session 建立；补齐 `message.send`、`task.submit`、明确成功/失败响应。
3. 按合同实现 Canonical JSON v0（递归 UTF-8 字典序、有限数字、重复键拒绝等）及带方法/路径前缀的 HMAC；校验 HS256、key 授权、时间窗、nonce/message 重放。
4. 严格校验必需字段、顶层额外字段、TTL 1000–300000、`reply_to`、响应互斥 `result/error`；统一固定错误对象和 HTTP 映射。
5. 为 message.send/task.submit/cancel 实现 idempotency_key 作用域、请求 hash、相同请求重放返回原结果、不同请求返回 `idempotency_conflict`，并持久化跨重启。
6. 补充 400/401/403/404/409/413/408/429/503 边界测试、请求与 body 限制、deadline/队列/并发测试。
7. 双实例验收必须走正式路由，覆盖 hello、一次幂等 message.send、task.submit/result 及错误 key。

## 与 code-acceptance 协作及相互影响

已读取 code-acceptance Round 1 最新报告 `acceptance/code-round-1.md`：**46/100，不通过**。该报告将本轮指出的路由 404、状态码、HMAC 前缀、严格封套、reply_to、握手、task/幂等全部确认列为代码级 P0，并补充资源耗尽、SSE 背压、输入字节限制和插件生命周期风险。两份报告相互印证：这些不是测试误报，而是实现缺口；因此本轮 37 分结论维持不变。其报告建议下一轮先解决全部 P0，并增加合同黑盒、DOM/client、插件生命周期测试；逻辑验收将把这些作为后续复测入口。
