<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import DailyCard from '$lib/components/DailyCard.svelte';
  import DurationPrompt from '$lib/components/DurationPrompt.svelte';
  import HistoryView from '$lib/components/HistoryView.svelte';
  import SettingsModal from '$lib/components/SettingsModal.svelte';
  import TopBar from '$lib/components/TopBar.svelte';
  import {
    addTodo,
    compactGitHubHistoryNow,
    deleteTodo,
    loadTodos,
    persistenceSettings,
    reorderVisibleTodos,
    syncState,
    syncTodosNow,
    todoItems,
    toggleTodoComplete,
    updatePersistenceSettings,
    updateTodo
  } from '$lib/stores/todos';
  import type { PersistenceSettings } from '$lib/persistence/persistenceSettings';
  import type { CompletionFilter, HistoryRange, TodoItem } from '$lib/types';
  import { getUniqueSortedTags } from '$lib/filter/filterTagAutocomplete';
  import { filterTodos } from '$lib/filter/filterTodos';
  import { parseTodoFilter } from '$lib/filter/parseTodoFilter';
  import { toggleFilterTag } from '$lib/filter/toggleFilterTag';

  const FILTER_STORAGE_KEY = 'dogpile.filterText.v1';

  let filterText = '';
  let completionFilter: CompletionFilter = 'all';
  let historyRange: HistoryRange = 7;
  let filterError: string | null = null;
  let pendingDurationTodo: TodoItem | null = null;
  let settingsOpen = false;
  let filterStorageReady = false;

  $: parsedFilter = parseTodoFilter(filterText);
  $: filterError = parsedFilter.ok ? null : parsedFilter.error;
  $: activeFilterTags = parsedFilter.ok ? parsedFilter.query.tags : [];
  $: availableFilterTags = getUniqueSortedTags($todoItems.flatMap((todo) => todo.tags));

  function matchesStatus(todo: TodoItem, status: CompletionFilter) {
    if (status === 'completed' && !todo.completed) return false;
    if (status === 'incomplete' && todo.completed) return false;
    return true;
  }

  $: statusFilteredTodos = $todoItems.filter((todo) => matchesStatus(todo, completionFilter));
  $: filteredTodos = parsedFilter.ok ? filterTodos(statusFilteredTodos, parsedFilter.query) : [];
  $: todayCompleted = filteredTodos
    .filter((todo) => todo.completed && isToday(todo.completedAt))
    .sort(sortByOrder);
  $: incompleteTodos = filteredTodos.filter((todo) => !todo.completed).sort(sortByOrder);
  $: dailyTodos = [...todayCompleted, ...incompleteTodos];
  $: historyTodos = filteredTodos.filter((todo) => todo.completed && !isToday(todo.completedAt));
  $: if (browser && filterStorageReady) {
    localStorage.setItem(FILTER_STORAGE_KEY, filterText);
  }

  onMount(() => {
    filterText = localStorage.getItem(FILTER_STORAGE_KEY) ?? '';
    filterStorageReady = true;
    loadTodos();
  });

  function handleAddTodo(event: CustomEvent<{ title: string; notes: string; tags: string[] }>) {
    addTodo(event.detail);
  }

  function handleToggleComplete(event: CustomEvent<{ id: string; completed: boolean }>) {
    const { id, completed } = event.detail;

    if (completed) {
      pendingDurationTodo = $todoItems.find((todo) => todo.id === id) ?? null;
      return;
    }

    toggleTodoComplete(id, false);
  }

  function handleDurationChange(event: CustomEvent<{ id: string; durationMinutes?: number }>) {
    updateTodo(event.detail.id, { durationMinutes: event.detail.durationMinutes });
  }

  function handleHistoryMarkIncomplete(event: CustomEvent<{ id: string }>) {
    toggleTodoComplete(event.detail.id, false);
  }

  function completePendingTodo(durationMinutes?: number) {
    if (!pendingDurationTodo) return;

    toggleTodoComplete(pendingDurationTodo.id, true, durationMinutes);
    pendingDurationTodo = null;
  }

  async function handleSaveSettings(event: CustomEvent<PersistenceSettings>) {
    await updatePersistenceSettings(event.detail);
    settingsOpen = false;
  }

  function handleToggleTagFilter(event: CustomEvent<{ tag: string }>) {
    filterText = toggleFilterTag(filterText, event.detail.tag);
  }

  function sortByOrder(a: TodoItem, b: TodoItem) {
    return a.order - b.order;
  }

  function isToday(isoDate?: string) {
    if (!isoDate) return false;
    const date = new Date(isoDate);
    const today = new Date();
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  }
</script>

<svelte:head>
  <title>Dogpile</title>
  <meta
    name="description"
    content="A prioritized SvelteKit todo dashboard with daily task tracking."
  />
</svelte:head>

<main class="app-shell">
  <TopBar
    bind:filterText
    bind:completionFilter
    bind:historyRange
    {filterError}
    availableTags={availableFilterTags}
    sync={$syncState}
    on:openSettings={() => (settingsOpen = true)}
    on:syncNow={syncTodosNow}
  />

  <section class="workspace" aria-label="Dogpile workspace">
    <section class="history-pane" aria-label="Previous completed work">
      <HistoryView
        activeFilterTags={activeFilterTags}
        todos={historyTodos}
        range={historyRange}
        on:markIncomplete={handleHistoryMarkIncomplete}
        on:toggleTagFilter={handleToggleTagFilter}
        on:updateTodo={(event) => updateTodo(event.detail.id, event.detail.updates)}
      />
    </section>

    <aside class="daily-pane" aria-label="Today">
      <DailyCard
        activeFilterTags={activeFilterTags}
        todos={dailyTodos}
        on:addTodo={handleAddTodo}
        on:deleteTodo={(event) => deleteTodo(event.detail.id)}
        on:durationChange={handleDurationChange}
        on:reorderTodos={(event) => reorderVisibleTodos(event.detail.ids)}
        on:toggleTagFilter={handleToggleTagFilter}
        on:toggleComplete={handleToggleComplete}
        on:updateTodo={(event) => updateTodo(event.detail.id, event.detail.updates)}
      />
    </aside>
  </section>
</main>

{#if pendingDurationTodo}
  <DurationPrompt
    todo={pendingDurationTodo}
    on:cancel={() => (pendingDurationTodo = null)}
    on:saveDuration={(event) => completePendingTodo(event.detail.durationMinutes)}
    on:skip={() => completePendingTodo()}
  />
{/if}

{#if settingsOpen}
  <SettingsModal
    settings={$persistenceSettings}
    sync={$syncState}
    on:compactGitHubHistory={compactGitHubHistoryNow}
    on:close={() => (settingsOpen = false)}
    on:save={handleSaveSettings}
    on:syncNow={syncTodosNow}
  />
{/if}
