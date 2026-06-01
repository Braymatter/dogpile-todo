export type FilterTagToken = {
  start: number;
  end: number;
  prefix: '--' | '!' | '\u2014';
  query: string;
};

const TAG_SUGGESTION_LIMIT = 8;

export function getUniqueSortedTags(tags: string[]) {
  const tagByKey = new Map<string, string>();

  for (const tag of tags) {
    const normalizedTag = tag.trim();
    const key = normalizedTag.toLowerCase();

    if (!normalizedTag || /\s/.test(normalizedTag) || tagByKey.has(key)) continue;

    tagByKey.set(key, normalizedTag);
  }

  return [...tagByKey.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

export function getFilterTagToken(value: string, cursorIndex: number): FilterTagToken | null {
  const cursor = Math.max(0, Math.min(cursorIndex, value.length));
  const start = findTokenStart(value, cursor);
  const end = findTokenEnd(value, cursor);
  const token = value.slice(start, end);
  const prefix = getTagPrefix(token);

  if (!prefix) return null;

  return {
    start,
    end,
    prefix,
    query: token.slice(prefix.length)
  };
}

export function getTagAutocompleteSuggestions(tags: string[], query: string) {
  const normalizedQuery = query.toLowerCase();

  return getUniqueSortedTags(tags)
    .filter((tag) => tag.toLowerCase().includes(normalizedQuery))
    .sort((a, b) => compareSuggestion(a, b, normalizedQuery))
    .slice(0, TAG_SUGGESTION_LIMIT);
}

export function replaceFilterTagToken(value: string, token: FilterTagToken, tag: string) {
  const replacement = `${token.prefix}${tag}`;
  const before = value.slice(0, token.start);
  const after = value.slice(token.end);
  const needsSpaceBeforeAfter = after.length > 0 && !/^\s/.test(after);
  const separator = after.length === 0 || needsSpaceBeforeAfter ? ' ' : '';
  const nextValue = `${before}${replacement}${separator}${after}`;

  return {
    value: nextValue,
    cursorIndex: before.length + replacement.length + separator.length
  };
}

function compareSuggestion(a: string, b: string, query: string) {
  const aKey = a.toLowerCase();
  const bKey = b.toLowerCase();
  const aStarts = query ? aKey.startsWith(query) : true;
  const bStarts = query ? bKey.startsWith(query) : true;

  if (aStarts !== bStarts) return aStarts ? -1 : 1;

  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

function findTokenStart(value: string, cursorIndex: number) {
  let start = cursorIndex;

  while (start > 0 && !/\s/.test(value[start - 1])) {
    start -= 1;
  }

  return start;
}

function findTokenEnd(value: string, cursorIndex: number) {
  let end = cursorIndex;

  while (end < value.length && !/\s/.test(value[end])) {
    end += 1;
  }

  return end;
}

function getTagPrefix(token: string): FilterTagToken['prefix'] | null {
  if (token.startsWith('--')) return '--';
  if (token.startsWith('!')) return '!';
  if (token.startsWith('\u2014')) return '\u2014';

  return null;
}
