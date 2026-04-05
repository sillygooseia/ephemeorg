const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');

const contentDir = path.join(__dirname, 'content');

function normalizeSlug(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-_ ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parsePost(fileName) {
  const filePath = path.join(contentDir, fileName);
  const raw = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);
  const slug = normalizeSlug(data.slug || path.basename(fileName, ".md"));
  const title = data.title || slug.replace(/[-_]+/g, " ");
  const dateObj = data.date ? new Date(data.date) : fs.statSync(filePath).mtime;
  const date = new Date(dateObj);
  const excerpt = data.description || String(content)
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)[0]
    .replace(/[#>*`]/g, "")
    .trim()
    .slice(0, 220);

  return {
    slug,
    title: String(title).trim(),
    description: String(data.description || excerpt).trim(),
    tags: Array.isArray(data.tags) ? data.tags : data.tags ? [data.tags] : [],
    date: date.toISOString(),
    timestamp: date.getTime(),
    html: marked.parse(content),
  };
}

function loadPosts() {
  if (!fs.existsSync(contentDir)) {
    return [];
  }

  return fs
    .readdirSync(contentDir)
    .filter((fileName) => fileName.toLowerCase().endsWith(".md"))
    .map(parsePost)
    .filter((post) => post && post.slug);
}

function getAllPosts() {
  return loadPosts().sort((a, b) => b.timestamp - a.timestamp);
}

function getPostBySlug(slug) {
  return getAllPosts().find((post) => post.slug === slug);
}

module.exports = {
  getAllPosts,
  getPostBySlug,
};
