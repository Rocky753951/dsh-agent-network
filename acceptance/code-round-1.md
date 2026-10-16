# dsh-agent-network 代码级验收 — Round 1

**日期**：2026-10-15 20:51（GMT+8）  
**结论**：**不通过（打回）**  
**评分：46/100**（低于 50，建议 Lead 先重新规划合同/实现边界，再进入下一轮；不应以当前 Demo 直接宣称 DAN/0.1 v0 合同实现。）

## 范围与证据

审查目录：`host/index.js`、`host/network.js`、`host/contract.js`、`client/client.js`、`PROTOCOL.md`、README、测试与 package/patch 清单。

- `cd dsh-agent-network/host && npm test`：5/5 通过。
- `node --check dsh-agent-network/client/client.js`：通过。
- 已读取逻辑验收 Round 1 报告：同样确认现有 5/5 测试通过，但冻结合同关键项不通过：必需 `/api/agent-network/v1/rpc` 404，仅旧 alias；状态码、HMAC 签名、TTL/字段校验、reply_to、hello/welcome、task.submit/幂等等不符合合同。

## 评分明细

| 维度 | 得分 | 结论 |
|---|---:|---|
| 模块边界与可读性 | 12/15 | Host transport/contract/client 分层清楚，Node built-ins、注释和 README 较好；但 Demo API 与冻结协议混用，边界契约不一致。 |
| DSH 插件规范 | 8/15 | Host `apply(ctx, config)`、`inject`、`ctx.effect`、bundle patch 基本合理；启动为异步 fire-and-forget，client 注入声明与实际运行时依赖容易误配，缺少真实宿主加载验证。 |
| 协议正确性 | 5/25 | 仅实现宽松封套和 ping/message.send；冻结 v0 要求的路由、canonical、hello/welcome、严格字段、错误封套、task/幂等均缺失。 |
| 安全 | 7/25 | HMAC 使用 constant-time 比较且默认 loopback 是优点；但没有 sender/key 绑定、nonce/ts/replay TTL、路径域签名、严格 canonical、权限/限流/队列上限。裸 `AgentNetworkServer({host:'0.0.0.0'})` 也可绕过 `apply` 的 loopback guard。 |
| 测试与可维护性 | 8/20 | 5 个 Host happy-path/smoke 测试通过；client 0 测试，且 malformed input、合同路由、状态码、SSE 生命周期、并发/背压、资源上限、plugin lifecycle 均未覆盖。 |
| **合计** | **46/100** | **不通过** |

## P0 必须打回项

1. **冻结合同路由不对**：`host/network.js:97-107` 只将 `/dan/0.1/*` 映射到处理器；合同要求 `POST /api/agent-network/v1/rpc`。当前必需路径返回 404，逻辑验收已复现。
2. **认证不是合同认证**：`contract.js:13-27` 的签名只覆盖 canonical envelope，没有 `DAN/0.1\nPOST\n/api/agent-network/v1/rpc\n` 前缀；`auth` 缺 `alg/ts/nonce`，不检查时间偏差、nonce 重放、key_id 与 sender/node 授权绑定。`seen` 是无限增长 Map，且只按 message_id 去重，重启/TTL 窗口保证不存在。
3. **封套校验过宽**：`validateEnvelope` 允许 `ttl_ms=1`（合同下限 1000），不要求/校验 `seq`，接受任意额外顶层字段，未拒绝非 RFC3339 UTC、非 canonical JSON、非法数字；错误对象只含 `{code}`，响应缺 `reply_to`/固定 `ok/result|error` 结构。
4. **错误 HTTP 状态泄漏/不映射**：`network.js:100-102,120` 把协议/认证/参数错误统一成 400，成功 dispatch 统一 200；冻结合同要求 unauthorized=401、invalid_method=404、冲突=409、过大=413 等，并要求错误码稳定、不得泄露 key 存在性。
5. **缺少必需协议能力**：无 hello/welcome 双向握手、无 session 建立/过期、无 `task.submit`/result/lease，也无 `idempotency_key` 持久化语义；当前 `METHODS` 只有 ping/describe/message.send，`message.send` 本身也没有幂等键。
6. **资源耗尽风险**：`queues` 无容量/TTL/并发上限，发送可无限堆积；`streams` 每 agent 只保存一个 response，第二个连接覆盖第一个；SSE 写入不检查 backpressure/error，停止与断连清理不完整。公网/反代误配时可被低成本 DoS。
7. **输入/传输边界不完整**：`readBody` 以 JS 字符串长度限制 1 MiB，不是字节，未校验 Content-Type/UTF-8；JSON parse 后才检查 body 大小；register/send 的 agent ID、metadata、payload 没有统一 schema/大小与字段限制。直接构造 `AgentNetworkServer` 可指定非 loopback host，绕过插件层安全护栏。

## P1 改进项

- 将 Demo `/register,/send,/receive` 与 DAN 合同实现拆为明确模块/路由，不再在文档中称 `/dan/0.1` 为冻结 v0 canonical。
- 为 contract 建立严格 schema（额外字段、UUID/ULID、UTC 时间、seq、method/body、auth），统一错误类型到 HTTP 映射；对外错误禁止 `error.message` 直出内部异常。
- `seen` 需 TTL 清理/有界存储，并持久化幂等记录；加入 sender/session 维度与 request hash 冲突检测。
- 启动失败需可观测/可等待，测试 `ctx.effect` dispose、重复 apply、端口占用与 stop 后请求；增加 client DOM/clipboard/API feature-detection 测试。
- SSE 需要连接数限制、心跳、写入背压、重复连接策略和 cursor/resume；日志不得记录 payload/secret。
- 增加合同黑盒测试：canonical 签名、错误状态码、必需路径、超限 413、过期/重放/错误 key、额外字段、hello/welcome、幂等冲突、任务终态。

## 对逻辑验收 Round 1 的回应

逻辑验收报告指出的 404 路由、状态码、HMAC 前缀、严格 TTL/字段、reply_to、握手、task/幂等缺失均属**代码级 P0**，不是仅测试缺口；本报告已逐项纳入上述打回清单。现有 5/5 测试只能证明旧 alias 与宽松 Demo happy path，不足以证明冻结 DAN/0.1 v0 合同。建议 Lead 先决定：实现冻结合同（推荐）或明确降级为 Demo 协议并从 README/PROTOCOL 中移除“合同实现”表述，再进行 Round 2。

## 通过标准（下一轮）

必须先解决全部 P0，并新增合同黑盒测试覆盖必需路径、状态码、签名前缀、严格封套、nonce/replay、hello/welcome、message/task 幂等与资源上限；`npm test`、client syntax/DOM tests、插件加载/销毁测试全部通过后，代码评分达到 70 分以上方可通过。
