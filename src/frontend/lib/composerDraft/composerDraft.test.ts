import assert from 'node:assert/strict';
import { clearDraft, loadDraft, saveDraft } from './index.js';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(storageKey: string): string | null {
    return this.values.get(storageKey) ?? null;
  }

  setItem(storageKey: string, value: string): void {
    this.values.set(storageKey, value);
  }

  removeItem(storageKey: string): void {
    this.values.delete(storageKey);
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
