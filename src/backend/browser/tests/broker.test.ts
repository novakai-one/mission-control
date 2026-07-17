// SessionBroker orchestration tests. Run with
// `npx tsx src/backend/browser/tests/broker.test.ts`.
// NEVER launches real Chrome — a FakeProvider stands in for ChromePool.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionBroker, type BrowserProvider } from '../broker.js';
import type { BrowserInstance, LaunchSpec } from '../types.js';

class FakeProvider implements BrowserProvider {
  launches = 0;
  disposed: number[] = [];
  private nextPort = 9300;
  async launch(_spec: LaunchSpec): Promise<BrowserInstance> {
    this.launches += 1;
    const port = this.nextPort++;
    return { pid: 1000 + port, port, userDataDir: `/tmp/udd-${port}`, cdpEndpoint: `http://127.0.0.1:${port}` };
  }
  async dispose(instance: BrowserInstance): Promise<void> {
    this.disposed.push(instance.pid);
  }
}

function registryPath(): string {
  return join(mkdtempSync(join(tmpdir(), 'mc-browser-')), 'sessions.json');
}

function fixedClock(iso: string): () => Date {
  return () => new Date(iso);
}

async function testGetOrCreateReuses(): Promise<void> {
  const provider = new FakeProvider();
  const broker = new SessionBroker({ provider, registryPath: registryPath(), now: fixedClock('2026-07-17T00:00:00Z'), isAlive: () => true });
  const first = await broker.acquire('s1', 'a1');
  const second = await broker.acquire('s1', 'a1');
  assert.equal(provider.launches, 1, 'second acquire of same id reuses the instance');
  assert.equal(first.cdpEndpoint, second.cdpEndpoint, 'same endpoint returned');
}

async function testDistinctIdsAreIsolated(): Promise<void> {
  const provider = new FakeProvider();
  const broker = new SessionBroker({ provider, registryPath: registryPath(), isAlive: () => true });
  const a = await broker.acquire('alpha', 'a1');
  const b = await broker.acquire('bravo', 'a2');
  assert.equal(provider.launches, 2, 'each id gets its own instance');
  assert.notEqual(a.cdpEndpoint, b.cdpEndpoint, 'distinct endpoints');
}

async function testReconnectAcrossProcesses(): Promise<void> {
  const path = registryPath();
  const provider1 = new FakeProvider();
  const broker1 = new SessionBroker({ provider: provider1, registryPath: path, isAlive: () => true });
  await broker1.acquire('s1', 'a1');
  // A fresh broker over the same registry file (simulating a new CLI process) reuses.
  const provider2 = new FakeProvider();
  const broker2 = new SessionBroker({ provider: provider2, registryPath: path, isAlive: () => true });
  await broker2.acquire('s1', 'a1');
  assert.equal(provider2.launches, 0, 'reconnecting broker reuses the persisted instance');
}

async function testExpiredLeaseRelaunches(): Promise<void> {
  const path = registryPath();
  const provider = new FakeProvider();
  const broker1 = new SessionBroker({ provider, registryPath: path, now: fixedClock('2026-07-17T00:00:00Z'), ttlMs: 1000, isAlive: () => true });
  await broker1.acquire('s1', 'a1');
  // 10s later — well past the 1s TTL.
  const broker2 = new SessionBroker({ provider, registryPath: path, now: fixedClock('2026-07-17T00:00:10Z'), ttlMs: 1000, isAlive: () => true });
  await broker2.acquire('s1', 'a1');
  assert.equal(provider.launches, 2, 'expired lease forces a relaunch');
  assert.equal(provider.disposed.length, 1, 'old instance disposed');
}

async function testDeadInstanceRelaunches(): Promise<void> {
  const path = registryPath();
  const provider = new FakeProvider();
  const broker1 = new SessionBroker({ provider, registryPath: path, isAlive: () => true });
  await broker1.acquire('s1', 'a1');
  const broker2 = new SessionBroker({ provider, registryPath: path, isAlive: () => false });
  await broker2.acquire('s1', 'a1');
  assert.equal(provider.launches, 2, 'dead instance forces a relaunch');
  assert.equal(provider.disposed.length, 1, 'dead instance disposed');
}

async function testReleaseDisposesAndDrops(): Promise<void> {
  const provider = new FakeProvider();
  const broker = new SessionBroker({ provider, registryPath: registryPath(), isAlive: () => true });
  await broker.acquire('s1', 'a1');
  await broker.release('s1');
  assert.equal(provider.disposed.length, 1, 'release disposes the instance');
  assert.equal(broker.list().length, 0, 'released session no longer listed');
}

await testGetOrCreateReuses();
await testDistinctIdsAreIsolated();
await testReconnectAcrossProcesses();
await testExpiredLeaseRelaunches();
await testDeadInstanceRelaunches();
await testReleaseDisposesAndDrops();
console.log('PASS');
