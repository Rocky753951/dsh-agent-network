# Round 2 P0-1 Gate 3 Final 修复双 Host 复测（logic）

- 日期：2026-10-15（GMT+8）
- 结论：**logic 15/15，通过；待 code 独立报告后联合放行 Gate 4**。

## 证据

- `cd dsh-agent-network/host && npm test`：**10/10 pass**，包含 checked-in vector 实际换行、replay restart、formal route 与既有回归。
- `vectors.json` 的 `hmac_framing` JSON 解析后为实际换行，checked-in vector 测试通过。
- 双 Host 正式 vectors：正确 sender/key/recipient + HMAC 200；错误 MAC/key 401 且不泄密；错误 recipient 401；重复 nonce 409 `replay_detected`；默认缺失绑定拒绝。
- replay state：`maxSeen`/`maxNonces` 均有界且 TTL 清理；replayFile 仅保存受 64 KiB 控制的 response metadata、expires，chmod 0600，加载/保存有上限。
- 重启同一 `message_id` 使用新 nonce：首次与重启后 response HTTP 200，响应 JSON deepEqual；不重复执行。

## 评分

| 项目 | 得分 |
|---|---:|
| nonce 校验、TTL、重复 nonce | 4/4 |
| key→sender/recipient 默认拒绝绑定 | 4/4 |
| message_id replay 有界、TTL、重启 response 恢复 | 3/3 |
| 错误 MAC/不泄露 | 2/2 |
| 双 Host formal vectors、vectors framing、回归 | 2/2 |
| **logic Gate 3 合计** | **15/15** |

## 联合门禁

已请求 code-acceptance 独立复核。只有 code 同样达标后才联合放行 Gate 4；Gate 3 通过不代表 P0-1 或 Round 2 总体验收通过。
