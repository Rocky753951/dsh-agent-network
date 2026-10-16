# Round 2 P0-1 Gate 3 修复后联合复测

**最终结论：通过，15/15；与 logic 联合放行 Gate 4。**

## 复测证据

- `cd dsh-agent-network/host && npm test`：**10/10 通过**。
- 双 Host 正式 vectors：正确 HMAC、key→sender、recipient→Host、错误 MAC 401 不泄露、重复 nonce 409 `replay_detected` 均通过。
- 默认拒绝：缺少 key binding 或 recipient 不匹配均被拒绝。
- replay 资源：`maxSeen`/`maxNonces` 均有 10000 默认上限与淘汰；seen/nonce 按 TTL 清理；replayFile 读取、保存限制并执行 mode 0600。
- 重启语义：首次请求与重启后同 `message_id` + 新 nonce 重放结果 `deepEqual`；持久化 response 受 64 KiB 控制，超限不会写入敏感大 payload。
- `vectors.json` 已修复，JSON 解析后的 `hmac_framing` 含真实换行；对应回归测试通过。

## 评分

| Gate 3 项目 | 得分 |
|---|---:|
| nonce 校验、TTL、容量上限、重复 nonce 错误映射 | 4/4 |
| key→sender 与 recipient→Host 默认拒绝绑定 | 4/4 |
| message_id replay 有界、TTL、重启恢复及原响应一致性 | 3/3 |
| 错误 MAC 401 与信息不泄露 | 2/2 |
| 双 Host formal vectors 与可维护性 | 2/2 |
| **Gate 3 合计** | **15/15** |

logic-acceptance 的联合复测同评 15/15。此前发现的 `entry.response` 丢失、nonce 无界、replayFile payload 及 framing vector 问题均已修复并有回归证据。双方确认 Gate 3 完成，联合放行 Gate 4；Round 2 其余 Gate 及总体合同仍需继续验收。
