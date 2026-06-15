<script lang="ts">
  import { browser } from '$app/environment';
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import { ClipboardList, ListTodo, NotebookText, Plus } from '@lucide/svelte';
  import { parseTagInput } from '$lib/parseTagInput';
  import { getQuickAddPlaceholder, mergeQuickAddTags } from '$lib/quickAddTags';
  import type { PlannedTask, TodoItem } from '$lib/types';
  import PlannedTaskRow from './PlannedTaskRow.svelte';
  import TodoItemRow from './TodoItemRow.svelte';

  type DailyTab = 'todo' | 'plan' | 'notes';

  const HIDE_COMPLETED_STORAGE_KEY = 'dogpile.daily.hideCompleted.v1';
  const ACTIVE_TAB_STORAGE_KEY = 'dogpile.daily.activeTab.v1';

  export let todos: TodoItem[] = [];
  export let plannedTasks: PlannedTask[] = [];
  export let notesMarkdown = '';
  export let activeFilterTags: string[] = [];
  export let activeTab: DailyTab = 'todo';
  export let showTabs = true;

  const dispatch = createEventDispatcher<{
    addPlannedTask: { title: string; notes: string; tags: string[] };
    addTodo: { title: string; notes: string; tags: string[] };
    deletePlannedTask: { id: string };
    deleteTodo: { id: string };
    durationChange: { id: string; durationMinutes?: number };
    movePlannedTaskToTodo: { id: string };
    moveTodoToPlan: { id: string };
    reorderPlannedTasks: { ids: string[] };
    reorderTodos: { ids: string[] };
    toggleTagFilter: { tag: string };
    toggleComplete: { id: string; completed: boolean };
    updateNotesMarkdown: { markdown: string };
    updatePlannedTask: { id: string; updates: Partial<PlannedTask> };
    updateTodo: { id: string; updates: Partial<TodoItem> };
  }>();

  let quickAdd = '';
  let plannedQuickAdd = '';
  let draggedId: string | null = null;
  let dropIndex: number | null = null;
  let draggedPlannedId: string | null = null;
  let plannedDropIndex: number | null = null;
  let hideCompleted = false;
  let activeNoteLineIndex: number | null = null;
  let shouldAutoFocusLastNoteLine = false;
  let lastAutoFocusedNotesMarkdown = '';
  let noteLineTextareas: HTMLTextAreaElement[] = [];
  let listElement: HTMLDivElement;
  let plannedListElement: HTMLDivElement;

  $: todayTitle = new Intl.DateTimeFormat(undefined, {
    month: 'long',
    day: 'numeric'
  }).format(new Date());
  $: openCount = todos.filter((todo) => !todo.completed).length;
  $: completedCount = todos.filter((todo) => todo.completed).length;
  $: visibleTodos = hideCompleted ? todos.filter((todo) => !todo.completed) : todos;
  $: sortedPlannedTasks = plannedTasks.slice().sort(sortByOrder);
  $: quickAddPlaceholder = getQuickAddPlaceholder(activeFilterTags);
  $: plannedQuickAddPlaceholder = getQuickAddPlaceholder(activeFilterTags);
  $: notesWordCount = notesMarkdown.trim().split(/\s+/).filter(Boolean).length;
  $: noteLines = getNoteLines(notesMarkdown);
  $: if (dropIndex !== null && dropIndex > visibleTodos.length) {
    dropIndex = visibleTodos.length;
  }
  $: if (plannedDropIndex !== null && plannedDropIndex > sortedPlannedTasks.length) {
    plannedDropIndex = sortedPlannedTasks.length;
  }
  $: if (activeNoteLineIndex !== null && activeNoteLineIndex >= noteLines.length) {
    activeNoteLineIndex = Math.max(0, noteLines.length - 1);
  }

  onMount(() => {
    hideCompleted = loadHideCompletedPreference();
    activeTab = showTabs ? loadActiveTabPreference() : 'todo';
    if (activeTab === 'notes') {
      requestScratchpadAutofocus();
    }
  });

  $: if (!showTabs && activeTab !== 'todo') {
    activeTab = 'todo';
  }

  function setActiveTab(tab: DailyTab) {
    activeTab = tab;
    if (tab === 'notes') {
      requestScratchpadAutofocus();
    } else {
      activeNoteLineIndex = null;
      shouldAutoFocusLastNoteLine = false;
    }
    saveActiveTabPreference();
    handleDragEnd();
    handlePlannedDragEnd();
  }

  function handleHideCompletedChange(event: Event) {
    hideCompleted = (event.currentTarget as HTMLInputElement).checked;
    saveHideCompletedPreference();
  }

  function loadHideCompletedPreference() {
    if (!browser) return false;

    try {
      return localStorage.getItem(HIDE_COMPLETED_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  function saveHideCompletedPreference() {
    if (!browser) return;

    try {
      localStorage.setItem(HIDE_COMPLETED_STORAGE_KEY, hideCompleted ? 'true' : 'false');
    } catch {
      // Ignore storage failures; the toggle should still work for the current session.
    }
  }

  function loadActiveTabPreference(): DailyTab {
    if (!browser) return 'todo';

    try {
      const storedTab = localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
      return isDailyTab(storedTab) ? storedTab : 'todo';
    } catch {
      return 'todo';
    }
  }

  function saveActiveTabPreference() {
    if (!browser) return;

    try {
      localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab);
    } catch {
      // Ignore storage failures; the tab should still work for the current session.
    }
  }

  function isDailyTab(value: string | null): value is DailyTab {
    return value === 'todo' || value === 'plan' || value === 'notes';
  }

  function submitTodo(value = quickAdd) {
    const parsed = parseTagInput(value);
    if (!parsed.text) return;

    dispatch('addTodo', {
      title: parsed.text,
      notes: '',
      tags: mergeQuickAddTags(parsed.tags, activeFilterTags)
    });

    quickAdd = '';
  }

  function submitPlannedTask(value = plannedQuickAdd) {
    const parsed = parseTagInput(value);
    if (!parsed.text) return;

    dispatch('addPlannedTask', {
      title: parsed.text,
      notes: '',
      tags: mergeQuickAddTags(parsed.tags, activeFilterTags)
    });

    plannedQuickAdd = '';
  }

  function handleQuickAddKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;

    event.preventDefault();
    submitTodo((event.currentTarget as HTMLInputElement).value);
  }

  function handlePlannedQuickAddKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;

    event.preventDefault();
    submitPlannedTask((event.currentTarget as HTMLInputElement).value);
  }

  function handlePointerDown(event: PointerEvent, id: string) {
    if (!(event.target as HTMLElement).closest('.drag-handle')) return;

    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
    draggedId = id;
    dropIndex = visibleTodos.findIndex((todo) => todo.id === id);
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

    const ids = visibleTodos.map((todo) => todo.id);
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

  function handlePlannedPointerDown(event: PointerEvent, id: string) {
    if (!(event.target as HTMLElement).closest('.drag-handle')) return;

    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
    draggedPlannedId = id;
    plannedDropIndex = sortedPlannedTasks.findIndex((task) => task.id === id);
  }

  function handlePlannedPointerMove(event: PointerEvent) {
    if (!draggedPlannedId) return;

    event.preventDefault();
    const rows = Array.from(plannedListElement.querySelectorAll<HTMLElement>('.drag-wrapper'));
    const nextDropIndex = rows.findIndex((row) => {
      const bounds = row.getBoundingClientRect();
      return event.clientY < bounds.top + bounds.height / 2;
    });

    plannedDropIndex = nextDropIndex === -1 ? rows.length : nextDropIndex;
  }

  function handlePlannedPointerUp(event: PointerEvent) {
    if (draggedPlannedId) {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    }

    dropPlannedAtCurrentIndex();
  }

  function handlePlannedDragEnd() {
    draggedPlannedId = null;
    plannedDropIndex = null;
  }

  function dropPlannedAtCurrentIndex() {
    if (!draggedPlannedId || plannedDropIndex === null) return;

    const ids = sortedPlannedTasks.map((task) => task.id);
    const fromIndex = ids.indexOf(draggedPlannedId);
    if (fromIndex === -1) return;

    let insertionIndex = plannedDropIndex;
    ids.splice(fromIndex, 1);

    if (fromIndex < insertionIndex) {
      insertionIndex -= 1;
    }

    ids.splice(Math.max(0, Math.min(insertionIndex, ids.length)), 0, draggedPlannedId);
    dispatch('reorderPlannedTasks', { ids });
    handlePlannedDragEnd();
  }

  function sortByOrder(a: { order: number }, b: { order: number }) {
    return a.order - b.order;
  }

  function getNoteLines(markdown: string) {
    return markdown.length ? markdown.split('\n') : [''];
  }

  $: if (
    activeTab === 'notes' &&
    shouldAutoFocusLastNoteLine &&
    notesMarkdown !== lastAutoFocusedNotesMarkdown
  ) {
    void cleanTrailingNoteLinesAndFocus();
  }

  function setNoteLines(lines: string[]) {
    dispatch('updateNotesMarkdown', {
      markdown: lines.every((line) => line === '') ? '' : lines.join('\n')
    });
  }

  function setNotesMarkdown(markdown: string) {
    dispatch('updateNotesMarkdown', { markdown });
  }

  function handleNoteLineInput(event: Event, index: number) {
    const nextLines = getNoteLines(notesMarkdown);
    nextLines[index] = (event.currentTarget as HTMLTextAreaElement).value;
    setNoteLines(nextLines);
    resizeNoteLineTextarea(event.currentTarget as HTMLTextAreaElement);
  }

  function handleNoteLineFocus(event: FocusEvent, index: number) {
    activeNoteLineIndex = index;
    resizeNoteLineTextarea(event.currentTarget as HTMLTextAreaElement);
  }

  function handleNoteLineBlur(index: number) {
    if (activeNoteLineIndex === index) {
      activeNoteLineIndex = null;
    }
  }

  function handleNoteLinePreviewKeydown(event: KeyboardEvent, index: number) {
    if (event.key !== 'Enter' && event.key !== ' ') return;

    event.preventDefault();
    void focusNoteLine(index);
  }

  function handleNoteLineKeydown(event: KeyboardEvent, index: number) {
    const textarea = event.currentTarget as HTMLTextAreaElement;
    const lines = getNoteLines(notesMarkdown);
    const value = lines[index] ?? '';
    const selectionStart = textarea.selectionStart ?? value.length;
    const selectionEnd = textarea.selectionEnd ?? selectionStart;

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const before = value.slice(0, selectionStart);
      const after = value.slice(selectionEnd);
      lines.splice(index, 1, before, after);
      setNoteLines(lines);
      void focusNoteLine(index + 1, 0);
      return;
    }

    if (event.key === 'Backspace' && selectionStart === 0 && selectionEnd === 0 && index > 0) {
      event.preventDefault();
      const previousValue = lines[index - 1] ?? '';
      lines.splice(index - 1, 2, previousValue + value);
      setNoteLines(lines);
      void focusNoteLine(index - 1, previousValue.length);
      return;
    }

    if (
      event.key === 'Delete' &&
      selectionStart === value.length &&
      selectionEnd === value.length &&
      index < lines.length - 1
    ) {
      event.preventDefault();
      lines.splice(index, 2, value + (lines[index + 1] ?? ''));
      setNoteLines(lines);
      void focusNoteLine(index, value.length);
      return;
    }

    if (event.key === 'ArrowUp' && selectionStart === 0 && selectionEnd === 0 && index > 0) {
      event.preventDefault();
      void focusNoteLine(index - 1);
      return;
    }

    if (
      event.key === 'ArrowDown' &&
      selectionStart === value.length &&
      selectionEnd === value.length &&
      index < lines.length - 1
    ) {
      event.preventDefault();
      void focusNoteLine(index + 1);
    }
  }

  async function addNoteLine() {
    const lines = getNoteLines(notesMarkdown);
    const nextIndex = lines.length;
    lines.push('');
    setNoteLines(lines);
    shouldAutoFocusLastNoteLine = false;
    await focusNoteLine(nextIndex, 0);
  }

  function requestScratchpadAutofocus() {
    shouldAutoFocusLastNoteLine = true;
    void cleanTrailingNoteLinesAndFocus();
  }

  async function cleanTrailingNoteLinesAndFocus() {
    const cleanedMarkdown = removeTrailingEmptyNoteLines(notesMarkdown);

    if (cleanedMarkdown !== notesMarkdown) {
      setNotesMarkdown(cleanedMarkdown);
      return;
    }

    await focusLastNonEmptyNoteLine();
  }

  async function focusLastNonEmptyNoteLine() {
    const lines = getNoteLines(notesMarkdown);
    const lastNonEmptyIndex = findLastNonEmptyLineIndex(lines);

    lastAutoFocusedNotesMarkdown = notesMarkdown;
    await focusNoteLine(lastNonEmptyIndex);

    if (notesMarkdown.trim()) {
      shouldAutoFocusLastNoteLine = false;
    }
  }

  function removeTrailingEmptyNoteLines(markdown: string) {
    if (!markdown) return '';

    const lines = markdown.split('\n');
    while (lines.length && !lines[lines.length - 1].trim()) {
      lines.pop();
    }

    return lines.join('\n');
  }

  function findLastNonEmptyLineIndex(lines: string[]) {
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      if (lines[index]?.trim()) {
        return index;
      }
    }

    return 0;
  }

  async function focusNoteLine(index: number, cursorPosition?: number) {
    activeNoteLineIndex = index;
    await tick();

    const textarea = noteLineTextareas[index];
    if (!textarea) return;

    const position = cursorPosition ?? textarea.value.length;
    textarea.focus();
    textarea.setSelectionRange(position, position);
    resizeNoteLineTextarea(textarea);
  }

  function resizeNoteLineTextarea(textarea: HTMLTextAreaElement) {
    requestAnimationFrame(() => {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    });
  }

  function renderMarkdown(markdown: string) {
    const blocks = markdown.trim().split(/\n{2,}/).filter(Boolean);

    if (!blocks.length) {
      return '';
    }

    return blocks.map(renderMarkdownBlock).join('');
  }

  function renderMarkdownBlock(block: string) {
    const trimmed = block.trim();

    if (trimmed.startsWith('```')) {
      const code = trimmed.replace(/^```[^\n]*\n?/, '').replace(/```$/, '').trim();
      return `<pre><code>${escapeHtml(code)}</code></pre>`;
    }

    const lines = trimmed.split('\n');
    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      return `<h${level}>${renderMarkdownInline(heading[2])}</h${level}>`;
    }

    if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
      const items = lines
        .map((line) => `<li>${renderMarkdownInline(line.replace(/^\s*[-*]\s+/, ''))}</li>`)
        .join('');
      return `<ul>${items}</ul>`;
    }

    if (lines.every((line) => /^\s*\d+\.\s+/.test(line))) {
      const items = lines
        .map((line) => `<li>${renderMarkdownInline(line.replace(/^\s*\d+\.\s+/, ''))}</li>`)
        .join('');
      return `<ol>${items}</ol>`;
    }

    if (lines.every((line) => /^\s*>\s?/.test(line))) {
      const quote = lines
        .map((line) => renderMarkdownInline(line.replace(/^\s*>\s?/, '')))
        .join('<br>');
      return `<blockquote>${quote}</blockquote>`;
    }

    return `<p>${lines.map(renderMarkdownInline).join('<br>')}</p>`;
  }

  function renderMarkdownInline(value: string) {
    return escapeHtml(value)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');
  }

  function escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
</script>

<article class="daily-card card">
  {#if showTabs}
    <div class="daily-tabs" role="tablist" aria-label="Daily panel tabs">
      <button
        class:active={activeTab === 'todo'}
        aria-selected={activeTab === 'todo'}
        role="tab"
        title="Show today's tasks"
        type="button"
        on:click={() => setActiveTab('todo')}
      >
        <ListTodo size={16} aria-hidden="true" />
        <span>Todo</span>
      </button>
      <button
        class:active={activeTab === 'plan'}
        aria-selected={activeTab === 'plan'}
        role="tab"
        title="Show planned tasks"
        type="button"
        on:click={() => setActiveTab('plan')}
      >
        <ClipboardList size={16} aria-hidden="true" />
        <span>Plan</span>
      </button>
      <button
        class:active={activeTab === 'notes'}
        aria-selected={activeTab === 'notes'}
        role="tab"
        title="Open scratchpad notes"
        type="button"
        on:click={() => setActiveTab('notes')}
      >
        <NotebookText size={16} aria-hidden="true" />
        <span>Notes</span>
      </button>
    </div>
  {/if}

  {#if activeTab === 'todo'}
    <div class="daily-tab-panel" role="tabpanel" aria-label="Todo">
      <div class="card-heading">
        <div>
          <p class="eyebrow">Daily</p>
          <h2>{todayTitle}</h2>
        </div>
        <div class="daily-heading-actions">
          {#if hideCompleted}
            <span
              class="completed-count-badge"
              aria-label={`${completedCount} completed tasks hidden`}
              title={`${completedCount} completed tasks hidden`}
            >
              {completedCount}
            </span>
          {/if}
          <label
            class:active={hideCompleted}
            class="completed-toggle"
            title={hideCompleted ? 'Show completed tasks' : 'Hide completed tasks'}
          >
            <input
              aria-label="Hide completed tasks in daily card"
              checked={hideCompleted}
              type="checkbox"
              on:change={handleHideCompletedChange}
            />
            <span class="toggle-track" aria-hidden="true">
              <span class="toggle-knob"></span>
            </span>
            <span>Hide completed</span>
          </label>
          <span class="count-pill">{openCount} open</span>
        </div>
      </div>

      <section class="daily-list-shell" aria-label="Daily tasks">
        {#if visibleTodos.length}
          <div bind:this={listElement} class="task-list daily-task-list" role="list">
            {#each visibleTodos as todo, index (todo.id)}
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
                  activeFilterTags={activeFilterTags}
                  {todo}
                  draggableRow
                  on:deleteTodo={(event) => dispatch('deleteTodo', event.detail)}
                  on:durationChange={(event) => dispatch('durationChange', event.detail)}
                  on:moveToPlan={(event) => dispatch('moveTodoToPlan', event.detail)}
                  on:toggleTagFilter={(event) => dispatch('toggleTagFilter', event.detail)}
                  on:toggleComplete={(event) => dispatch('toggleComplete', event.detail)}
                  on:updateTodo={(event) => dispatch('updateTodo', event.detail)}
                />
              </div>
            {/each}
            {#if dropIndex === visibleTodos.length}
              <div class="drop-indicator" role="presentation"></div>
            {/if}
          </div>
        {:else if hideCompleted && completedCount}
          <p class="empty-state page-empty">Completed tasks are hidden.</p>
        {:else}
          <p class="empty-state page-empty">No tasks match this view.</p>
        {/if}

        <form class="quick-add" on:submit|preventDefault={() => submitTodo()}>
          <Plus size={18} aria-hidden="true" />
          <input
            aria-label="Add task"
            bind:value={quickAdd}
            placeholder={quickAddPlaceholder}
            title="Add a task. Include #tags to attach tags."
            type="text"
            on:keydown={handleQuickAddKeydown}
          />
        </form>
      </section>
    </div>
  {:else if activeTab === 'plan'}
    <div class="daily-tab-panel" role="tabpanel" aria-label="Plan">
      <div class="card-heading">
        <div>
          <p class="eyebrow">Plan</p>
          <h2>Planned tasks</h2>
        </div>
        <div class="daily-heading-actions">
          <span class="count-pill">{sortedPlannedTasks.length} planned</span>
        </div>
      </div>

      <section class="daily-list-shell" aria-label="Planned tasks">
        {#if sortedPlannedTasks.length}
          <div bind:this={plannedListElement} class="task-list daily-task-list" role="list">
            {#each sortedPlannedTasks as task, index (task.id)}
              {#if plannedDropIndex === index && draggedPlannedId !== task.id}
                <div class="drop-indicator" role="presentation"></div>
              {/if}
              <div
                class="drag-wrapper"
                class:dragging={draggedPlannedId === task.id}
                role="listitem"
                on:pointercancel={handlePlannedDragEnd}
                on:pointerdown={(event) => handlePlannedPointerDown(event, task.id)}
                on:pointermove={handlePlannedPointerMove}
                on:pointerup={handlePlannedPointerUp}
              >
                <PlannedTaskRow
                  activeFilterTags={activeFilterTags}
                  {task}
                  on:deleteTask={(event) => dispatch('deletePlannedTask', event.detail)}
                  on:moveToTodo={(event) => dispatch('movePlannedTaskToTodo', event.detail)}
                  on:toggleTagFilter={(event) => dispatch('toggleTagFilter', event.detail)}
                  on:updateTask={(event) => dispatch('updatePlannedTask', event.detail)}
                />
              </div>
            {/each}
            {#if plannedDropIndex === sortedPlannedTasks.length}
              <div class="drop-indicator" role="presentation"></div>
            {/if}
          </div>
        {:else}
          <p class="empty-state page-empty">No planned tasks.</p>
        {/if}

        <form class="quick-add" on:submit|preventDefault={() => submitPlannedTask()}>
          <Plus size={18} aria-hidden="true" />
          <input
            aria-label="Add planned task"
            bind:value={plannedQuickAdd}
            placeholder={plannedQuickAddPlaceholder}
            title="Add a planned task. Include #tags to attach tags."
            type="text"
            on:keydown={handlePlannedQuickAddKeydown}
          />
        </form>
      </section>
    </div>
  {:else}
    <div class="daily-tab-panel" role="tabpanel" aria-label="Notes">
      <div class="card-heading">
        <div>
          <p class="eyebrow">Notes</p>
          <h2>Scratchpad</h2>
        </div>
        <div class="daily-heading-actions">
          <span class="count-pill">{notesWordCount} words</span>
        </div>
      </div>

      <section class="daily-list-shell notes-tab-shell" aria-label="Notes editor">
        <div class="notes-line-editor" aria-label="Markdown notes">
          {#each noteLines as line, index}
            <div
              class:editing={activeNoteLineIndex === index || (!notesMarkdown && index === 0)}
              class:empty={!line}
              class="note-line"
            >
              {#if activeNoteLineIndex === index || (!notesMarkdown && index === 0)}
                <textarea
                  bind:this={noteLineTextareas[index]}
                  aria-label={`Edit notes line ${index + 1}`}
                  placeholder={index === 0 ? 'Write notes' : ''}
                  rows="1"
                  value={line}
                  on:blur={() => handleNoteLineBlur(index)}
                  on:focus={(event) => handleNoteLineFocus(event, index)}
                  on:input={(event) => handleNoteLineInput(event, index)}
                  on:keydown={(event) => handleNoteLineKeydown(event, index)}
                ></textarea>
              {:else}
                <div
                  class:empty={!line.trim()}
                  class="note-line-preview"
                  aria-label={`Edit notes line ${index + 1}`}
                  role="button"
                  tabindex="0"
                  title={`Edit notes line ${index + 1}`}
                  on:click={() => void focusNoteLine(index)}
                  on:keydown={(event) => handleNoteLinePreviewKeydown(event, index)}
                >
                  {#if line.trim()}
                    {@html renderMarkdown(line)}
                  {:else}
                    <span aria-hidden="true">&nbsp;</span>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}

          <button
            class="note-line-add icon-button"
            aria-label="Add notes line"
            title="Add line"
            type="button"
            on:click={() => void addNoteLine()}
          >
            <Plus size={16} aria-hidden="true" />
          </button>
        </div>
      </section>
    </div>
  {/if}
</article>
