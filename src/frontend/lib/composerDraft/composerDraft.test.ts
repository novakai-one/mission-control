import assert from 'node:assert/strict';
import { clearDraft, loadDraft, saveDraft } from './index.js';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const storage = new MemoryStorage();
const longDraft = 'A long product message '.repeat(80);

saveDraft('room_alpha', longDraft, storage);
assert.equal(loadDraft('room_alpha', storage), longDraft, 'a remounted composer restores the exact draft');
assert.equal(loadDraft('room_beta', storage), '', 'drafts never leak between conversations');
clearDraft('room_alpha', storage);
assert.equal(loadDraft('room_alpha', storage), '', 'a successfully sent draft is removed');

console.log('PASS');
