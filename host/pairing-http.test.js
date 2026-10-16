import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { AgentNetworkServer } from "./network.js";
import { canonical, signEnvelope } from "./contract.js";

const keys = { "key-a": "secret-a", "key-b": "secret-b" };
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
async function host(nodeId, keyId, file) { const s = new AgentNetworkServer({ host: "127.0.0.1", port: 0, contract: { nodeId, replayFile: file, hmac: { keyId, keys, bindings: { "key-a": A, "key-b": B }, required: true } } }); await s.start(); return s; }
async function post(server, sender, recipient, keyId, method, params) { const e = { kind: "request", protocol: "dan/0.1", request_id: randomUUID(), message_id: randomUUID(), session_id: randomUUID(), sender, recipient, sent_at: new Date().toISOString(), ttl_ms: 30000, seq: 1, method, body: { params }, auth: { alg: "HS256", key_id: keyId, ts: new Date().toISOString(), nonce: randomUUID() } }; e.auth.mac = signEnvelope(e, keys[keyId]); const a = server.address(); const r = await fetch(`http://127.0.0.1:${a.port}/api/agent-network/v1/rpc`, { method: "POST", headers: { "content-type": "application/json" }, body: canonical(e) }); return { status: r.status, body: await r.json() }; }

test("formal HTTP dual-host pairing and revoke side-effect block", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dan-http-pair-")); const file = join(dir, "replay.json"); let a, b;
  try {
    a = await host(A, "key-a", file); const invite = await post(a, A, A, "key-a", "pair.invite.create", { permissions: { allow: ["task.read"] }, duration: "1h", idempotency_key: "http-pair" }); assert.equal(invite.body.result?.status, "invited", JSON.stringify(invite)); await a.stop();
    b = await host(B, "key-b", file); const join = await post(b, B, B, "key-b", "pair.join.request", { pairing_id: invite.body.result.pairing_id, token: invite.body.result.token }); assert.equal(join.body.result.status, "pending"); await b.stop();
    a = await host(A, "key-a", file); const approve = await post(a, A, A, "key-a", "pair.approve", { pairing_id: invite.body.result.pairing_id, revision: join.body.result.revision, permissions: { allow: ["task.read"] }, duration: "1h" }); assert.equal(approve.body.result.status, "approved"); await a.stop();
    b = await host(B, "key-b", file); const connect = await post(b, B, B, "key-b", "pair.session.open", { pairing_id: invite.body.result.pairing_id, revision: approve.body.result.revision }); assert.equal(connect.body.result.status, "connected");
    const denied = await post(b, B, B, "key-b", "task.submit", { pairing_id: invite.body.result.pairing_id, task_id: "denied-task", objective: "denied", input: {}, idempotency_key: "denied", deadline: new Date(Date.now() + 30000).toISOString(), required_capabilities: [], write_scopes: [] }); assert.equal(denied.body.error.code, "forbidden"); await b.stop();
    a = await host(A, "key-a", file); const revoke = await post(a, A, A, "key-a", "pair.revoke", { pairing_id: invite.body.result.pairing_id, revision: connect.body.result.revision }); assert.equal(revoke.body.result.status, "revoked");
    const blocked = await post(a, A, A, "key-a", "task.submit", { pairing_id: invite.body.result.pairing_id, task_id: "blocked-task", objective: "should-block", input: {}, idempotency_key: "after-revoke", deadline: new Date(Date.now() + 30000).toISOString(), required_capabilities: [], write_scopes: [] }); assert.equal(blocked.body.error.code, "forbidden");
  } finally { await a?.stop(); await b?.stop(); rmSync(dir, { recursive: true, force: true }); }
});
