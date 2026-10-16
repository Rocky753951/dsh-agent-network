import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DanContractAdapter } from "./contract.js";

let clock = Date.now();
const env = (sender, method, params) => ({ kind: "request", protocol: "dan/0.1", request_id: randomUUID(), message_id: randomUUID(), session_id: randomUUID(), sender, recipient: "host", sent_at: new Date(clock).toISOString(), ttl_ms: 30000, seq: 1, method, body: { params } });

test("dual-host pairing matrix: scope, duration, expiry, restart, revoke", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dan-pair-matrix-")); const file = join(dir, "replay.json");
  try {
    const a = new DanContractAdapter({ nodeId: "host-a", replayFile: file, pairingNow: () => clock });
    const invite = await a.dispatch(env("host-a", "pair.invite.create", { permissions: { allow: ["task.read"], deny: ["task.admin"] }, duration: "15m", idempotency_key: "matrix-1" }));
    assert.equal(invite.result.duration, "15m"); assert.deepEqual(invite.result.permissions.allow, ["task.read"]);
    const b = new DanContractAdapter({ nodeId: "host-b", replayFile: file, pairingNow: () => clock });
    const pending = await b.dispatch(env("host-b", "pair.join.request", { pairing_id: invite.result.pairing_id, token: invite.result.token })); assert.equal(pending.result.status, "pending");
    const approved = await b.dispatch(env("host-a", "pair.approve", { pairing_id: invite.result.pairing_id, revision: pending.result.revision, permissions: { allow: ["task.read"] }, duration: "1h" })); assert.equal(approved.result.duration, "1h");
    const connected = await b.dispatch(env("host-b", "pair.session.open", { pairing_id: invite.result.pairing_id, revision: approved.result.revision })); assert.equal(connected.result.status, "connected");
    const restarted = new DanContractAdapter({ nodeId: "host-a", replayFile: file, pairingNow: () => clock }); const afterRestart = await restarted.dispatch(env("host-a", "pair.status", { pairing_id: invite.result.pairing_id })); assert.equal(afterRestart.result.status, "connected");
    const revoked = await restarted.dispatch(env("host-a", "pair.revoke", { pairing_id: invite.result.pairing_id, revision: afterRestart.result.revision })); assert.equal(revoked.result.status, "revoked");
    clock += 2 * 3600000;
    assert.equal((await restarted.dispatch(env("host-a", "pair.status", { pairing_id: invite.result.pairing_id }))).result.status, "revoked");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
