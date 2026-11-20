import express from 'express';
import { existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { AdminAuth } from './auth.js';
import { GameStore } from './game.js';
import { registerSocketHandlers } from './sockets.js';

const PORT = Number(process.env.PORT) || 3001;
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 10_000 });
const store = new GameStore();
const auth = new AdminAuth({ username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD });
if (!auth.configured) console.warn('⚠️  ADMIN_USERNAME / ADMIN_PASSWORD are not set: nobody can open admin mode.');

registerSocketHandlers(io, store, auth);
setInterval(() => store.cleanup(), 10 * 60 * 1000).unref();

app.get('/healthz', (_req, res) => res.json({ ok: true, games: store.games.size }));

if (existsSync(distDir)) {
  app.use(express.static(distDir, { index: false, maxAge: '1h' }));
  // SPA fallback: every non-asset route is handled by the React router.
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

server.listen(PORT, () => console.log(`🦹 Word Thief server listening on http://localhost:${PORT}`));
