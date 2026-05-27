<script lang="ts">
  import { onMount } from 'svelte';
  import DailyCard from '$lib/components/DailyCard.svelte';
  import DurationPrompt from '$lib/components/DurationPrompt.svelte';
  import HistoryView from '$lib/components/HistoryView.svelte';
  import TopBar from '$lib/components/TopBar.svelte';
  import {
    addTodo,
    deleteTodo,
    loadTodos,
    reorderVisibleTodos,
    todoItems,
    toggleTodoComplete,
    updateTodo
  } from '$lib/stores/todos';
  import type { CompletionFilter, HistoryRange, TodoItem } from '$lib/types';
  import { filterTodos } from '$lib/filter/filterTodos';
  import { parseTodoFilter } from '$lib/filter/parseTodoFilter';

  let filterText = '';
  let completionFilter: CompletionFilter = 'all';
  let historyRange: HistoryRange = 7;
  let filterError: string | null = null;
  let pendingDurationTodo: TodoItem | null = null;

  $: parsedFilter = parseTodoFilter(filterText);
  $: filterError = parsedFilter.ok ? null : parsedFilter.error;

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

  onMount(() => {
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

  function completePendingTodo(durationMinutes?: number) {
    if (!pendingDurationTodo) return;

    toggleTodoComplete(pendingDurationTodo.id, true, durationMinutes);
    pendingDurationTodo = null;
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
  />

  <section class="workspace" aria-label="Dogpile workspace">
    <section class="history-pane" aria-label="Previous completed work">
      <HistoryView todos={historyTodos} range={historyRange} />
    </section>

    <aside class="daily-pane" aria-label="Today">
      <DailyCard
        todos={dailyTodos}
        on:addTodo={handleAddTodo}
        on:deleteTodo={(event) => deleteTodo(event.detail.id)}
        on:durationChange={handleDurationChange}
        on:reorderTodos={(event) => reorderVisibleTodos(event.detail.ids)}
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
