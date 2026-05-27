import type { TodoItem } from '$lib/types';
import type { TodoStore } from './TodoStore';

const STORAGE_KEY = 'dogpile.todos.v1';

export class LocalStorageTodoStore implements TodoStore {
  async loadTodos(): Promise<TodoItem[]> {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(normalizeTodo).filter(isTodoItem) : [];
    } catch {
      return [];
    }
  }

  async saveTodos(todos: TodoItem[]): Promise<void> {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  }
}

function normalizeTodo(value: unknown): TodoItem | null {
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
