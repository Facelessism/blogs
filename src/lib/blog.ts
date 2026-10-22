import { getCollection } from "astro:content";
import type { CollectionEntry } from "astro:content";
import { getReadingTime } from "./reading-time";

export type BlogPost = CollectionEntry<"blog">;

export async function getPublishedPosts(): Promise<BlogPost[]> {
  const posts = await getCollection("blog", ({ data }) => !data.draft);

  return posts.sort(
    (a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime(),
  );
}

export async function getPublishedPostBySlug(
  id: string,
): Promise<BlogPost | undefined> {
  const posts = await getPublishedPosts();
  return posts.find((post) => post.id === id);
}

export async function getCategories(): Promise<string[]> {
  const posts = await getPublishedPosts();

  return [
    ...new Set(posts.flatMap((post) => post.data.categories)),
  ].sort((a, b) => a.localeCompare(b));
}

export async function getTags(): Promise<string[]> {
  const posts = await getPublishedPosts();

  return [
    ...new Set(posts.flatMap((post) => post.data.tags)),
  ].sort((a, b) => a.localeCompare(b));
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getPostReadingTime(post: BlogPost) {
  return getReadingTime(post.body ?? "");
}
