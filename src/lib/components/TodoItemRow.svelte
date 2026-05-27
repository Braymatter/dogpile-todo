<script lang="ts">
  import { browser } from '$app/environment';
  import { createEventDispatcher } from 'svelte';
  import {
    Check,
    ChevronDown,
    ChevronRight,
    GripVertical,
    Pencil,
    Save,
    Trash2,
    Undo2,
    X
  } from '@lucide/svelte';
  import type { TodoItem } from '$lib/types';

  export let todo: TodoItem;
  export let draggableRow = false;

  const dispatch = createEventDispatcher<{
    deleteTodo: { id: string };
    durationChange: { id: string; durationMinutes?: number };
    toggleComplete: { id: string; completed: boolean };
    updateTodo: { id: string; updates: Partial<TodoItem> };
  }>();

  let editing = false;
  let notesExpanded = false;
  let titleDraft = todo.title;
  let notesDraft = todo.notes ?? '';
  let tagsDraft = todo.tags.join(', ');
  let durationDraft: string | number = todo.durationMinutes?.toString() ?? '';
  $: notesDirty = notesDraft !== (todo.notes ?? '');

  $: if (!editing) {
    titleDraft = todo.title;
    notesDraft = todo.notes ?? '';
    tagsDraft = todo.tags.join(', ');
  }

  $: if (browser && document.activeElement?.id !== `duration-${todo.id}`) {
    durationDraft = todo.durationMinutes?.toString() ?? '';
  }

  function saveEdits() {
    if (!titleDraft.trim()) return;

    dispatch('updateTodo', {
      id: todo.id,
      updates: {
        title: titleDraft,
        notes: notesDraft,
        tags: parseTags(tagsDraft)
      }
    });
    editing = false;
  }

  function saveNotes() {
    dispatch('updateTodo', {
      id: todo.id,
      updates: {
        notes: notesDraft
      }
    });
  }

  function saveDuration() {
    const trimmed = String(durationDraft).trim();
    const minutes = Number(trimmed);

    dispatch('durationChange', {
      id: todo.id,
      durationMinutes:
        trimmed === '' || !Number.isFinite(minutes) ? undefined : Math.max(0, Math.round(minutes))
    });
  }

  function parseTags(value: string) {
    return value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
</script>

<div class:completed={todo.completed} class="todo-row">
  {#if draggableRow}
    <span class="drag-handle" aria-hidden="true">
      <GripVertical size={17} />
    </span>
  {/if}

  <button
    class="icon-button complete-button"
    aria-label={todo.completed ? 'Mark incomplete' : 'Mark complete'}
    title={todo.completed ? 'Mark incomplete' : 'Mark complete'}
    type="button"
    on:click={() => dispatch('toggleComplete', { id: todo.id, completed: !todo.completed })}
  >
    {#if todo.completed}
      <Undo2 size={16} aria-hidden="true" />
    {:else}
      <Check size={16} aria-hidden="true" />
    {/if}
  </button>

  <div class="todo-content">
    {#if editing}
      <div class="edit-grid">
        <label>
          <span>Task</span>
          <input bind:value={titleDraft} type="text" />
        </label>
        <label>
          <span>Tags</span>
          <input bind:value={tagsDraft} type="text" />
        </label>
      </div>
    {:else}
      <div class="todo-title-row">
        <strong>{todo.title}</strong>
        {#if todo.completed}
          <label class="duration-field">
            <span>min</span>
            <input
              id={`duration-${todo.id}`}
              bind:value={durationDraft}
              inputmode="numeric"
              min="0"
              type="number"
              on:change={saveDuration}
            />
          </label>
        {/if}
      </div>

      {#if todo.tags.length}
        <div class="tag-list" aria-label="Tags">
          {#each todo.tags as tag}
            <span>{tag}</span>
          {/each}
        </div>
      {/if}
    {/if}

    {#if notesExpanded}
      <div class="notes-panel">
        <label>
          <span>Notes</span>
          <textarea bind:value={notesDraft} rows="4" placeholder="Add notes"></textarea>
        </label>
        <button
          class="secondary-button compact-save"
          disabled={!notesDirty}
          type="button"
          on:click={saveNotes}
        >
          <Save size={15} aria-hidden="true" />
          Save notes
        </button>
      </div>
    {/if}
  </div>

  <div class="row-actions">
    {#if editing}
      <button
        class="icon-button"
        aria-label="Save task"
        title="Save"
        type="button"
        on:click={saveEdits}
      >
        <Save size={16} aria-hidden="true" />
      </button>
      <button
        class="icon-button"
        aria-label="Cancel editing"
        title="Cancel"
        type="button"
        on:click={() => (editing = false)}
      >
        <X size={16} aria-hidden="true" />
      </button>
    {:else}
      <button
        class="icon-button"
        aria-expanded={notesExpanded}
        aria-label={notesExpanded ? 'Collapse notes' : 'Expand notes'}
        title={notesExpanded ? 'Collapse notes' : 'Expand notes'}
        type="button"
        on:click={() => (notesExpanded = !notesExpanded)}
      >
        {#if notesExpanded}
          <ChevronDown size={16} aria-hidden="true" />
        {:else}
          <ChevronRight size={16} aria-hidden="true" />
        {/if}
      </button>
      <button
        class="icon-button"
        aria-label="Edit task"
        title="Edit"
        type="button"
        on:click={() => (editing = true)}
      >
        <Pencil size={16} aria-hidden="true" />
      </button>
      <button
        class="icon-button danger"
        aria-label="Delete task"
        title="Delete"
        type="button"
        on:click={() => dispatch('deleteTodo', { id: todo.id })}
      >
        <Trash2 size={16} aria-hidden="true" />
      </button>
    {/if}
  </div>
</div>
