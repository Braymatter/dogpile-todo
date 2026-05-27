<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { Check, Clock, X } from '@lucide/svelte';
  import type { TodoItem } from '$lib/types';

  export let todo: TodoItem;

  const dispatch = createEventDispatcher<{
    cancel: void;
    saveDuration: { durationMinutes: number };
    skip: void;
  }>();

  let duration: string | number = '';
  let input: HTMLInputElement;

  onMount(() => {
    input?.focus();
  });

  function submitDuration() {
    const parsed = Number(String(duration).trim());

    if (!Number.isFinite(parsed) || parsed < 0) {
      dispatch('skip');
      return;
    }

    dispatch('saveDuration', { durationMinutes: Math.round(parsed) });
  }
</script>

<div class="modal-backdrop" role="presentation">
  <div
    aria-labelledby="duration-title"
    aria-modal="true"
    class="duration-modal card"
    role="dialog"
  >
    <header>
      <div class="modal-icon" aria-hidden="true">
        <Clock size={19} />
      </div>
      <div>
        <p class="eyebrow">Duration</p>
        <h2 id="duration-title">{todo.title}</h2>
      </div>
    </header>

    <form on:submit|preventDefault={submitDuration}>
      <label>
        <span>Minutes</span>
        <input
          bind:this={input}
          bind:value={duration}
          inputmode="numeric"
          min="0"
          placeholder="25"
          type="number"
        />
      </label>

      <div class="modal-actions">
        <button class="secondary-button" type="button" on:click={() => dispatch('cancel')}>
          <X size={16} aria-hidden="true" />
          Cancel
        </button>
        <button class="secondary-button" type="button" on:click={() => dispatch('skip')}>
          Skip
        </button>
        <button class="primary-button" type="submit">
          <Check size={16} aria-hidden="true" />
          Save
        </button>
      </div>
    </form>
  </div>
</div>
