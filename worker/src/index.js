const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });

function corsHeaders(origin, env) {
  const headers = new Headers({
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function encodeText(value) {
  return base64url(new TextEncoder().encode(value));
}

function decodeBase64url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  return base64url(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))
    )
  );
}

async function createSession(username, env) {
  const now = Math.floor(Date.now() / 1000);
  const ttl = Math.min(
    Math.max(Number(env.SESSION_TTL_SECONDS) || 1800, 300),
    1800
  );

  const payload = encodeText(JSON.stringify({
    sub: username,
    iat: now,
    exp: now + ttl
  }));

  const content = `v1.${payload}`;
  const signature = await sign(content, env.SESSION_SECRET);

  return `${content}.${signature}`;
}

async function verifySession(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer ([A-Za-z0-9._-]+)$/);

  if (!match) return null;

  const parts = match[1].split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;

  const [version, payload, signature] = parts;
  const expected = await sign(`${version}.${payload}`, env.SESSION_SECRET);

  if (signature.length !== expected.length) return null;

  const actualBytes = new TextEncoder().encode(signature);
  const expectedBytes = new TextEncoder().encode(expected);
  let difference = 0;

  for (let i = 0; i < actualBytes.length; i++) {
    difference |= actualBytes[i] ^ expectedBytes[i];
  }

  if (difference !== 0) return null;

  try {
    const claims = JSON.parse(
      new TextDecoder().decode(decodeBase64url(payload))
    );

    const now = Math.floor(Date.now() / 1000);

    if (
      claims.sub !== env.ADMIN_GITHUB_USERNAME ||
      !Number.isFinite(claims.exp) ||
      claims.exp <= now ||
      !Number.isFinite(claims.iat) ||
      claims.iat > now + 60
    ) {
      return null;
    }

    return claims;
  } catch {
    return null;
  }
}

async function handleLogin(request, env) {
  let body;

  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const pat = typeof body?.pat === "string" ? body.pat.trim() : "";

  if (!pat || pat.length > 500) {
    return json({ error: "Enter a valid GitHub PAT." }, 400);
  }

  let githubResponse;

  try {
    githubResponse = await fetch("https://api.github.com/user", {
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${pat}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "blogs-admin"
      }
    });
  } catch {
    return json({ error: "GitHub could not be reached. Try again." }, 502);
  }

  if (!githubResponse.ok) {
    return json({ error: "GitHub rejected that token." }, 401);
  }

  let user;

  try {
    user = await githubResponse.json();
  } catch {
    return json({ error: "GitHub returned an invalid response." }, 502);
  }

  if (
    typeof user.login !== "string" ||
    user.login.toLowerCase() !== env.ADMIN_GITHUB_USERNAME.toLowerCase()
  ) {
    return json({ error: "This GitHub account is not an allowed admin." }, 403);
  }

  const session = await createSession(user.login, env);

  return json({
    token: session,
    username: user.login,
    expiresIn: Math.min(
      Math.max(Number(env.SESSION_TTL_SECONDS) || 1800, 300),
      1800
    )
  });
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

    let response;

    if (url.pathname === "/api/login" && request.method === "POST") {
      response = await handleLogin(request, env);
    } else if (url.pathname === "/api/me" && request.method === "GET") {
      const session = await verifySession(request, env);

      response = session
        ? json({
            authenticated: true,
            username: session.sub,
            expiresAt: session.exp
          })
        : json({ error: "Session expired or invalid." }, 401);
    } else {
      response = json({ error: "Not found." }, 404);
    }

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
