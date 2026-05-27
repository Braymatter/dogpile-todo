<script lang="ts">
  import { onMount } from 'svelte';
  import { Pause, Play, RotateCcw } from '@lucide/svelte';

  type TimerMode = 'work' | 'break';

  const durations: Record<TimerMode, number> = {
    work: 25 * 60,
    break: 5 * 60
  };

  let mode: TimerMode = 'work';
  let running = false;
  let secondsLeft = durations.work;

  onMount(() => {
    const interval = window.setInterval(() => {
      if (!running) return;

      if (secondsLeft <= 1) {
        secondsLeft = 0;
        running = false;
        return;
      }

      secondsLeft -= 1;
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  });

  $: minutes = Math.floor(secondsLeft / 60).toString().padStart(2, '0');
  $: seconds = (secondsLeft % 60).toString().padStart(2, '0');

  function setMode(nextMode: TimerMode) {
    mode = nextMode;
    running = false;
    secondsLeft = durations[nextMode];
  }

  function reset() {
    running = false;
    secondsLeft = durations[mode];
  }
</script>

<section class="pomodoro" aria-label="Pomodoro timer">
  <div class="timer-display" aria-live="polite">{minutes}:{seconds}</div>

  <div class="timer-actions">
    <button
      aria-label={running ? 'Pause timer' : 'Start timer'}
      title={running ? 'Pause' : 'Start'}
      type="button"
      on:click={() => (running = !running)}
    >
      {#if running}
        <Pause size={16} aria-hidden="true" />
      {:else}
        <Play size={16} aria-hidden="true" />
      {/if}
    </button>
    <button aria-label="Reset timer" title="Reset" type="button" on:click={reset}>
      <RotateCcw size={16} aria-hidden="true" />
    </button>
  </div>

  <div class="timer-modes" aria-label="Timer mode">
    <button
      aria-pressed={mode === 'work'}
      class:active={mode === 'work'}
      type="button"
      on:click={() => setMode('work')}
    >
      Work
    </button>
    <button
      aria-pressed={mode === 'break'}
      class:active={mode === 'break'}
      type="button"
      on:click={() => setMode('break')}
    >
      Break
    </button>
  </div>
</section>
