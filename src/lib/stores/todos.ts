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

const GITHUB_SAVE_DEBOUNCE_MS = 1500;
const GITHUB_POLL_INTERVAL_MS = 15_000;

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
let githubPollTimer: ReturnType<typeof setTimeout> | null = null;
let githubPollInFlightFor: GitHubTodoStore | null = null;
let githubPollingEventsBound = false;
let lastSyncedSignature = '';

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
  stopGitHubPolling();
  githubPersistence = null;
  lastSyncedSignature = '';

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
      markSynced(currentTodos);
      startGitHubPolling();
      return;
    }

    await saveGitHubTodos(currentTodos);
    if (githubPersistence === nextGitHubPersistence && nextGitHubPersistence.remoteFileExists) {
      startGitHubPolling();
    }
  } catch (error) {
    loaded = true;
    replaceTodos(localTodos);
    await localPersistence?.saveTodos(currentTodos);
    syncState.set({
      status: 'error',
      message: `${describeError(error)} Local cache loaded.`
    });

    if (githubPersistence === nextGitHubPersistence) {
      startGitHubPolling();
    }
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
  }, GITHUB_SAVE_DEBOUNCE_MS);
}

async function saveGitHubTodos(todos: TodoItem[]) {
  const savingStore = githubPersistence;

  if (!savingStore) {
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
    const savedTodos = normalizeOrder(todos);
    await savingStore.saveTodos(savedTodos);
    if (githubPersistence !== savingStore) return;

    markSynced(savedTodos);
  } catch (error) {
    if (githubPersistence !== savingStore) return;

    if (error instanceof GitHubConflictError) {
      try {
        await mergeGitHubConflict(todos, savingStore);
      } catch (mergeError) {
        syncState.set({ status: 'error', message: describeError(mergeError) });
      }
    } else {
      syncState.set({ status: 'error', message: describeError(error) });
    }
  } finally {
    githubSaveInFlight = false;

    const shouldSaveAgain = saveAgainAfterFlight && githubPersistence === savingStore;
    saveAgainAfterFlight = false;

    if (shouldSaveAgain) {
      scheduleGitHubSave(currentTodos);
    }
  }
}

async function mergeGitHubConflict(localTodos: TodoItem[], mergingStore = githubPersistence) {
  if (!mergingStore || githubPersistence !== mergingStore) return;

  syncState.set({ status: 'conflict', message: 'Merging remote GitHub changes' });

  const remoteTodos = await mergingStore.loadTodos();
  if (githubPersistence !== mergingStore) return;

  const mergedTodos = mergeTodosById(localTodos, remoteTodos);
  replaceTodos(mergedTodos);
  await localPersistence?.saveTodos(currentTodos);
  await mergingStore.saveTodos(currentTodos);
  if (githubPersistence !== mergingStore) return;

  markSynced(currentTodos, 'Merged and synced with GitHub');
}

function startGitHubPolling() {
  if (!browser || !githubPersistence) return;

  clearGitHubPollTimer();
  bindGitHubPollingEvents();
  scheduleNextGitHubPoll();
}

function stopGitHubPolling() {
  clearGitHubPollTimer();
  unbindGitHubPollingEvents();
  githubPollInFlightFor = null;
}

function scheduleNextGitHubPoll(delay = GITHUB_POLL_INTERVAL_MS) {
  if (!browser || !githubPersistence || githubPollTimer) return;

  githubPollTimer = setTimeout(() => {
    githubPollTimer = null;
    void pollGitHubTodos();
  }, delay);
}

async function pollGitHubTodos() {
  const pollingStore = githubPersistence;
  if (!pollingStore || githubPollInFlightFor) return;

  if (!canPollGitHub()) {
    scheduleNextGitHubPoll();
    return;
  }

  if (hasPendingGitHubSave()) {
    scheduleNextGitHubPoll();
    return;
  }

  githubPollInFlightFor = pollingStore;

  try {
    const remoteTodos = await pollingStore.loadTodos();
    if (githubPersistence !== pollingStore) return;

    if (!pollingStore.remoteFileExists) {
      syncState.set({ status: 'error', message: 'GitHub todo file was not found.' });
      return;
    }

    await reconcilePolledTodos(remoteTodos);
  } catch (error) {
    if (githubPersistence === pollingStore) {
      syncState.set({ status: 'error', message: describeError(error) });
    }
  } finally {
    if (githubPollInFlightFor === pollingStore) {
      githubPollInFlightFor = null;
      scheduleNextGitHubPoll();
    }
  }
}

async function reconcilePolledTodos(remoteTodos: TodoItem[]) {
  const remoteSignature = getTodosSignature(remoteTodos);

  if (remoteSignature === lastSyncedSignature) {
    if (hasUnsyncedLocalChanges()) {
      await saveGitHubTodos(currentTodos);
      return;
    }

    markSynced(currentTodos);
    return;
  }

  if (!hasUnsyncedLocalChanges()) {
    replaceTodos(remoteTodos);
    await localPersistence?.saveTodos(currentTodos);
    markSynced(currentTodos, 'Updated from GitHub');
    return;
  }

  syncState.set({ status: 'conflict', message: 'Merging remote GitHub changes' });

  const mergedTodos = mergeTodosById(currentTodos, remoteTodos);
  replaceTodos(mergedTodos);
  await localPersistence?.saveTodos(currentTodos);
  await saveGitHubTodos(currentTodos);
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

function clearGitHubPollTimer() {
  if (!githubPollTimer) return;

  clearTimeout(githubPollTimer);
  githubPollTimer = null;
}

function bindGitHubPollingEvents() {
  if (!browser || githubPollingEventsBound) return;

  document.addEventListener('visibilitychange', pollGitHubWhenAvailable);
  window.addEventListener('online', pollGitHubWhenAvailable);
  githubPollingEventsBound = true;
}

function unbindGitHubPollingEvents() {
  if (!browser || !githubPollingEventsBound) return;

  document.removeEventListener('visibilitychange', pollGitHubWhenAvailable);
  window.removeEventListener('online', pollGitHubWhenAvailable);
  githubPollingEventsBound = false;
}

function pollGitHubWhenAvailable() {
  if (!canPollGitHub()) return;

  clearGitHubPollTimer();
  void pollGitHubTodos();
}

function canPollGitHub() {
  return !document.hidden && navigator.onLine;
}

function hasPendingGitHubSave() {
  return Boolean(githubSaveTimer || githubSaveInFlight || saveAgainAfterFlight);
}

function hasUnsyncedLocalChanges() {
  return hasPendingGitHubSave() || getTodosSignature(currentTodos) !== lastSyncedSignature;
}

function markSynced(todos: TodoItem[], message = 'Synced with GitHub') {
  lastSyncedSignature = getTodosSignature(todos);
  syncState.set({
    status: 'synced',
    message,
    lastSyncedAt: new Date().toISOString()
  });
}

function getTodosSignature(todos: TodoItem[]) {
  return JSON.stringify(normalizeOrder(todos));
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
        .filter((tag) => tag && !/\s/.test(tag))
    )
  );
}
