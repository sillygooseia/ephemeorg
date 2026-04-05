require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const { createLogger, requestLogger: _requestLogger } = require("@epheme/core/logger");
const { getAllPosts, getPostBySlug } = require("./content");

const app = express();
const PORT = Number(process.env.PORT || 8791);
const log = createLogger({ service: "ephemeorg-backend" });

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

app.get("/healthz", (_req, res) => res.sendStatus(200));
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "ephemeorg", ts: Date.now() });
});

app.listen(PORT, () => {
  log.info({ port: PORT }, "backend listening");
});
