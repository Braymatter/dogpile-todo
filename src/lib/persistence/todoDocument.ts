import type { DogpileData, PlannedTask, TodoItem } from '$lib/types';

export type DogpileDocument = {
  schemaVersion: 2;
  app: 'Dogpile';
  updatedAt: string;
  todos: TodoItem[];
  plannedTasks: PlannedTask[];
  notesMarkdown: string;
};

export function createEmptyDogpileData(): DogpileData {
  return {
    todos: [],
    plannedTasks: [],
    notesMarkdown: ''
  };
}

export function serializeDogpileDocument(data: DogpileData) {
  const document: DogpileDocument = {
    schemaVersion: 2,
    app: 'Dogpile',
    updatedAt: new Date().toISOString(),
    todos: data.todos,
    plannedTasks: data.plannedTasks,
    notesMarkdown: data.notesMarkdown
  };

  return JSON.stringify(document, null, 2);
}

export function parseDogpileDocument(raw: string): DogpileData {
  try {
    const parsed = JSON.parse(raw);
    const todos = Array.isArray(parsed) ? parsed : parsed?.todos;
    const plannedTasks = Array.isArray(parsed) ? [] : parsed?.plannedTasks;
    const notesMarkdown = Array.isArray(parsed) ? '' : parsed?.notesMarkdown;

    return {
      todos: Array.isArray(todos) ? todos.map(normalizeTodo).filter(isTodoItem) : [],
      plannedTasks: Array.isArray(plannedTasks)
        ? plannedTasks.map(normalizePlannedTask).filter(isPlannedTask)
        : [],
      notesMarkdown: typeof notesMarkdown === 'string' ? notesMarkdown : ''
    };
  } catch {
    return createEmptyDogpileData();
  }
}

export function serializeTodoDocument(todos: TodoItem[]) {
  return serializeDogpileDocument({
    ...createEmptyDogpileData(),
    todos
  });
}

export function parseTodoDocument(raw: string): TodoItem[] {
  return parseDogpileDocument(raw).todos;
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

export function normalizePlannedTask(value: unknown): PlannedTask | null {
  if (!value || typeof value !== 'object') return null;

  const item = value as Partial<PlannedTask>;
  if (!item.id || !item.title || typeof item.order !== 'number') return null;

  const now = new Date().toISOString();

  return {
    id: item.id,
    title: item.title,
    notes: item.notes ?? '',
    tags: Array.isArray(item.tags) ? item.tags.filter((tag) => typeof tag === 'string') : [],
    order: item.order,
    createdAt: item.createdAt ?? now,
    updatedAt: item.updatedAt ?? now
  };
}

function isTodoItem(value: TodoItem | null): value is TodoItem {
  return value !== null;
}

function isPlannedTask(value: PlannedTask | null): value is PlannedTask {
  return value !== null;
}
