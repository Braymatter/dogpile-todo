<script lang="ts">
  import type { TodoItem } from '$lib/types';

  export let day: {
    key: string;
    date: Date;
    todos: TodoItem[];
    totalMinutes: number;
  };

  $: title = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  }).format(day.date);

  function formatDuration(minutes: number | undefined) {
    if (!minutes) return '0m';

    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;

    if (hours && remainder) return `${hours}h ${remainder}m`;
    if (hours) return `${hours}h`;
    return `${remainder}m`;
  }
</script>

<article class="day-card card">
  <header>
    <h3>{title}</h3>
    <span>{day.todos.length}</span>
  </header>

  {#if day.todos.length}
    <ul>
      {#each day.todos as todo (todo.id)}
        <li>
          <div>
            <strong>{todo.title}</strong>
            {#if todo.tags.length}
              <p>{todo.tags.join(', ')}</p>
            {/if}
          </div>
          <span>{formatDuration(todo.durationMinutes)}</span>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="empty-state">No completed tasks.</p>
  {/if}

  <footer>
    <span>Total</span>
    <strong>{formatDuration(day.totalMinutes)}</strong>
  </footer>
</article>
