<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { TodoItem } from '$lib/types';

  export let day: {
    key: string;
    date: Date;
    todos: TodoItem[];
    totalMinutes: number;
  };
  export let activeFilterTags: string[] = [];

  const dispatch = createEventDispatcher<{
    toggleTagFilter: { tag: string };
  }>();

  $: title = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  }).format(day.date);
  $: activeFilterTagSet = new Set(activeFilterTags.map((tag) => tag.toLowerCase()));

  function formatDuration(minutes: number | undefined) {
    if (!minutes) return '0m';

    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;

    if (hours && remainder) return `${hours}h ${remainder}m`;
    if (hours) return `${hours}h`;
    return `${remainder}m`;
  }

  function isFilterTagActive(tag: string) {
    return activeFilterTagSet.has(tag.toLowerCase());
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
              <div class="day-tag-list" aria-label="Tags">
                {#each todo.tags as tag}
                  <button
                    class:active={isFilterTagActive(tag)}
                    class="tag-chip filter-tag"
                    aria-pressed={isFilterTagActive(tag)}
                    title={isFilterTagActive(tag) ? 'Remove tag from filter' : 'Add tag to filter'}
                    type="button"
                    on:click={() => dispatch('toggleTagFilter', { tag })}
                  >
                    {tag}
                  </button>
                {/each}
              </div>
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
