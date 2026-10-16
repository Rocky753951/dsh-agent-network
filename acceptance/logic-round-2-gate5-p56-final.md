# Round 2 Gate 5 P5-6 最终复测（logic）

- `npm test`：**20/20 pass**。
- 结论：**P5-6 2/2，通过**。

## 证据

- `apply(ctx, config)` 为每个 context 设置 duplicate guard；同 context 重复 apply 同步拒绝；dispose 删除 guard，重新 apply 可用。
- 非 loopback host 同步拒绝；client 明确 Node-only，不伪称浏览器能力。
- server `ready` Promise 暴露启动结果；端口占用 startup rejection 可观测；port conflict + stop releases handles 测试通过。
- `ctx.effect` disposer 调用 server.stop，清 heartbeat、streams、queues、contract tasks/workers/nonces，并注销 tools；stop 重复调用安全。
- npm/Node handles 归零；重新启动/停止基础生命周期通过。

## 评分

| 项目 | 得分 |
|---|---:|
| 启动失败/重复 apply/端口冲突/ready | 1/1 |
| dispose、资源清理、重启、loopback/Node-only 安全边界 | 1/1 |
| **P5-6 合计** | **2/2** |

与 code-acceptance 等待最终交叉报告。按当前既有分项 P5-1/P5-2=6/7、P5-3=2/2、P5-4/P5-5=4/4，加本项2/2，算术合计 **14/15**；若联合门禁将明确 `events:false` 安全降级的 P5-2 计满3/3，则总分为15/15。