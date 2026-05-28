<script lang="ts">
  import { ChevronDown, ChevronRight, Pencil, Save, Undo2, X } from '@lucide/svelte';
  import { createEventDispatcher } from 'svelte';
  import { parseEditableTag } from '$lib/parseEditableTag';
  import type { TodoItem } from '$lib/types';

  export let todo: TodoItem;
  export let activeFilterTags: string[] = [];

  const dispatch = createEventDispatcher<{
    markIncomplete: { id: string };
    toggleTagFilter: { tag: string };
    updateTodo: { id: string; updates: Partial<TodoItem> };
  }>();

  let editing = false;
  let notesExpanded = false;
  let titleDraft = todo.title;
  let notesDraft = todo.notes ?? '';
  let durationDraft = todo.durationMinutes?.toString() ?? '';
  let tagDraft = '';
  let tagError = '';

  $: hasNotes = Boolean(todo.notes?.trim());
  $: notesDirty = notesDraft !== (todo.notes ?? '');
  $: activeFilterTagSet = new Set(activeFilterTags.map((tag) => tag.toLowerCase()));

  $: if (!editing) {
    titleDraft = todo.title;
    notesDraft = todo.notes ?? '';
    durationDraft = todo.durationMinutes?.toString() ?? '';
    tagDraft = '';
    tagError = '';
  }

  $: if (!hasNotes) {
    notesExpanded = false;
  }

  function saveEdits() {
    if (!titleDraft.trim()) return;

    const duration = parseDuration(durationDraft);
    const updates: Partial<TodoItem> = {
      title: titleDraft,
      notes: notesDraft,
      durationMinutes: duration
    };

    if (tagDraft.trim()) {
      const tag = parseEditableTag(tagDraft);

      if (!tag) {
        tagError = 'No spaces in tags.';
        return;
      }

      updates.tags = mergeTags(todo.tags, [tag]);
    }

    dispatch('updateTodo', { id: todo.id, updates });
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

  function addTag(value = tagDraft) {
    if (!value.trim()) {
      tagError = '';
      return;
    }

    const tag = parseEditableTag(value);
    if (!tag) {
      tagError = 'No spaces in tags.';
      return;
    }

    const tags = mergeTags(todo.tags, [tag]);
    tagDraft = '';
    tagError = '';

    if (tags.length === todo.tags.length) return;

    dispatch('updateTodo', { id: todo.id, updates: { tags } });
  }

  function removeTag(tag: string) {
    dispatch('updateTodo', {
      id: todo.id,
      updates: {
        tags: todo.tags.filter((existingTag) => existingTag.toLowerCase() !== tag.toLowerCase())
      }
    });
  }

  function handleSaveKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.target instanceof HTMLTextAreaElement) return;

    event.preventDefault();
    saveEdits();
  }

  function handleTagKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;

    event.preventDefault();
    addTag((event.currentTarget as HTMLInputElement).value);
  }

  function parseDuration(value: string) {
    const trimmed = value.trim();
    const minutes = Number(trimmed);

    return trimmed === '' || !Number.isFinite(minutes) ? undefined : Math.max(0, Math.round(minutes));
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

<div class:editing class="history-todo-row">
  {#if editing}
    <div class="history-edit">
      <input
        bind:value={titleDraft}
        aria-label="Task title"
        type="text"
        on:keydown={handleSaveKeydown}
      />
      <textarea bind:value={notesDraft} aria-label="Notes" rows="2" placeholder="Notes"></textarea>
      <div class="history-edit-line">
        <label>
          <span>Min</span>
          <input
            bind:value={durationDraft}
            inputmode="numeric"
            min="0"
            type="number"
            on:keydown={handleSaveKeydown}
          />
        </label>
        <label>
          <span>Tag</span>
          <input
            bind:value={tagDraft}
            placeholder="tag, Enter"
            type="text"
            on:keydown={handleTagKeydown}
          />
        </label>
      </div>
      {#if tagError}
        <p class="tag-error">{tagError}</p>
      {/if}
    </div>
  {:else}
    <div class="history-todo-main">
      <strong>{todo.title}</strong>
    </div>
  {/if}

  <div class="history-todo-actions">
    {#if editing}
      <button class="icon-button" aria-label="Save history task" title="Save" type="button" on:click={saveEdits}>
        <Save size={15} aria-hidden="true" />
      </button>
      <button
        class="icon-button"
        aria-label="Cancel editing history task"
        title="Cancel"
        type="button"
        on:click={() => (editing = false)}
      >
        <X size={15} aria-hidden="true" />
      </button>
    {:else}
      <span class="history-duration">{formatDuration(todo.durationMinutes)}</span>
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
          <ChevronDown size={15} aria-hidden="true" />
        {:else}
          <ChevronRight size={15} aria-hidden="true" />
        {/if}
      </button>
      <button
        class="icon-button"
        aria-label="Edit history task"
        title="Edit"
        type="button"
        on:click={() => (editing = true)}
      >
        <Pencil size={15} aria-hidden="true" />
      </button>
      <button
        class="icon-button"
        aria-label="Mark incomplete"
        title="Mark incomplete"
        type="button"
        on:click={() => dispatch('markIncomplete', { id: todo.id })}
      >
        <Undo2 size={15} aria-hidden="true" />
      </button>
    {/if}
  </div>

  {#if !editing && hasNotes}
    <p class="history-note-preview">{todo.notes}</p>
  {/if}

  {#if todo.tags.length}
    <div class:editable-tags={editing} class="day-tag-list" aria-label="Tags">
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

  {#if !editing && notesExpanded}
    <div class="notes-panel history-notes-panel">
      <label>
        <span>Notes</span>
        <textarea bind:value={notesDraft} rows="3" placeholder="Add notes"></textarea>
      </label>
      <button
        class="secondary-button compact-save"
        disabled={!notesDirty}
        type="button"
        on:click={saveNotes}
      >
        <Save size={14} aria-hidden="true" />
        Save notes
      </button>
    </div>
  {/if}
</div>
