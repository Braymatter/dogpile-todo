export type PersistenceMode = 'local' | 'github';

export type GitHubPersistenceSettings = {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  token: string;
};

export type PersistenceSettings = {
  mode: PersistenceMode;
  github: GitHubPersistenceSettings;
};

const SETTINGS_KEY = 'dogpile.persistence.settings.v1';

export const defaultPersistenceSettings: PersistenceSettings = {
  mode: 'local',
  github: {
    owner: '',
    repo: '',
    branch: 'main',
    path: 'dogpile/todos.json',
    token: ''
  }
};

export function loadPersistenceSettings(): PersistenceSettings {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return structuredClone(defaultPersistenceSettings);

  try {
    return normalizePersistenceSettings(JSON.parse(raw));
  } catch {
    return structuredClone(defaultPersistenceSettings);
  }
}

export function savePersistenceSettings(settings: PersistenceSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizePersistenceSettings(settings)));
}

export function normalizePersistenceSettings(value: unknown): PersistenceSettings {
  const settings = value as Partial<PersistenceSettings> | null;
  const github = (settings?.github ?? {}) as Partial<GitHubPersistenceSettings>;
  const mode = settings?.mode === 'github' ? 'github' : 'local';

  return {
    mode,
    github: {
      owner: sanitizeText(github.owner),
      repo: sanitizeText(github.repo),
      branch: sanitizeText(github.branch) || defaultPersistenceSettings.github.branch,
      path: sanitizePath(github.path) || defaultPersistenceSettings.github.path,
      token: sanitizeText(github.token)
    }
  };
}

export function hasGitHubSettings(settings: PersistenceSettings) {
  const github = settings.github;

  return Boolean(
    settings.mode === 'github' &&
      github.owner &&
      github.repo &&
      github.branch &&
      github.path &&
      github.token
  );
}

function sanitizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizePath(value: unknown) {
  return sanitizeText(value).replace(/^\/+/, '');
}
