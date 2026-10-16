# Round 2 Gate 5 P5-4/P5-5 修复复测（logic）

- `npm test`：**18/18 pass**。
- 结论：**P5-4 2/2；P5-5 2/2；合计 4/4，通过**。

## P5-4 重试、超时与 deadline（2/2）

`gate5.test.js` 已覆盖：

- 临时 503 最多按 bounded exponential backoff+jitter 重试并最终成功；
- 401 认证错误零重试；
- 调用方 request_id/message_id/idempotency_key 保持不变；
- clock 注入验证 overall deadline 在 backoff 后停止继续重试；
- 18/18 回归通过。

## P5-5 敏感日志与审计（2/2）

- 运行 audit logger 仅输出允许的 metadata（ID、method、status、size 等）；prompt/input/result 不进入记录；
- `auditRecord` 单测确认敏感 payload 字段剔除；
- Host 已补错误 key、非法 body、失败 task、cancel/retry 场景的 metadata-only 约束，未发现 secret/MAC/Cookie/token/payload/绝对路径泄露；
- 18/18 回归通过。

## 阶段累计

P5-1/P5-2 = 6/7；P5-3 = 1/2；本次 P5-4/P5-5 = 4/4，当前累计 **11/13**。P5-3 尚需 stop/lease/timer/竞态清理证据；P5-6 dispose 尚未验收。
