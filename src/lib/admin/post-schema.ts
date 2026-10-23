export interface PostInput {
  title: string;
  slug: string;
  description: string;
  body: string;
  pubDate: string;
  categories: string[];
  tags: string[];
  draft: boolean;
}

export interface AdminPost extends PostInput {
  createdAt: string;
  updatedAt: string;
  updatedDate?: string;
}

export function normalizeSlug(value: string): string {
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

export function parseLabels(value: string): string[] {
  const seen = new Set<string>();

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => {
      if (!item) return false;

      const key = item.toLowerCase();

      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    });
}

export function validatePostInput(input: PostInput): string[] {
  const errors: string[] = [];

  if (!input.title.trim()) {
    errors.push("Title is required.");
  }

  if (!input.description.trim()) {
    errors.push("Description is required.");
  }

  if (!input.body.trim()) {
    errors.push("Article content is required.");
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug)) {
    errors.push(
      "Slug must contain lowercase letters, numbers, and single hyphens only.",
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.pubDate)) {
    errors.push("Enter a valid publication date.");
  } else {
    const date = new Date(`${input.pubDate}T00:00:00.000Z`);

    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== input.pubDate
    ) {
      errors.push("Enter a real calendar date.");
    }
  }

  for (const [label, values] of [
    ["category", input.categories],
    ["tag", input.tags],
  ] as const) {
    for (const value of values) {
      if (!value.trim()) {
        errors.push(`An empty ${label} is not allowed.`);
        break;
      }
    }
  }

  return errors;
}
