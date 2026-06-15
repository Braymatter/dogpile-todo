import { get } from 'svelte/store';
import { afterEach, describe, expect, it } from 'vitest';
import type { PlannedTask, TodoItem } from '$lib/types';
import { movePlannedTaskToTodo, moveTodoToPlan, plannedTasks, todoItems, toggleTodoComplete } from './todos';

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

const openTodo: TodoItem = {
  id: 'todo-2',
  title: 'Current open task',
  notes: '',
  tags: ['open'],
  order: 5000,
  completed: false,
  createdAt: '2026-05-27T12:00:00.000Z',
  updatedAt: '2026-05-27T12:00:00.000Z'
};

const plannedTask: PlannedTask = {
  id: 'planned-1',
  title: 'Promote this task',
  notes: 'Bring the notes along',
  tags: ['plan'],
  order: 1000,
  createdAt: '2026-05-27T11:00:00.000Z',
  updatedAt: '2026-05-27T11:00:00.000Z'
};

describe('todo store', () => {
  afterEach(() => {
    todoItems.set([]);
    plannedTasks.set([]);
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

  it('moves a planned task to the top of open todos', () => {
    todoItems.set([completedTodo, openTodo]);
    plannedTasks.set([plannedTask]);

    movePlannedTaskToTodo(plannedTask.id);

    const todos = get(todoItems);
    const openTodos = todos.filter((todo) => !todo.completed).sort((a, b) => a.order - b.order);

    expect(get(plannedTasks)).toEqual([]);
    expect(openTodos.map((todo) => todo.id)).toEqual([plannedTask.id, openTodo.id]);
    expect(openTodos[0]).toMatchObject({
      title: plannedTask.title,
      notes: plannedTask.notes,
      tags: plannedTask.tags,
      completed: false
    });
  });

  it('moves a todo back into planning', () => {
    todoItems.set([openTodo]);
    plannedTasks.set([]);

    moveTodoToPlan(openTodo.id);

    expect(get(todoItems)).toEqual([]);
    expect(get(plannedTasks)[0]).toMatchObject({
      id: openTodo.id,
      title: openTodo.title,
      notes: openTodo.notes,
      tags: openTodo.tags
    });
  });
});
