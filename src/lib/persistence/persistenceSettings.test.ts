import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadPersistenceSettings,
  savePersistenceSettings,
  type PersistenceSettings
} from './persistenceSettings';

const SETTINGS_KEY = 'dogpile.persistence.settings.v1';

function createLocalStorageMock() {
  const values = new Map<string, string>();

  return {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value)
  };
}

describe('persistence settings', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('saves weekly auto-compaction with the GitHub settings in local storage', () => {
    const settings: PersistenceSettings = {
      mode: 'github',
      github: {
        owner: 'Braymatter',
        repo: 'dogpile-todo',
        branch: 'main',
        path: 'dogpile/todos.json',
        token: 'github_pat_test',
        autoCompactWeekly: true
      }
    };

    savePersistenceSettings(settings);

    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')).toMatchObject({
      mode: 'github',
      github: {
        owner: 'Braymatter',
        repo: 'dogpile-todo',
        branch: 'main',
        path: 'dogpile/todos.json',
        token: 'github_pat_test',
        autoCompactWeekly: true
      }
    });
    expect(loadPersistenceSettings().github.autoCompactWeekly).toBe(true);
  });
});
