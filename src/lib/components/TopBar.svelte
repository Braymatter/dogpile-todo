<script lang="ts">
  import { onMount } from 'svelte';
  import { createEventDispatcher } from 'svelte';
  import { Cloud, CloudOff, Moon, RefreshCw, Settings, Sun } from '@lucide/svelte';
  import type { CompletionFilter, HistoryRange } from '$lib/types';
  import type { SyncState } from '$lib/stores/todos';
  import PomodoroTimer from './PomodoroTimer.svelte';

  export let filterText = '';
  export let completionFilter: CompletionFilter = 'all';
  export let historyRange: HistoryRange = 7;
  export let filterError: string | null = null;
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

  $: syncTitle = sync.lastSyncedAt
    ? `${sync.message} at ${new Date(sync.lastSyncedAt).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit'
      })}`
    : sync.message;
  $: syncLabel = getSyncLabel(sync.status);

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
    if (status === 'loading') return 'Loading';
    if (status === 'synced') return 'Synced';
    if (status === 'conflict') return 'Merging';
    return 'Sync error';
  }
</script>

<header class="top-bar">
  <div class="brand">
    <p class="eyebrow">Prioritized work</p>
    <h1>Dogpile</h1>
  </div>

  <div class="toolbar" aria-label="Filters and timer">
    <label class="field filter-field">
      <span>Filter</span>
      <input
        bind:value={filterText}
        aria-invalid={Boolean(filterError)}
        placeholder="fuzzy search --tag !tag"
        type="text"
      />
    </label>

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
