const SENSITIVE = /secret|token|password|cookie|authorization|mac|prompt|input|result|body|path/i;

/** Return only non-sensitive audit metadata; never serializes task payloads or credentials. */
export function auditRecord({ request_id, message_id, task_id, session_id, method, status, error_code, attempt, latency_ms, size } = {}) {
  return Object.fromEntries(Object.entries({ request_id, message_id, task_id, session_id, method, status, error_code, attempt, latency_ms, size }).filter(([key, value]) => value !== undefined && !SENSITIVE.test(key)));
}

export function createAuditLogger(logger = console) {
  return (record) => logger.info?.("agent-network.audit", auditRecord(record));
}
