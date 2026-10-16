# Round 2 P0-1 Gate 3 修复后正式双 Host 复测（logic）

- 日期：2026-10-15（GMT+8）
- 结论：**logic 15/15，暂通过；待 code 独立报告后联合决定 Gate 4**。
- 本轮不得把 Gate 3 通过等同于 P0-1/总体验收通过。

## 复测证据

- 当前 `npm test` 实际输出 **8/8 pass**（Lead 提报 9/9；仓库当前 Node test runner 发现 8 个测试，计数差异已记录，需补齐/确认测试发现情况）。
- 两个正式 loopback Host，配置显式 UUID node B、key `k -> sender A`、recipient B、secret：
  - 正确 MAC/sender/key/recipient：HTTP 200；
  - 重复 nonce：HTTP 409 `replay_detected`；
  - 错 MAC/错误 key：HTTP 401 `unauthorized`，不泄露 key/MAC/secret；
  - 正确签名但 recipient 非本 Host：HTTP 401 `unauthorized`；
  - 未配置 key binding 或默认 node 身份：拒绝，不允许旁路；
  - `host/vectors.json` 已提供 protocol/path/framing/canonical/security vectors。
- replayFile restart 黑盒（0600 可选文件）：首次提交 HTTP 200；停止 Host、用同一 replayFile 重启后重放同 nonce 返回 HTTP 409 `replay_detected`。
- `seen` 采用 TTL/`maxSeen` 清理；nonce 采用过期清理，重放状态写入 replayFile。

## 评分

| 项目 | 得分 |
|---|---:|
| nonce 校验、TTL 清理、重复 nonce | 4/4 |
| key→sender 默认拒绝与显式绑定 | 4/4 |
| recipient→Host 默认拒绝与显式绑定 | 3/3 |
| 错 key/MAC 状态与信息不泄露 | 2/2 |
| 双 Host formal、bounded/restart vectors | 2/2 |
| **logic Gate 3 合计** | **15/15** |

## Code 交叉复核与联合结论

已读取 `acceptance/code-round-2-p0-1-gate3-rerun.md`：code **13/15，不通过**。其确认默认 key/recipient 拒绝、seen TTL/maxSeen、重启恢复均通过，但发现 nonce Map 无容量上限（300 秒内可无限增长），replayFile 持久化完整 response/result payload 且既有文件权限不收紧，正式双 Host vectors 尚未固化入仓。logic 的正向 vectors 不能抵消这些资源/敏感数据风险，故 Gate 3 **不联合放行 Gate 4**。

测试计数存在差异：logic 当前工作区执行得到 8/8，code 报告得到 9/9（新增 replay restart test 发现情况不同），需 Lead/Host 统一确认测试发现基线。

