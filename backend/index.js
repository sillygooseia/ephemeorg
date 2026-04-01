require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = Number(process.env.PORT || 8791);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/healthz", (_req, res) => res.sendStatus(200));
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "ephemeorg", ts: Date.now() });
});

app.listen(PORT, () => {
  console.log(`[ephemeorg] listening on http://localhost:${PORT}`);
});
