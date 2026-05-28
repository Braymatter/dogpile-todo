<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Check, RefreshCw, Save, ServerCog, X } from '@lucide/svelte';
  import { testGitHubConnection } from '$lib/persistence/GitHubTodoStore';
  import {
    hasGitHubSettings,
    normalizePersistenceSettings,
    type PersistenceSettings
  } from '$lib/persistence/persistenceSettings';
  import type { SyncState } from '$lib/stores/todos';

  export let settings: PersistenceSettings;
  export let sync: SyncState;

  const dispatch = createEventDispatcher<{
    compactGitHubHistory: void;
    close: void;
    save: PersistenceSettings;
    syncNow: void;
  }>();

  let draft = cloneSettings(settings);
  let testing = false;
  let testMessage = '';
  let testFailed = false;

  $: normalizedDraft = normalizePersistenceSettings(draft);
  $: normalizedSettings = normalizePersistenceSettings(settings);
  $: canTestGitHub = hasGitHubSettings(normalizedDraft);
  $: settingsSaved = JSON.stringify(normalizedDraft) === JSON.stringify(normalizedSettings);
  $: canCompactGitHub =
    hasGitHubSettings(normalizedSettings) &&
    settingsSaved &&
    !['loading', 'pending', 'syncing', 'compacting'].includes(sync.status);
  $: lastCompactedAt = normalizedSettings.github.lastCompactedAt
    ? new Date(normalizedSettings.github.lastCompactedAt).toLocaleString([], {
        dateStyle: 'medium',
        timeStyle: 'short'
      })
    : '';

  async function testConnection() {
    testMessage = '';
    testFailed = false;

    if (!canTestGitHub) {
      testFailed = true;
      testMessage = 'Add owner, repo, branch, path, and PAT first.';
      return;
    }

    testing = true;

    try {
      await testGitHubConnection(normalizedDraft.github);
      testMessage = 'GitHub connection looks good.';
    } catch (error) {
      testFailed = true;
      testMessage = error instanceof Error ? error.message : 'GitHub connection failed.';
    } finally {
      testing = false;
    }
  }

  function save() {
    dispatch('save', normalizedDraft);
  }

  function compactGitHubHistory() {
    if (!canCompactGitHub) return;

    const confirmed = window.confirm(
      `Compact GitHub sync history for ${normalizedSettings.github.owner}/${normalizedSettings.github.repo}:${normalizedSettings.github.branch}? This force-updates that branch.`
    );

    if (confirmed) {
      dispatch('compactGitHubHistory');
    }
  }

  function cloneSettings(value: PersistenceSettings) {
    return normalizePersistenceSettings(JSON.parse(JSON.stringify(value)));
  }
</script>

<div class="modal-backdrop" role="presentation">
  <div aria-labelledby="settings-title" aria-modal="true" class="settings-modal card" role="dialog">
    <header class="settings-header">
      <div class="modal-icon" aria-hidden="true">
        <ServerCog size={19} />
      </div>
      <div>
        <p class="eyebrow">Persistence</p>
        <h2 id="settings-title">Dogpile settings</h2>
      </div>
      <button
        class="icon-button"
        aria-label="Close settings"
        title="Close"
        type="button"
        on:click={() => dispatch('close')}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </header>

    <form class="settings-form" on:submit|preventDefault={save}>
      <label class="field">
        <span>Storage</span>
        <select bind:value={draft.mode}>
          <option value="local">Local only</option>
          <option value="github">GitHub repo</option>
        </select>
      </label>

      {#if draft.mode === 'github'}
        <div class="settings-grid">
          <label class="field">
            <span>Owner</span>
            <input bind:value={draft.github.owner} autocomplete="off" placeholder="octocat" type="text" />
          </label>
          <label class="field">
            <span>Repo</span>
            <input bind:value={draft.github.repo} autocomplete="off" placeholder="dogpile-data" type="text" />
          </label>
          <label class="field">
            <span>Branch</span>
            <input bind:value={draft.github.branch} autocomplete="off" placeholder="main" type="text" />
          </label>
          <label class="field">
            <span>Path</span>
            <input
              bind:value={draft.github.path}
              autocomplete="off"
              placeholder="dogpile/todos.json"
              type="text"
            />
          </label>
        </div>

        <label class="field">
          <span>Fine-grained PAT</span>
          <input
            bind:value={draft.github.token}
            autocomplete="off"
            placeholder="github_pat_..."
            type="password"
          />
          <small>
            Stored in this browser's local storage. Use a fine-grained token limited to one repo
            with Contents read/write.
          </small>
        </label>

        <div class="sync-summary">
          <span class:error={sync.status === 'error'}>{sync.message}</span>
        </div>

        <section class="settings-section">
          <div>
            <p class="settings-section-title">Sync history</p>
            <p class="settings-warning">
              Compaction rewrites the configured GitHub branch to one Dogpile snapshot commit.
            </p>
          </div>

          <label class="checkbox-field">
            <input bind:checked={draft.github.autoCompactWeekly} type="checkbox" />
            <span>Auto-compact weekly</span>
          </label>

          {#if lastCompactedAt}
            <small>Last compacted {lastCompactedAt}</small>
          {/if}

          {#if !settingsSaved}
            <small>Save settings before compacting this repo.</small>
          {/if}

          <button
            class="secondary-button"
            disabled={!canCompactGitHub}
            type="button"
            on:click={compactGitHubHistory}
          >
            <RefreshCw size={16} aria-hidden="true" />
            {sync.status === 'compacting' ? 'Compacting' : 'Compact now'}
          </button>
        </section>

        {#if testMessage}
          <p class:error={testFailed} class="settings-message">{testMessage}</p>
        {/if}
      {/if}

      <div class="modal-actions">
        <button class="secondary-button" type="button" on:click={() => dispatch('close')}>
          <X size={16} aria-hidden="true" />
          Cancel
        </button>
        {#if draft.mode === 'github'}
          <button
            class="secondary-button"
            disabled={testing}
            type="button"
            on:click={testConnection}
          >
            <Check size={16} aria-hidden="true" />
            {testing ? 'Testing' : 'Test'}
          </button>
          <button class="secondary-button" type="button" on:click={() => dispatch('syncNow')}>
            <RefreshCw size={16} aria-hidden="true" />
            Sync now
          </button>
        {/if}
        <button class="primary-button" type="submit">
          <Save size={16} aria-hidden="true" />
          Save
        </button>
      </div>
    </form>
  </div>
</div>
