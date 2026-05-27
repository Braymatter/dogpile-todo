import { describe, expect, it } from 'vitest';
import type { TodoItem } from '$lib/types';
import { parseTodoDocument, serializeTodoDocument } from './todoDocument';

const todo: TodoItem = {
  id: 'todo-1',
  title: 'Write sync layer',
  notes: 'Keep it readable',
  tags: ['code'],
  order: 1000,
  completed: false,
  createdAt: '2026-05-27T12:00:00.000Z',
  updatedAt: '2026-05-27T12:00:00.000Z'
};

describe('todoDocument', () => {
  it('round trips the Dogpile document format', () => {
    expect(parseTodoDocument(serializeTodoDocument([todo]))).toEqual([todo]);
  });

  it('still reads the legacy localStorage array format', () => {
    expect(parseTodoDocument(JSON.stringify([todo]))).toEqual([todo]);
  });

  it('drops malformed todos instead of throwing', () => {
    const parsed = parseTodoDocument(JSON.stringify({ todos: [todo, { id: 'bad' }] }));

    expect(parsed).toEqual([todo]);
  });
});
