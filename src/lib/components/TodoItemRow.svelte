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
  import { parseEditableTag } from '$lib/parseEditableTag';
  import type { TodoItem } from '$lib/types';

  export let todo: TodoItem;
  export let draggableRow = false;
  export let activeFilterTags: string[] = [];

  const dispatch = createEventDispatcher<{
    deleteTodo: { id: string };
    durationChange: { id: string; durationMinutes?: number };
    toggleTagFilter: { tag: string };
    toggleComplete: { id: string; completed: boolean };
    updateTodo: { id: string; updates: Partial<TodoItem> };
  }>();

  let editing = false;
  let notesExpanded = false;
  let titleDraft = todo.title;
  let notesDraft = todo.notes ?? '';
  let tagDraft = '';
  let tagError = '';
  let durationDraft: string | number = todo.durationMinutes?.toString() ?? '';

  $: hasNotes = Boolean(todo.notes?.trim());
  $: notesDirty = notesDraft !== (todo.notes ?? '');
  $: activeFilterTagSet = new Set(activeFilterTags.map((tag) => tag.toLowerCase()));

  $: if (!editing) {
    titleDraft = todo.title;
    notesDraft = todo.notes ?? '';
    tagDraft = '';
    tagError = '';
  }

  $: if (browser && document.activeElement?.id !== `duration-${todo.id}`) {
    durationDraft = todo.durationMinutes?.toString() ?? '';
  }

  $: if (!hasNotes) {
    notesExpanded = false;
  }

  function saveEdits() {
    if (!titleDraft.trim()) return;

    const updates: Partial<TodoItem> = {
      title: titleDraft,
      notes: notesDraft
    };

    if (tagDraft.trim()) {
      const tag = parseEditableTag(tagDraft);

      if (!tag) {
        tagError = 'Tags cannot contain spaces.';
        return;
      }

      updates.tags = mergeTags(todo.tags, [tag]);
    }

    dispatch('updateTodo', {
      id: todo.id,
      updates
    });
    tagDraft = '';
    tagError = '';
    editing = false;
  }

  function handleTitleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;

    event.preventDefault();
    saveEdits();
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

  function addTags(value = tagDraft) {
    const tag = parseEditableTag(value);

    if (!value.trim()) {
      tagError = '';
      return;
    }

    if (!tag) {
      tagError = 'Tags cannot contain spaces.';
      return;
    }

    const nextTags = mergeTags(todo.tags, [tag]);
    tagDraft = '';
    tagError = '';

    if (nextTags.length === todo.tags.length) return;

    dispatch('updateTodo', {
      id: todo.id,
      updates: { tags: nextTags }
    });
  }

  function handleTagKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;

    event.preventDefault();
    addTags((event.currentTarget as HTMLInputElement).value);
  }

  function removeTag(tag: string) {
    dispatch('updateTodo', {
      id: todo.id,
      updates: {
        tags: todo.tags.filter((existingTag) => existingTag.toLowerCase() !== tag.toLowerCase())
      }
    });
  }

  function mergeTags(existingTags: string[], addedTags: string[]) {
    const seenTags = new Set(existingTags.map((tag) => tag.toLowerCase()));
    const nextTags = [...existingTags];

    for (const tag of addedTags) {
      const normalizedTag = tag.trim();
      const key = normalizedTag.toLowerCase();

      if (!normalizedTag || seenTags.has(key)) continue;

      seenTags.add(key);
      nextTags.push(normalizedTag);
    }

    return nextTags;
  }

  function isFilterTagActive(tag: string) {
    return activeFilterTagSet.has(tag.toLowerCase());
  }
</script>

<div class:completed={todo.completed} class:draggable={draggableRow} class="todo-row">
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
          <input bind:value={titleDraft} type="text" on:keydown={handleTitleKeydown} />
        </label>
        <form class="tag-entry" on:submit|preventDefault={() => addTags()}>
          <label>
            <span>Add tag</span>
            <input
              bind:value={tagDraft}
              placeholder="tag, Enter to add"
              type="text"
              on:keydown={handleTagKeydown}
            />
          </label>
          {#if tagError}
            <p class="tag-error">{tagError}</p>
          {/if}
        </form>
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
        aria-expanded={hasNotes ? notesExpanded : undefined}
        aria-label={hasNotes ? (notesExpanded ? 'Collapse notes' : 'Expand notes') : 'No notes'}
        disabled={!hasNotes}
        title={hasNotes ? (notesExpanded ? 'Collapse notes' : 'Expand notes') : 'No notes'}
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

  {#if !editing && hasNotes}
    <p class="todo-note-preview todo-row-wide">{todo.notes}</p>
  {/if}

  {#if todo.tags.length}
    <div class:editable-tags={editing} class="tag-list todo-row-wide" aria-label="Tags">
      {#each todo.tags as tag}
        {#if editing}
          <button class="tag-chip" type="button" on:click={() => removeTag(tag)}>
            {tag}
            <X size={12} aria-hidden="true" />
          </button>
        {:else}
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
        {/if}
      {/each}
    </div>
  {/if}

  {#if notesExpanded}
    <div class="notes-panel todo-row-wide">
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
