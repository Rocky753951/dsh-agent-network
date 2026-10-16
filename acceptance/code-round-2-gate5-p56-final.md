# Gate 5 P5-6 最终代码复测

**P5-6 结论：通过，2/2。**（覆盖最新 activeContexts duplicate guard、server.ready、npm20/20、port conflict、dispose、handles、client fallback 实现。）

## 证据

- `cd dsh-agent-network/host && npm test`：**20/20 通过**。
- `node/index.js`：per-context duplicate apply guard；dispose 删除 active context；`server.ready` 暴露启动 Promise，端口冲突可传播/观测；dispose 调用 stop 并注销 tools。
- `network.test.js`：端口冲突、stop 后 handles 释放测试通过；logic lifecycle 报告确认 Node/npm handles 归零、重复 apply/dispose、loopback 与 Node-only client fallback 通过。
- `network.js`：stop 清 heartbeat、streams、queues、contract tasks/nonces/seen/idempotency；重复 stop 幂等；非 loopback 在 apply 层拒绝。
- client fallback 已明确 Node-only，不伪称浏览器能力；无 DOM 场景不替换 app root。

## 评分

| P5-6 项目 | 得分 |
|---|---:|
| 启动失败/端口冲突/duplicate apply guard | 0.5/0.5 |
| dispose/stop 清理 server、streams、queues、tasks、timers、tools | 0.5/0.5 |
| loopback 安全边界与重复 stop/restart | 0.5/0.5 |
| handles/client fallback/lifecycle 证据 | 0.5/0.5 |
| **P5-6 合计** | **2/2** |

logic-acceptance final 复测同评 2/2。**P5-2 的 events:false + 404 events_disabled 安全降级按当前门禁仍计 2/3**（未实现 cursor/resume，不能满分）。因此 P5-1=4/4、P5-2=2/3、P5-3~P5-5=6/6、P5-6=2/2，当前阶段分项合计 **14/15**。只有 Lead 正式修订门禁、明确将安全降级授予 P5-2 满分，Gate5 才可记 15/15；否则应保留 14/15。
