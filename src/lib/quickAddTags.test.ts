import { describe, expect, it } from 'vitest';
import { getQuickAddPlaceholder, mergeQuickAddTags } from './quickAddTags';

describe('quick add tags', () => {
  it('uses the default placeholder when no filter tags are active', () => {
    expect(getQuickAddPlaceholder([])).toBe('Task Name --TagA --TagB');
  });

  it('shows active filter tags in the quick-add placeholder', () => {
    expect(getQuickAddPlaceholder(['work', 'deep-focus'])).toBe(
      'Task Name --work --deep-focus'
    );
  });

  it('adds active filter tags to new tasks after typed tags', () => {
    expect(mergeQuickAddTags(['TypedExtra'], ['work', 'deep-focus'])).toEqual([
      'TypedExtra',
      'work',
      'deep-focus'
    ]);
  });

  it('deduplicates typed and active filter tags case-insensitively', () => {
    expect(mergeQuickAddTags(['Work'], ['work', 'deep-focus'])).toEqual([
      'Work',
      'deep-focus'
    ]);
  });
});
