const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const cors = require("cors");
const Redis = require("ioredis");
const { createLogger, requestLogger: _requestLogger } = require("@epheme/core/logger");
const { createDeviceRegistry } = require("@epheme/core/deviceRegistry");
const { getAllPosts, getPostBySlug } = require("./content");

const app = express();

let _redis = null;
let _redisReady = false;

function getRedis() {
  if (!_redis) {
    _redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379", {
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => (times < 3 ? Math.min(times * 500, 2000) : null),
    });
    _redis.on("ready", () => { _redisReady = true; });
    _redis.on("error", () => { _redisReady = false; });
    _redis.on("close", () => { _redisReady = false; });
  }
  return _redis;
}

function redisAvailable() {
  return _redis && _redisReady;
}
const voteRegistry = createDeviceRegistry({ deviceJwtSecret: process.env.DEVICE_JWT_SECRET });
const VOTE_WINDOW_SECONDS = 24 * 60 * 60;
const VOTE_UP_KEY = "votes:up";
const VOTE_DOWN_KEY = "votes:down";
const VOTE_RESET_KEY = "votes:resetAt";
const DEVICE_VOTE_KEY_PREFIX = "votes:device:";

function normalizeDeviceId(rawId) {
  if (!rawId || typeof rawId !== "string") return null;
  const trimmed = rawId.trim();
  if (!trimmed) return null;
  return trimmed;
}

function extractDeviceId(req) {
  const authHeader = req.get("Authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (bearer) {
    const payload = voteRegistry.verifyDeviceJWT(bearer);
    if (payload?.device_id) {
      return normalizeDeviceId(payload.device_id);
    }
  }
  return normalizeDeviceId(req.get("X-Device-Id") || req.get("x-device-id"));
}

async function ensureVoteWindow() {
  const redis = getRedis();
  const resetAt = await redis.get(VOTE_RESET_KEY);
  if (resetAt) {
    return Number(resetAt);
  }

  const now = Date.now();
  await redis.multi()
    .set(VOTE_UP_KEY, 0, "EX", VOTE_WINDOW_SECONDS)
    .set(VOTE_DOWN_KEY, 0, "EX", VOTE_WINDOW_SECONDS)
    .set(VOTE_RESET_KEY, String(now), "EX", VOTE_WINDOW_SECONDS)
    .exec();
  return now;
}

async function getVoteState(deviceId) {
  const redis = getRedis();
  let [up, down, resetAt] = await redis.mget(VOTE_UP_KEY, VOTE_DOWN_KEY, VOTE_RESET_KEY);
  if (!resetAt) {
    resetAt = String(await ensureVoteWindow());
    up = up ?? "0";
    down = down ?? "0";
  }

  const result = {
    up: Number(up || 0),
    down: Number(down || 0),
    resetAt: Number(resetAt) || Date.now(),
  };

  if (deviceId) {
    const deviceVote = await redis.get(`${DEVICE_VOTE_KEY_PREFIX}${deviceId}`);
    if (deviceVote === "up" || deviceVote === "down") {
      result.deviceVote = deviceVote;
    }
  }

  return result;
}

async function recordVote(deviceId, vote) {
  const redis = getRedis();
  const existing = await redis.get(`${DEVICE_VOTE_KEY_PREFIX}${deviceId}`);
  const tx = redis.multi();
  if (existing && existing !== vote) {
    tx.decr(existing === "up" ? VOTE_UP_KEY : VOTE_DOWN_KEY);
  }
  if (!existing || existing !== vote) {
    tx.incr(vote === "up" ? VOTE_UP_KEY : VOTE_DOWN_KEY);
    tx.set(`${DEVICE_VOTE_KEY_PREFIX}${deviceId}`, vote, "EX", VOTE_WINDOW_SECONDS);
  }
  await tx.exec();
}

const PORT = Number(process.env.PORT || 8791);
const log = createLogger({ service: "ephemeorg-backend" });

// Eagerly attempt Redis connection so it is ready when first vote arrives.
getRedis();

app.use(cors());
app.use(express.json());
app.use(_requestLogger(log));
app.use(express.static(path.join(__dirname, "public")));

function renderPage({ title, description = "", body, extraStyles = [] }) {
  const styles = ["/app.css", ...extraStyles].map((href) => `<link rel="stylesheet" href="${href}" />`).join("\n      ");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title} | Epheme</title>
    <meta name="description" content="${description}" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700;9..144,800&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap"
      rel="stylesheet"
    />
    ${styles}
  </head>
  <body class="blog">
    <div class="grain" aria-hidden="true"></div>
    <div class="stage" aria-hidden="true">
      <span class="orb orb-1"></span>
      <span class="orb orb-2"></span>
    </div>
    ${body}
  </body>
</html>`;
}

function renderBlogList(posts) {
  const postCards = posts
    .map(
      (post) => `
        <article class="blog-card">
          <h2><a href="/blog/${post.slug}">${post.title}</a></h2>
          <div class="blog-meta">
            <span>${new Date(post.date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
            ${post.tags.map((tag) => `<span>#${tag}</span>`).join("")}
          </div>
          <p>${post.description}</p>
          <a href="/blog/${post.slug}">Read post →</a>
        </article>`
    )
    .join("\n");

  return renderPage({
    title: "Blog",
    description: "Epheme blog posts, tutorials, and practical notes.",
    extraStyles: ["/blog.css"],
    body: `
      <main class="blog-page">
        <section class="blog-header">
          <p class="kicker">E P H E M E</p>
          <h1>Blog & Resources</h1>
          <p>Short essays, code notes, and technical guides for building privacy-first, local-first software.</p>
          <div class="blog-meta">
            <span><a href="/">Home</a></span>
            <span>${posts.length} posts</span>
          </div>
        </section>
        <section class="blog-list">
          ${postCards}
        </section>
      </main>`,
  });
}

function renderBlogPost(post) {
  const tags = post.tags.map((tag) => `<span>#${tag}</span>`).join("");

  return renderPage({
    title: post.title,
    description: post.description,
    extraStyles: ["/blog.css"],
    body: `
      <main class="blog-page">
        <article class="blog-post">
          <p class="kicker">E P H E M E</p>
          <h1>${post.title}</h1>
          <div class="blog-meta">
            <span>${new Date(post.date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
            ${tags}
          </div>
          <article>${post.html}</article>
          <a class="back-link" href="/blog">← Back to blog</a>
        </article>
      </main>`,
  });
}

app.get("/blog", (_req, res) => {
  const posts = getAllPosts();
  res.send(renderBlogList(posts));
});

app.get("/blog/:slug", (req, res) => {
  const post = getPostBySlug(req.params.slug);
  if (!post) {
    return res.status(404).send(
      renderPage({
        title: "Post Not Found",
        description: "The requested Epheme post does not exist.",
        extraStyles: ["/blog.css"],
        body: `
          <main class="blog-page">
            <section class="blog-post">
              <h1>Post not found</h1>
              <p>The blog post you were looking for could not be found.</p>
              <a class="back-link" href="/blog">Back to blog</a>
            </section>
          </main>`,
      })
    );
  }

  res.send(renderBlogPost(post));
});

app.get("/budget", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "budget.html"));
});

app.get("/api/blog", (_req, res) => {
  const posts = getAllPosts().map(({ html, ...meta }) => meta);
  res.json(posts);
});

app.get("/api/blog/:slug", (req, res) => {
  const post = getPostBySlug(req.params.slug);
  if (!post) {
    return res.status(404).json({ error: "Post not found" });
  }
  res.json(post);
});

app.get("/api/votes", async (req, res) => {
  if (!redisAvailable()) {
    return res.json({ up: 0, down: 0, resetAt: null, unavailable: true });
  }
  try {
    const deviceId = extractDeviceId(req);
    const state = await getVoteState(deviceId);
    res.json(state);
  } catch (error) {
    log.error({ err: error.message }, "Failed to load vote state");
    res.json({ up: 0, down: 0, resetAt: null, unavailable: true });
  }
});

app.post("/api/votes", async (req, res) => {
  if (!redisAvailable()) {
    return res.status(503).json({ error: "Vote storage not available right now." });
  }

  const vote = req.body?.vote;
  if (vote !== "up" && vote !== "down") {
    return res.status(400).json({ error: "Vote must be 'up' or 'down'." });
  }

  const deviceId = extractDeviceId(req);
  if (!deviceId) {
    return res.status(400).json({ error: "Device identity is required." });
  }

  try {
    await ensureVoteWindow();
    await recordVote(deviceId, vote);
    const state = await getVoteState(deviceId);
    res.json(state);
  } catch (error) {
    log.error({ err: error.message }, "Failed to record vote");
    res.status(503).json({ error: "Unable to record vote right now." });
  }
});

app.get("/healthz", (_req, res) => res.sendStatus(200));
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "ephemeorg", ts: Date.now() });
});

app.listen(PORT, () => {
  log.info({ port: PORT }, "backend listening");
});
