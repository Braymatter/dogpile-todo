import { stripOptionalRequiredTagPrefix } from '$lib/tagSyntax';

export function parseEditableTag(value: string) {
  const trimmed = value.trim();
  const tag = stripOptionalRequiredTagPrefix(trimmed);

  return tag && !/\s/.test(tag) ? tag : null;
}
