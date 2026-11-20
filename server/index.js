import express from 'express';
import { existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { AdminAuth } from './auth.js';
import { GameStore } from './game.js';
import { FileGamePersistence } from './persistence.js';
import { registerSocketHandlers } from './sockets.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Load local settings (e.g. ADMIN_PASSWORD) from a git-ignored .env, however the server was started.
// Variables already set in the environment (as on a cloud host) take precedence.
if (existsSync(path.join(rootDir, '.env'))) process.loadEnvFile(path.join(rootDir, '.env'));

const PORT = Number(process.env.PORT) || 3001;
const distDir = path.join(rootDir, 'dist');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 10_000 });
// DATA_DIR (e.g. a Render persistent disk at /var/data) keeps games across restarts and deploys.
const dataDir = process.env.DATA_DIR;
const store = new GameStore({ persistence: dataDir ? new FileGamePersistence(dataDir) : null });
if (dataDir) console.log(`💾 Saving games to ${dataDir}: restored ${store.restore()} game(s)`);
else console.log('💭 DATA_DIR is not set: games are kept in memory only');
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

// Render sends SIGTERM before stopping the old instance on every deploy: save pending changes first.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => {
    store.flush();
    io.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
