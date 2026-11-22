// server.js
// Meow Racing — Express static server for Render Web Service.
// Serves index.html, css/, js/ and any other static assets.

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Basic security-ish headers (kept minimal so nothing breaks on Render).
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
  next();
});

// Cache static assets lightly. HTML must always be fresh so deploys are picked up.
app.use(
  express.static(__dirname, {
    etag: true,
    maxAge: '1h',
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
    }
  })
);

// Health check endpoint (Render can hit this).
app.get('/healthz', (req, res) => {
  res.status(200).json({ ok: true, service: 'meow-racing' });
});

// SPA-ish fallback: send index.html for any non-file GET route.
app.get('*', (req, res) => {
  if (req.path.startsWith('/js/') || req.path.startsWith('/css/') || req.path.startsWith('/assets/')) {
    return res.status(404).send('Not found');
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`[Meow Racing] listening on http://${HOST}:${PORT}`);
});