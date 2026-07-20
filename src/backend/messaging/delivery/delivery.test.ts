// PTY delivery unit tests (agent-messaging phases 2–3). Run with
// `npx tsx src/backend/messaging/delivery/delivery.test.ts`.
import assert from 'node:assert/strict';
import { PtyDelivery, DeliveryFailedError } from './index.js';
import type { AgentAddress, MessageEnvelope } from '../types.js';

const FAST = { interruptSettleMs: 0, submitDelayMs: 0 };
const address: AgentAddress = { agentId: 'agent_1', name: 'codex-1', provider: 'codex' };

function envelope(overrides: Partial<MessageEnvelope> = {}): MessageEnvelope {
  return {
    id: 'msg_1', from: 'claude-1', 'to': 'codex-1', delivery: 'normal',
    body: 'rebase onto main', createdAt: '2026-07-17T00:00:00.000Z', status: 'queued',
    ...overrides,
  };
}

interface RecordingWriter {
  writes: Array<{ agentId: string; data: string }>;
  write: (agentId: string, data: string) => boolean;
}

function recordingWriter(): RecordingWriter {
  const writes: Array<{ agentId: string; data: string }> = [];
  const write = (agentId: string, data: string): boolean => {
    writes.push({ agentId, data });
    return true;
  };
  return { writes, write };
}

async function testNormalTypesInboundFormatThenSubmits(): Promise<void> {
  const writer = recordingWriter();
  const receipt = await new PtyDelivery(writer, FAST).deliver(address, envelope());
  assert.deepEqual(writer.writes.map((entry) => entry.data), [
    '[nvk-msg from claude-1 id msg_1] rebase onto main',
    '\r',
  ], 'normal delivery types the bracketed inbound line, then submits');
  assert.equal(writer.writes[0]?.agentId, 'agent_1', 'delivery targets the resolved agentId');
  assert.equal(receipt.messageId, 'msg_1');
  assert.equal(receipt.mode, 'normal');
}

async function testInterruptSendsEscapeFirst(): Promise<void> {
  const writer = recordingWriter();
  const receipt = await new PtyDelivery(writer, FAST).deliver(address, envelope({ delivery: 'interrupt' }));
  assert.equal(writer.writes[0]?.data, '\x1b', 'interrupt breaks the turn with Esc before typing');
  assert.equal(writer.writes[1]?.data, '[nvk-msg from claude-1 id msg_1] rebase onto main');
  assert.equal(writer.writes[2]?.data, '\r');
  assert.equal(receipt.mode, 'interrupt');
}

async function testNewlinesNeverSubmitEarly(): Promise<void> {
  const writer = recordingWriter();
  await new PtyDelivery(writer, FAST).deliver(address, envelope({ body: 'line one\nline two\r\nline three' }));
  const typed = writer.writes[0]?.data ?? '';
  assert.ok(!/[\r\n]/.test(typed), 'typed line must contain no raw newlines');
  assert.ok(typed.includes('line one\\nline two\\nline three'), 'newlines become literal \\n');
}

async function testDeadPtyThrows(): Promise<void> {
  const delivery = new PtyDelivery({ write: () => false }, FAST);
  await assert.rejects(() => delivery.deliver(address, envelope()), DeliveryFailedError);
}

const kimiAddress: AgentAddress = { agentId: 'agent_k', name: 'kimi-1', provider: 'kimi' };
const FLUSHY = { interruptSettleMs: 0, submitDelayMs: 0, flushDelayMs: 30 };

async function testKimiGetsOneFlush(): Promise<void> {
  const writer = recordingWriter();
  await new PtyDelivery(writer, FLUSHY).deliver(kimiAddress, envelope({ to: 'kimi-1' }));
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.deepEqual(writer.writes.map((entry) => entry.data), [
    '[nvk-msg from claude-1 id msg_1] rebase onto main',
    '\r',
    '\r',
  ], 'kimi delivery ends with a settle-\\r plus exactly one flush-\\r');
}

async function testCodexGetsNoFlush(): Promise<void> {
  const writer = recordingWriter();
  await new PtyDelivery(writer, FLUSHY).deliver(address, envelope());
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.deepEqual(writer.writes.map((entry) => entry.data), [
    '[nvk-msg from claude-1 id msg_1] rebase onto main',
    '\r',
  ], 'flush is kimi-gated — other providers keep the classic two writes');
}

async function testFlushNeverThrowsOnDeadPty(): Promise<void> {
  let calls = 0;
  const flaky = new PtyDelivery({
    write: () => { calls += 1; return calls <= 2; }, // PTY "dies" before the flush lands
  }, FLUSHY);
  await flaky.deliver(kimiAddress, envelope({ to: 'kimi-1' }));
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(calls, 3, 'flush was attempted');
  // Reaching here means the failed flush did not crash the process.
}

await testNormalTypesInboundFormatThenSubmits();
await testInterruptSendsEscapeFirst();
await testNewlinesNeverSubmitEarly();
await testDeadPtyThrows();
await testKimiGetsOneFlush();
await testCodexGetsNoFlush();
await testFlushNeverThrowsOnDeadPty();
console.log('PASS');
