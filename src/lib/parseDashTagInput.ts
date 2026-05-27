export function parseDashTagInput(value: string) {
  const textParts: string[] = [];
  const tags: string[] = [];

  for (const part of value.trim().split(/\s+/).filter(Boolean)) {
    if (part.startsWith('-') && part.length > 1) {
      tags.push(part.slice(1));
    } else {
      textParts.push(part);
    }
  }

  return {
    text: textParts.join(' ').trim(),
    tags: Array.from(new Set(tags))
  };
}
