import type { TodoItem } from '$lib/types';

export interface TodoStore {
  loadTodos(): Promise<TodoItem[]>;
  saveTodos(todos: TodoItem[]): Promise<void>;
}
