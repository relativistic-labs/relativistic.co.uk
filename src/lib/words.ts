/** Count words the way a reader would: tokens with at least one letter or digit. "/" and "·" aren't words. */
export function countWords(text: string): number {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .split(/\s+/)
    .filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}
