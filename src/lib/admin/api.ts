
import { getSessionToken } from "./auth";

const API_URL = (import.meta.env.PUBLIC_ADMIN_API_URL as string | undefined)
  ?.replace(/\/+$/, "");

export interface RemotePost {
  slug: string;
  path: string;
  sha: string;
  content: string;
}

interface ApiError {
  error?: string;
}

interface PostListResponse {
  posts: RemotePost[];
}

interface WriteResponse {
  success: boolean;
  slug: string;
  path?: string;
  sha?: string;
  commit?: string;
}

function getApiUrl(): string {
  if (!API_URL) {
    throw new Error("Admin API URL is not configured.");
  }

  return API_URL;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getSessionToken();

  if (!token) {
    throw new Error("Your admin session has expired. Please log in again.");
  }

  const response = await fetch(`${getApiUrl()}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    cache: "no-store",
    credentials: "omit",
  });

  const result: unknown = await response.json().catch(() => ({}));

  if (response.status === 401) {
    throw new Error("Your admin session has expired. Please log in again.");
  }

  if (!response.ok) {
    const apiError =
      result !== null && typeof result === "object"
        ? (result as ApiError)
        : {};

    throw new Error(
      typeof apiError.error === "string"
        ? apiError.error
        : `Admin API request failed (${response.status}).`,
    );
  }

  return result as T;
}

export async function listRemotePosts(): Promise<RemotePost[]> {
  const result = await request<PostListResponse>("/api/posts", {
    method: "GET",
  });

  if (!Array.isArray(result.posts)) {
    throw new Error("The server returned an invalid post list.");
  }

  return result.posts;
}

export function createRemotePost(
  slug: string,
  content: string,
): Promise<WriteResponse> {
  return request<WriteResponse>("/api/posts", {
    method: "POST",
    body: JSON.stringify({ slug, content }),
  });
}

export function updateRemotePost(
  slug: string,
  content: string,
  sha: string,
): Promise<WriteResponse> {
  return request<WriteResponse>(
    `/api/posts/${encodeURIComponent(slug)}`,
    {
      method: "PUT",
      body: JSON.stringify({ content, sha }),
    },
  );
}

export function deleteRemotePost(
  slug: string,
  sha: string,
): Promise<WriteResponse> {
  return request<WriteResponse>(
    `/api/posts/${encodeURIComponent(slug)}`,
    {
      method: "DELETE",
      body: JSON.stringify({ sha }),
    },
  );
}
