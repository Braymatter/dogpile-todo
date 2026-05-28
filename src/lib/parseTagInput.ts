export function parseTagInput(value: string, options: { allowExcludedTags?: boolean } = {}) {
  const textParts: string[] = [];
  const tags: string[] = [];
  const excludedTags: string[] = [];

  for (const part of value.trim().split(/\s+/).filter(Boolean)) {
    if (part.startsWith('--') && part.length > 2) {
      tags.push(part.slice(2));
    } else if (options.allowExcludedTags && part.startsWith('!') && part.length > 1) {
      excludedTags.push(part.slice(1));
    } else {
      textParts.push(part);
    }
  }

  return {
    text: textParts.join(' ').trim(),
    tags: uniqueTags(tags),
    excludedTags: uniqueTags(excludedTags)
  };
}

function uniqueTags(tags: string[]) {
  const seenTags = new Set<string>();
  const uniqueTags: string[] = [];

  for (const tag of tags) {
    const normalizedTag = tag.trim();
    const key = normalizedTag.toLowerCase();

    if (!normalizedTag || seenTags.has(key)) continue;

    seenTags.add(key);
    uniqueTags.push(normalizedTag);
  }

  return uniqueTags;
}
