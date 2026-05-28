export type TodoFilterQuery = {
  searchText: string;
  tags: string[];
  excludedTags: string[];
};

export type TodoFilterParseResult =
  | { ok: true; query: TodoFilterQuery }
  | { ok: false; error: string };
