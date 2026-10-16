# Round 2 P0-1 Gate 3 双 Host 复测（logic）

- 日期：2026-10-15（GMT+8）
- 结论：**logic 15/15，暂通过；待 code 独立报告后联合放行 Gate 4**。
- 范围：HMAC 身份绑定、recipient binding、nonce/message replay、TTL 窗口及错误泄露。

## 双 Host 证据

两个独立 Host 配置相同 UUID node B、key `k -> sender UUID A`、secret；正式路由使用 canonical envelope 与 HMAC path framing：

- 正确 key/MAC、sender A、recipient B：两 Host HTTP 200，响应成功并带 auth。
- 重发同 nonce：两 Host HTTP 409 `replay_detected`，响应不泄露秘密。
- 错 secret/MAC：两 Host HTTP 401 `unauthorized`；不区分 key 存在性，不返回 secret/MAC/key 详情。
- 正确签名但 recipient 非本 Host：两 Host HTTP 401 `unauthorized`，recipient binding 生效。
- key→sender binding 使用错误 sender 时拒绝；重复 nonce 在两个 Host 均拒绝。
- `npm test`：**8/8 pass**，含 HMAC path framing 与前置回归。

## 评分

| 项目 | 得分 |
|---|---:|
| nonce/message replay 与 TTL 窗口 | 4/4 |
| key→sender 身份绑定 | 4/4 |
| recipient→Host binding | 3/3 |
| 错 key/MAC 状态与泄露 | 2/2 |
| 双 Host 黑盒与回归 | 2/2 |
| **logic Gate 3 合计** | **15/15** |

## Code 交叉复核与联合结论

已读取 `acceptance/code-round-2-p0-1-gate3.md`：code **10/15，不通过**。其阻断项为：无 key→sender 映射时默认旁路、`nodeId=host` 时 recipient 校验旁路、`seen` message_id Map 无 TTL/容量清理、nonce/replay 记录无持久化/正式双 Host vectors 未入仓。logic 正向 vectors 虽全部通过，但不能抵消实现级默认拒绝与资源边界缺口。

因此 Gate 3 **暂不联合放行 Gate 4**；Gate 3 通过仅表示本 Gate 正向安全向量通过，P0-1 Gate4/5 及 P0-2~P0-6 仍未验收。
