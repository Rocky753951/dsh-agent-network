# Round 2 P0-1 Gate 3 资源/持久化修复复测（logic）

- 日期：2026-10-15（GMT+8）
- 结论：**不通过，暂不放行 Gate 4**。
- `npm test`：**9/9 pass**（统一计数已确认）。

## 已通过

- 正式双 Host sender/key/recipient 正向、错误 MAC、错误 recipient、重复 nonce 向量通过。
- `maxNonces=10000` 有界淘汰；`seen` 有 TTL 与 `maxSeen`；replayFile 既有文件 chmod 0600，加载/保存有上限。
- vectors 已固化；重启后重复 nonce 返回 409 `replay_detected`。

## 新发现的阻断

replayFile 仅保存 `seen` 的 `{expires}` 元数据，不保存原 response。重启后以**同一 message_id、不同 nonce**重发时，`dispatch` 命中 `seen` 后访问 `entry.response` 为 undefined；正式路由返回 400 `invalid_envelope`，而合同要求相同 message_id/幂等重试返回首次 response/result，不得二次执行或错误失败。

该问题不会被“同 nonce 重放”测试发现（其先命中 nonce replay），必须补同 message_id+新 nonce 的重启黑盒。

## 评分

| 项目 | 得分 |
|---|---:|
| nonce 校验、TTL、重复 nonce | 4/4 |
| key→sender/recipient 默认拒绝绑定 | 4/4 |
| message_id replay 有界、TTL、重启恢复 | 1/3 |
| 错误 MAC 401/不泄露 | 2/2 |
| 双 Host formal vectors 与回归 | 1/2 |
| **logic Gate 3 合计** | **12/15** |

Gate 3 仍不通过；需修复重启后 message_id response/idempotency 恢复语义，并补对应正式测试后再联合复测 Gate 4。
