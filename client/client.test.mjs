import assert from 'node:assert/strict';
import { readBridgeConfig, buildTaskPayload, unwrapTaskResult, assertNoResultError, formatBridgeError, bridgeCall } from './client.js';

assert.equal(readBridgeConfig({}).configured, false);
assert.equal(readBridgeConfig({ agentNetworkBridge: { url: 'https://example.test', protocolVersion: 'v1', endpoints: { health: '/health' } } }).configured, true);
assert.equal(readBridgeConfig({ agentNetworkBridge: { protocolVersion: 'v1', timeoutMs: 25, request: async () => ({}) } }).configured, true);
assert.equal(readBridgeConfig({ agentNetworkBridge: { protocolVersion: 'v1', timeoutMs: 25, request: async () => ({}) } }).timeoutMs, 25);
assert.deepEqual(readBridgeConfig({ agentNetworkBridge: { url: 'x', protocolVersion: 'v1', endpoints: { submit: '/submit', bad: 4 } } }).endpoints, { submit: '/submit' });
const task = buildTaskPayload({ target: 'agent-a', text: 'do work' });
for (const key of ['task_id', 'objective', 'input', 'idempotency_key', 'deadline', 'required_capabilities', 'write_scopes']) assert.ok(task[key] !== undefined, key);
assert.equal(unwrapTaskResult({ ok: true, result: { task_id: 'nested-id', status: 'completed' } }).task_id, 'nested-id');
assert.equal(unwrapTaskResult({ ok: true, result: { status: 'cancelled' } }).status, 'cancelled');
assert.throws(() => assertNoResultError(unwrapTaskResult({ ok: true, result: { error: { code: 'TASK_FAILED', message: 'failed' } } })), /failed/);
assert.equal(formatBridgeError({ error: { code: 'LEASE_EXPIRED', message: 'lease expired' } }), 'LEASE_EXPIRED: lease expired');
assert.equal(formatBridgeError({ body: { response: { error: { code: 'NESTED_BAD', message: 'bad' } } } }), 'NESTED_BAD: bad');
assert.notEqual(task.task_id, task.idempotency_key, 'formal ids are independently generated');
await assert.rejects(() => bridgeCall({ configured: true, protocolVersion: 'v1', endpoints: {}, request: async () => ({ response: { ok: false, error: { code: 'NESTED_BAD', message: 'bad' } } }) }, 'status', {}), /bad/);
console.log('bridge configuration tests passed');
