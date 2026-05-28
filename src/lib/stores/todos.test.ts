import { get } from 'svelte/store';
import { afterEach, describe, expect, it } from 'vitest';
import type { TodoItem } from '$lib/types';
import { todoItems, toggleTodoComplete } from './todos';

const completedTodo: TodoItem = {
  id: 'todo-1',
  title: 'Edit history tasks',
  notes: 'Keep the old priority intact',
  tags: ['history'],
  order: 3000,
  completed: true,
  completedAt: '2026-05-27T14:30:00.000Z',
  durationMinutes: 45,
  createdAt: '2026-05-26T12:00:00.000Z',
  updatedAt: '2026-05-27T14:30:00.000Z'
};

describe('todo store', () => {
  afterEach(() => {
    todoItems.set([]);
  });

  it('marks a completed todo incomplete without changing its priority order', () => {
    todoItems.set([completedTodo]);

    toggleTodoComplete(completedTodo.id, false);

    expect(get(todoItems)[0]).toMatchObject({
      id: completedTodo.id,
      order: completedTodo.order,
      completed: false,
      completedAt: undefined,
      durationMinutes: undefined
    });
  });
});
