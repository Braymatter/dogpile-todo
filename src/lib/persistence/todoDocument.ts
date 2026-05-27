import type { TodoItem } from '$lib/types';

export type DogpileDocument = {
  schemaVersion: 1;
  app: 'Dogpile';
  updatedAt: string;
  todos: TodoItem[];
};

export function serializeTodoDocument(todos: TodoItem[]) {
  const document: DogpileDocument = {
    schemaVersion: 1,
    app: 'Dogpile',
    updatedAt: new Date().toISOString(),
    todos
  };

  return JSON.stringify(document, null, 2);
}

export function parseTodoDocument(raw: string): TodoItem[] {
  try {
    const parsed = JSON.parse(raw);
    const todos = Array.isArray(parsed) ? parsed : parsed?.todos;

    return Array.isArray(todos) ? todos.map(normalizeTodo).filter(isTodoItem) : [];
  } catch {
    return [];
  }
}

export function normalizeTodo(value: unknown): TodoItem | null {
  if (!value || typeof value !== 'object') return null;

  const item = value as Partial<TodoItem>;
  if (!item.id || !item.title || typeof item.order !== 'number') return null;

  const now = new Date().toISOString();

  return {
    id: item.id,
    title: item.title,
    notes: item.notes ?? '',
    tags: Array.isArray(item.tags) ? item.tags.filter((tag) => typeof tag === 'string') : [],
    order: item.order,
    completed: Boolean(item.completed),
    completedAt: item.completedAt,
    durationMinutes:
      typeof item.durationMinutes === 'number' && Number.isFinite(item.durationMinutes)
        ? item.durationMinutes
        : undefined,
    createdAt: item.createdAt ?? now,
    updatedAt: item.updatedAt ?? now
  };
}

function isTodoItem(value: TodoItem | null): value is TodoItem {
  return value !== null;
}
