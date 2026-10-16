# Gate 5 P5-3~P5-6 代码侧测试入口

依据联合清单 `logic-round-2-gate5-p53-p56-checklist.md`；仅定义代码审查/测试入口，不修改实现。

## P5-3 取消传播与终态（2分）

- 静态入口：`contract.js` task.cancel、task.result 状态转移、worker/AbortSignal/lease/timer 引用；确认 cancel 不是仅修改 Map 状态。
- 运行入口：`npm test`；正式 RPC 双 Host cancel/retry/terminal conflict；检查 stop 后任务、worker、lease、timer 计数归零。
- 阻断：无 AbortSignal/worker；竞态双终态；cancel 后仍有副作用；终态回退；资源句柄残留。

## P5-4 错误重试、超时与 deadline（2分）

- 静态入口：搜索 retry/backoff/jitter、AbortSignal/deadline、request_id/message_id/idempotency_key 复用；确认错误分类不会把 401/403/参数错误纳入重试。
- 运行入口：注入连接中断/408/429/5xx/503、401/403、invalid_envelope、慢依赖；记录 attempts、延迟、总 deadline、最终 status/code，并复启验证无双执行。
- 阻断：无限/无抖动重试；不复用三 ID；超过 deadline 仍副作用；认证/参数错误重试。

## P5-5 敏感日志与审计（2分）

- 静态入口：审查 `logger` 调用、错误响应、replayFile/idempotency 持久化；grep secret/MAC/token/Cookie/prompt/input/result/绝对路径；确认只记录 ID、method、size、status、hash、code、attempt、latency。
- 运行入口：错误 key、invalid JSON、失败 task、cancel、retry、internal error、replay/idempotency 后收集日志与 0600 文件，检查无正文/密钥/堆栈/路径。
- 阻断：任一真实 secret/MAC/payload/绝对路径泄露；内部异常堆栈外泄；完整 payload 落入审计/replay 文件。

## P5-6 插件启动、dispose 与安全边界（2分）

- 静态入口：`host/index.js` apply/ctx.effect/注册工具/stop；确认异步启动失败可见、dispose 注销 tools、stop 清 timers/queues/streams/workers；`AgentNetworkServer` 非 loopback 拒绝；client apply 无 DOM 与 unload fallback。
- 运行入口：端口占用、重复 apply、异常启动、重复 dispose/stop、stop 后请求/重启、非 loopback；用 `process._getActiveHandles()`/`process._getActiveRequests()` 辅助检查无悬挂句柄（仅测试观测，不进入生产逻辑）。
- 阻断：孤儿 server/worker/timer；dispose 后仍监听/写入；重复注册工具；非 loopback 越权；client fallback 抛异常或替换 app root。

## 代码侧评分规则

P5-3~P5-6 各 2 分，结合 logic 双 Host 黑盒报告交叉评分。当前资源/stream 基线为 6/7；四项满分后 Gate5 总分 15/15。任一 P0（资源泄露、敏感泄露、错误重试双执行、插件孤儿句柄）直接阻断，不以总分抵销。
