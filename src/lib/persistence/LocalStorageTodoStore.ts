import type { TodoItem } from '$lib/types';
import type { TodoStore } from './TodoStore';
import { parseTodoDocument } from './todoDocument';

const STORAGE_KEY = 'dogpile.todos.v1';

export class LocalStorageTodoStore implements TodoStore {
  async loadTodos(): Promise<TodoItem[]> {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    return parseTodoDocument(raw);
  }

  async saveTodos(todos: TodoItem[]): Promise<void> {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  }
}
