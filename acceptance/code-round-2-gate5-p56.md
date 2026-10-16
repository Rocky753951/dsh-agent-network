# Gate 5 P5-6 代码复测：插件启动、dispose 与安全边界

**评分：1/2；与 logic 一致，暂不通过满分。**

## 通过证据

- `apply` 强制 host 为 `127.0.0.1`/`localhost`/`::1`，非 loopback 直接抛错。
- `ctx.effect` disposer 调用 `server.stop()`，并注销已注册 tools；`AgentNetworkServer.stop()` 清 heartbeat、streams、queues，`contract.dispose()` 清 tasks/workers/nonces/seen/idempotency。
- stop 可重复调用，client 入口在无 DOM 时 no-op，未替换 app root；`npm test` 19/19 通过。

## 缺失/阻断证据

1. **端口冲突/异步启动失败不可观察给 apply 调用者**：`ctx.effect` 内 `server.start().catch(logger.error)` 仅记录错误，`apply()` 已返回，无法 await 或将失败传播给宿主。
2. **重复 apply 未防护**：同一 ctx/config 可注册多份 tools、启动多个 server；无 singleton/registry 或幂等 guard，也没有重复 apply 回归测试。
3. **句柄生命周期证据缺失**：没有端口占用、dispose 后 `process._getActiveHandles()`/requests 归零、重复 dispose/重新 apply 的测试。
4. **client lifecycle/fallback 未覆盖**：无 DOM、clipboard/API 缺失、load/unload 的 DOM 测试；仅静态代码可见 feature detection，不能替代 runtime 证据。

## 评分

| 项目 | 得分 |
|---|---:|
| loopback 安全边界 | 0.5/0.5 |
| effect stop/资源清理 | 0.5/0.5 |
| 启动失败/端口冲突/重复 apply | 0/0.5 |
| handles/client lifecycle 证据 | 0/0.5 |
| **P5-6 合计** | **1/2** |

logic 同评 P5-6=1/2；P5-3~P5-5 code=6/6，P5-1/2=6/7，当前 Gate5 累计 **13/15**。缺陷不属于可忽略测试覆盖：异步失败吞掉与重复 apply 可能造成孤儿 server/tool，按门禁应在宣布 Gate5 通过前修复或补齐明确安全策略。
