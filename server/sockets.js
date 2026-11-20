import { GameError } from './game.js';

const gameRoom = (gameId) => `game:${gameId}`;
const adminRoom = (gameId) => `admin:${gameId}`;
const playerRoom = (gameId, playerId) => `player:${gameId}:${playerId}`;
// Bursts of changes (e.g. many steals at once in a 300-player game) are coalesced into one broadcast.
const BROADCAST_INTERVAL_MS = 150;

export function registerSocketHandlers(io, store, auth) {
  const pending = new Map();
  const broadcast = (game) => {
    if (pending.has(game.id)) return;
    pending.set(
      game.id,
      setTimeout(() => {
        pending.delete(game.id);
        io.to(gameRoom(game.id)).emit('state', store.publicState(game));
        io.to(adminRoom(game.id)).emit('adminState', store.publicState(game, { admin: true }));
      }, BROADCAST_INTERVAL_MS),
    );
  };
  const sendMe = (game, player) => io.to(playerRoom(game.id, player.id)).emit('me', store.playerState(player));
  const brief = (p) => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color });

  // End games whose time is up and tell everyone watching them.
  setInterval(() => store.expireDueGames().forEach(broadcast), 2_000).unref();

  io.on('connection', (socket) => {
    // Behind a cloud proxy every socket shares the proxy's address, so prefer the forwarded client IP.
    const clientId = String(socket.handshake.headers['x-forwarded-for'] ?? socket.handshake.address).split(',')[0].trim();
    const handle = (event, fn) =>
      socket.on(event, (payload, ack) => {
        if (typeof ack !== 'function') return;
        try {
          ack({ ok: true, ...fn(payload && typeof payload === 'object' ? payload : {}) });
        } catch (err) {
          if (!(err instanceof GameError)) console.error(`[${event}]`, err);
          ack(
            err instanceof GameError
              ? { ok: false, error: err.message, errorCode: err.code }
              : { ok: false, error: 'Something went wrong. Please try again.' },
          );
        }
      });

    const watch = (game) => socket.join(gameRoom(game.id));
    const asPlayer = (game, player) => {
      watch(game);
      socket.join(playerRoom(game.id, player.id));
    };

    handle('game:create', () => {
      const game = store.createGame();
      return { gameId: game.id };
    });

    // One admin login unlocks admin mode for every game.
    handle('admin:login', ({ username, password }) => ({ adminKey: auth.login(clientId, username, password) }));

    handle('admin:logout', ({ adminKey }) => {
      auth.logout(adminKey);
      return {};
    });

    handle('admin:games', ({ adminKey }) => {
      auth.requireSession(adminKey);
      return { games: store.listGames() };
    });

    handle('game:watch', ({ gameId }) => {
      const game = store.getGame(gameId);
      watch(game);
      return { state: store.publicState(game) };
    });

    handle('admin:watch', ({ gameId, adminKey }) => {
      auth.requireSession(adminKey);
      const game = store.getGame(gameId);
      watch(game);
      socket.join(adminRoom(game.id));
      return { state: store.publicState(game, { admin: true }) };
    });

    handle('game:start', ({ gameId }) => {
      const game = store.startGame(gameId);
      broadcast(game);
      return {};
    });

    handle('admin:kick', ({ gameId, adminKey, playerId }) => {
      auth.requireSession(adminKey);
      const { game, player } = store.kickPlayer(gameId, playerId);
      io.to(playerRoom(game.id, player.id)).emit('kicked');
      broadcast(game);
      return {};
    });

    handle('admin:undo', ({ gameId, adminKey }) => {
      auth.requireSession(adminKey);
      const { game, hunter, target } = store.undoLastCapture(gameId);
      broadcast(game);
      sendMe(game, hunter);
      sendMe(game, target);
      io.to(gameRoom(game.id)).emit('undo', { hunter: brief(hunter), target: brief(target) });
      return {};
    });

    handle('admin:setEndsAt', ({ gameId, adminKey, endsAt }) => {
      auth.requireSession(adminKey);
      const game = store.setEndsAt(gameId, endsAt);
      broadcast(game);
      return {};
    });

    handle('admin:end', ({ gameId, adminKey }) => {
      auth.requireSession(adminKey);
      const game = store.endGame(gameId);
      broadcast(game);
      return {};
    });

    handle('player:join', ({ gameId, name }) => {
      const { game, player } = store.joinGame(gameId, name);
      asPlayer(game, player);
      broadcast(game);
      io.to(gameRoom(game.id)).emit('joined', brief(player));
      return { token: player.token, me: store.playerState(player), state: store.publicState(game) };
    });

    handle('player:rejoin', ({ gameId, name }) => {
      const { game, player } = store.rejoinGame(gameId, name);
      asPlayer(game, player);
      broadcast(game);
      return { token: player.token, me: store.playerState(player), state: store.publicState(game) };
    });

    handle('player:update', ({ gameId, token, name, avatar }) => {
      const { game, player } = store.updateProfile(gameId, token, { name, avatar });
      broadcast(game);
      sendMe(game, player);
      return { me: store.playerState(player) };
    });

    handle('player:resume', ({ gameId, token }) => {
      const game = store.getGame(gameId);
      const player = store.findPlayerByToken(game, token);
      asPlayer(game, player);
      return { me: store.playerState(player), state: store.publicState(game) };
    });

    handle('player:capture', ({ gameId, token, code }) => {
      const { game, hunter, target, stolen } = store.capture(gameId, token, String(code ?? ''));
      broadcast(game);
      sendMe(game, hunter);
      sendMe(game, target);
      io.to(gameRoom(game.id)).emit('capture', { hunter: brief(hunter), target: brief(target) });
      return { count: stolen.length, target: brief(target), me: store.playerState(hunter) };
    });
  });
}
