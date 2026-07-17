import assert from 'node:assert/strict';
import { watchDesktopOwner } from '../../owner/index.js';

async function testDesktopLeaseReapsOrphans(): Promise<void> {
  let alive = true;
  let exits = 0;
  const stop = watchDesktopOwner(123, () => { exits += 1; }, 2, () => alive);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(exits, 0, 'host survives while the desktop lease owner lives');
  alive = false;
  await new Promise((resolve) => setTimeout(resolve, 8));
  assert.equal(exits, 1, 'host stops exactly once after the desktop exits');
  stop();
}

await testDesktopLeaseReapsOrphans();
console.log('PASS');
