import Fuse from 'fuse.js';
import type { TodoItem } from '$lib/types';
import type { TodoFilterQuery } from './filterTypes';

export function filterTodos(todos: TodoItem[], query: TodoFilterQuery) {
  const tagFilteredTodos = todos.filter((todo) => hasTags(todo, query.tags));

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

function hasTags(todo: TodoItem, requiredTags: string[]) {
  if (requiredTags.length === 0) return true;

  const tags = new Set(todo.tags.map((tag) => tag.toLowerCase()));
  return requiredTags.every((tag) => tags.has(tag.toLowerCase()));
}
