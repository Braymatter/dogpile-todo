<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Plus } from '@lucide/svelte';
  import { parseDashTagInput } from '$lib/parseDashTagInput';
  import type { TodoItem } from '$lib/types';
  import TodoItemRow from './TodoItemRow.svelte';

  export let todos: TodoItem[] = [];

  const dispatch = createEventDispatcher<{
    addTodo: { title: string; notes: string; tags: string[] };
    deleteTodo: { id: string };
    durationChange: { id: string; durationMinutes?: number };
    reorderTodos: { ids: string[] };
    toggleComplete: { id: string; completed: boolean };
    updateTodo: { id: string; updates: Partial<TodoItem> };
  }>();

  let quickAdd = '';
  let draggedId: string | null = null;
  let dropIndex: number | null = null;
  let listElement: HTMLDivElement;

  $: todayTitle = new Intl.DateTimeFormat(undefined, {
    month: 'long',
    day: 'numeric'
  }).format(new Date());
  $: openCount = todos.filter((todo) => !todo.completed).length;

  function submitTodo(value = quickAdd) {
    const parsed = parseDashTagInput(value);
    if (!parsed.text) return;

    dispatch('addTodo', {
      title: parsed.text,
      notes: '',
      tags: parsed.tags
    });

    quickAdd = '';
  }

  function handleQuickAddKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;

    event.preventDefault();
    submitTodo((event.currentTarget as HTMLInputElement).value);
  }

  function handlePointerDown(event: PointerEvent, id: string) {
    if (!(event.target as HTMLElement).closest('.drag-handle')) return;

    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
    draggedId = id;
    dropIndex = todos.findIndex((todo) => todo.id === id);
  }

  function handlePointerMove(event: PointerEvent) {
    if (!draggedId) return;

    event.preventDefault();
    const rows = Array.from(listElement.querySelectorAll<HTMLElement>('.drag-wrapper'));
    const nextDropIndex = rows.findIndex((row) => {
      const bounds = row.getBoundingClientRect();
      return event.clientY < bounds.top + bounds.height / 2;
    });

    dropIndex = nextDropIndex === -1 ? rows.length : nextDropIndex;
  }

  function handlePointerUp(event: PointerEvent) {
    if (draggedId) {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    }

    dropAtCurrentIndex();
  }

  function handleDragEnd() {
    draggedId = null;
    dropIndex = null;
  }

  function dropAtCurrentIndex() {
    if (!draggedId || dropIndex === null) return;

    const ids = todos.map((todo) => todo.id);
    const fromIndex = ids.indexOf(draggedId);
    if (fromIndex === -1) return;

    let insertionIndex = dropIndex;
    ids.splice(fromIndex, 1);

    if (fromIndex < insertionIndex) {
      insertionIndex -= 1;
    }

    ids.splice(Math.max(0, Math.min(insertionIndex, ids.length)), 0, draggedId);
    dispatch('reorderTodos', { ids });
    handleDragEnd();
  }
</script>

<article class="daily-card card">
  <div class="card-heading">
    <div>
      <p class="eyebrow">Daily</p>
      <h2>{todayTitle}</h2>
    </div>
    <span class="count-pill">{openCount} open</span>
  </div>

  <section class="daily-list-shell" aria-label="Daily tasks">
    {#if todos.length}
      <div bind:this={listElement} class="task-list daily-task-list" role="list">
        {#each todos as todo, index (todo.id)}
          {#if dropIndex === index && draggedId !== todo.id}
            <div class="drop-indicator" role="presentation"></div>
          {/if}
          <div
            class="drag-wrapper"
            class:dragging={draggedId === todo.id}
            role="listitem"
            on:pointercancel={handleDragEnd}
            on:pointerdown={(event) => handlePointerDown(event, todo.id)}
            on:pointermove={handlePointerMove}
            on:pointerup={handlePointerUp}
          >
            <TodoItemRow
              {todo}
              draggableRow
              on:deleteTodo={(event) => dispatch('deleteTodo', event.detail)}
              on:durationChange={(event) => dispatch('durationChange', event.detail)}
              on:toggleComplete={(event) => dispatch('toggleComplete', event.detail)}
              on:updateTodo={(event) => dispatch('updateTodo', event.detail)}
            />
          </div>
        {/each}
        {#if dropIndex === todos.length}
          <div class="drop-indicator" role="presentation"></div>
        {/if}
      </div>
    {:else}
      <p class="empty-state page-empty">No tasks match this view.</p>
    {/if}

    <form class="quick-add" on:submit|preventDefault={() => submitTodo()}>
      <Plus size={18} aria-hidden="true" />
      <input
        aria-label="Add task"
        bind:value={quickAdd}
        placeholder="Task Name -TagA -TagB"
        type="text"
        on:keydown={handleQuickAddKeydown}
      />
    </form>
  </section>
</article>
