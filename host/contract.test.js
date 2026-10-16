import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { DanContractAdapter, canonical, signEnvelope } from "./contract.js";

const autoEnvelope = (body = { method: "ping" }) => ({ kind: "request", protocol: "dan/0.1", request_id: "req-1", message_id: "msg-1", session_id: "sess-1", sender: "node-a", recipient: "node-b", sent_at: new Date().toISOString(), ttl_ms: 30000, seq: 1, body });

test("DAN adapter validates envelope and dispatches ping", async () => {
  const adapter = new DanContractAdapter({ nodeId: "node-b" });
  const response = await adapter.dispatch(autoEnvelope());
  assert.equal(response.ok, true);
  assert.equal(response.result.pong, true);
  assert.equal(response.request_id, "req-1");
});

test("DAN adapter verifies configured HMAC", async () => {
  const adapter = new DanContractAdapter({ nodeId: "node-b", hmac: { keyId: "k1", keys: { k1: "secret" }, required: true } });
  const request = autoEnvelope();
  request.auth = { key_id: "k1" };
  request.auth.mac = signEnvelope(request, "secret");
  assert.equal((await adapter.dispatch(request)).ok, true);
  const bad = { ...request, message_id: "msg-2", auth: { key_id: "k1", mac: "bad" } };
  await assert.rejects(() => adapter.dispatch(bad), /unauthorized/);
});

test("HMAC uses DAN POST path framing with real newlines", () => {
  const envelope = autoEnvelope();
  const unsigned = { ...envelope };
  const framing = `dan/0.1\nPOST\n/api/agent-network/v1/rpc\n${canonical(unsigned)}`;
  const expected = createHmac("sha256", "secret").update(framing).digest("base64url");
  assert.equal(signEnvelope(envelope, "secret"), expected);
  assert.notEqual(signEnvelope(envelope, "secret", { path: "/dan/0.1/rpc" }), expected);
});

test("task submit/result and idempotency conflict close the demo business loop", async () => {
  const adapter = new DanContractAdapter();
  const base = { ...autoEnvelope(), method: "task.submit", body: { params: { task_id: "task-1", objective: "demo", input: {}, idempotency_key: "idem-1", deadline: new Date(Date.now() + 30000).toISOString(), required_capabilities: [], write_scopes: [] } } };
  const accepted = await adapter.dispatch(base);
  assert.equal(accepted.result.status, "queued");
  const running = await adapter.dispatch({ ...base, message_id: "msg-accept", method: "task.accept", body: { params: { task_id: "task-1" } } });
  assert.equal(running.result.status, "running");
  const result = await adapter.dispatch({ ...base, message_id: "msg-result", method: "task.result", body: { params: { task_id: "task-1", result: { ok: true } } } });
  assert.equal(result.result.status, "succeeded");
  await assert.rejects(() => adapter.dispatch({ ...base, message_id: "msg-conflict", body: { params: { ...base.body.params, input: { changed: true } } } }), /idempotency_conflict/);
});

test("checked-in vector uses actual newline HMAC framing", () => {
  const vector = JSON.parse(readFileSync(new URL("./vectors.json", import.meta.url), "utf8"));
  assert.equal(vector.hmac_framing, "DAN/0.1\nPOST\n/api/agent-network/v1/rpc\n<canonical unsigned>");
});

test("replay state survives adapter restart", async () => {
  const replayFile = `./.replay-test-${process.pid}-${randomUUID()}.json`;
  const options = { nodeId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", replayFile, hmac: { keyId: "k1", keys: { k1: "secret" }, bindings: { k1: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, required: true } };
  const request = { ...autoEnvelope(), request_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", message_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", session_id: "ffffffff-ffff-4fff-8fff-ffffffffffff", method: "ping", body: {}, sender: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", recipient: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
  request.auth = { alg: "HS256", key_id: "k1", ts: new Date().toISOString(), nonce: "MTIzNDU2Nzg5MDEyMzQ1Njc4OTA" };
  request.auth.mac = signEnvelope(request, "secret");
  const first = new DanContractAdapter(options);
  const firstResponse = await first.dispatch(request, { strict: true });
  const restarted = new DanContractAdapter(options);
  const retry = { ...request, auth: { ...request.auth, nonce: "MTIzNDU2Nzg5MDEyMzQ1Njc4OTE" } };
  retry.auth.mac = signEnvelope(retry, "secret");
  const replayedResponse = await restarted.dispatch(retry, { strict: true });
  assert.deepEqual(replayedResponse, firstResponse);
  if (existsSync(replayFile)) rmSync(replayFile);
});
