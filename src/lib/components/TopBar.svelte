<script lang="ts">
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import { Cloud, CloudOff, Moon, RefreshCw, Settings, Sun } from '@lucide/svelte';
  import {
    getFilterTagToken,
    getTagAutocompleteSuggestions,
    replaceFilterTagToken
  } from '$lib/filter/filterTagAutocomplete';
  import type { CompletionFilter, HistoryRange } from '$lib/types';
  import type { SyncState } from '$lib/stores/todos';
  import type { FilterTagToken } from '$lib/filter/filterTagAutocomplete';
  import PomodoroTimer from './PomodoroTimer.svelte';

  export let filterText = '';
  export let completionFilter: CompletionFilter = 'all';
  export let historyRange: HistoryRange = 7;
  export let filterError: string | null = null;
  export let availableTags: string[] = [];
  export let sync: SyncState = {
    status: 'local',
    message: 'Local storage'
  };

  type Theme = 'dark' | 'light';

  const dispatch = createEventDispatcher<{
    openSettings: void;
    syncNow: void;
  }>();

  let theme: Theme = 'dark';
  let filterInput: HTMLInputElement;
  let filterCursorIndex = 0;
  let tagAutocompleteOpen = false;
  let activeSuggestionIndex = 0;
  let lastSuggestionKey = '';

  $: syncTitle = sync.lastSyncedAt
    ? `${sync.message} at ${new Date(sync.lastSyncedAt).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit'
      })}`
    : sync.message;
  $: syncLabel = getSyncLabel(sync.status);
  $: activeTagToken = getFilterTagToken(filterText, filterCursorIndex);
  $: tagSuggestions = activeTagToken
    ? getTagAutocompleteSuggestions(availableTags, activeTagToken.query)
    : [];
  $: showTagAutocomplete = tagAutocompleteOpen && Boolean(activeTagToken) && tagSuggestions.length > 0;
  $: activeSuggestion = tagSuggestions[activeSuggestionIndex] ?? tagSuggestions[0];
  $: suggestionKey = `${activeTagToken?.start ?? ''}:${activeTagToken?.end ?? ''}:${
    activeTagToken?.prefix ?? ''
  }:${activeTagToken?.query ?? ''}:${tagSuggestions.join('\u0000')}`;
  $: if (suggestionKey !== lastSuggestionKey) {
    lastSuggestionKey = suggestionKey;
    activeSuggestionIndex = 0;
  }
  $: if (activeSuggestionIndex >= tagSuggestions.length) {
    activeSuggestionIndex = 0;
  }

  onMount(() => {
    const storedTheme = localStorage.getItem('dogpile.theme');
    theme = storedTheme === 'light' ? 'light' : 'dark';
    applyTheme(theme);
  });

  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('dogpile.theme', theme);
    applyTheme(theme);
  }

  function applyTheme(nextTheme: Theme) {
    document.documentElement.dataset.theme = nextTheme;
  }

  function getSyncLabel(status: SyncState['status']) {
    if (status === 'local') return 'Local';
    if (status === 'pending') return 'Queued';
    if (status === 'syncing') return 'Syncing';
    if (status === 'compacting') return 'Compacting';
    if (status === 'loading') return 'Loading';
    if (status === 'synced') return 'Synced';
    if (status === 'conflict') return 'Merging';
    return 'Sync error';
  }

  function handleFilterInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement;

    filterText = input.value;
    updateFilterCursor(input);
    tagAutocompleteOpen = true;
  }

  function handleFilterKeydown(event: KeyboardEvent) {
    if (!showTagAutocomplete) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      activeSuggestionIndex = (activeSuggestionIndex + 1) % tagSuggestions.length;
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      activeSuggestionIndex = (activeSuggestionIndex - 1 + tagSuggestions.length) % tagSuggestions.length;
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      void chooseTagSuggestion(activeSuggestion);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      tagAutocompleteOpen = false;
    }
  }

  function handleFilterCursorEvent(event: Event) {
    updateFilterCursor(event.currentTarget as HTMLInputElement);
    tagAutocompleteOpen = true;
  }

  function updateFilterCursor(input: HTMLInputElement) {
    filterCursorIndex = input.selectionStart ?? input.value.length;
  }

  async function chooseTagSuggestion(tag?: string) {
    if (!tag || !activeTagToken) return;

    const nextFilter = replaceFilterTagToken(filterText, activeTagToken as FilterTagToken, tag);
    filterText = nextFilter.value;
    filterCursorIndex = nextFilter.cursorIndex;
    tagAutocompleteOpen = false;

    await tick();
    filterInput?.focus();
    filterInput?.setSelectionRange(nextFilter.cursorIndex, nextFilter.cursorIndex);
  }
</script>

<header class="top-bar">
  <div class="brand">
    <h1>Dogpile</h1>
  </div>

  <div class="toolbar" aria-label="Filters and timer">
    <div class="field filter-field">
      <label for="todo-filter">Filter</label>
      <div class="filter-input-wrap">
        <input
          id="todo-filter"
          bind:this={filterInput}
          bind:value={filterText}
          aria-activedescendant={showTagAutocomplete ? `filter-tag-suggestion-${activeSuggestionIndex}` : undefined}
          aria-autocomplete="list"
          aria-controls="filter-tag-autocomplete"
          aria-expanded={showTagAutocomplete}
          aria-invalid={Boolean(filterError)}
          placeholder="fuzzy search --tag !tag"
          role="combobox"
          type="text"
          on:blur={() => (tagAutocompleteOpen = false)}
          on:click={handleFilterCursorEvent}
          on:focus={handleFilterCursorEvent}
          on:input={handleFilterInput}
          on:keydown={handleFilterKeydown}
          on:keyup={handleFilterCursorEvent}
        />

        {#if showTagAutocomplete && activeTagToken}
          <div class="filter-suggestions" id="filter-tag-autocomplete" role="listbox">
            {#each tagSuggestions as tag, index}
              <button
                id={`filter-tag-suggestion-${index}`}
                class:active={index === activeSuggestionIndex}
                class="filter-suggestion"
                aria-selected={index === activeSuggestionIndex}
                role="option"
                tabindex="-1"
                type="button"
                on:mousedown|preventDefault={() => chooseTagSuggestion(tag)}
              >
                <span class="filter-suggestion-token">
                  <span>{activeTagToken.prefix}</span>{tag}
                </span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <label class="field status-field">
      <span>Status</span>
      <select bind:value={completionFilter}>
        <option value="all">All</option>
        <option value="incomplete">Incomplete</option>
        <option value="completed">Completed</option>
      </select>
    </label>

    <div class="field">
      <span>History</span>
      <div class="segmented" aria-label="History range">
        <button
          aria-pressed={historyRange === 7}
          class:active={historyRange === 7}
          type="button"
          on:click={() => (historyRange = 7)}
        >
          7 days
        </button>
        <button
          aria-pressed={historyRange === 30}
          class:active={historyRange === 30}
          type="button"
          on:click={() => (historyRange = 30)}
        >
          30 days
        </button>
      </div>
    </div>

    <PomodoroTimer />

    <div class:local={sync.status === 'local'} class:error={sync.status === 'error'} class="sync-pill" title={syncTitle}>
      {#if sync.status === 'local'}
        <CloudOff size={16} aria-hidden="true" />
      {:else}
        <Cloud size={16} aria-hidden="true" />
      {/if}
      <span>{syncLabel}</span>
      <button
        class="icon-button"
        aria-label="Sync now"
        disabled={sync.status === 'local'}
        title="Sync now"
        type="button"
        on:click={() => dispatch('syncNow')}
      >
        <RefreshCw size={15} aria-hidden="true" />
      </button>
    </div>

    <button
      class="theme-toggle"
      aria-label="Open settings"
      title="Settings"
      type="button"
      on:click={() => dispatch('openSettings')}
    >
      <Settings size={17} aria-hidden="true" />
    </button>

    <button
      class="theme-toggle"
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
      type="button"
      on:click={toggleTheme}
    >
      {#if theme === 'dark'}
        <Sun size={17} aria-hidden="true" />
      {:else}
        <Moon size={17} aria-hidden="true" />
      {/if}
    </button>
  </div>

  {#if filterError}
    <p class="filter-error">{filterError}</p>
  {/if}
</header>
