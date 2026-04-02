require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const { createLogger, requestLogger: _requestLogger } = require("@epheme/core/logger");

const app = express();
const PORT = Number(process.env.PORT || 8791);
const log = createLogger({ service: "ephemeorg-backend" });

app.use(cors());
app.use(express.json());
app.use(_requestLogger(log));
app.use(express.static(path.join(__dirname, "public")));

app.get("/healthz", (_req, res) => res.sendStatus(200));
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "ephemeorg", ts: Date.now() });
});

app.listen(PORT, () => {
  log.info({ port: PORT }, "backend listening");
});
