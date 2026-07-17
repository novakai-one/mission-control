/** Reaps a detached host only when its true desktop owner exits. */
export function watchDesktopOwner(
  ownerPid: number | undefined,
  onOwnerExit: () => void,
  intervalMs = 1_000,
  isAlive: (processId: number) => boolean = processIsAlive,
): () => void {
  if (!ownerPid || !Number.isSafeInteger(ownerPid) || ownerPid <= 0) return () => {};
  const timer = setInterval(() => {
    if (isAlive(ownerPid)) return;
    clearInterval(timer);
    onOwnerExit();
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

function processIsAlive(processId: number): boolean {
  try {
    process.kill(processId, 0);
    return true;
  } catch {
    return false;
  }
}
