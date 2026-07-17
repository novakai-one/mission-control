/** Map provider model IDs back to a registry option. Kept separate from the
 * control receipt: only transcript telemetry may claim a model is applied. */
export function appliedModelOption(
  model: string | null | undefined,
  options: { id: string }[],
): string {
  if (!model) return '';
  const normalized = model.toLowerCase();
  return options.find(({ id }) => (
    normalized === id || normalized.startsWith(`claude-${id}-`)
  ))?.id ?? '';
}
