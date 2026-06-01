const REQUIRED_TAG_PREFIXES = ['--', '\u2014'] as const;

export function parseRequiredTagToken(value: string) {
  const prefix = getRequiredTagPrefix(value);
  if (!prefix) return null;

  const tag = value.slice(prefix.length);
  return tag ? tag : null;
}

export function stripOptionalRequiredTagPrefix(value: string) {
  const prefix = getRequiredTagPrefix(value);
  return prefix ? value.slice(prefix.length) : value;
}

function getRequiredTagPrefix(value: string) {
  return REQUIRED_TAG_PREFIXES.find((prefix) => value.startsWith(prefix));
}
