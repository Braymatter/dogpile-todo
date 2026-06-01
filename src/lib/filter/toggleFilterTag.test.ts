import { describe, expect, it } from 'vitest';
import { toggleFilterTag } from './toggleFilterTag';

describe('toggleFilterTag', () => {
  it('adds a required tag when it is not active', () => {
    expect(toggleFilterTag('dashboard polish', 'Design')).toBe('dashboard polish --Design');
  });

  it('removes a required tag when it is active', () => {
    expect(toggleFilterTag('dashboard --Design polish', 'design')).toBe('dashboard polish');
  });

  it('removes an em dash required tag when it is active', () => {
    expect(toggleFilterTag('dashboard \u2014Design polish', 'design')).toBe('dashboard polish');
  });

  it('replaces an excluded tag with a required tag', () => {
    expect(toggleFilterTag('dashboard !Design', 'Design')).toBe('dashboard --Design');
  });
});
