import type { TodoFilterParseResult } from './filterTypes';
import { parseTagInput } from '$lib/parseTagInput';

export function parseTodoFilter(input: string): TodoFilterParseResult {
  const parsed = parseTagInput(input, { allowExcludedTags: true });

  return {
    ok: true,
    query: {
      searchText: parsed.text,
      tags: parsed.tags.map((tag) => tag.toLowerCase()),
      excludedTags: parsed.excludedTags.map((tag) => tag.toLowerCase())
    }
  };
}
