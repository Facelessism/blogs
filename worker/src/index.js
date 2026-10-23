
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });

const encoder = new TextEncoder();
const MAX_CONTENT_SIZE = 500_000;
const MAX_SESSION_TTL = 1800;

function corsHeaders(origin, env) {
  const headers = new Headers({
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600"
  });

  if (origin === env.ALLOWED_ORIGIN) {
    headers.set("Access-Control-Allow-Origin", origin);
  }

  return headers;
}

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function encodeText(value) {
  return base64url(encoder.encode(value));
}

function decodeBase64url(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Invalid token encoding.");
  }

  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(
    normalized + "=".repeat((4 - normalized.length % 4) % 4)
  );

  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function encodeBase64(value) {
  const bytes = encoder.encode(value);
  let binary = "";

  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }

  return btoa(binary);
}

function decodeBase64(value) {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  return base64url(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, encoder.encode(value))
    )
  );
}

function sessionTtl(env) {
  return Math.min(
    Math.max(Number(env.SESSION_TTL_SECONDS) || MAX_SESSION_TTL, 300),
    MAX_SESSION_TTL
  );
}

async function createSession(username, env) {
  const now = Math.floor(Date.now() / 1000);
  const payload = encodeText(JSON.stringify({
    sub: username,
    iat: now,
    exp: now + sessionTtl(env)
  }));

  const content = `v1.${payload}`;
  return `${content}.${await sign(content, env.SESSION_SECRET)}`;
}

async function verifySession(request, env) {
  if (!env.SESSION_SECRET) return null;

  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer ([A-Za-z0-9._-]{1,8192})$/);

  if (!match) return null;

  const parts = match[1].split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;

  const [version, payload, signature] = parts;

  try {
    const expected = await sign(`${version}.${payload}`, env.SESSION_SECRET);

    if (signature.length !== expected.length) return null;

    const actualBytes = encoder.encode(signature);
    const expectedBytes = encoder.encode(expected);
    let difference = 0;

    for (let i = 0; i < actualBytes.length; i++) {
      difference |= actualBytes[i] ^ expectedBytes[i];
    }

    if (difference !== 0) return null;

    const claims = JSON.parse(
      new TextDecoder().decode(decodeBase64url(payload))
    );

    const now = Math.floor(Date.now() / 1000);

    if (
      typeof claims.sub !== "string" ||
      claims.sub.toLowerCase() !== env.ADMIN_GITHUB_USERNAME.toLowerCase() ||
      !Number.isFinite(claims.exp) ||
      claims.exp <= now ||
      !Number.isFinite(claims.iat) ||
      claims.iat > now + 60 ||
      claims.exp - claims.iat > MAX_SESSION_TTL
    ) {
      return null;
    }

    return claims;
  } catch {
    return null;
  }
}

async function readJson(request) {
  const length = Number(request.headers.get("Content-Length") || 0);

  if (length > MAX_CONTENT_SIZE + 20_000) {
    throw new Error("Request body is too large.");
  }

  const body = await request.json();

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Invalid request body.");
  }

  return body;
}

async function handleLogin(request, env) {
  if (!env.SESSION_SECRET) {
    return json({ error: "Authentication is not configured." }, 503);
  }

  let body;

  try {
    body = await readJson(request);
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const pat = typeof body.pat === "string" ? body.pat.trim() : "";

  if (!pat || pat.length > 500) {
    return json({ error: "Enter a valid GitHub PAT." }, 400);
  }

  let response;

  try {
    response = await fetch("https://api.github.com/user", {
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${pat}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "blogs-admin"
      }
    });
  } catch {
    return json({ error: "GitHub could not be reached." }, 502);
  }

  if (!response.ok) {
    return json({ error: "GitHub rejected that token." }, 401);
  }

  const user = await response.json().catch(() => null);

  if (
    typeof user?.login !== "string" ||
    user.login.toLowerCase() !== env.ADMIN_GITHUB_USERNAME.toLowerCase()
  ) {
    return json({ error: "This GitHub account is not an allowed admin." }, 403);
  }

  return json({
    token: await createSession(user.login, env),
    username: user.login,
    expiresIn: sessionTtl(env)
  });
}

function githubPath(path, env) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `/repos/${encodeURIComponent(env.GITHUB_REPO_OWNER)}/${encodeURIComponent(env.GITHUB_REPO_NAME)}/contents/${encodedPath}`;
}

async function githubRequest(path, env, options = {}) {
  if (!env.GITHUB_WRITE_TOKEN) {
    const error = new Error("Repository write access is not configured.");
    error.status = 503;
    throw error;
  }

  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${env.GITHUB_WRITE_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "blogs-admin",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    }
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error("GitHub repository operation failed.");
    error.status = response.status;
    throw error;
  }

  return data;
}

function validSlug(slug) {
  return (
    typeof slug === "string" &&
    slug.length <= 80 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
  );
}

function validateMarkdown(content) {
  if (
    typeof content !== "string" ||
    !content.trim() ||
    encoder.encode(content).length > MAX_CONTENT_SIZE
  ) {
    return "Markdown content is empty or too large.";
  }

  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);

  if (!match) return "Markdown must begin with YAML frontmatter.";

  const frontmatter = match[1];

  for (const field of ["title", "description", "pubDate"]) {
    const pattern = new RegExp(`^${field}:\\s*\\S.+$`, "m");

    if (!pattern.test(frontmatter)) {
      return `Frontmatter requires a non-empty ${field} field.`;
    }
  }

  if (!/^pubDate:\s*["']?\d{4}-\d{2}-\d{2}/m.test(frontmatter)) {
    return "pubDate must begin with a YYYY-MM-DD date.";
  }

  return null;
}

function postPath(slug, env) {
  return `${env.BLOG_DIRECTORY}/${slug}.md`;
}

async function getFile(slug, env) {
  try {
    return await githubRequest(
      `${githubPath(postPath(slug, env), env)}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`,
      env
    );
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

async function readPost(file, env) {
  const data = await githubRequest(
    `${githubPath(file.path, env)}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`,
    env
  );

  if (data.encoding !== "base64" || typeof data.content !== "string") {
    throw new Error("Unsupported Markdown file encoding.");
  }

  return {
    slug: file.name.replace(/\.md$/i, ""),
    path: file.path,
    sha: file.sha,
    content: decodeBase64(data.content)
  };
}

async function listPosts(env) {
  const directory = githubPath(env.BLOG_DIRECTORY, env);
  const files = await githubRequest(
    `${directory}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`,
    env
  );

  if (!Array.isArray(files)) {
    throw new Error("The blog content directory could not be read.");
  }

  const markdownFiles = files.filter(
    file => file.type === "file" && /\.md$/i.test(file.name)
  );

  const posts = [];

  for (let i = 0; i < markdownFiles.length; i += 8) {
    const batch = markdownFiles.slice(i, i + 8);
    posts.push(...await Promise.all(batch.map(file => readPost(file, env))));
  }

  return posts;
}

async function writePost(slug, content, sha, env, action) {
  const validationError = validateMarkdown(content);

  if (validationError) {
    return json({ error: validationError }, 400);
  }

  const path = postPath(slug, env);
  const existing = await getFile(slug, env);

  if (action === "create" && existing) {
    return json({ error: "A post with that slug already exists." }, 409);
  }

  if (action === "update") {
    if (!existing) {
      return json({ error: "Post not found." }, 404);
    }

    if (!sha || sha !== existing.sha) {
      return json({
        error: "This post changed on GitHub. Reload it before saving."
      }, 409);
    }
  }

  const message = action === "create"
    ? `content(blog): create ${slug}`
    : `content(blog): update ${slug}`;

  const result = await githubRequest(githubPath(path, env), env, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: encodeBase64(content),
      branch: env.GITHUB_BRANCH,
      ...(action === "update" ? { sha: existing.sha } : {})
    })
  });

  return json({
    success: true,
    slug,
    path,
    sha: result.content?.sha,
    commit: result.commit?.html_url
  }, action === "create" ? 201 : 200);
}

async function deletePost(slug, sha, env) {
  if (!sha || typeof sha !== "string") {
    return json({ error: "A current post SHA is required." }, 400);
  }

  const existing = await getFile(slug, env);

  if (!existing) {
    return json({ error: "Post not found." }, 404);
  }

  if (sha !== existing.sha) {
    return json({
      error: "This post changed on GitHub. Reload it before deleting."
    }, 409);
  }

  const result = await githubRequest(
    githubPath(postPath(slug, env), env),
    env,
    {
      method: "DELETE",
      body: JSON.stringify({
        message: `content(blog): delete ${slug}`,
        sha: existing.sha,
        branch: env.GITHUB_BRANCH
      })
    }
  );

  return json({
    success: true,
    slug,
    commit: result.commit?.html_url
  });
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (path === "/api/login" && method === "POST") {
    return handleLogin(request, env);
  }

  if (!env.SESSION_SECRET) {
    return json({ error: "Authentication is not configured." }, 503);
  }

  const session = await verifySession(request, env);

  if (!session) {
    return json({ error: "Session expired or invalid." }, 401);
  }

  if (path === "/api/me" && method === "GET") {
    return json({
      authenticated: true,
      username: session.sub,
      expiresAt: session.exp
    });
  }

  if (path === "/api/posts" && method === "GET") {
    try {
      return json({ posts: await listPosts(env) });
    } catch (error) {
      return githubError(error);
    }
  }

  if (path === "/api/posts" && method === "POST") {
    let body;

    try {
      body = await readJson(request);
    } catch {
      return json({ error: "Invalid request body." }, 400);
    }

    if (!validSlug(body.slug)) {
      return json({
        error: "Slug must contain lowercase letters, numbers, and single hyphens."
      }, 400);
    }

    return safely(() => writePost(body.slug, body.content, null, env, "create"));
  }

  const match = path.match(/^\/api\/posts\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);

  if (match && method === "PUT") {
    let body;

    try {
      body = await readJson(request);
    } catch {
      return json({ error: "Invalid request body." }, 400);
    }

    if (!validSlug(match[1])) {
      return json({ error: "Invalid slug." }, 400);
    }

    return safely(() => writePost(
      match[1],
      body.content,
      body.sha,
      env,
      "update"
    ));
  }

  if (match && method === "DELETE") {
    let body;

    try {
      body = await readJson(request);
    } catch {
      return json({ error: "Invalid request body." }, 400);
    }

    if (!validSlug(match[1])) {
      return json({ error: "Invalid slug." }, 400);
    }

    return safely(() => deletePost(match[1], body.sha, env));
  }

  return json({ error: "Not found." }, 404);
}

async function safely(operation) {
  try {
    return await operation();
  } catch (error) {
    return githubError(error);
  }
}

function githubError(error) {
  if (error.status === 409 || error.status === 422) {
    return json({
      error: "GitHub rejected the change. Check for a conflict or invalid file."
    }, 409);
  }

  if (error.status === 503) {
    return json({ error: error.message }, 503);
  }

  return json({
    error: "The repository operation failed. Check the Worker token, repository, and branch configuration."
  }, 502);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin, env);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      if (origin !== env.ALLOWED_ORIGIN) {
        return new Response(null, { status: 403 });
      }

      return new Response(null, { status: 204, headers });
    }

    if (origin && origin !== env.ALLOWED_ORIGIN) {
      return json({ error: "Origin not allowed." }, 403);
    }

    const response = await handleApi(request, env).catch(() =>
      json({ error: "Unexpected server error." }, 500)
    );

    const responseHeaders = new Headers(response.headers);

    for (const [key, value] of headers) {
      responseHeaders.set(key, value);
    }

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders
    });
  }
};
