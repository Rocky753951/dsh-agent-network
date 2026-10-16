/* DSH Agent Network: intentionally dependency-free browser entry.
 * The panel is mounted beside the app (document.body), never by replacing app root.
 */

export const inject = ["sessions", "uiWorkspace", "slots"];

const STYLE = `
.dsh-agent-network-toggle{position:fixed;right:16px;bottom:16px;z-index:2147483000;border:1px solid #334155;border-radius:999px;background:#0f172a;color:#f8fafc;padding:10px 14px;font:600 13px system-ui,sans-serif;box-shadow:0 8px 24px #02061766;cursor:pointer}
.dsh-agent-network-panel{position:fixed;right:16px;bottom:64px;z-index:2147483000;width:min(380px,calc(100vw - 32px));max-height:min(600px,calc(100vh - 96px));overflow:auto;box-sizing:border-box;border:1px solid #334155;border-radius:16px;background:#0f172af5;color:#e2e8f0;padding:16px;font:14px system-ui,sans-serif;box-shadow:0 20px 50px #02061799;backdrop-filter:blur(12px)}
.dsh-agent-network-panel[hidden]{display:none}.dsh-agent-network-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:14px}.dsh-agent-network-head h2{font-size:16px;margin:0}.dsh-agent-network-close{border:0;background:transparent;color:#94a3b8;font-size:20px;cursor:pointer}.dsh-agent-network-list{display:grid;gap:8px;margin:0 0 14px;padding:0;list-style:none}.dsh-agent-network-agent{display:flex;align-items:center;gap:9px;border:1px solid #1e293b;border-radius:10px;padding:9px}.dsh-agent-network-dot{width:8px;height:8px;border-radius:50%;background:#64748b;flex:none}.dsh-agent-network-dot.online{background:#34d399;box-shadow:0 0 0 3px #34d39922}.dsh-agent-network-name{font-weight:600}.dsh-agent-network-status{margin-left:auto;color:#94a3b8;font-size:12px}.dsh-agent-network-form{display:grid;gap:8px}.dsh-agent-network-form label{font-size:12px;color:#94a3b8}.dsh-agent-network-form input,.dsh-agent-network-form textarea,.dsh-agent-network-pairing input,.dsh-agent-network-pairing select{width:100%;box-sizing:border-box;border:1px solid #334155;border-radius:8px;background:#020617;color:#f8fafc;padding:9px;font:inherit}.dsh-agent-network-form textarea{min-height:68px;resize:vertical}.dsh-agent-network-actions{display:flex;gap:8px}.dsh-agent-network-actions button{border:0;border-radius:8px;background:#38bdf8;color:#082f49;padding:9px 11px;font-weight:700;cursor:pointer}.dsh-agent-network-actions button.secondary{background:#1e293b;color:#cbd5e1}.dsh-agent-network-note{color:#94a3b8;font-size:12px;min-height:18px;margin:2px 0 0}.dsh-agent-network-result{white-space:pre-wrap;max-height:140px;overflow:auto;color:#cbd5e1;font-size:12px;margin:0}
@media (prefers-reduced-motion:reduce){.dsh-agent-network-panel{scroll-behavior:auto}}
`;

/** Read only explicit configuration; this plugin never invents a bridge URL/path. */
export function readBridgeConfig(ctx = {}) {
  const configured = ctx?.agentNetworkBridge ?? globalThis.__DSH_AGENT_NETWORK_BRIDGE__;
  if (!configured || typeof configured !== "object") return { url: "", protocolVersion: "", configured: false };
  const url = typeof configured.url === "string" ? configured.url.trim() : "";
  const protocolVersion = typeof configured.protocolVersion === "string" ? configured.protocolVersion.trim() : "";
  const endpoints = configured.endpoints && typeof configured.endpoints === "object" ? Object.fromEntries(Object.entries(configured.endpoints).filter(([, value]) => typeof value === "string" && value.trim())) : {};
  const request = typeof configured.request === "function" ? configured.request : undefined;
  const timeoutMs = Number.isFinite(Number(configured.timeoutMs)) && Number(configured.timeoutMs) > 0 ? Number(configured.timeoutMs) : 10000;
  return { url, protocolVersion, endpoints, request, timeoutMs, configured: Boolean(protocolVersion && (url || request)) };
}

function bridgeStatus(config) {
  if (!config.configured) return "Host bridge not configured (URL + protocol version required).";
  const count = Object.keys(config.endpoints).length;
  return count ? `Host bridge configured: ${config.url || "request callback"} · protocol ${config.protocolVersion}` : "Bridge configured via callback; endpoint paths are delegated.";
}

function envelopeError(body) {
  return body?.error ?? body?.response?.error ?? body?.body?.error;
}

/** Transport uses only explicit endpoint paths; no port or protocol path is inferred. */
export async function bridgeCall(config, operation, payload) {
  const endpoint = config.endpoints[operation];
  if (!config.configured || (!endpoint && typeof config.request !== "function")) throw new Error(`Bridge operation “${operation}” is not configured.`);
  if (typeof config.request === "function") {
    const body = await config.request({ operation, endpoint, payload, protocolVersion: config.protocolVersion });
    const detail = envelopeError(body);
    if (body?.ok === false || body?.response?.ok === false || detail) { const info = detail ?? body; const error = new Error(info.message ?? `Bridge ${operation} failed.`); error.code = info.code ?? body.error_code ?? "BRIDGE_ERROR"; error.body = body; throw error; }
    return body;
  }
  const url = new URL(endpoint, config.url).toString();
  const method = operation === "health" || operation === "discover" ? "GET" : "POST";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(config.timeoutMs) > 0 ? Number(config.timeoutMs) : 10000);
  let response;
  try { response = await fetch(url, { method, headers: { "content-type": "application/json", "x-dsh-protocol-version": config.protocolVersion }, body: method === "GET" ? undefined : JSON.stringify(payload ?? {}), signal: controller.signal }); } catch (cause) { const error = new Error(cause?.name === "AbortError" ? "Bridge request timed out." : (cause?.message ?? "Bridge request failed.")); error.code = cause?.name === "AbortError" ? "BRIDGE_TIMEOUT" : "BRIDGE_NETWORK_ERROR"; error.cause = cause; throw error; } finally { clearTimeout(timeout); }
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
  const value = Number(seconds);
  return value === 1800 ? "30m" : value === 86400 ? "24h" : "1h";
}

export function durationSeconds(value) {
  return value === "30m" ? 1800 : value === "24h" ? 86400 : 3600;
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
  panel.innerHTML = `<div class="dsh-agent-network-head"><h2>Agent network</h2><button class="dsh-agent-network-close" type="button" aria-label="Close">×</button></div><section class="dsh-agent-network-pairing" aria-labelledby="pairing-title"><h3 id="pairing-title">Pair a user</h3><div class="dsh-agent-network-actions"><button type="button" data-pair="invite.create">Create invite</button><button type="button" data-pair="join.request" class="secondary">Join</button></div><input name="pairInvite" placeholder="Invite code" aria-label="Invite code"><input name="pairScopes" placeholder="Scopes (comma separated)" aria-label="Permission scopes"><select name="pairDuration" aria-label="Duration"><option value="1800">30 minutes</option><option value="3600" selected>1 hour</option><option value="86400">24 hours</option></select><div class="dsh-agent-network-actions"><button type="button" data-pair="approve" class="secondary">Approve</button><button type="button" data-pair="session.open" class="secondary">Confirm connection</button><button type="button" data-pair="revoke" class="secondary">Revoke</button><button type="button" data-pair="status" class="secondary">Refresh</button></div><p class="dsh-agent-network-pair-status" role="status">idle</p><p class="dsh-agent-network-pair-code"></p></section><div class="dsh-agent-network-actions"><button type="button" data-bridge="health">Connect / health</button><button type="button" class="secondary" data-bridge="discover">Discover</button></div><ul class="dsh-agent-network-list"></ul><form class="dsh-agent-network-form"><label for="dsh-agent-target">Target agent</label><input id="dsh-agent-target" name="target" placeholder="agent id or name"><label for="dsh-agent-text">Message or task</label><textarea id="dsh-agent-text" name="text" required placeholder="Describe the work…"></textarea><div class="dsh-agent-network-actions"><button type="submit" data-kind="message">Send message</button><button type="submit" class="secondary" data-kind="task">Create task</button></div><p class="dsh-agent-network-note" role="status"></p><pre class="dsh-agent-network-result" aria-live="polite"></pre><label for="dsh-agent-task-id">Task ID</label><input id="dsh-agent-task-id" name="taskId" placeholder="Returned task id"><div class="dsh-agent-network-actions"><button type="button" data-task="status" class="secondary">Refresh status/result</button><button type="button" data-task="cancel" class="secondary">Cancel task</button></div></form>`;
  document.body.append(toggle, panel);

  const list = panel.querySelector(".dsh-agent-network-list");
  const bridge = readBridgeConfig(ctx);
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
  let pairingId = ""; let pairingTimer;
  panel.querySelector(".dsh-agent-network-close").addEventListener("click", () => { clearInterval(pairingTimer); setOpen(false); });
  const note = panel.querySelector(".dsh-agent-network-note");
  const taskId = () => panel.querySelector("[name=taskId]").value.trim();
  const resultBox = panel.querySelector(".dsh-agent-network-result");
  const requestId = () => globalThis.crypto?.randomUUID?.() ?? `dsh-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const showResult = (value) => { let text; try { text = typeof value === "string" ? value : JSON.stringify(value, null, 2); } catch { text = "[Unserializable result]"; } resultBox.textContent = text.length > 4000 ? `${text.slice(0, 4000)}…` : text; };
  const pairStatus = panel.querySelector(".dsh-agent-network-pair-status");
  const pairCode = panel.querySelector(".dsh-agent-network-pair-code");
  const pairPayload = (op) => pairingPayload(op, { pairing_id: pairingId || undefined, invite_code: panel.querySelector("[name=pairInvite]").value.trim(), permissions: panel.querySelector("[name=pairScopes]").value.split(",").map((v) => v.trim()).filter(Boolean), duration: Number(panel.querySelector("[name=pairDuration]").value) });
  const renderPair = (data) => { const value = normalizePairingResult(unwrapTaskResult(data)); assertNoResultError(value); pairingId = value?.pairing_id ?? pairingId; pairStatus.textContent = `${value?.state ?? "unknown"}${value?.remaining_seconds != null ? ` · ${Math.max(0, value.remaining_seconds)}s remaining` : value?.expires_at ? ` · expires ${value.expires_at}` : ""}`; if (value?.invite_code) { pairCode.textContent = `Invite: ${value.invite_code}`; globalThis.navigator?.clipboard?.writeText(value.invite_code).catch(() => {}); } showResult(value); return value; };
  const refreshPair = async () => { if (!pairingId) return; try { renderPair(await bridgeCall(bridge, "status", { pairing_id: pairingId })); } catch (error) { pairStatus.textContent = formatBridgeError(error); } };
  panel.querySelectorAll("[data-pair]").forEach((button) => button.addEventListener("click", async () => { const op = button.dataset.pair; try { const result = await bridgeCall(bridge, op, pairPayload(op)); const value = renderPair(result); if (op === "invite.create" && value?.invite_code) pairCode.textContent = `Invite: ${value.invite_code} (copied if permitted)`; if (op === "status" || op === "session.open") { clearInterval(pairingTimer); pairingTimer = setInterval(refreshPair, 10000); } } catch (error) { pairStatus.textContent = `Next step: ${formatBridgeError(error)}`; } }));
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
    const useBridge = bridge.configured && (bridge.endpoints[bridgeOperation] || bridge.request);
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
}

export function apply(ctx = {}) { mount(ctx); }
export default { apply, inject };
