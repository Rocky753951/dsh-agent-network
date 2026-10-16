# DAN/0.1 Round 2 联合验收门禁

依据：`PROTOCOL.md` §11、`acceptance/REPLAN-round-2.md`、logic/code Round 1 报告。本文仅定义验收入口与阻断条件，不修改实现。

## 总体硬门槛

- 逻辑与代码各自评分均须 ≥70；任一 P0 打回项存在即不通过。
- 必须使用两个独立 loopback Host、正式 `POST /api/agent-network/v1/rpc`；旧 `/dan/0.1/*`、Demo `/register|send|receive` 只能作为兼容回归，不能计入 DAN 得分。
- 必须完成：双向 hello/welcome、握手后一次幂等 `message.send`、一次 `task.submit` 到明确 `task.result`，并验证错误 key、重复消息、重启恢复。
- 每项记录原始 HTTP 状态、响应 envelope/error.code、请求 message_id/request_id/idempotency_key；不接受仅单元 happy-path 证据。

## P0-0：正式路由与黑盒基线（阻断）

**入口测试**
1. 合法 JSON POST 到 `/api/agent-network/v1/rpc` 不得 404；未知路径、GET/PUT 等未知方法不得进入 DAN dispatch。
2. 错 Content-Type、空体、非法 JSON、非 UTF-8、请求体 >1 MiB 均返回稳定 JSON 错误；Demo 回归独立执行。
3. 双 Host 可等待启动、停止、再次启动；测试保留可重启持久化目录。

**通过条件**：正式路径有效；未知路由/方法不改写；错误状态和 envelope 可解析。任何正式路由 404 为 P0 打回。

## P0-1：Canonical JSON 与严格封套（阻断）

**入口测试**
1. 对象递归按 UTF-8 字节序排序、数组保序、RFC8259 转义、有限数最短表示；重复键、BOM、NaN/Infinity/-0、非 canonical 原文拒绝。
2. 普通 envelope 只允许合同顶层字段及 `trace`；逐项测试缺失/错误类型/额外字段、非法 UUID/ULID、非 UTC RFC3339、seq、method/body。
3. TTL 边界覆盖 999（拒绝）、1000、300000、300001（拒绝）及过期消息。
4. response/ack 必须带 `reply_to`、`ok`，且 `result` 与 `error` 互斥；错误固定含 code/message/retryable（details 不得泄密）。

**通过条件**：合法 envelope 原样验签并 dispatch；所有非法输入得到 `invalid_json|invalid_envelope|unsupported_version` 等稳定码。缺 reply_to 或宽松接受额外字段即阻断。

## P0-2：HMAC、身份绑定与重放（阻断）

**入口测试**
1. 使用固定 golden vector 验证签名输入严格为 `DAN/0.1\\nPOST\\n/api/agent-network/v1/rpc\\n<CanonicalJSON(unsigned)>`；旧“仅 canonical”签名必须失败。
2. 正确 HS256/key 绑定/sender-recipient/UTC ts ±300s/≥16-byte base64url nonce 通过；错误 secret、未知 key、错误 alg、sender 绑定错、时间窗错均返回 401/`unauthorized`，不得泄露 key 是否存在。
3. 重复 nonce、重复 message_id、旧 session/重放分别验证 `replay_detected`（按合同状态映射）；握手后每条消息仍独立验签。
4. 日志/错误响应不得含 secret、MAC、Cookie、正文；replay 记录有界并按 TTL 清理。

**通过条件**：双 Host 均能验签；直接构造 Server 不能绕过 loopback 安全边界；任一签名域/身份/重放缺口为阻断。

## P0-3：Hello/Welcome 与 session（阻断）

**入口测试**
1. 两 Host 仅经正式路由发送 hello，完成双方 nonce、身份、request_id、features 的 welcome 证明并获得 session。
2. 未握手、旧 instance、过期 session、版本不兼容分别拒绝（`unsupported_version` 等稳定码）；events 未实现必须声明 `events:false`。
3. 新 instance/session 重连不得假定 seq 连续；普通 RPC 必须绑定 `(node_id,instance_id,session_id)`。

**通过条件**：无 hello 不能调用 message/task；错误 key hello 被 401；只实现单向 welcome 或可绕过 session 即阻断。

## P0-4：message.send 与 task.submit/result（阻断）

**入口测试**
1. allowlist 至少覆盖 ping/describe/message.send/task.submit/task.result；未知 method 返回 404/`invalid_method`。
2. 双 Host 正式路径完成一次 message.send（入队 ack）和 task.submit -> queued/running -> 唯一终态 result；result 引用 task_id/attempt/result_hash。
3. task 字段 objective/input/idempotency_key/deadline/required_capabilities/write_scopes 必填；非法 capability/scope 返回 403/`forbidden`。
4. 未知 task、非法状态跃迁、过期 lease 分别返回 `task_not_found|state_conflict|lease_expired`；若开放 cancel，必须最终终态，否则不得声明能力。

**通过条件**：不能把入队 ack 冒充 task 完成；无重复副作用；失败也有稳定 response/error。

## P0-5：幂等键、冲突与重启（阻断）

**入口测试**
1. message.send/task.submit（及开放的 cancel）强制非空且 ≤128 bytes idempotency_key；作用域为 sender+recipient+method+key。
2. 相同作用域、相同 canonical hash 重发（含相同 message_id）只产生一次副作用并返回原 response；不同 payload 返回 409/`idempotency_conflict`，不得覆盖。
3. 停止并重启 Host 后重复请求仍返回原 ack/result；message_id 去重先于幂等处理；记录至少保留 max(request TTL, task lease lifetime)。
4. 仅连接中断/408/429/5xx/temporary_unavailable 可重试；认证、参数、权限、状态错误不重试。

**通过条件**：双 Host、重启前后、并发重复提交均无双执行；无持久化或仅内存 Map 为阻断。

## P0-6：HTTP 映射、大小/资源上限、生命周期（阻断）

**入口测试**
1. 验证状态与 error.code 一致：400 invalid_*、401 unauthorized、403 forbidden、404 invalid_method/task_not_found、409 replay/idempotency/state/cursor、413 message_too_large、429 rate/queue、499 cancelled、500 internal、503 temporary_unavailable。
2. 请求 ≤1 MiB、body ≤256 KiB 按 UTF-8 字节在读取阶段限制；ASCII 与多字节超限、慢请求均不可无限读入内存。
3. 队列/并发/TTL/worker/stream 有上限；洪峰返回 queue_full/rate_limited；stop/断连释放资源，无 SSE 背压泄漏。
4. plugin apply 启动失败可见且可等待；重复 apply、端口占用、ctx.effect dispose/stop 清理有测试；默认拒绝非 loopback。
5. `npm test`、合同黑盒、client syntax/DOM、plugin load/dispose 全部通过。

**通过条件**：内部异常只返回 `internal_error`，不得泄露堆栈；任意无限队列、错误状态码、资源泄漏或生命周期假阳性为阻断。

## 评分权重与整体门禁

| 门禁 | 权重 |
|---|---:|
| P0-0 正式路由与黑盒基线 | 10 |
| P0-1 Canonical JSON 与严格封套 | 15 |
| P0-2 HMAC、身份绑定与重放 | 15 |
| P0-3 Hello/Welcome 与 session | 15 |
| P0-4 message/task 业务闭环 | 15 |
| P0-5 幂等、冲突与重启 | 15 |
| P0-6 HTTP 映射、资源与生命周期 | 15 |
| **总分** | **100** |

- 任一 P0 门禁存在阻断项，整体即判定不通过，不得用其他项高分抵销。
- logic-acceptance 与 code-acceptance 各自评分均须 ≥70；任一方低于 70，整体不通过。
- 旧 Demo/alias 的通过只能作为回归证据，不计入 DAN/0.1 合同得分。

## 联合执行与签字

- logic-acceptance：负责 P0-0、P0-3、P0-4、P0-5 双 Host 流程、重复消息、错误 key、重启与最终评分。
- code-acceptance：负责 P0-1、P0-2、P0-6 canonical/安全/错误映射/大小资源/插件生命周期审查，并复核逻辑证据的实现可信度。
- 两方必须读取对方最新 Round 2 报告，记录相互影响；不得以旧 5/5 Demo 测试替代本清单。
- 出口报告：`acceptance/logic-round-2.md` 与 `acceptance/code-round-2.md`；任一报告不通过则整体不通过。
