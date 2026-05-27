import type { TodoItem } from '$lib/types';
import type { TodoFilterQuery } from './filterTypes';

export function evaluateTodoFilter(todo: TodoItem, query: TodoFilterQuery) {
  if (query.tags.length === 0) return true;

  const tags = new Set(todo.tags.map((tag) => tag.toLowerCase()));
  return query.tags.every((tag) => tags.has(tag.toLowerCase()));
}
