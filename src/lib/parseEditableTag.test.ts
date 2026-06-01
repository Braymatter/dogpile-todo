import { describe, expect, it } from 'vitest';
import { parseEditableTag } from './parseEditableTag';

describe('parseEditableTag', () => {
  it('accepts plain tag names', () => {
    expect(parseEditableTag('plainTag')).toBe('plainTag');
  });

  it('still accepts an optional double-dash prefix', () => {
    expect(parseEditableTag('--habit')).toBe('habit');
  });

  it('still accepts an optional em dash prefix', () => {
    expect(parseEditableTag('\u2014habit')).toBe('habit');
  });

  it('rejects tags containing spaces', () => {
    expect(parseEditableTag('two words')).toBeNull();
  });
});
