const DRAFT_PREFIX = 'novakai.composerDraft.';

interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStorage(): DraftStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function keyFor(conversationId: string): string {
  return `${DRAFT_PREFIX}${encodeURIComponent(conversationId)}`;
}

export function loadDraft(
  conversationId: string,
  storage: DraftStorage | null = browserStorage(),
): string {
  if (!storage) return '';
  try {
    return storage.getItem(keyFor(conversationId)) ?? '';
  } catch {
    return '';
  }
}

export function saveDraft(
  conversationId: string,
  draft: string,
  storage: DraftStorage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    if (draft === '') storage.removeItem(keyFor(conversationId));
    else storage.setItem(keyFor(conversationId), draft);
  } catch {
    // A draft remains usable in-memory when storage is unavailable.
  }
}

export function clearDraft(
  conversationId: string,
  storage: DraftStorage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(keyFor(conversationId));
  } catch {
    // A successful send must not fail because storage cleanup was denied.
  }
}
