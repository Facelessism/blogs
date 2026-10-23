import type { AdminPost, PostInput } from "./post-schema";

const STORAGE_KEY = "blogs-admin-posts-v1";

export function listPosts(): AdminPost[] {
  try {
    const value = localStorage.getItem(STORAGE_KEY);

    if (!value) return [];

    const parsed: unknown = JSON.parse(value);

    if (!Array.isArray(parsed)) return [];

    return (parsed as AdminPost[]).sort(
      (a, b) =>
        b.pubDate.localeCompare(a.pubDate) ||
        b.updatedAt.localeCompare(a.updatedAt),
    );
  } catch {
    return [];
  }
}

export function getPost(slug: string): AdminPost | undefined {
  return listPosts().find((post) => post.slug === slug);
}

export function savePost(
  input: PostInput,
  previousSlug?: string,
): AdminPost {
  const posts = listPosts();

  const duplicate = posts.some(
    (post) =>
      post.slug === input.slug &&
      post.slug !== previousSlug,
  );

  if (duplicate) {
    throw new Error(`The slug "${input.slug}" is already in use.`);
  }

  const existing = previousSlug
    ? posts.find((post) => post.slug === previousSlug)
    : undefined;

  if (previousSlug && !existing) {
    throw new Error("The original article no longer exists.");
  }

  const now = new Date().toISOString();

  const saved: AdminPost = {
    ...input,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    ...(existing ? { updatedDate: now.slice(0, 10) } : {}),
  };

  const next = posts.filter(
    (post) =>
      post.slug !== input.slug &&
      post.slug !== previousSlug,
  );

  next.push(saved);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));

  return saved;
}

export function deletePost(slug: string): void {
  const posts = listPosts();
  const next = posts.filter((post) => post.slug !== slug);

  if (next.length === posts.length) {
    throw new Error("The article no longer exists.");
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
