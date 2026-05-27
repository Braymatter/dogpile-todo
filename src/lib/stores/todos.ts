import { browser } from '$app/environment';
import { writable } from 'svelte/store';
import { GitHubConflictError, GitHubTodoStore } from '$lib/persistence/GitHubTodoStore';
import { LocalStorageTodoStore } from '$lib/persistence/LocalStorageTodoStore';
import {
  defaultPersistenceSettings,
  hasGitHubSettings,
  loadPersistenceSettings,
  normalizePersistenceSettings,
  savePersistenceSettings,
  type PersistenceSettings
} from '$lib/persistence/persistenceSettings';
import type { TodoStore } from '$lib/persistence/TodoStore';
import type { TodoItem } from '$lib/types';

export type SyncState = {
  status: 'local' | 'loading' | 'pending' | 'syncing' | 'synced' | 'conflict' | 'error';
  message: string;
  lastSyncedAt?: string;
};

export const todoItems = writable<TodoItem[]>([]);
export const persistenceSettings = writable<PersistenceSettings>(defaultPersistenceSettings);
export const syncState = writable<SyncState>({
  status: 'local',
  message: 'Local storage'
});

let localPersistence: TodoStore | null = browser ? new LocalStorageTodoStore() : null;
let githubPersistence: GitHubTodoStore | null = null;
let loaded = false;
let applyingSnapshot = false;
let currentTodos: TodoItem[] = [];
let githubSaveTimer: ReturnType<typeof setTimeout> | null = null;
let githubSaveInFlight = false;
let saveAgainAfterFlight = false;

todoItems.subscribe((todos) => {
  currentTodos = todos;

  if (!browser || !loaded || applyingSnapshot) {
    return;
  }

  if (localPersistence) {
    void localPersistence.saveTodos(todos);
  }

  scheduleGitHubSave(todos);
});

export async function loadTodos() {
  if (!browser || !localPersistence) return;

  const settings = loadPersistenceSettings();
  persistenceSettings.set(settings);
  await activatePersistence(settings);
}

export async function updatePersistenceSettings(settings: PersistenceSettings) {
  if (!browser || !localPersistence) return;

  const normalizedSettings = normalizePersistenceSettings(settings);
  savePersistenceSettings(normalizedSettings);
  persistenceSettings.set(normalizedSettings);
  await activatePersistence(normalizedSettings, currentTodos);
}

export async function syncTodosNow() {
  clearGitHubSaveTimer();
  await saveGitHubTodos(currentTodos);
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

async function activatePersistence(settings: PersistenceSettings, seedTodos?: TodoItem[]) {
  clearGitHubSaveTimer();
  githubPersistence = null;

  const localTodos = seedTodos ?? (await localPersistence?.loadTodos()) ?? [];

  if (!hasGitHubSettings(settings)) {
    loaded = true;
    replaceTodos(localTodos);
    await localPersistence?.saveTodos(currentTodos);
    syncState.set({ status: 'local', message: 'Local storage' });
    return;
  }

  const nextGitHubPersistence = new GitHubTodoStore(settings.github);
  githubPersistence = nextGitHubPersistence;
  syncState.set({ status: 'loading', message: 'Loading from GitHub' });

  try {
    const remoteTodos = await nextGitHubPersistence.loadTodos();
    const todos = nextGitHubPersistence.remoteFileExists ? remoteTodos : localTodos;

    loaded = true;
    replaceTodos(todos);
    await localPersistence?.saveTodos(currentTodos);

    if (nextGitHubPersistence.remoteFileExists) {
      syncState.set({
        status: 'synced',
        message: 'Synced with GitHub',
        lastSyncedAt: new Date().toISOString()
      });
      return;
    }

    await saveGitHubTodos(currentTodos);
  } catch (error) {
    loaded = true;
    replaceTodos(localTodos);
    await localPersistence?.saveTodos(currentTodos);
    syncState.set({
      status: 'error',
      message: `${describeError(error)} Local cache loaded.`
    });
  }
}

function replaceTodos(todos: TodoItem[]) {
  applyingSnapshot = true;
  todoItems.set(normalizeOrder(todos));
  applyingSnapshot = false;
}

function scheduleGitHubSave(todos: TodoItem[]) {
  if (!githubPersistence) return;

  clearGitHubSaveTimer();
  syncState.set({ status: 'pending', message: 'Saving to GitHub soon' });

  githubSaveTimer = setTimeout(() => {
    void saveGitHubTodos(todos);
  }, 1500);
}

async function saveGitHubTodos(todos: TodoItem[]) {
  if (!githubPersistence) {
    syncState.set({ status: 'local', message: 'Local storage' });
    return;
  }

  if (githubSaveInFlight) {
    saveAgainAfterFlight = true;
    return;
  }

  githubSaveInFlight = true;
  syncState.set({ status: 'syncing', message: 'Saving to GitHub' });

  try {
    await githubPersistence.saveTodos(normalizeOrder(todos));
    syncState.set({
      status: 'synced',
      message: 'Synced with GitHub',
      lastSyncedAt: new Date().toISOString()
    });
  } catch (error) {
    if (error instanceof GitHubConflictError) {
      try {
        await mergeGitHubConflict(todos);
      } catch (mergeError) {
        syncState.set({ status: 'error', message: describeError(mergeError) });
      }
    } else {
      syncState.set({ status: 'error', message: describeError(error) });
    }
  } finally {
    githubSaveInFlight = false;

    if (saveAgainAfterFlight) {
      saveAgainAfterFlight = false;
      scheduleGitHubSave(currentTodos);
    }
  }
}

async function mergeGitHubConflict(localTodos: TodoItem[]) {
  if (!githubPersistence) return;

  syncState.set({ status: 'conflict', message: 'Merging remote GitHub changes' });

  const remoteTodos = await githubPersistence.loadTodos();
  const mergedTodos = mergeTodosById(localTodos, remoteTodos);
  replaceTodos(mergedTodos);
  await localPersistence?.saveTodos(currentTodos);
  await githubPersistence.saveTodos(currentTodos);

  syncState.set({
    status: 'synced',
    message: 'Merged and synced with GitHub',
    lastSyncedAt: new Date().toISOString()
  });
}

function mergeTodosById(localTodos: TodoItem[], remoteTodos: TodoItem[]) {
  const todosById = new Map<string, TodoItem>();

  for (const todo of remoteTodos) {
    todosById.set(todo.id, todo);
  }

  for (const todo of localTodos) {
    const existing = todosById.get(todo.id);
    if (!existing || new Date(todo.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
      todosById.set(todo.id, todo);
    }
  }

  return normalizeOrder(Array.from(todosById.values()));
}

function clearGitHubSaveTimer() {
  if (!githubSaveTimer) return;

  clearTimeout(githubSaveTimer);
  githubSaveTimer = null;
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message : 'GitHub sync failed.';
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
