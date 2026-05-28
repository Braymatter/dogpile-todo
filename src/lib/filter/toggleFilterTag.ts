export function toggleFilterTag(filterText: string, tag: string) {
  const normalizedTag = tag.trim();
  if (!normalizedTag || /\s/.test(normalizedTag)) return filterText;

  const tagKey = normalizedTag.toLowerCase();
  const tokens = filterText.trim().split(/\s+/).filter(Boolean);
  const hasRequiredTag = tokens.some((token) => matchesRequiredTag(token, tagKey));
  const nextTokens = tokens.filter((token) => !matchesRequiredTag(token, tagKey) && !matchesExcludedTag(token, tagKey));

  if (!hasRequiredTag) {
    nextTokens.push(`--${normalizedTag}`);
  }

  return nextTokens.join(' ');
}

function matchesRequiredTag(token: string, tagKey: string) {
  return token.startsWith('--') && token.slice(2).toLowerCase() === tagKey;
}

function matchesExcludedTag(token: string, tagKey: string) {
  return token.startsWith('!') && token.slice(1).toLowerCase() === tagKey;
}
