import test from "node:test";
import assert from "node:assert/strict";
import { DanContractAdapter } from "./contract.js";
import { AgentNetworkServer } from "./network.js";
import { retry } from "./retry.js";
import { auditRecord, createAuditLogger } from "./audit.js";

test("cancel propagates AbortSignal and leaves one terminal state", async () => {
  const adapter = new DanContractAdapter();
  const base = { kind: "request", protocol: "dan/0.1", request_id: "r", session_id: "s", sender: "a", recipient: "b", sent_at: new Date().toISOString(), ttl_ms: 30000, seq: 1 };
  await adapter.dispatch({ ...base, message_id: "m1", method: "task.submit", body: { params: { task_id: "t1", objective: "x", input: {}, idempotency_key: "i1", deadline: new Date(Date.now() + 30000).toISOString(), required_capabilities: [], write_scopes: [] } } });
  await adapter.dispatch({ ...base, message_id: "m2", method: "task.accept", body: { params: { task_id: "t1" } } });
  let sideEffects = 0; const worker = adapter.tasks.get("t1"); worker.abortController.signal.addEventListener("abort", () => { sideEffects++; });
  await adapter.dispatch({ ...base, message_id: "m3", method: "task.cancel", body: { params: { task_id: "t1", idempotency_key: "c1" } } });
  assert.equal(adapter.tasks.get("t1").abortController.signal.aborted, true);
  assert.equal(sideEffects, 1);
  await assert.rejects(() => adapter.dispatch({ ...base, message_id: "m4", method: "task.result", body: { params: { task_id: "t1", result: {} } } }), /state_conflict/);
});

test("port conflict rejects startup and stop releases handles", async () => {
  const first = new AgentNetworkServer({ host: "127.0.0.1", port: 0 }); await first.start();
  const second = new AgentNetworkServer({ host: "127.0.0.1", port: first.address().port });
  await assert.rejects(() => second.start()); await first.stop(); await second.stop();
});

test("lease expiry rejects accept and dispose clears workers", async () => {
  const adapter = new DanContractAdapter();
  const base = { kind: "request", protocol: "dan/0.1", request_id: "r", session_id: "s", sender: "a", recipient: "b", sent_at: new Date().toISOString(), ttl_ms: 30000, seq: 1 };
  await adapter.dispatch({ ...base, message_id: "lease-1", method: "task.submit", body: { params: { task_id: "lease-task", objective: "x", input: {}, idempotency_key: "lease-idem", deadline: new Date(Date.now() + 5).toISOString(), required_capabilities: [], write_scopes: [] } } });
  await new Promise((resolve) => setTimeout(resolve, 10));
  await assert.rejects(() => adapter.dispatch({ ...base, message_id: "lease-2", method: "task.accept", body: { params: { task_id: "lease-task" } } }), /lease_expired/);
  adapter.dispose(); assert.equal(adapter.tasks.size, 0); assert.equal(adapter.nonces.size, 0);
});

test("retry only retries temporary failures with bounded backoff", async () => {
  let calls = 0; const waits = [];
  const result = await retry(async () => { calls++; if (calls < 3) { const e = new Error("temporary"); e.status = 503; throw e; } return "ok"; }, { sleep: async (ms) => waits.push(ms), random: () => 0, deadline: Date.now() + 10000 });
  assert.equal(result, "ok"); assert.equal(calls, 3); assert.equal(waits.length, 2);
});

test("retry does not retry auth failures and reuses caller IDs", async () => {
  let calls = 0; const ids = { request_id: "r", message_id: "m", idempotency_key: "i" };
  await assert.rejects(() => retry(async (attempt) => { calls++; assert.equal(attempt, 1); assert.deepEqual(ids, { request_id: "r", message_id: "m", idempotency_key: "i" }); const e = new Error("unauthorized"); e.status = 401; throw e; }, { sleep: async () => {}, deadline: Date.now() + 10000 }), /unauthorized/);
  assert.equal(calls, 1);
});

test("retry stops at overall deadline after backoff", async () => {
  let now = 0; let calls = 0;
  await assert.rejects(() => retry(async () => { calls++; const e = new Error("temporary"); e.status = 503; throw e; }, { attempts: 5, deadline: 50, sleep: async () => { now = 100; }, random: () => 0, now: () => now }), /temporary/);
  assert.equal(calls, 2);
});

test("audit logger emits metadata without sensitive payload", () => {
  let logged; const audit = createAuditLogger({ info: (_label, record) => { logged = record; } });
  audit({ request_id: "r", method: "task.submit", prompt: "secret", status: 200 });
  assert.deepEqual(logged, { request_id: "r", method: "task.submit", status: 200 });
});

test("audit records omit sensitive payload fields", () => {
  const record = auditRecord({ request_id: "r", method: "task.submit", input: "secret", result: "payload", status: 200, size: 10 });
  assert.deepEqual(record, { request_id: "r", method: "task.submit", status: 200, size: 10 });
});
