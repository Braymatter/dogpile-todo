<script lang="ts">
  import type { HistoryRange, TodoItem } from '$lib/types';
  import DayCard from './DayCard.svelte';

  export let todos: TodoItem[] = [];
  export let range: HistoryRange = 7;

  $: days = buildDays(range, todos);

  function buildDays(dayCount: HistoryRange, completedTodos: TodoItem[]) {
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
      date.setDate(today.getDate() - index - 1);
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
</script>

<div class="history-header">
  <div>
    <p class="eyebrow">History</p>
    <h2>Previous {range} days</h2>
  </div>
</div>

<div class:month-grid={range === 30} class="history-grid">
  {#each days as day (day.key)}
    <DayCard {day} />
  {/each}
</div>
