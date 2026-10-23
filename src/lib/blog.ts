import { getCollection } from "astro:content";
import type { CollectionEntry } from "astro:content";
import { getReadingTime } from "./reading-time";

export type BlogPost = CollectionEntry<"blog">;

export interface TaxonomyItem {
  label: string;
  slug: string;
}

export async function getPublishedPosts(): Promise<BlogPost[]> {
  const posts = await getCollection("blog", ({ data }) => !data.draft);

  return posts.sort(
    (a, b) =>
      b.data.pubDate.getTime() - a.data.pubDate.getTime() ||
      a.id.localeCompare(b.id),
  );
}

export async function getPublishedPostBySlug(
  id: string,
): Promise<BlogPost | undefined> {
  const posts = await getPublishedPosts();
  return posts.find((post) => post.id === id);
}

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\+/g, " plus ")
    .replace(/#/g, " sharp ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function createTaxonomyItems(
  labels: string[],
  type: "category" | "tag",
): TaxonomyItem[] {
  const bySlug = new Map<string, string>();

  for (const label of labels) {
    const slug = slugify(label);

    if (!slug) {
      throw new Error(
        `Invalid ${type} "${label}": it produces an empty URL slug.`,
      );
    }

    const existing = bySlug.get(slug);

    if (existing && existing !== label) {
      throw new Error(
        `Conflicting ${type} slugs: "${existing}" and "${label}" both produce "${slug}". Rename one of them.`,
      );
    }

    bySlug.set(slug, label);
  }

  return [...bySlug.entries()]
    .map(([slug, label]) => ({ label, slug }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export async function getCategories(): Promise<string[]> {
  const posts = await getPublishedPosts();

  return createTaxonomyItems(
    posts.flatMap((post) => post.data.categories),
    "category",
  ).map((item) => item.label);
}

export async function getTags(): Promise<string[]> {
  const posts = await getPublishedPosts();

  return createTaxonomyItems(
    posts.flatMap((post) => post.data.tags),
    "tag",
  ).map((item) => item.label);
}

export async function getCategoryItems(): Promise<TaxonomyItem[]> {
  const posts = await getPublishedPosts();

  return createTaxonomyItems(
    posts.flatMap((post) => post.data.categories),
    "category",
  );
}

export async function getTagItems(): Promise<TaxonomyItem[]> {
  const posts = await getPublishedPosts();

  return createTaxonomyItems(
    posts.flatMap((post) => post.data.tags),
    "tag",
  );
}

export function getPostReadingTime(post: BlogPost) {
  return getReadingTime(post.body ?? "");
}
