import { describe, expect, it } from 'vitest';
import { parseTagInput } from './parseTagInput';

describe('parseTagInput', () => {
  it('parses double-dash tags and leaves single-dash terms as text', () => {
    expect(parseTagInput('Write report -old --Work --DeepFocus')).toEqual({
      text: 'Write report -old',
      tags: ['Work', 'DeepFocus'],
      excludedTags: []
    });
  });

  it('parses em dash tags like double-dash tags', () => {
    expect(parseTagInput('Write report \u2014Work --DeepFocus')).toEqual({
      text: 'Write report',
      tags: ['Work', 'DeepFocus'],
      excludedTags: []
    });
  });

  it('parses excluded tags only when enabled', () => {
    expect(parseTagInput('review !Blocked', { allowExcludedTags: true })).toEqual({
      text: 'review',
      tags: [],
      excludedTags: ['Blocked']
    });
  });
});
