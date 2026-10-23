import type { AdminPost } from "./post-schema";

function quote(value: string): string {
  return JSON.stringify(value);
}

export function serializeMarkdown(post: AdminPost): string {
  const frontmatter = [
    "---",
    `title: ${quote(post.title)}`,
    `description: ${quote(post.description)}`,
    `pubDate: ${quote(post.pubDate)}`,
    ...(post.updatedDate
      ? [`updatedDate: ${quote(post.updatedDate)}`]
      : []),
    `categories: ${JSON.stringify(post.categories)}`,
    `tags: ${JSON.stringify(post.tags)}`,
    `draft: ${post.draft}`,
    "---",
  ];

  return `${frontmatter.join("\n")}\n\n${post.body.trimEnd()}\n`;
}
