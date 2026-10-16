import test from "node:test";
import assert from "node:assert/strict";
import { PairingState } from "./pairing.js";

test("pairing rejects oversized UTF-8 scope and accepts bounded Unicode", () => {
  const p = new PairingState();
  assert.throws(() => p.create({ inviter: "host", permissions: { allow: ["界".repeat(257)] }, duration: "1h", idempotency_key: "utf8-1" }), /invalid_envelope/);
  const invite = p.create({ inviter: "host", permissions: { allow: ["读/任务"] }, duration: "15m", idempotency_key: "utf8-2" }); assert.equal(invite.status, "invited");
});

test("pairing lifecycle separates permissions and duration and consumes token", () => {
  const p = new PairingState(); const invite = p.create({ inviter: "host", permissions: { allow: ["task.read"] }, duration: "1h", idempotency_key: "i1" });
  assert.equal(invite.status, "invited"); assert.deepEqual(invite.permissions, { allow: ["task.read"] }); assert.equal(invite.duration, "1h");
  const pending = p.mutate(invite.pairing_id, "join", "client", { token: invite.token }); assert.equal(pending.status, "pending");
  assert.throws(() => p.mutate(invite.pairing_id, "join", "client", { token: invite.token }), /state_conflict|unauthorized/);
  const approved = p.mutate(invite.pairing_id, "approve", "host", { permissions: { allow: ["task.read", "task.write"] }, duration: "15m" }); assert.equal(approved.status, "approved"); assert.equal(approved.duration, "15m");
  assert.throws(() => p.mutate(invite.pairing_id, "approve", "attacker", { revision: approved.revision }), /forbidden/);
  assert.equal(p.mutate(invite.pairing_id, "connect", "client").status, "connected"); assert.equal(p.mutate(invite.pairing_id, "revoke", "host").status, "revoked");
});
