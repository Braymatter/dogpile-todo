import type { TodoFilterParseResult } from './filterTypes';

export function parseTodoFilter(input: string): TodoFilterParseResult {
  const searchParts: string[] = [];
  const tags: string[] = [];

  input
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .forEach((part) => {
      if (part.startsWith('-') && part.length > 1) {
        tags.push(part.slice(1).toLowerCase());
        return;
      }

      searchParts.push(part);
    });

  return {
    ok: true,
    query: {
      searchText: searchParts.join(' ').trim(),
      tags: Array.from(new Set(tags))
    }
  };
}
