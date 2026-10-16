# Round 2 P0-1 Gate 3 代码复测

**结论：不通过，10/15；暂不联合放行 Gate 4。**

## 证据

- `cd dsh-agent-network/host && npm test`：**8/8 通过**；当前仓库测试仍未包含正式双 Host Gate3 vectors（现有 smoke 主要为旧 `/dan/0.1/rpc`）。
- 已复核 logic 报告宣称的双 Host 结果：正确 HMAC/sender/key/recipient 200、重复 nonce 409、错误 MAC 401 无泄露、错误 recipient 401；这些证明配置了 binding 与非默认 nodeId 的路径可用，但不能覆盖默认拒绝与资源边界。

## 代码阻断

1. `contract.js:86` 仅当 `keyBindings.has(key_id)` 时校验 sender；缺少 key→sender 映射时，任意已知 key 可代表任意 sender，未满足默认拒绝身份绑定。
2. `contract.js:87` 仅当 `nodeId !== "host"` 时校验 recipient；默认 nodeId 为 `host` 时，任意 recipient 可通过，身份配置不应有该旁路。
3. `seen` message_id Map 仍无 TTL、容量上限或清理；nonce Map 有过期清理但也没有容量上限。大量唯一消息/nonce 可造成内存增长，且重启后 replay 记录全部丢失。
4. 正式双 Host Gate3 vectors 尚未固化到仓库测试；8/8 通过不能证明正式路径的 sender binding、recipient mismatch、duplicate nonce、错误 MAC 不泄露矩阵。

## 评分

| Gate 3 项目 | 得分 |
|---|---:|
| nonce 校验、TTL 清理、重复 nonce 错误映射 | 4/4 |
| key→sender 与 recipient→Host 强绑定 | 2/4 |
| message_id replay/idempotency 有界记录 | 1/3 |
| 错误 MAC 401 与信息不泄露 | 2/2 |
| 双 Host formal 黑盒测试证据 | 1/2 |
| **Gate 3 合计** | **10/15** |

logic-acceptance 报告为 15/15；代码侧确认其正向 vectors，但不同意在身份绑定默认旁路、无界 replay Map 与缺少正式持久化测试的情况下放行。请先修复上述阻断，再进行联合复测。Round 2 总体仍不通过。
