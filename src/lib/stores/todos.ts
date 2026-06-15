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
import type { DogpileData, PlannedTask, TodoItem } from '$lib/types';

export type SyncState = {
  status:
    | 'local'
    | 'loading'
    | 'pending'
    | 'syncing'
    | 'compacting'
    | 'synced'
    | 'conflict'
    | 'error';
  message: string;
  lastSyncedAt?: string;
};

const GITHUB_SAVE_DEBOUNCE_MS = 1500;
const GITHUB_POLL_INTERVAL_MS = 15_000;

export const todoItems = writable<TodoItem[]>([]);
export const plannedTasks = writable<PlannedTask[]>([]);
export const notesMarkdown = writable('');
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
let currentPlannedTasks: PlannedTask[] = [];
let currentNotesMarkdown = '';
let githubSaveTimer: ReturnType<typeof setTimeout> | null = null;
let githubSaveInFlight = false;
let saveAgainAfterFlight = false;
let githubCompactionInFlight = false;
let githubPollTimer: ReturnType<typeof setTimeout> | null = null;
let githubPollInFlightFor: GitHubTodoStore | null = null;
let githubPollingEventsBound = false;
let lastSyncedSignature = '';
let lastSyncedData: DogpileData | null = null;

todoItems.subscribe((todos) => {
  currentTodos = todos;
  persistCurrentData();
});

plannedTasks.subscribe((tasks) => {
  currentPlannedTasks = tasks;
  persistCurrentData();
});

notesMarkdown.subscribe((markdown) => {
  currentNotesMarkdown = markdown;
  persistCurrentData();
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
  await activatePersistence(normalizedSettings, getCurrentData());
}

export async function syncTodosNow() {
  clearGitHubSaveTimer();
  await saveGitHubData(getCurrentData());
}

export async function compactGitHubHistoryNow() {
  await compactGitHubHistory(githubPersistence, 'manual');
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

  commitData({
    ...getCurrentData(),
    todos: [...currentTodos, todo]
  });
}

export function updateTodo(id: string, updates: Partial<Omit<TodoItem, 'id' | 'createdAt'>>) {
  commitData({
    ...getCurrentData(),
    todos: currentTodos.map((todo) =>
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
  });
}

export function deleteTodo(id: string) {
  commitData({
    ...getCurrentData(),
    todos: currentTodos.filter((todo) => todo.id !== id)
  });
}

export function toggleTodoComplete(id: string, completed: boolean, durationMinutes?: number) {
  const now = new Date().toISOString();

  commitData({
    ...getCurrentData(),
    todos: currentTodos.map((todo) => {
      if (todo.id !== id) return todo;

      const completedOrders = currentTodos
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
  });
}

export function reorderVisibleTodos(orderedVisibleIds: string[]) {
  if (orderedVisibleIds.length < 2) return;

  const todoById = new Map(currentTodos.map((todo) => [todo.id, todo]));
  const orderById = new Map<string, number>();

  assignVisibleGroupOrders(
    currentTodos,
    orderedVisibleIds.filter((id) => todoById.get(id)?.completed),
    true,
    orderById
  );
  assignVisibleGroupOrders(
    currentTodos,
    orderedVisibleIds.filter((id) => todoById.get(id)?.completed === false),
    false,
    orderById
  );

  commitData({
    ...getCurrentData(),
    todos: currentTodos.map((todo) => {
      const order = orderById.get(todo.id);
      return order === undefined ? todo : { ...todo, order, updatedAt: new Date().toISOString() };
    })
  });
}

export function addPlannedTask(input: { title: string; notes?: string; tags?: string[] }) {
  const title = input.title.trim();
  if (!title) return;

  const now = new Date().toISOString();
  const maxOrder = currentPlannedTasks.reduce((max, task) => Math.max(max, task.order), 0);

  const task: PlannedTask = {
    id: crypto.randomUUID(),
    title,
    notes: input.notes?.trim() ?? '',
    tags: normalizeTags(input.tags ?? []),
    order: maxOrder + 1000,
    createdAt: now,
    updatedAt: now
  };

  commitData({
    ...getCurrentData(),
    plannedTasks: [...currentPlannedTasks, task]
  });
}

export function updatePlannedTask(
  id: string,
  updates: Partial<Omit<PlannedTask, 'id' | 'createdAt'>>
) {
  commitData({
    ...getCurrentData(),
    plannedTasks: currentPlannedTasks.map((task) =>
      task.id === id
        ? {
            ...task,
            ...updates,
            tags: updates.tags ? normalizeTags(updates.tags) : task.tags,
            title: updates.title?.trim() || task.title,
            notes: updates.notes ?? task.notes,
            updatedAt: new Date().toISOString()
          }
        : task
    )
  });
}

export function deletePlannedTask(id: string) {
  commitData({
    ...getCurrentData(),
    plannedTasks: currentPlannedTasks.filter((task) => task.id !== id)
  });
}

export function reorderPlannedTasks(orderedTaskIds: string[]) {
  if (orderedTaskIds.length < 2) return;

  const plannedTaskById = new Map(currentPlannedTasks.map((task) => [task.id, task]));
  const visibleIds = orderedTaskIds.filter((id) => plannedTaskById.has(id));
  const visibleIdSet = new Set(visibleIds);
  const targetOrders = currentPlannedTasks
    .filter((task) => visibleIdSet.has(task.id))
    .map((task) => task.order)
    .sort((a, b) => a - b);

  if (targetOrders.length !== visibleIds.length) return;

  const orderById = new Map(visibleIds.map((id, index) => [id, targetOrders[index]]));

  commitData({
    ...getCurrentData(),
    plannedTasks: currentPlannedTasks.map((task) => {
      const order = orderById.get(task.id);
      return order === undefined ? task : { ...task, order, updatedAt: new Date().toISOString() };
    })
  });
}

export function movePlannedTaskToTodo(id: string) {
  const task = currentPlannedTasks.find((plannedTask) => plannedTask.id === id);
  if (!task) return;

  const now = new Date().toISOString();
  const todo: TodoItem = {
    id: task.id,
    title: task.title,
    notes: task.notes ?? '',
    tags: normalizeTags(task.tags),
    order: getTopOpenTodoOrder(currentTodos),
    completed: false,
    createdAt: task.createdAt,
    updatedAt: now
  };

  commitData({
    ...getCurrentData(),
    todos: [...currentTodos, todo],
    plannedTasks: currentPlannedTasks.filter((plannedTask) => plannedTask.id !== id)
  });
}

export function moveTodoToPlan(id: string) {
  const todo = currentTodos.find((todoItem) => todoItem.id === id);
  if (!todo) return;

  const now = new Date().toISOString();
  const task: PlannedTask = {
    id: todo.id,
    title: todo.title,
    notes: todo.notes ?? '',
    tags: normalizeTags(todo.tags),
    order: getTopPlannedTaskOrder(currentPlannedTasks),
    createdAt: todo.createdAt,
    updatedAt: now
  };

  commitData({
    ...getCurrentData(),
    todos: currentTodos.filter((todoItem) => todoItem.id !== id),
    plannedTasks: [...currentPlannedTasks, task]
  });
}

export function updateNotesMarkdown(markdown: string) {
  commitData({
    ...getCurrentData(),
    notesMarkdown: markdown
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

function normalizePlannedTaskOrder(tasks: PlannedTask[]) {
  return tasks
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((task, index) => ({ ...task, order: (index + 1) * 1000 }));
}

function getCurrentData(): DogpileData {
  return {
    todos: currentTodos,
    plannedTasks: currentPlannedTasks,
    notesMarkdown: currentNotesMarkdown
  };
}

function prepareDataForSave(data: DogpileData): DogpileData {
  return {
    todos: normalizeOrder(data.todos),
    plannedTasks: normalizePlannedTaskOrder(data.plannedTasks),
    notesMarkdown: data.notesMarkdown
  };
}

function persistCurrentData() {
  if (!browser || !loaded || applyingSnapshot) {
    return;
  }

  const data = prepareDataForSave(getCurrentData());

  if (localPersistence) {
    void localPersistence.saveData(data);
  }

  scheduleGitHubSave(data);
}

function commitData(data: DogpileData) {
  applyingSnapshot = true;
  todoItems.set(data.todos);
  plannedTasks.set(data.plannedTasks);
  notesMarkdown.set(data.notesMarkdown);
  applyingSnapshot = false;
  persistCurrentData();
}

async function activatePersistence(settings: PersistenceSettings, seedData?: DogpileData) {
  clearGitHubSaveTimer();
  stopGitHubPolling();
  githubPersistence = null;
  lastSyncedSignature = '';
  lastSyncedData = null;

  const localData = seedData ?? (await localPersistence?.loadData()) ?? getCurrentData();

  if (!hasGitHubSettings(settings)) {
    loaded = true;
    replaceData(localData);
    await localPersistence?.saveData(prepareDataForSave(getCurrentData()));
    syncState.set({ status: 'local', message: 'Local storage' });
    return;
  }

  const nextGitHubPersistence = new GitHubTodoStore(settings.github);
  githubPersistence = nextGitHubPersistence;
  syncState.set({ status: 'loading', message: 'Loading from GitHub' });

  try {
    const remoteData = await nextGitHubPersistence.loadData();
    const data = nextGitHubPersistence.remoteFileExists ? remoteData : localData;

    loaded = true;
    replaceData(data);
    await localPersistence?.saveData(prepareDataForSave(getCurrentData()));

    if (nextGitHubPersistence.remoteFileExists) {
      markSynced(getCurrentData());
      startGitHubPolling();
      return;
    }

    await saveGitHubData(getCurrentData());
    if (githubPersistence === nextGitHubPersistence && nextGitHubPersistence.remoteFileExists) {
      startGitHubPolling();
    }
  } catch (error) {
    loaded = true;
    replaceData(localData);
    await localPersistence?.saveData(prepareDataForSave(getCurrentData()));
    syncState.set({
      status: 'error',
      message: `${describeError(error)} Local cache loaded.`
    });

    if (githubPersistence === nextGitHubPersistence) {
      startGitHubPolling();
    }
  }
}

function replaceData(data: DogpileData) {
  applyingSnapshot = true;
  todoItems.set(normalizeOrder(data.todos));
  plannedTasks.set(normalizePlannedTaskOrder(data.plannedTasks));
  notesMarkdown.set(data.notesMarkdown);
  applyingSnapshot = false;
}

function scheduleGitHubSave(data: DogpileData) {
  if (!githubPersistence) return;

  clearGitHubSaveTimer();
  syncState.set({ status: 'pending', message: 'Saving to GitHub soon' });

  githubSaveTimer = setTimeout(() => {
    void saveGitHubData(data);
  }, GITHUB_SAVE_DEBOUNCE_MS);
}

async function saveGitHubData(data: DogpileData) {
  const savingStore = githubPersistence;

  if (!savingStore) {
    syncState.set({ status: 'local', message: 'Local storage' });
    return;
  }

  if (githubSaveInFlight) {
    saveAgainAfterFlight = true;
    return;
  }

  if (githubCompactionInFlight) {
    saveAgainAfterFlight = true;
    return;
  }

  githubSaveInFlight = true;
  syncState.set({ status: 'syncing', message: 'Saving to GitHub' });

  try {
    const savedData = prepareDataForSave(data);
    await savingStore.saveData(savedData);
    if (githubPersistence !== savingStore) return;

    markSynced(savedData);
    queueGitHubAutoCompaction(savingStore);
  } catch (error) {
    if (githubPersistence !== savingStore) return;

    if (error instanceof GitHubConflictError) {
      try {
        await mergeGitHubConflict(data, savingStore);
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
      scheduleGitHubSave(getCurrentData());
    }
  }
}

async function mergeGitHubConflict(localData: DogpileData, mergingStore = githubPersistence) {
  if (!mergingStore || githubPersistence !== mergingStore) return;

  syncState.set({ status: 'conflict', message: 'Merging remote GitHub changes' });

  const remoteData = await mergingStore.loadData();
  if (githubPersistence !== mergingStore) return;

  const mergedData = mergeDogpileData(localData, remoteData);
  replaceData(mergedData);
  await localPersistence?.saveData(prepareDataForSave(getCurrentData()));
  await mergingStore.saveData(prepareDataForSave(getCurrentData()));
  if (githubPersistence !== mergingStore) return;

  markSynced(getCurrentData(), 'Merged and synced with GitHub');
  queueGitHubAutoCompaction(mergingStore);
}

async function compactGitHubHistory(
  compactingStore: GitHubTodoStore | null,
  mode: 'manual' | 'auto'
) {
  if (!compactingStore) {
    syncState.set({ status: 'local', message: 'GitHub sync is not configured.' });
    return;
  }

  if (githubCompactionInFlight) return;

  if (githubPollInFlightFor) {
    syncState.set({ status: 'error', message: 'Wait for the current GitHub check to finish.' });
    return;
  }

  githubCompactionInFlight = true;
  clearGitHubSaveTimer();
  stopGitHubPolling();
  syncState.set({ status: 'compacting', message: 'Preparing compact snapshot' });

  try {
    await waitForGitHubSaveIdle();
    clearGitHubSaveTimer();
    if (githubPersistence !== compactingStore) return;

    const remoteData = await compactingStore.loadData();
    if (githubPersistence !== compactingStore) return;

    const dataToCompact = compactingStore.remoteFileExists
      ? mergeDogpileData(getCurrentData(), remoteData)
      : prepareDataForSave(getCurrentData());

    replaceData(dataToCompact);
    await localPersistence?.saveData(prepareDataForSave(getCurrentData()));

    syncState.set({ status: 'compacting', message: 'Compacting GitHub history' });
    await compactingStore.compactData(prepareDataForSave(getCurrentData()));
    if (githubPersistence !== compactingStore) return;

    const compactedData = await compactingStore.loadData();
    if (githubPersistence !== compactingStore) return;

    replaceData(mergeDogpileData(getCurrentData(), compactedData));
    await localPersistence?.saveData(prepareDataForSave(getCurrentData()));
    markGitHubCompacted();
    markSynced(
      getCurrentData(),
      mode === 'auto' ? 'Auto-compacted GitHub history' : 'Compacted GitHub history'
    );
  } catch (error) {
    if (githubPersistence === compactingStore) {
      syncState.set({ status: 'error', message: describeError(error) });
    }
  } finally {
    githubCompactionInFlight = false;

    if (githubPersistence === compactingStore) {
      startGitHubPolling();
    }

    if (saveAgainAfterFlight) {
      saveAgainAfterFlight = false;
      scheduleGitHubSave(getCurrentData());
    }
  }
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
    void pollGitHubData();
  }, delay);
}

async function pollGitHubData() {
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
    const remoteData = await pollingStore.loadData();
    if (githubPersistence !== pollingStore) return;

    if (!pollingStore.remoteFileExists) {
      syncState.set({ status: 'error', message: 'GitHub todo file was not found.' });
      return;
    }

    await reconcilePolledData(remoteData);
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

async function reconcilePolledData(remoteData: DogpileData) {
  const remoteSignature = getDataSignature(remoteData);

  if (remoteSignature === lastSyncedSignature) {
    if (hasUnsyncedLocalChanges()) {
      await saveGitHubData(getCurrentData());
      return;
    }

    markSynced(getCurrentData());
    return;
  }

  if (!hasUnsyncedLocalChanges()) {
    replaceData(remoteData);
    await localPersistence?.saveData(prepareDataForSave(getCurrentData()));
    markSynced(getCurrentData(), 'Updated from GitHub');
    return;
  }

  syncState.set({ status: 'conflict', message: 'Merging remote GitHub changes' });

  const mergedData = mergeDogpileData(getCurrentData(), remoteData);
  replaceData(mergedData);
  await localPersistence?.saveData(prepareDataForSave(getCurrentData()));
  await saveGitHubData(getCurrentData());
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

function mergePlannedTasksById(localTasks: PlannedTask[], remoteTasks: PlannedTask[]) {
  const tasksById = new Map<string, PlannedTask>();

  for (const task of remoteTasks) {
    tasksById.set(task.id, task);
  }

  for (const task of localTasks) {
    const existing = tasksById.get(task.id);
    if (!existing || new Date(task.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
      tasksById.set(task.id, task);
    }
  }

  return normalizePlannedTaskOrder(Array.from(tasksById.values()));
}

function mergeDogpileData(localData: DogpileData, remoteData: DogpileData): DogpileData {
  return prepareDataForSave({
    todos: mergeTodosById(localData.todos, remoteData.todos),
    plannedTasks: mergePlannedTasksById(localData.plannedTasks, remoteData.plannedTasks),
    notesMarkdown: mergeNotesMarkdown(localData, remoteData)
  });
}

function mergeNotesMarkdown(localData: DogpileData, remoteData: DogpileData) {
  if (localData.notesMarkdown === remoteData.notesMarkdown) {
    return localData.notesMarkdown;
  }

  const baseMarkdown = lastSyncedData?.notesMarkdown;
  if (baseMarkdown !== undefined) {
    const localChanged = localData.notesMarkdown !== baseMarkdown;
    const remoteChanged = remoteData.notesMarkdown !== baseMarkdown;

    if (!localChanged && remoteChanged) {
      return remoteData.notesMarkdown;
    }
  }

  return localData.notesMarkdown;
}

function getTopOpenTodoOrder(todos: TodoItem[]) {
  const openOrders = todos.filter((todo) => !todo.completed).map((todo) => todo.order);
  if (openOrders.length) return Math.min(...openOrders) - 1000;

  const completedOrders = todos.filter((todo) => todo.completed).map((todo) => todo.order);
  if (completedOrders.length) return Math.max(...completedOrders) + 1000;

  return 1000;
}

function getTopPlannedTaskOrder(tasks: PlannedTask[]) {
  if (!tasks.length) return 1000;

  return Math.min(...tasks.map((task) => task.order)) - 1000;
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
  void pollGitHubData();
}

function canPollGitHub() {
  return !document.hidden && navigator.onLine;
}

function hasPendingGitHubSave() {
  return Boolean(githubSaveTimer || githubSaveInFlight || saveAgainAfterFlight || githubCompactionInFlight);
}

function hasUnsyncedLocalChanges() {
  return hasPendingGitHubSave() || getDataSignature(getCurrentData()) !== lastSyncedSignature;
}

function markSynced(data: DogpileData, message = 'Synced with GitHub') {
  const syncedData = prepareDataForSave(data);

  lastSyncedSignature = getDataSignature(syncedData);
  lastSyncedData = cloneData(syncedData);
  syncState.set({
    status: 'synced',
    message,
    lastSyncedAt: new Date().toISOString()
  });
}

function queueGitHubAutoCompaction(store: GitHubTodoStore) {
  if (!browser) return;

  window.setTimeout(() => {
    void maybeAutoCompactGitHubHistory(store);
  }, 0);
}

async function maybeAutoCompactGitHubHistory(store: GitHubTodoStore) {
  if (githubPersistence !== store || githubCompactionInFlight || hasPendingGitHubSave()) return;

  const settings = loadPersistenceSettings();
  if (!hasGitHubSettings(settings) || !settings.github.autoCompactWeekly) return;

  const currentWeek = getWeekKey();
  if (settings.github.lastCompactedWeek === currentWeek) return;

  await compactGitHubHistory(store, 'auto');
}

function markGitHubCompacted() {
  const settings = loadPersistenceSettings();
  if (!hasGitHubSettings(settings)) return;

  const nextSettings = normalizePersistenceSettings({
    ...settings,
    github: {
      ...settings.github,
      lastCompactedAt: new Date().toISOString(),
      lastCompactedWeek: getWeekKey()
    }
  });

  savePersistenceSettings(nextSettings);
  persistenceSettings.set(nextSettings);
}

async function waitForGitHubSaveIdle() {
  while (githubSaveInFlight) {
    await delay(50);
  }
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function getWeekKey(date = new Date()) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);

  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);

  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function getDataSignature(data: DogpileData) {
  return JSON.stringify(prepareDataForSave(data));
}

function cloneData(data: DogpileData): DogpileData {
  return {
    todos: data.todos.map((todo) => ({ ...todo, tags: [...todo.tags] })),
    plannedTasks: data.plannedTasks.map((task) => ({ ...task, tags: [...task.tags] })),
    notesMarkdown: data.notesMarkdown
  };
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
