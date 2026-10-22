export function getPlainText(content: string): string {
  return content
    // Remove YAML frontmatter when present.
    .replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n/, "")

    // Exclude fenced code blocks.
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")

    // Keep image alt text and Markdown link labels.
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")

    // Remove reference-style link definitions.
    .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, " ")

    // Remove inline code delimiters while preserving their text.
    .replace(/(`+)(.*?)\1/g, "$2")

    // Remove MDX import/export statements.
    .replace(/^\s*(?:import|export)\s+.*$/gm, " ")

    // Remove HTML/JSX tags.
    .replace(/<\/?[A-Za-z][^>]*>/g, " ")

    // Remove Markdown heading, quote, and list markers.
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")

    // Remove common Markdown formatting characters.
    .replace(/(\*\*|__|~~|\*|_|==)/g, "")
    .replace(/\\([\\`*_{}[\]()#+.!|>~-])/g, "$1")

    // Normalize whitespace.
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Count words in Markdown or MDX content.
 * Supports Unicode letters and numbers.
 */
export function countWords(content: string): number {
  const text = getPlainText(content);

  if (!text) {
    return 0;
  }

  const words = text.match(
    /[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu,
  );

  return words?.length ?? 0;
}
