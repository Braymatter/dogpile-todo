import type { TodoItem } from '$lib/types';
import type { GitHubPersistenceSettings } from './persistenceSettings';
import type { TodoStore } from './TodoStore';
import { parseTodoDocument, serializeTodoDocument } from './todoDocument';

type GitHubContentResponse = {
  content?: string;
  encoding?: string;
  sha?: string;
};

type GitHubUpdateResponse = {
  content?: {
    sha?: string;
  };
};

type GitHubRefResponse = {
  object?: {
    sha?: string;
  };
};

type GitHubCommitResponse = {
  sha?: string;
  tree?: {
    sha?: string;
  };
};

type GitHubTreeResponse = {
  sha?: string;
  tree?: Array<{
    path?: string;
    sha?: string;
    type?: string;
  }>;
};

export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

export class GitHubConflictError extends Error {
  constructor() {
    super('GitHub data changed before Dogpile could save.');
    this.name = 'GitHubConflictError';
  }
}

export class GitHubTodoStore implements TodoStore {
  private sha: string | undefined;

  remoteFileExists = false;

  constructor(private readonly settings: GitHubPersistenceSettings) {}

  async loadTodos(): Promise<TodoItem[]> {
    const response = await this.request(contentUrl(this.settings));

    if (response.status === 404) {
      this.sha = undefined;
      this.remoteFileExists = false;
      return [];
    }

    await assertOk(response);

    const payload = (await response.json()) as GitHubContentResponse | GitHubContentResponse[];
    if (Array.isArray(payload) || payload.encoding !== 'base64' || !payload.content) {
      throw new GitHubApiError('GitHub path does not point to a readable JSON file.', response.status);
    }

    this.sha = payload.sha;
    this.remoteFileExists = true;

    return parseTodoDocument(decodeBase64Utf8(payload.content));
  }

  async saveTodos(todos: TodoItem[]): Promise<void> {
    const body: Record<string, unknown> = {
      message: `Dogpile sync: ${new Date().toLocaleString()}`,
      content: encodeBase64Utf8(serializeTodoDocument(todos)),
      branch: this.settings.branch
    };

    if (this.sha) {
      body.sha = this.sha;
    }

    const response = await this.request(contentUrl(this.settings, false), {
      method: 'PUT',
      body: JSON.stringify(body)
    });

    if (response.status === 409) {
      throw new GitHubConflictError();
    }

    await assertOk(response);

    const payload = (await response.json()) as GitHubUpdateResponse;
    this.sha = payload.content?.sha ?? this.sha;
    this.remoteFileExists = true;
  }

  async compactTodos(todos: TodoItem[]): Promise<void> {
    const refResponse = await this.request(gitRefUrl(this.settings));
    await assertOk(refResponse);

    const ref = (await refResponse.json()) as GitHubRefResponse;
    const headSha = ref.object?.sha;
    if (!headSha) {
      throw new GitHubApiError('GitHub branch ref did not include a commit SHA.', refResponse.status);
    }

    const headResponse = await this.request(gitCommitUrl(this.settings, headSha));
    await assertOk(headResponse);

    const head = (await headResponse.json()) as GitHubCommitResponse;
    const baseTreeSha = head.tree?.sha;
    if (!baseTreeSha) {
      throw new GitHubApiError('GitHub branch head did not include a tree SHA.', headResponse.status);
    }

    const treeResponse = await this.request(gitTreesUrl(this.settings), {
      method: 'POST',
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: [
          {
            path: this.settings.path,
            mode: '100644',
            type: 'blob',
            content: serializeTodoDocument(todos)
          }
        ]
      })
    });
    await assertOk(treeResponse);

    const tree = (await treeResponse.json()) as GitHubTreeResponse;
    if (!tree.sha) {
      throw new GitHubApiError('GitHub did not return a compacted tree SHA.', treeResponse.status);
    }

    const commitResponse = await this.request(gitCommitsUrl(this.settings), {
      method: 'POST',
      body: JSON.stringify({
        message: `Dogpile compact snapshot: ${new Date().toLocaleString()}`,
        tree: tree.sha,
        parents: []
      })
    });
    await assertOk(commitResponse);

    const commit = (await commitResponse.json()) as GitHubCommitResponse;
    if (!commit.sha) {
      throw new GitHubApiError('GitHub did not return a compacted commit SHA.', commitResponse.status);
    }

    const updateRefResponse = await this.request(gitRefUrl(this.settings), {
      method: 'PATCH',
      body: JSON.stringify({
        sha: commit.sha,
        force: true
      })
    });
    await assertOk(updateRefResponse);

    this.sha = tree.tree?.find((entry) => entry.path === this.settings.path && entry.type === 'blob')?.sha;
    this.remoteFileExists = true;
  }

  private request(url: string, init: RequestInit = {}) {
    return fetch(url, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.settings.token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...init.headers
      }
    });
  }
}

export async function testGitHubConnection(settings: GitHubPersistenceSettings) {
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${settings.token}`,
        'X-GitHub-Api-Version': '2022-11-28'
      }
    }
  );

  await assertOk(response);
}

async function assertOk(response: Response) {
  if (response.ok) return;

  throw new GitHubApiError(await readGitHubError(response), response.status);
}

async function readGitHubError(response: Response) {
  try {
    const payload = (await response.json()) as { message?: string };
    return payload.message || `GitHub returned ${response.status}.`;
  } catch {
    return `GitHub returned ${response.status}.`;
  }
}

function contentUrl(settings: GitHubPersistenceSettings, includeRef = true) {
  const path = settings.path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');

  const url = `https://api.github.com/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(
    settings.repo
  )}/contents/${path}`;

  return includeRef ? `${url}?ref=${encodeURIComponent(settings.branch)}` : url;
}

function gitRefUrl(settings: GitHubPersistenceSettings) {
  return `${repoUrl(settings)}/git/refs/${branchRef(settings.branch)}`;
}

function gitCommitUrl(settings: GitHubPersistenceSettings, sha: string) {
  return `${repoUrl(settings)}/git/commits/${encodeURIComponent(sha)}`;
}

function gitCommitsUrl(settings: GitHubPersistenceSettings) {
  return `${repoUrl(settings)}/git/commits`;
}

function gitTreesUrl(settings: GitHubPersistenceSettings) {
  return `${repoUrl(settings)}/git/trees`;
}

function repoUrl(settings: GitHubPersistenceSettings) {
  return `https://api.github.com/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(
    settings.repo
  )}`;
}

function branchRef(branch: string) {
  return `heads/${branch
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')}`;
}

function encodeBase64Utf8(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';

  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(index, index + 0x8000));
  }

  return btoa(binary);
}

function decodeBase64Utf8(value: string) {
  const binary = atob(value.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}
