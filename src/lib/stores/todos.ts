import { browser } from '$app/environment';
import { writable } from 'svelte/store';
import { LocalStorageTodoStore } from '$lib/persistence/LocalStorageTodoStore';
import type { TodoStore } from '$lib/persistence/TodoStore';
import type { TodoItem } from '$lib/types';

export const todoItems = writable<TodoItem[]>([]);

let persistence: TodoStore | null = browser ? new LocalStorageTodoStore() : null;
let loaded = false;
let currentTodos: TodoItem[] = [];

todoItems.subscribe((todos) => {
  currentTodos = todos;

  if (browser && loaded && persistence) {
    persistence.saveTodos(todos);
  }
});

export async function loadTodos(store: TodoStore | null = persistence) {
  if (!browser || !store) return;

  const todos = await store.loadTodos();
  loaded = true;
  todoItems.set(normalizeOrder(todos));
}

export function addTodo(input: { title: string; notes?: string; tags?: string[] }) {
  const title = input.title.trim();
  if (!title) return;

  const now = new Date().toISOString();
  const maxOrder = currentTodos.reduce((max, todo) => Math.max(max, todo.order), 0);

  const todo: TodoItem = {
    id: crypto.randomUUID(),
    title,
    notes: input.notes?.trim() ?? '',
    tags: normalizeTags(input.tags ?? []),
    order: maxOrder + 1000,
    completed: false,
    createdAt: now,
    updatedAt: now
  };

  todoItems.update((todos) => [...todos, todo]);
}

export function updateTodo(id: string, updates: Partial<Omit<TodoItem, 'id' | 'createdAt'>>) {
  todoItems.update((todos) =>
    todos.map((todo) =>
      todo.id === id
        ? {
            ...todo,
            ...updates,
            tags: updates.tags ? normalizeTags(updates.tags) : todo.tags,
            title: updates.title?.trim() || todo.title,
            notes: updates.notes ?? todo.notes,
            updatedAt: new Date().toISOString()
          }
        : todo
    )
  );
}

export function deleteTodo(id: string) {
  todoItems.update((todos) => todos.filter((todo) => todo.id !== id));
}

export function toggleTodoComplete(id: string, completed: boolean, durationMinutes?: number) {
  const now = new Date().toISOString();

  todoItems.update((todos) =>
    todos.map((todo) => {
      if (todo.id !== id) return todo;

      const completedOrders = todos
        .filter((item) => item.completed && item.id !== id)
        .map((item) => item.order);
      const newestCompletedOrder =
        completedOrders.length > 0 ? Math.min(...completedOrders) - 1000 : todo.order;

      return {
        ...todo,
        order: completed ? newestCompletedOrder : todo.order,
        completed,
        completedAt: completed ? now : undefined,
        durationMinutes: completed ? durationMinutes : undefined,
        updatedAt: now
      };
    })
  );
}

export function reorderVisibleTodos(orderedVisibleIds: string[]) {
  if (orderedVisibleIds.length < 2) return;

  todoItems.update((todos) => {
    const todoById = new Map(todos.map((todo) => [todo.id, todo]));
    const orderById = new Map<string, number>();

    assignVisibleGroupOrders(
      todos,
      orderedVisibleIds.filter((id) => todoById.get(id)?.completed),
      true,
      orderById
    );
    assignVisibleGroupOrders(
      todos,
      orderedVisibleIds.filter((id) => todoById.get(id)?.completed === false),
      false,
      orderById
    );

    return todos.map((todo) => {
      const order = orderById.get(todo.id);
      return order === undefined ? todo : { ...todo, order, updatedAt: new Date().toISOString() };
    });
  });
}

function assignVisibleGroupOrders(
  todos: TodoItem[],
  visibleIds: string[],
  completed: boolean,
  orderById: Map<string, number>
) {
  if (visibleIds.length < 2) return;

  const visibleIdSet = new Set(visibleIds);
  const targetOrders = todos
    .filter((todo) => todo.completed === completed && visibleIdSet.has(todo.id))
    .map((todo) => todo.order)
    .sort((a, b) => a - b);

  if (targetOrders.length !== visibleIds.length) return;

  visibleIds.forEach((id, index) => {
    orderById.set(id, targetOrders[index]);
  });
}

function normalizeOrder(todos: TodoItem[]) {
  return todos
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((todo, index) => ({ ...todo, order: (index + 1) * 1000 }));
}

function normalizeTags(tags: string[]) {
  return Array.from(
    new Set(
      tags
        .flatMap((tag) => tag.split(','))
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  );
}
