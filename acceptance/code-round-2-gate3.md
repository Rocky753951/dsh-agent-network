# Round 2 Gate 3 代码复测

**结论：不通过，10/15；打回 Gate 3。**

## 证据

- `cd dsh-agent-network/host && npm test`：8/8 通过，但现有新增测试仍主要覆盖旧 `/dan/0.1/rpc` smoke，未覆盖正式双 Host Gate3 矩阵；不能单凭 8/8 宣布通过。
- 代码已增加 nonce TTL 清理、重复 nonce→`replay_detected`、key binding 配置、recipient 检查、错误 key→401 映射；formal handler 映射 replay 为 409。

## 阻断项

1. **key→sender 绑定是可选旁路**：仅在 `this.keyBindings.has(envelope.auth.key_id)` 时检查 sender；未配置 binding 的任意已知 key 可代表任意 sender，未满足默认拒绝的身份绑定合同。应要求 key 必须有授权 sender 映射并拒绝未知/缺失绑定。
2. **recipient→Host 绑定存在默认旁路**：仅当 `nodeId !== "host"` 才校验 recipient；默认 `nodeId="host"` 的正式 Host 接受任意 recipient，且 `apply`/patch 配置未证明 node identity 必填。
3. **message_id replay 记录缺失且 `seen` 无界**：nonce 有 TTL 清理，但 `seen` 只按 message_id 存储、无 TTL/容量上限；同 message_id 的旧消息可以无限保留并造成内存增长，重启后也不持久化。Gate3 要求 nonce/message_id replay 记录均有界并按 TTL 清理。
4. **formal 双 Host Gate3 测试证据缺失**：当前 `smoke.test.js` 仍请求旧 alias，且使用不完整 auth；没有正式路径的重复 nonce、sender binding、recipient mismatch、错误 key 信息不泄露测试。现有测试通过不能覆盖本 Gate。

## 评分

| Gate 3 项目 | 得分 |
|---|---:|
| nonce 校验、TTL 清理、重复 nonce 错误映射 | 4/4 |
| key→sender 与 recipient→Host 强绑定 | 2/4 |
| message_id replay/idempotency 记录边界 | 1/3 |
| 错误 key 401 与信息不泄露 | 2/2 |
| 双 Host formal 黑盒测试与可维护性 | 1/2 |
| **Gate 3 合计** | **10/15** |

logic-acceptance 应独立复测正式双 Host vectors；在身份绑定默认拒绝、message_id 有界 TTL、正式路由测试补齐前，代码侧不放行后续 Gate。Round 2 总体仍不通过。
