<script lang="ts">
  import { createEventDispatcher, onMount, tick } from 'svelte';
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
    toggleTagFilter: { tag: string };
  }>();

  let railElement: HTMLDivElement;

  $: days = buildDays(range, todos);
  $: columns = buildColumns(days);
  $: scrollKey = `${range}:${days[0]?.key ?? ''}:${days[days.length - 1]?.key ?? ''}`;
  $: if (railElement && scrollKey) {
    void scrollToNewest();
  }

  onMount(() => {
    void scrollToNewest();
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
    if (!railElement || !days.length) return;

    await tick();
    await new Promise(requestAnimationFrame);
    railElement.scrollTo({
      left: railElement.scrollWidth - railElement.clientWidth,
      behavior: 'auto'
    });
  }
</script>

<div class="history-header">
  <div>
    <p class="eyebrow">History</p>
    <h2>Previous {range} days</h2>
  </div>
</div>

<div bind:this={railElement} class="history-grid" aria-label="Previous completed days">
  {#each columns as column (column.key)}
    <div class="history-column">
      {#each column.days as day (day.key)}
        <DayCard
          activeFilterTags={activeFilterTags}
          {day}
          on:toggleTagFilter={(event) => dispatch('toggleTagFilter', event.detail)}
        />
      {/each}
    </div>
  {/each}
</div>
