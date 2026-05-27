import Fuse from 'fuse.js';
import type { TodoItem } from '$lib/types';
import type { TodoFilterQuery } from './filterTypes';
import { evaluateTodoFilter } from './evaluateTodoFilter';

export function filterTodos(todos: TodoItem[], query: TodoFilterQuery) {
  const tagFilteredTodos = todos.filter((todo) => evaluateTodoFilter(todo, query));

  if (!query.searchText) {
    return tagFilteredTodos;
  }

  const fuse = new Fuse(tagFilteredTodos, {
    ignoreLocation: true,
    includeScore: true,
    keys: [
      { name: 'title', weight: 0.72 },
      { name: 'notes', weight: 0.28 }
    ],
    threshold: 0.36
  });
  const matchingIds = new Set(fuse.search(query.searchText).map((result) => result.item.id));

  return tagFilteredTodos.filter((todo) => matchingIds.has(todo.id));
}
