import { createHash, randomUUID, randomBytes } from "node:crypto";

const STATES = new Set(["invited", "pending", "approved", "rejected", "connected", "expired", "revoked"]);
const TRANSITIONS = {
  invited: { pending: "join", expired: "expire", revoked: "revoke" },
  pending: { approved: "approve", rejected: "reject", expired: "expire", revoked: "revoke" },
  approved: { connected: "connect", expired: "expire", revoked: "revoke" },
  connected: { revoked: "revoke", expired: "expire" },
  rejected: {}, expired: {}, revoked: {}
};
const DURATIONS = new Set(["15m", "1h", "8h", "24h", "7d"]);
const durationMs = { "15m": 900000, "1h": 3600000, "8h": 28800000, "24h": 86400000, "7d": 604800000 };
const hash = (token) => createHash("sha256").update(token, "utf8").digest("hex");

export class PairingState {
  constructor({ now = () => Date.now(), persist = () => {} } = {}) { this.now = now; this.persist = persist; this.records = new Map(); this.audit = []; this.revisions = new Map(); }
  create({ inviter, permissions = {}, duration = "1h", idempotency_key, now = this.now() }) {
    if (!inviter || !DURATIONS.has(duration) || typeof idempotency_key !== "string" || Buffer.byteLength(idempotency_key, "utf8") > 128 || !permissions || typeof permissions !== "object" || Array.isArray(permissions) || Buffer.byteLength(JSON.stringify(permissions), "utf8") > 65536) throw new Error("invalid_envelope");
    for (const key of ["allow", "deny"]) if (permissions[key] !== undefined && (!Array.isArray(permissions[key]) || permissions[key].some((scope) => typeof scope !== "string" || Buffer.byteLength(scope, "utf8") > 256))) throw new Error("invalid_envelope");
    const existing = [...this.records.values()].find((r) => r.idempotency_key === idempotency_key && r.inviter === inviter); if (existing) return this.view(existing);
    const pairing_id = randomUUID(), token = randomBytes(24).toString("base64url"), expires_at = new Date(now + durationMs[duration]).toISOString();
    const record = { pairing_id, inviter, permissions, duration, expires_at, token_hash: hash(token), idempotency_key, status: "invited", revision: 1, created_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString(), token };
    this.records.set(pairing_id, record); this.#audit(record, "created", inviter, now); this.persist(); return { ...this.view(record), token };
  }
  mutate(pairing_id, action, actor, { revision, token, permissions, duration } = {}) {
    const r = this.records.get(pairing_id); if (!r) throw new Error("pairing_not_found");
    if (revision !== undefined && revision !== r.revision) throw new Error("revision_conflict");
    if (r.status === "invited" || r.status === "pending" || r.status === "approved" || r.status === "connected") if (this.now() >= Date.parse(r.expires_at)) { r.status = "expired"; r.revision++; this.#audit(r, "expired", actor); }
    if (action === "join" && (typeof token !== "string" || !r.token_hash || hash(token) !== r.token_hash)) throw new Error("unauthorized");
    if (["approve", "reject", "revoke"].includes(action) && actor !== r.inviter) throw new Error("forbidden");
    if (action === "connect" && actor !== r.joiner) throw new Error("forbidden");
    const previous = r.status;
    // Resolve the transition before mutating: a join against an expired or
    // revoked pairing must not consume the invite or record an actor.
    const next = Object.entries(TRANSITIONS[r.status] || {}).find(([, a]) => a === action)?.[0]; if (!next) throw new Error("state_conflict");
    if (action === "join") { r.token_hash = null; r.token = null; r.joiner = actor; }
    if (action === "approve" && permissions) r.permissions = permissions;
    if (action === "approve" && duration) { if (!DURATIONS.has(duration)) throw new Error("invalid_envelope"); r.duration = duration; r.expires_at = new Date(this.now() + durationMs[duration]).toISOString(); }
    r.status = next; r.revision++; r.updated_at = new Date(this.now()).toISOString(); this.#audit(r, action, actor, this.now(), previous, next); this.persist(); return this.view(r);
  }
  snapshot() { return { records: [...this.records], audit: this.audit.slice(-10000) }; }
  restore(snapshot = {}) { for (const [id, record] of snapshot.records || []) this.records.set(id, record); this.audit = (snapshot.audit || []).slice(-10000); }
  view(r) { const { token_hash, token, ...safe } = r; return { ...safe, audit_seq: this.audit.filter((a) => a.pairing_id === r.pairing_id).length }; }
  #audit(r, action, actor, at = this.now(), from = r.status, to = r.status) { this.audit.push({ transition_id: randomUUID(), pairing_id: r.pairing_id, action, actor, from, to, at: new Date(at).toISOString(), revision: r.revision }); }
}
