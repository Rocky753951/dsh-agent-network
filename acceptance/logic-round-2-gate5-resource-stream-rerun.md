# Round 2 Gate 5 P5-1/P5-2 降级复测（logic）

- 日期：2026-10-15（GMT+8）
- 结论：P5-1 **3/4**；P5-2 **2/3（部分通过，不是满分）**；合计 **5/7**。
- `npm test`：12/12 pass。

## P5-1 资源/背压（3/4）

- `maxQueue=1000`/`queue_full`、多 stream Set、断开清理、15s heartbeat、stop 清理 heartbeat/streams 已验证方向。
- emit 检查 destroyed 与 write backpressure；仍缺完整洪峰 HTTP/429、慢消费者淘汰、write error 与 queue/worker/timer 全量资源证据，故不满分。

## P5-2 stream/SSE + cursor（2/3）

- formal describe 返回 `events:false`，capabilities 不虚报 events；直接检查得到 `capabilities:["rpc","tasks"]`、`events:false`。
- Demo stream endpoint 已安全关闭：`GET /dan/0.1/receive?agentId=a&stream=1` 返回 404 `events_disabled`，不再提供未认证半支持 SSE。
- 未实现正式 stream、cursor/resume/gap，故不能给 3/3；但明确降级和安全拒绝，较之前 Demo 半支持提升至 **2/3**。

## 联合影响

已读取 code 资源/stream 初验（资源3/4、SSE1/3）；本轮修复后 code 需独立更新。P5-2 的“不虚报+安全拒绝”只能获得部分分，不能等同于正式 stream/cursor 全能力。P5-1/P5-2 合计暂为 5/7，Gate5 总体仍待其余 P5-3~P5-6。
