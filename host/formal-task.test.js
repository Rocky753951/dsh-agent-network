import test from "node:test";
import assert from "node:assert/strict";
import { AgentNetworkServer } from "./network.js";
import { canonical, signEnvelope } from "./contract.js";

const sender = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const recipient = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const secret = "formal-task-secret";
const make = (method, params, n) => { const e = { kind: "request", protocol: "dan/0.1", request_id: `dddddddd-dddd-4ddd-8ddd-ddddddddddd${n}`, message_id: `eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee${n}`, session_id: "ffffffff-ffff-4fff-8fff-ffffffffffff", sender, recipient, sent_at: new Date().toISOString(), ttl_ms: 30000, seq: n, method, body: { params }, auth: { alg: "HS256", key_id: "task-key", ts: new Date().toISOString(), nonce: ("MTIzNDU2Nzg5MDEyMzQ1Nj" + n).slice(0, 24) } }; e.auth.mac = signEnvelope(e, secret); return e; };

test("formal dual-host task submit/accept/cancel matrix", async (t) => {
  const server = new AgentNetworkServer({ host: "127.0.0.1", port: 0, contract: { nodeId: recipient, hmac: { keyId: "task-key", keys: { "task-key": secret }, bindings: { "task-key": sender }, required: true } } });
  await server.start(); t.after(() => server.stop()); const base = `http://127.0.0.1:${server.address().port}`;
  const post = (e) => fetch(`${base}/api/agent-network/v1/rpc`, { method: "POST", headers: { "content-type": "application/json" }, body: canonical(e) }).then(async (r) => ({ status: r.status, body: await r.json() }));
  const submit = await post(make("task.submit", { task_id: "task-formal", objective: "smoke", input: {}, idempotency_key: "task-idem", deadline: new Date(Date.now() + 30000).toISOString(), required_capabilities: [], write_scopes: [] }, 1));
  assert.equal(submit.status, 200); assert.equal(submit.body.result.status, "queued");
  const accept = await post(make("task.accept", { task_id: "task-formal" }, 2)); assert.equal(accept.body.result.status, "running");
  const cancel = await post(make("task.cancel", { task_id: "task-formal", idempotency_key: "cancel-idem" }, 3)); assert.equal(cancel.body.result.status, "cancelled");
  const cancelRetry = await post(make("task.cancel", { task_id: "task-formal", idempotency_key: "cancel-idem" }, 4)); assert.equal(cancelRetry.body.result.status, "cancelled");
});
