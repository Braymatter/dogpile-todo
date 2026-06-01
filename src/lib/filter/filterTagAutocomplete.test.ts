import { describe, expect, it } from 'vitest';
import {
  getFilterTagToken,
  getTagAutocompleteSuggestions,
  getUniqueSortedTags,
  replaceFilterTagToken
} from './filterTagAutocomplete';

describe('filter tag autocomplete', () => {
  it('finds the active double-dash tag token at the cursor', () => {
    expect(getFilterTagToken('launch --De', 'launch --De'.length)).toEqual({
      start: 7,
      end: 11,
      prefix: '--',
      query: 'De'
    });
  });

  it('finds excluded and em dash tag tokens', () => {
    expect(getFilterTagToken('review !Blo', 'review !Blo'.length)?.prefix).toBe('!');
    expect(getFilterTagToken('review \u2014Deep', 'review \u2014Deep'.length)?.prefix).toBe('\u2014');
  });

  it('ignores plain search text tokens', () => {
    expect(getFilterTagToken('launch De', 'launch De'.length)).toBeNull();
  });

  it('returns unique sorted tags without whitespace-only values', () => {
    expect(getUniqueSortedTags(['Work', ' personal ', 'work', 'Deep Focus', ''])).toEqual([
      'personal',
      'Work'
    ]);
  });

  it('prioritizes prefix matches in suggestions', () => {
    expect(getTagAutocompleteSuggestions(['Backend', 'DeepFocus', 'Frontend'], 'end')).toEqual([
      'Backend',
      'Frontend'
    ]);
  });

  it('replaces only the active tag token', () => {
    expect(
      replaceFilterTagToken('launch --De today', { start: 7, end: 11, prefix: '--', query: 'De' }, 'DeepFocus')
    ).toEqual({
      value: 'launch --DeepFocus today',
      cursorIndex: 18
    });
  });
});
