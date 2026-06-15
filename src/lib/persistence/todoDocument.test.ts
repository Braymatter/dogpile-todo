import { describe, expect, it } from 'vitest';
import type { DogpileData, PlannedTask, TodoItem } from '$lib/types';
import { parseDogpileDocument, parseTodoDocument, serializeDogpileDocument } from './todoDocument';

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

const plannedTask: PlannedTask = {
  id: 'planned-1',
  title: 'Sketch tomorrow',
  notes: 'Before standup',
  tags: ['plan'],
  order: 1000,
  createdAt: '2026-05-27T13:00:00.000Z',
  updatedAt: '2026-05-27T13:00:00.000Z'
};

const dogpileData: DogpileData = {
  todos: [todo],
  plannedTasks: [plannedTask],
  notesMarkdown: '# Notes'
};

describe('todoDocument', () => {
  it('round trips the Dogpile document format', () => {
    expect(parseDogpileDocument(serializeDogpileDocument(dogpileData))).toEqual(dogpileData);
  });

  it('still reads the legacy localStorage array format', () => {
    expect(parseDogpileDocument(JSON.stringify([todo]))).toEqual({
      todos: [todo],
      plannedTasks: [],
      notesMarkdown: ''
    });
  });

  it('drops malformed todos instead of throwing', () => {
    const parsed = parseDogpileDocument(
      JSON.stringify({
        todos: [todo, { id: 'bad' }],
        plannedTasks: [plannedTask, { id: 'bad-plan' }],
        notesMarkdown: '# Notes'
      })
    );

    expect(parsed).toEqual(dogpileData);
  });

  it('still exposes todo-only parsing for legacy callers', () => {
    expect(parseTodoDocument(serializeDogpileDocument(dogpileData))).toEqual([todo]);
  });
});
