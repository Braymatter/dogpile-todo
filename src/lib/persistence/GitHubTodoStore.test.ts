import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TodoItem } from '$lib/types';
import { GitHubTodoStore } from './GitHubTodoStore';

const todo: TodoItem = {
  id: 'todo-1',
  title: 'Compact sync history',
  notes: '',
  tags: ['sync'],
  order: 1000,
  completed: false,
  createdAt: '2026-05-28T12:00:00.000Z',
  updatedAt: '2026-05-28T12:00:00.000Z'
};

describe('GitHubTodoStore', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('compacts todos into a root snapshot commit and force-updates the branch', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ object: { sha: 'head-sha' } }))
      .mockResolvedValueOnce(jsonResponse({ tree: { sha: 'base-tree-sha' } }))
      .mockResolvedValueOnce(
        jsonResponse({
          sha: 'snapshot-tree-sha',
          tree: [{ path: 'dogpile/todos.json', type: 'blob', sha: 'todo-blob-sha' }]
        })
      )
      .mockResolvedValueOnce(jsonResponse({ sha: 'snapshot-commit-sha' }))
      .mockResolvedValueOnce(jsonResponse({ object: { sha: 'snapshot-commit-sha' } }));

    const store = new GitHubTodoStore({
      owner: 'Braymatter',
      repo: 'dogpile-data',
      branch: 'dogpile/data',
      path: 'dogpile/todos.json',
      token: 'github_pat_test',
      autoCompactWeekly: false
    });

    await store.compactTodos([todo]);

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.github.com/repos/Braymatter/dogpile-data/git/refs/heads/dogpile/data'
    );
    expect(fetchMock.mock.calls[2][0]).toBe(
      'https://api.github.com/repos/Braymatter/dogpile-data/git/trees'
    );
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toMatchObject({
      base_tree: 'base-tree-sha',
      tree: [{ path: 'dogpile/todos.json', mode: '100644', type: 'blob' }]
    });
    expect(JSON.parse(String(fetchMock.mock.calls[3][1]?.body))).toMatchObject({
      tree: 'snapshot-tree-sha',
      parents: []
    });
    expect(JSON.parse(String(fetchMock.mock.calls[4][1]?.body))).toEqual({
      sha: 'snapshot-commit-sha',
      force: true
    });
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
