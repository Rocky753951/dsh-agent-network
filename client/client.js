/* DSH Agent Network: intentionally dependency-free browser entry.
 * The panel is mounted beside the app (document.body), never by replacing app root.
 */

export const inject = ["sessions", "uiWorkspace", "slots"];

const STYLE = `
.dsh-agent-network{--an-bg:#0f172a;--an-bg-soft:#020617;--an-fg:#e2e8f0;--an-fg-dim:#94a3b8;--an-line:#334155;--an-line-soft:#1e293b;--an-accent:#38bdf8;--an-accent-fg:#082f49;--an-shadow:#02061766;color-scheme:dark}
@media (prefers-color-scheme:light){.dsh-agent-network{--an-bg:#ffffff;--an-bg-soft:#f8fafc;--an-fg:#0f172a;--an-fg-dim:#64748b;--an-line:#cbd5e1;--an-line-soft:#e2e8f0;--an-accent:#0284c7;--an-accent-fg:#f8fafc;--an-shadow:#0f172a1f;color-scheme:light}}
.dsh-agent-network-toggle{position:fixed;right:16px;bottom:16px;z-index:2147483000;border:1px solid var(--an-line);border-radius:999px;background:var(--an-bg);color:var(--an-fg);padding:10px 14px;font:600 13px system-ui,sans-serif;box-shadow:0 8px 24px var(--an-shadow);cursor:pointer}
.dsh-agent-network-panel{position:fixed;right:16px;bottom:64px;z-index:2147483000;width:min(380px,calc(100vw - 32px));max-height:min(600px,calc(100vh - 96px));overflow:auto;box-sizing:border-box;border:1px solid var(--an-line);border-radius:16px;background:var(--an-bg);color:var(--an-fg);padding:16px;font:14px system-ui,sans-serif;box-shadow:0 20px 50px var(--an-shadow);backdrop-filter:blur(12px)}
.dsh-agent-network-panel[hidden]{display:none}.dsh-agent-network-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:14px}.dsh-agent-network-head h2{font-size:16px;margin:0}.dsh-agent-network-close{border:0;background:transparent;color:var(--an-fg-dim);font-size:20px;cursor:pointer}.dsh-agent-network-list{display:grid;gap:8px;margin:0 0 14px;padding:0;list-style:none}.dsh-agent-network-agent{display:flex;align-items:center;gap:9px;border:1px solid var(--an-line-soft);border-radius:10px;padding:9px}.dsh-agent-network-dot{width:8px;height:8px;border-radius:50%;background:#64748b;flex:none}.dsh-agent-network-dot.online{background:#34d399;box-shadow:0 0 0 3px #34d39922}.dsh-agent-network-name{font-weight:600}.dsh-agent-network-status{margin-left:auto;color:var(--an-fg-dim);font-size:12px}.dsh-agent-network-form{display:grid;gap:8px}.dsh-agent-network-form label{font-size:12px;color:var(--an-fg-dim)}.dsh-agent-network-form input,.dsh-agent-network-form textarea,.dsh-agent-network-pairing input,.dsh-agent-network-pairing select{width:100%;box-sizing:border-box;border:1px solid var(--an-line);border-radius:8px;background:var(--an-bg-soft);color:var(--an-fg);padding:9px;font:inherit}.dsh-agent-network-form textarea{min-height:68px;resize:vertical}.dsh-agent-network-actions{display:flex;gap:8px}.dsh-agent-network-actions button{border:0;border-radius:8px;background:var(--an-accent);color:var(--an-accent-fg);padding:9px 11px;font-weight:700;cursor:pointer}.dsh-agent-network-actions button.secondary{background:var(--an-line-soft);color:var(--an-fg)}.dsh-agent-network-note{color:var(--an-fg-dim);font-size:12px;min-height:18px;margin:2px 0 0}.dsh-agent-network-result{white-space:pre-wrap;max-height:140px;overflow:auto;color:var(--an-fg-dim);font-size:12px;margin:0}
@media (prefers-reduced-motion:reduce){.dsh-agent-network-panel{scroll-behavior:auto}}
`;

const PAIRING_STORAGE_KEY = "dsh-agent-network:pairing";
const DEFAULT_CONNECTOR_PORT = 8787;
// The protocol stores one of five fixed windows; the panel speaks seconds.
export const DURATION_BY_SECONDS = new Map([[900, "15m"], [3600, "1h"], [28800, "8h"], [86400, "24h"], [604800, "7d"]]);
export const SECONDS_BY_DURATION = new Map([...DURATION_BY_SECONDS].map(([seconds, value]) => [value, seconds]));

/** Read explicit configuration, if any. Discovery is a separate, opt-in step. */
export function readBridgeConfig(ctx = {}) {
  const configured = ctx?.agentNetworkBridge ?? globalThis.__DSH_AGENT_NETWORK_BRIDGE__;
  if (!configured || typeof configured !== "object") return { url: "", protocolVersion: "", configured: false };
  const url = typeof configured.url === "string" ? configured.url.trim() : "";
  const protocolVersion = typeof configured.protocolVersion === "string" ? configured.protocolVersion.trim() : "";
  const endpoints = configured.endpoints && typeof configured.endpoints === "object" ? Object.fromEntries(Object.entries(configured.endpoints).filter(([, value]) => typeof value === "string" && value.trim())) : {};
  const request = typeof configured.request === "function" ? configured.request : undefined;
  const timeoutMs = Number.isFinite(Number(configured.timeoutMs)) && Number(configured.timeoutMs) > 0 ? Number(configured.timeoutMs) : 10000;
  const token = typeof configured.token === "string" ? configured.token.trim() : "";
  const connectorEndpoint = typeof configured.connectorEndpoint === "string" && configured.connectorEndpoint.trim() ? configured.connectorEndpoint.trim() : "/api/agent-network/v1/local";
  const transport = configured.transport === "local" ? "local" : "http";
  const configuredResult = transport === "local"
    ? Boolean(url && token && protocolVersion)
    : Boolean(protocolVersion && (url || request));
  return { url, protocolVersion, endpoints, request, timeoutMs, token, connectorEndpoint, transport, configured: configuredResult };
}

/** Discovery candidates: an explicit URL, otherwise this plugin's own default loopback port. */
export function connectorCandidates(ctx = {}) {
  const explicit = ctx?.agentNetworkBridge?.discoverUrl ?? globalThis.__DSH_AGENT_NETWORK_BRIDGE__?.discoverUrl;
  if (typeof explicit === "string" && explicit.trim()) return [explicit.trim()];
  const port = Number(globalThis.__DSH_AGENT_NETWORK_PORT__) || DEFAULT_CONNECTOR_PORT;
  return [`http://127.0.0.1:${port}/api/agent-network/v1/bridge-config`];
}

/**
 * Ask a local Host for its loopback connector. The Host answers only to loopback
 * origins, so a remote page can never read the connector token.
 */
export async function discoverBridge(ctx = {}, { timeoutMs = 1500, fetchImpl } = {}) {
  const doFetch = fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== "function") return readBridgeConfig(ctx);
  for (const url of connectorCandidates(ctx)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await doFetch(url, { headers: { accept: "application/json" }, signal: controller.signal });
      if (!response.ok) continue;
      const body = await response.json();
      const connector = body?.connector;
      if (!connector || typeof connector.url !== "string" || typeof connector.token !== "string" || !connector.token) continue;
      return {
        url: connector.url.trim(),
        protocolVersion: typeof body.protocol === "string" && body.protocol ? body.protocol : "dan/0.1",
        transport: "local",
        token: connector.token,
        connectorEndpoint: typeof connector.endpoint === "string" && connector.endpoint ? connector.endpoint : "/api/agent-network/v1/local",
        discoverUrl: url,
        endpoints: {},
        timeoutMs: 10000,
        configured: true
      };
    } catch { /* try the next candidate */ } finally { clearTimeout(timer); }
  }
  return readBridgeConfig(ctx);
}

function bridgeStatus(config) {
  if (!config.configured) return "Host bridge not configured (URL + protocol version required).";
  if (config.transport === "local") return `Connected to local Host connector: ${config.url}`;
  const count = Object.keys(config.endpoints).length;
  return count ? `Host bridge configured: ${config.url || "request callback"} · protocol ${config.protocolVersion}` : "Bridge configured via callback; endpoint paths are delegated.";
}

function envelopeError(body) {
  return body?.error ?? body?.response?.error ?? body?.body?.error;
}

/** Transport uses only explicit endpoint paths; no port or protocol path is inferred. */
export async function bridgeCall(config, operation, payload) {
  const endpoint = config.transport === "local" ? config.connectorEndpoint : config.endpoints[operation];
  if (!config.configured || (!endpoint && typeof config.request !== "function")) throw new Error(`Bridge operation “${operation}” is not configured.`);
  if (typeof config.request === "function") {
    const body = await config.request({ operation, endpoint, payload, protocolVersion: config.protocolVersion });
    const detail = envelopeError(body);
    if (body?.ok === false || body?.response?.ok === false || detail) { const info = detail ?? body; const error = new Error(info.message ?? `Bridge ${operation} failed.`); error.code = info.code ?? body.error_code ?? "BRIDGE_ERROR"; error.body = body; throw error; }
    return body;
  }
  const url = new URL(endpoint, config.url).toString();
  const local = config.transport === "local";
  const method = local ? "POST" : operation === "health" || operation === "discover" ? "GET" : "POST";
  const headers = { "content-type": "application/json", "x-dsh-protocol-version": config.protocolVersion };
  if (local) headers["x-agent-network-token"] = config.token;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(config.timeoutMs) > 0 ? Number(config.timeoutMs) : 10000);
  const bodyText = local ? JSON.stringify({ operation, payload: payload ?? {} }) : JSON.stringify(payload ?? {});
  let response;
  try { response = await fetch(url, { method, headers, body: method === "GET" ? undefined : bodyText, signal: controller.signal }); } catch (cause) { const error = new Error(cause?.name === "AbortError" ? "Bridge request timed out." : (cause?.message ?? "Bridge request failed.")); error.code = cause?.name === "AbortError" ? "BRIDGE_TIMEOUT" : "BRIDGE_NETWORK_ERROR"; error.cause = cause; throw error; } finally { clearTimeout(timeout); }
  const body = await response.json().catch(() => ({}));
  const detail = envelopeError(body);
  if (!response.ok || body?.ok === false || body?.response?.ok === false || detail) { const info = detail ?? body; const error = new Error(info?.message ?? `Bridge ${operation} failed (${response.status}).`); error.code = info?.code ?? body?.error_code ?? `HTTP_${response.status}`; error.body = body; throw error; }
  return body;
}

export function buildTaskPayload({ target = "", text = "" } = {}) {
  const id = globalThis.crypto?.randomUUID?.() ?? `dsh-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const idempotencyKey = globalThis.crypto?.randomUUID?.() ?? `dsh-key-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { task_id: id, objective: text, input: text, target, assignee: target, title: text, description: text, message: text, idempotency_key: idempotencyKey, deadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(), required_capabilities: [], write_scopes: [] };
}

export function unwrapTaskResult(response) {
  return response?.result && typeof response.result === "object" ? response.result : response;
}

export function durationEnum(seconds) {
  return DURATION_BY_SECONDS.get(Number(seconds)) ?? "1h";
}

export function durationSeconds(value) {
  return SECONDS_BY_DURATION.get(value) ?? 3600;
}

export function pairingPayload(operation, values = {}) {
  const idempotency_key = globalThis.crypto?.randomUUID?.() ?? `pair-${Date.now()}`;
  const permissions = values.permissions ?? values.scope_allowlist ?? [];
  const durationSecondsValue = Number(values.duration_seconds ?? values.duration ?? 3600);
  const duration = durationEnum(durationSecondsValue);
  if (operation === "invite.create") return { role: "host", permissions, duration, idempotency_key };
  if (operation === "join.request") return { role: "peer", token: values.token ?? values.invite_code ?? "", idempotency_key };
  if (operation === "approve") return { pairing_id: values.pairing_id, permissions, duration, idempotency_key };
  if (operation === "session.open") return { pairing_id: values.pairing_id, token: values.token ?? values.confirmation_token, idempotency_key };
  return { pairing_id: values.pairing_id, idempotency_key };
}

export function normalizePairingResult(value = {}) {
  const duration = value.duration_seconds ?? (typeof value.duration === "number" ? value.duration : durationSeconds(value.duration));
  const token = value.token ?? value.invite_code ?? value.confirmation_token;
  return { ...value, state: value.state ?? value.status ?? "unknown", status: value.status ?? value.state ?? "unknown", scope_allowlist: value.permissions ?? value.scope_allowlist ?? [], duration_seconds: duration, duration_label: typeof value.duration === "string" ? value.duration : durationEnum(duration), invite_code: value.invite_code ?? token, confirmation_token: value.confirmation_token ?? token };
}

export function assertNoResultError(result) {
  const error = result?.error;
  if (error) throw Object.assign(new Error(error.message ?? "Bridge result failed."), { code: error.code ?? error.error_code ?? "BRIDGE_RESULT_ERROR" });
  return result;
}

export function formatBridgeError(error) {
  const code = error?.code ?? error?.error?.code ?? error?.body?.error?.code ?? error?.body?.response?.error?.code ?? error?.error_code ?? "BRIDGE_ERROR";
  const message = error?.message ?? error?.error?.message ?? error?.body?.error?.message ?? error?.body?.response?.error?.message ?? "Unknown bridge error";
  return `${code}: ${message}`;
}

function readAgents(ctx) {
  const result = [];
  const snapshots = ctx?.sessions?.list?.getSnapshot?.();
  const byId = snapshots?.byId;
  if (byId && typeof byId === "object") {
    for (const [id, session] of Object.entries(byId)) {
      const projection = session?.projectionValues ?? session?.values ?? {};
      const agent = projection.agent ?? projection.subagent ?? {};
      result.push({ id, name: agent.label ?? projection.title ?? id, online: session?.running === true || agent.activity === "running" });
    }
  }
  return result;
}

async function dispatch(ctx, kind, target, text) {
  const candidates = kind === "message"
    ? [ctx?.sessions?.sendMessage, ctx?.sessions?.message, ctx?.sendMessage]
    : [ctx?.sessions?.createTask, ctx?.sessions?.createCollaborativeTask, ctx?.createTask];
  const fn = candidates.find((candidate) => typeof candidate === "function");
  if (!fn) return false;
  try { await fn.call(ctx.sessions ?? ctx, { target, message: text, title: text, kind }); return true; } catch { return false; }
}

function mount(ctx) {
  if (typeof document === "undefined" || document.getElementById("dsh-agent-network-panel")) return;
  const style = document.createElement("style");
  style.dataset.dshAgentNetwork = "true";
  style.textContent = STYLE;
  document.head.appendChild(style);

  const toggle = document.createElement("button");
  toggle.className = "dsh-agent-network-toggle";
  toggle.type = "button";
  toggle.textContent = "Agents";
  toggle.setAttribute("aria-controls", "dsh-agent-network-panel");
  toggle.setAttribute("aria-expanded", "false");

  const panel = document.createElement("aside");
  panel.className = "dsh-agent-network-panel";
  panel.id = "dsh-agent-network-panel";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Agent network");
  panel.innerHTML = `<div class="dsh-agent-network-head"><h2>Agent network</h2><button class="dsh-agent-network-close" type="button" aria-label="Close">×</button></div><section class="dsh-agent-network-pairing" aria-labelledby="pairing-title"><h3 id="pairing-title">Pair a user</h3><div class="dsh-agent-network-actions"><button type="button" data-pair="invite.create">Create invite</button><button type="button" data-pair="join.request" class="secondary">Join</button></div><input name="pairInvite" placeholder="Invite code" aria-label="Invite code"><input name="pairScopes" placeholder="Scopes (comma separated)" aria-label="Permission scopes"><select name="pairDuration" aria-label="Duration"><option value="900">15 minutes</option><option value="3600" selected>1 hour</option><option value="28800">8 hours</option><option value="86400">24 hours</option><option value="604800">7 days</option></select><div class="dsh-agent-network-actions"><button type="button" data-pair="approve" class="secondary">Approve</button><button type="button" data-pair="session.open" class="secondary">Confirm connection</button><button type="button" data-pair="revoke" class="secondary">Revoke</button><button type="button" data-pair="status" class="secondary">Refresh</button></div><p class="dsh-agent-network-pair-status" role="status">idle</p><p class="dsh-agent-network-pair-code"></p></section><div class="dsh-agent-network-actions"><button type="button" data-bridge="health">Connect / health</button><button type="button" class="secondary" data-bridge="discover">Discover</button></div><ul class="dsh-agent-network-list"></ul><form class="dsh-agent-network-form"><label for="dsh-agent-target">Target agent</label><input id="dsh-agent-target" name="target" placeholder="agent id or name"><label for="dsh-agent-text">Message or task</label><textarea id="dsh-agent-text" name="text" required placeholder="Describe the work…"></textarea><div class="dsh-agent-network-actions"><button type="submit" data-kind="message">Send message</button><button type="submit" class="secondary" data-kind="task">Create task</button></div><p class="dsh-agent-network-note" role="status"></p><pre class="dsh-agent-network-result" aria-live="polite"></pre><label for="dsh-agent-task-id">Task ID</label><input id="dsh-agent-task-id" name="taskId" placeholder="Returned task id"><div class="dsh-agent-network-actions"><button type="button" data-task="status" class="secondary">Refresh status/result</button><button type="button" data-task="cancel" class="secondary">Cancel task</button></div></form>`;
  document.body.append(toggle, panel);

  const list = panel.querySelector(".dsh-agent-network-list");
  let bridge = readBridgeConfig(ctx);
  const initialNote = panel.querySelector(".dsh-agent-network-note");
  initialNote.textContent = bridgeStatus(bridge);
  const agents = readAgents(ctx);
  if (!agents.length) {
    const empty = document.createElement("li");
    empty.className = "dsh-agent-network-note";
    empty.textContent = "No agent roster is exposed by this DSH build.";
    list.appendChild(empty);
  } else for (const agent of agents) {
    const row = document.createElement("li"); row.className = "dsh-agent-network-agent";
    row.innerHTML = `<span class="dsh-agent-network-dot ${agent.online ? "online" : ""}" aria-hidden="true"></span><span class="dsh-agent-network-name"></span><span class="dsh-agent-network-status"></span>`;
    row.querySelector(".dsh-agent-network-name").textContent = agent.name;
    row.querySelector(".dsh-agent-network-status").textContent = agent.online ? "online" : "offline";
    list.appendChild(row);
  }
  const setOpen = (open) => { panel.hidden = !open; toggle.setAttribute("aria-expanded", String(open)); if (open) panel.querySelector("input")?.focus(); };
  toggle.addEventListener("click", () => setOpen(panel.hidden));
  const note = panel.querySelector(".dsh-agent-network-note");
  const taskId = () => panel.querySelector("[name=taskId]").value.trim();
  const resultBox = panel.querySelector(".dsh-agent-network-result");
  const showResult = (value) => { let text; try { text = typeof value === "string" ? value : JSON.stringify(value, null, 2); } catch { text = "[Unserializable result]"; } resultBox.textContent = text.length > 4000 ? `${text.slice(0, 4000)}…` : text; };
  const pairStatus = panel.querySelector(".dsh-agent-network-pair-status");
  const pairCode = panel.querySelector(".dsh-agent-network-pair-code");

  // Pairing must survive a page reload: the invite/join half of the flow lives on
  // a different screen for the other person, and losing the id breaks it silently.
  const TERMINAL_STATES = new Set(["revoked", "rejected", "expired"]);
  const pairingStore = {
    read() { try { return JSON.parse(globalThis.localStorage?.getItem(PAIRING_STORAGE_KEY) || "null"); } catch { return null; } },
    write(value) { try { if (value) globalThis.localStorage?.setItem(PAIRING_STORAGE_KEY, JSON.stringify(value)); else globalThis.localStorage?.removeItem(PAIRING_STORAGE_KEY); } catch { /* storage may be blocked */ } }
  };
  const restored = pairingStore.read();
  let pairingId = typeof restored?.pairing_id === "string" ? restored.pairing_id : "";
  let pairingState = typeof restored?.state === "string" ? restored.state : "";
  let pairingExpiresAt = typeof restored?.expires_at === "string" ? Date.parse(restored.expires_at) || 0 : 0;
  let pairingTimer;
  const paintPair = () => {
    const parts = [pairingState || "idle"];
    if (pairingExpiresAt) {
      const remaining = Math.max(0, Math.round((pairingExpiresAt - Date.now()) / 1000));
      parts.push(remaining > 0 ? `${Math.floor(remaining / 60)}m ${String(remaining % 60).padStart(2, "0")}s left` : "expired");
    }
    pairStatus.textContent = parts.join(" · ");
  };
  const stopPairPoll = () => { if (pairingTimer) { clearInterval(pairingTimer); pairingTimer = undefined; } };
  const startPairPoll = () => { if (pairingTimer || !pairingId) return; pairingTimer = setInterval(() => { refreshPair(); }, 5000); };
  const countdown = setInterval(paintPair, 1000);
  const closePanel = () => { stopPairPoll(); clearInterval(countdown); setOpen(false); };
  panel.querySelector(".dsh-agent-network-close").addEventListener("click", closePanel);
  paintPair();
  const pairPayload = (op) => pairingPayload(op, { pairing_id: pairingId || undefined, invite_code: panel.querySelector("[name=pairInvite]").value.trim(), permissions: panel.querySelector("[name=pairScopes]").value.split(",").map((v) => v.trim()).filter(Boolean), duration: Number(panel.querySelector("[name=pairDuration]").value) });
  const renderPair = (data) => {
    const value = normalizePairingResult(unwrapTaskResult(data));
    assertNoResultError(value);
    if (value?.pairing_id) pairingId = value.pairing_id;
    if (value?.state) pairingState = value.state;
    if (value?.expires_at) pairingExpiresAt = Date.parse(value.expires_at) || pairingExpiresAt;
    paintPair();
    if (value?.invite_code) { pairCode.textContent = `Invite: ${value.invite_code}`; globalThis.navigator?.clipboard?.writeText(value.invite_code).catch(() => {}); }
    if (TERMINAL_STATES.has(pairingState)) { stopPairPoll(); pairingStore.write(null); }
    else if (pairingId) pairingStore.write({ pairing_id: pairingId, state: pairingState, expires_at: value?.expires_at });
    showResult(value);
    return value;
  };
  const refreshPair = async () => {
    if (!pairingId) return;
    try { renderPair(await bridgeCall(bridge, "status", { pairing_id: pairingId })); }
    catch (error) { pairStatus.textContent = formatBridgeError(error); if (error.code === "PAIRING_NOT_FOUND" || error.code === "pairing_not_found") { stopPairPoll(); pairingStore.write(null); } }
  };
  panel.querySelectorAll("[data-pair]").forEach((button) => button.addEventListener("click", async () => {
    const op = button.dataset.pair;
    try {
      const value = renderPair(await bridgeCall(bridge, op, pairPayload(op)));
      if (op === "invite.create" && value?.invite_code) pairCode.textContent = `Invite: ${value.invite_code} (copied if permitted)`;
      if (pairingId && !TERMINAL_STATES.has(pairingState)) startPairPoll();
    } catch (error) { pairStatus.textContent = `Next step: ${formatBridgeError(error)}`; }
  }));
  panel.querySelectorAll("[data-bridge]").forEach((button) => button.addEventListener("click", async () => {
    try { const result = await bridgeCall(bridge, button.dataset.bridge, {}); if (button.dataset.bridge === "discover" && Array.isArray(result?.agents)) { list.replaceChildren(...result.agents.map((agent) => { const row = document.createElement("li"); row.className = "dsh-agent-network-agent"; row.textContent = `${agent.name ?? agent.id ?? "agent"} · ${agent.online ? "online" : "offline"}`; return row; })); } note.textContent = `${button.dataset.bridge} OK${result?.status ? `: ${result.status}` : ""}`; }
    catch (error) { note.textContent = `Bridge error: ${formatBridgeError(error)}`; }
  }));
  panel.querySelectorAll("[data-task]").forEach((button) => button.addEventListener("click", async () => {
    if (!taskId()) { note.textContent = "Enter a task ID first."; return; }
    try { const result = unwrapTaskResult(await bridgeCall(bridge, button.dataset.task, { task_id: taskId(), taskId: taskId() })); assertNoResultError(result); note.textContent = `${button.dataset.task}: ${result?.status ?? "OK"}${result?.error_code ? ` (${result.error_code})` : ""}`; showResult({ status: result?.status, lease: result?.lease ?? result?.lease_id, result_hash: result?.result_hash, error_code: result?.error_code, result: result?.result }); }
    catch (error) { note.textContent = `Task ${button.dataset.task} error: ${formatBridgeError(error)}`; }
  }));
  panel.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget; const target = form.target.value.trim(); const text = form.text.value.trim();
    const kind = event.submitter?.dataset.kind ?? "message";
    if (!text) return;
    const bridgeOperation = kind === "task" ? "submit" : "message";
    const useBridge = bridge.configured && (bridge.transport === "local" || bridge.endpoints[bridgeOperation] || bridge.request);
    if (useBridge) {
      try {
        const payload = kind === "task" ? buildTaskPayload({ target, text }) : { target, recipient: target, message: text };
        const result = await bridgeCall(bridge, bridgeOperation, payload);
        const taskResult = kind === "task" ? unwrapTaskResult(result) : result;
        assertNoResultError(taskResult);
        if (kind === "task" && !(taskResult?.task_id || taskResult?.taskId)) throw new Error("Task submit response missing task_id.");
        if (kind === "task") form.taskId.value = taskResult.task_id ?? taskResult.taskId;
        note.textContent = kind === "task" ? `Task accepted: ${taskResult.task_id ?? taskResult.taskId}.` : "Message sent.";
        showResult(taskResult); form.text.value = ""; return;
      } catch (error) { note.textContent = `Bridge ${bridgeOperation} error: ${formatBridgeError(error)}`; return; }
    }
    const sent = await dispatch(ctx, kind, target, text);
    if (sent) { note.textContent = `${kind === "task" ? "Task" : "Message"} sent.`; form.text.value = ""; return; }
    note.textContent = "No message transport configured; attempting clipboard copy.";
    try { await globalThis.navigator?.clipboard?.writeText(text); note.textContent = "No transport; message copied to clipboard."; } catch { note.textContent = "No transport and clipboard copy failed."; }
    form.text.value = "";
  });

  // Zero-config path: when no bridge is configured by hand, ask the local Host
  // for its loopback connector. Failure keeps the panel in its unconfigured state.
  if (!bridge.configured) {
    discoverBridge(ctx).then((discovered) => {
      if (!discovered.configured || discovered.transport !== "local") return;
      bridge = discovered;
      note.textContent = bridgeStatus(bridge);
      if (pairingId) { paintPair(); refreshPair(); startPairPoll(); }
    }).catch(() => {});
  } else if (pairingId) {
    paintPair(); refreshPair(); startPairPoll();
  }
}

export function apply(ctx = {}) { mount(ctx); }
export default { apply, inject };
