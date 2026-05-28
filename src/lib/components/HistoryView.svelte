<script lang="ts">
  import { browser } from '$app/environment';
  import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte';
  import type { HistoryRange, TodoItem } from '$lib/types';
  import DayCard from './DayCard.svelte';

  type HistoryDay = {
    key: string;
    date: Date;
    todos: TodoItem[];
    totalMinutes: number;
  };

  export let todos: TodoItem[] = [];
  export let range: HistoryRange = 7;
  export let activeFilterTags: string[] = [];

  const dispatch = createEventDispatcher<{
    markIncomplete: { id: string };
    toggleTagFilter: { tag: string };
    updateTodo: { id: string; updates: Partial<TodoItem> };
  }>();

  let railElement: HTMLDivElement;
  let canScrollHistoryLeft = false;
  let canScrollHistoryRight = false;
  let leftEdgeHeight = 100;
  let rightEdgeHeight = 100;

  $: days = buildDays(range, todos);
  $: columns = buildColumns(days);
  $: scrollKey = `${range}:${days[0]?.key ?? ''}:${days[days.length - 1]?.key ?? ''}`;
  $: if (browser && railElement && scrollKey) {
    void scrollToNewest();
  }

  onMount(() => {
    window.addEventListener('resize', updateScrollEdges);
    void scrollToNewest();
  });

  onDestroy(() => {
    if (!browser) return;

    window.removeEventListener('resize', updateScrollEdges);
  });

  function buildDays(dayCount: HistoryRange, completedTodos: TodoItem[]): HistoryDay[] {
    const today = startOfDay(new Date());
    const byDate = new Map<string, TodoItem[]>();

    for (const todo of completedTodos) {
      if (!todo.completedAt) continue;
      const key = toDateKey(new Date(todo.completedAt));
      const bucket = byDate.get(key) ?? [];
      bucket.push(todo);
      byDate.set(key, bucket);
    }

    return Array.from({ length: dayCount }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - dayCount + index);
      const key = toDateKey(date);
      const dayTodos = (byDate.get(key) ?? []).sort((a, b) => {
        const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        return bTime - aTime;
      });

      return {
        key,
        date,
        todos: dayTodos,
        totalMinutes: dayTodos.reduce((sum, todo) => sum + (todo.durationMinutes ?? 0), 0)
      };
    });
  }

  function startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function toDateKey(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate()
    ).padStart(2, '0')}`;
  }

  function buildColumns(currentDays: HistoryDay[]) {
    const rowsPerColumn = 3;
    const newestFirst = currentDays.slice().reverse();
    const nextColumns: { key: string; days: HistoryDay[] }[] = [];

    for (let index = 0; index < newestFirst.length; index += rowsPerColumn) {
      const columnDays = newestFirst.slice(index, index + rowsPerColumn);
      nextColumns.unshift({
        key: columnDays.map((day) => day.key).join(':'),
        days: columnDays
      });
    }

    return nextColumns;
  }

  async function scrollToNewest() {
    if (!railElement || !days.length) {
      updateScrollEdges();
      return;
    }

    await tick();
    await new Promise(requestAnimationFrame);
    railElement.scrollTo({
      left: railElement.scrollWidth - railElement.clientWidth,
      behavior: 'auto'
    });
    updateScrollEdges();
  }

  function updateScrollEdges() {
    if (!railElement) {
      canScrollHistoryLeft = false;
      canScrollHistoryRight = false;
      return;
    }

    const maxScrollLeft = Math.max(0, railElement.scrollWidth - railElement.clientWidth);
    const currentScrollLeft = Math.max(0, railElement.scrollLeft);
    canScrollHistoryLeft = currentScrollLeft > 2;
    canScrollHistoryRight = currentScrollLeft < maxScrollLeft - 2;
    leftEdgeHeight = getEdgeColumnHeight('left');
    rightEdgeHeight = getEdgeColumnHeight('right');
  }

  function getEdgeColumnHeight(edge: 'left' | 'right') {
    if (!railElement) return 100;

    const railBounds = railElement.getBoundingClientRect();
    const edgeX = edge === 'left' ? railBounds.left + 1 : railBounds.right - 1;
    const columns = Array.from(railElement.querySelectorAll<HTMLElement>('.history-column'));
    const edgeColumn =
      columns.find((column) => {
        const bounds = column.getBoundingClientRect();
        return bounds.left <= edgeX && bounds.right >= edgeX;
      }) ??
      (edge === 'left'
        ? columns.find((column) => column.getBoundingClientRect().right > railBounds.left)
        : columns
            .slice()
            .reverse()
            .find((column) => column.getBoundingClientRect().left < railBounds.right));

    const cardCount = Math.max(1, Math.min(3, edgeColumn?.childElementCount ?? 3));
    return (cardCount / 3) * 100;
  }
</script>

<div class="history-header">
  <div>
    <p class="eyebrow">History</p>
    <h2>Previous {range} days</h2>
  </div>
</div>

<div class="history-rail-shell">
  <div
    class:left-visible={canScrollHistoryLeft}
    class="history-edge left"
    style={`--history-edge-height: ${leftEdgeHeight}%;`}
    aria-hidden="true"
  ></div>
  <div
    bind:this={railElement}
    class="history-grid"
    aria-label="Previous completed days"
    on:scroll={updateScrollEdges}
  >
    {#each columns as column (column.key)}
      <div class="history-column">
        {#each column.days as day (day.key)}
          <DayCard
            activeFilterTags={activeFilterTags}
            {day}
            on:markIncomplete={(event) => dispatch('markIncomplete', event.detail)}
            on:toggleTagFilter={(event) => dispatch('toggleTagFilter', event.detail)}
            on:updateTodo={(event) => dispatch('updateTodo', event.detail)}
          />
        {/each}
      </div>
    {/each}
  </div>
  <div
    class:right-visible={canScrollHistoryRight}
    class="history-edge right"
    style={`--history-edge-height: ${rightEdgeHeight}%;`}
    aria-hidden="true"
  ></div>
</div>
