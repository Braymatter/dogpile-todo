export type TodoFilterQuery = {
  searchText: string;
  tags: string[];
};

export type TodoFilterParseResult =
  | { ok: true; query: TodoFilterQuery }
  | { ok: false; error: string };
