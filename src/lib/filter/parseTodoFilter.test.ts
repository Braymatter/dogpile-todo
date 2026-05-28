import { describe, expect, it } from 'vitest';
import type { TodoItem } from '$lib/types';
import { filterTodos } from './filterTodos';
import { parseTodoFilter } from './parseTodoFilter';

const baseTodo: TodoItem = {
  id: '1',
  title: 'Build Dogpile',
  tags: ['TagA', 'TagC'],
  order: 1000,
  completed: false,
  createdAt: '2026-05-26T12:00:00.000Z',
  updatedAt: '2026-05-26T12:00:00.000Z'
};

describe('todo filter parsing', () => {
  it('parses free text separately from double-dash tags', () => {
    const parsed = parseTodoFilter('launch checklist --TagA --TagC');

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.query).toEqual({
      searchText: 'launch checklist',
      tags: ['taga', 'tagc'],
      excludedTags: []
    });
  });

  it('only filters tags when terms are double-dash-prefixed', () => {
    const parsed = parseTodoFilter('TagA -TagA');

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.query.searchText).toBe('TagA -TagA');
    expect(parsed.query.tags).toEqual([]);
  });

  it('fuzzily matches titles and notes while preserving original order', () => {
    const todos: TodoItem[] = [
      baseTodo,
      {
        ...baseTodo,
        id: '2',
        title: 'Review dashboard polish',
        notes: 'Clean up the daily card layout.',
        tags: ['Design']
      }
    ];
    const parsed = parseTodoFilter('dashbord polish');

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(filterTodos(todos, parsed.query).map((todo) => todo.id)).toEqual(['2']);
  });

  it('matches explicit tags case-insensitively', () => {
    const parsed = parseTodoFilter('--taga');

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(filterTodos([baseTodo], parsed.query)).toEqual([baseTodo]);
  });

  it('excludes explicit tags case-insensitively', () => {
    const parsed = parseTodoFilter('--taga !Personal');
    const todos = [
      baseTodo,
      {
        ...baseTodo,
        id: '2',
        tags: ['TagA', 'Personal']
      }
    ];

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(filterTodos(todos, parsed.query)).toEqual([baseTodo]);
  });
});
