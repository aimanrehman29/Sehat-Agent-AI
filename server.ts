/**
 * ─────────────────────────────────────────────────────────────────────────────
 * server.ts — Main entry point, starts the server.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Custom Next.js server that also exposes Express-style REST endpoints
 * for the agent API. This allows both:
 *   - Next.js frontend pages (test UI, dashboard)
 *   - REST API endpoints for Track B / external integrations
 *
 * Usage:
 *   npm run dev       → starts dev server on port 3000
 *   npm run build     → production build
 *   npm start         → starts production server
 */

import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { apiRouter } from "./routes/api";
import { logger } from "./utils/logger";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    const parsedUrl = parse(req.url || "", true);
    const { pathname } = parsedUrl;

    // ── API routes ──
    if (pathname?.startsWith("/api/v1")) {
      try {
        await apiRouter(req, res, pathname);
      } catch (err) {
        logger.error(`[Server] API error: ${pathname}`, {
          error: err instanceof Error ? err.message : "Unknown",
        });
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
      return;
    }

    // ── Next.js pages ──
    await handle(req, res, parsedUrl);
  });

  server.listen(port, () => {
    logger.info(`[Server] Sehat-Agent AI running on http://localhost:${port}`);
    logger.info(`[Server] Mode: ${dev ? "development" : "production"}`);
    logger.info(`[Server] API:  http://localhost:${port}/api/v1/agents`);
    logger.info(`[Server] Test: http://localhost:${port}/test`);
  });
});
