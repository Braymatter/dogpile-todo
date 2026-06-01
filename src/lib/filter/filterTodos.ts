import Fuse from 'fuse.js';
import type { TodoItem } from '$lib/types';
import type { TodoFilterQuery } from './filterTypes';

export function filterTodos(todos: TodoItem[], query: TodoFilterQuery) {
  const tagFilteredTodos = todos.filter((todo) =>
    matchesTags(todo, query.tags, query.excludedTags)
  );

  const searchAlternatives = getSearchAlternatives(query.searchText);

  if (searchAlternatives.length === 0) {
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
  const matchingIds = new Set(
    searchAlternatives.flatMap((searchText) =>
      fuse.search(searchText).map((result) => result.item.id)
    )
  );

  return tagFilteredTodos.filter((todo) => matchingIds.has(todo.id));
}

function getSearchAlternatives(searchText: string) {
  return searchText
    .split('|')
    .map((alternative) => alternative.trim())
    .filter(Boolean);
}

function matchesTags(todo: TodoItem, requiredTags: string[], excludedTags: string[]) {
  const tags = new Set(todo.tags.map((tag) => tag.toLowerCase()));

  return (
    requiredTags.every((tag) => tags.has(tag.toLowerCase())) &&
    excludedTags.every((tag) => !tags.has(tag.toLowerCase()))
  );
}
