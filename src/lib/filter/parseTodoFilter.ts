import type { TodoFilterParseResult } from './filterTypes';
import { parseDashTagInput } from '$lib/parseDashTagInput';

export function parseTodoFilter(input: string): TodoFilterParseResult {
  const parsed = parseDashTagInput(input);

  return {
    ok: true,
    query: {
      searchText: parsed.text,
      tags: parsed.tags.map((tag) => tag.toLowerCase())
    }
  };
}
