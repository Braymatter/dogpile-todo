<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import {
    ChevronDown,
    ChevronRight,
    GripVertical,
    Pencil,
    Save,
    Send,
    Trash2,
    X
  } from '@lucide/svelte';
  import { parseEditableTag } from '$lib/parseEditableTag';
  import type { PlannedTask } from '$lib/types';

  export let task: PlannedTask;
  export let activeFilterTags: string[] = [];

  const dispatch = createEventDispatcher<{
    deleteTask: { id: string };
    moveToTodo: { id: string };
    toggleTagFilter: { tag: string };
    updateTask: { id: string; updates: Partial<PlannedTask> };
  }>();

  let editing = false;
  let notesExpanded = false;
  let titleDraft = task.title;
  let notesDraft = task.notes ?? '';
  let tagDraft = '';
  let tagError = '';

  $: hasNotes = Boolean(task.notes?.trim());
  $: notesDirty = notesDraft !== (task.notes ?? '');
  $: activeFilterTagSet = new Set(activeFilterTags.map((tag) => tag.toLowerCase()));

  $: if (!editing) {
    titleDraft = task.title;
    notesDraft = task.notes ?? '';
    tagDraft = '';
    tagError = '';
  }

  $: if (!hasNotes) {
    notesExpanded = false;
  }

  function saveEdits() {
    if (!titleDraft.trim()) return;

    const updates: Partial<PlannedTask> = {
      title: titleDraft,
      notes: notesDraft
    };

    if (tagDraft.trim()) {
      const tag = parseEditableTag(tagDraft);

      if (!tag) {
        tagError = 'Tags cannot contain spaces.';
        return;
      }

      updates.tags = mergeTags(task.tags, [tag]);
    }

    dispatch('updateTask', {
      id: task.id,
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
    dispatch('updateTask', {
      id: task.id,
      updates: {
        notes: notesDraft
      }
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

    const nextTags = mergeTags(task.tags, [tag]);
    tagDraft = '';
    tagError = '';

    if (nextTags.length === task.tags.length) return;

    dispatch('updateTask', {
      id: task.id,
      updates: { tags: nextTags }
    });
  }

  function handleTagKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;

    event.preventDefault();
    addTags((event.currentTarget as HTMLInputElement).value);
  }

  function removeTag(tag: string) {
    dispatch('updateTask', {
      id: task.id,
      updates: {
        tags: task.tags.filter((existingTag) => existingTag.toLowerCase() !== tag.toLowerCase())
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

<div class:editing class="todo-row planned-row">
  <span class="drag-handle" aria-hidden="true">
    <GripVertical size={17} />
  </span>

  <div class="todo-content">
    {#if editing}
      <div class="edit-grid">
        <label class="edit-field">
          <span>Task</span>
          <input bind:value={titleDraft} type="text" on:keydown={handleTitleKeydown} />
        </label>
        <label class="edit-field note-edit-field">
          <span>Notes</span>
          <textarea bind:value={notesDraft} rows="3" placeholder="Add notes"></textarea>
        </label>
        <form class="tag-entry" on:submit|preventDefault={() => addTags()}>
          <label class="edit-field">
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
        <div class="todo-title-line">
          <strong>{task.title}</strong>
          {#if task.tags.length}
            <div class="tag-list inline-tag-list" aria-label="Tags">
              {#each task.tags as tag}
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
      </div>
    {/if}
  </div>

  <div class="row-actions">
    {#if editing}
      <button
        class="icon-button"
        aria-label="Save planned task"
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
        aria-label="Move planned task to Todo"
        title="Move to Todo"
        type="button"
        on:click={() => dispatch('moveToTodo', { id: task.id })}
      >
        <Send size={16} aria-hidden="true" />
      </button>
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
        aria-label="Edit planned task"
        title="Edit"
        type="button"
        on:click={() => (editing = true)}
      >
        <Pencil size={16} aria-hidden="true" />
      </button>
      <button
        class="icon-button danger"
        aria-label="Delete planned task"
        title="Delete"
        type="button"
        on:click={() => dispatch('deleteTask', { id: task.id })}
      >
        <Trash2 size={16} aria-hidden="true" />
      </button>
    {/if}
  </div>

  {#if !editing && hasNotes}
    <p class="todo-note-preview todo-row-wide">{task.notes}</p>
  {/if}

  {#if editing && task.tags.length}
    <div class:editable-tags={editing} class="tag-list todo-row-wide" aria-label="Tags">
      {#each task.tags as tag}
        <button class="tag-chip" type="button" on:click={() => removeTag(tag)}>
          {tag}
          <X size={12} aria-hidden="true" />
        </button>
      {/each}
    </div>
  {/if}

  {#if !editing && notesExpanded}
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
