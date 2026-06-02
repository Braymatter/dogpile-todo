const DEFAULT_QUICK_ADD_PLACEHOLDER = 'Task Name --TagA --TagB';

export function getQuickAddPlaceholder(prefilledTags: string[]) {
  const tags = uniqueTags(prefilledTags);

  return tags.length
    ? `Task Name ${tags.map((tag) => `--${tag}`).join(' ')}`
    : DEFAULT_QUICK_ADD_PLACEHOLDER;
}

export function mergeQuickAddTags(typedTags: string[], prefilledTags: string[]) {
  return uniqueTags([...typedTags, ...prefilledTags]);
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
