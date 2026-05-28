export function parseEditableTag(value: string) {
  const trimmed = value.trim();
  const tag = trimmed.startsWith('--') ? trimmed.slice(2) : trimmed;

  return tag && !/\s/.test(tag) ? tag : null;
}
