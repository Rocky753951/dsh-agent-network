# Round 2 P0-1 功能验收清单：Canonical JSON 与严格封套

P0-0 已由 logic/code 联合复测 10/10 放行。本清单仅用于 P0-1，不能替代后续 P0-2~P0-6。

## A. 合法封套与响应

- [ ] 正式 `POST /api/agent-network/v1/rpc` 合法严格 envelope 可 dispatch。
- [ ] 顶层仅允许 `protocol/kind/request_id/message_id/session_id/sender/recipient/sent_at/ttl_ms/seq/method/body/auth/trace`。
- [ ] response/ack 带 `reply_to`，成功为 `ok:true + result`，失败为 `ok:false + error`，result/error 不同时出现。
- [ ] 错误固定含 `code/message/retryable`，details 可选且不泄密。

## B. Canonical JSON golden vectors

- [ ] 对象递归按 UTF-8 字节序排序，数组保持顺序，RFC8259 转义，无空白。
- [ ] undefined 字段省略；NaN、Infinity、-0 拒绝；数字有限且为最短合法表示。
- [ ] 重复键、BOM、非 canonical 原文在解析阶段拒绝，不能 parse 后静默修正。
- [ ] 固定 golden vector 的 canonical bytes 在双 Host 一致。

## C. 严格字段与边界

- [ ] 缺字段、错误类型、额外顶层字段返回 `invalid_envelope`。
- [ ] UUID/ULID、非空 ID、UTC RFC3339 校验；seq 为合法整数且 method/body 类型正确。
- [ ] TTL：999 拒绝，1000/300000 接受，300001 拒绝；过期消息拒绝。
- [ ] 协议版本错误返回 `unsupported_version`。
- [ ] body >256 KiB 返回 `message_too_large`；请求/响应 JSON 与错误状态保持一致。

## D. 双 Host 黑盒与评分

- [ ] 两个独立 Host 均通过合法/非法 vectors，错误 code 一致。
- [ ] 不依赖旧 `/dan/0.1/*` alias、Cookie、ACP 或 Team mailbox。
- [ ] logic 与 code 各自评分；P0-1 权重 15。任一 P0 阻断仍使 Round2 总体不通过。
- [ ] 产出 `logic-round-2-p0-1.md` 与 `code-round-2-p0-1.md`，双方读取对方报告后再决定是否放行 P0-2。
