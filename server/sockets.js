import { GameError } from './game.js';

const gameRoom = (gameId) => `game:${gameId}`;
const playerRoom = (gameId, playerId) => `player:${gameId}:${playerId}`;
// Bursts of changes (e.g. many steals at once in a 300-player game) are coalesced into one broadcast.
const BROADCAST_INTERVAL_MS = 150;

export function registerSocketHandlers(io, store) {
  const pending = new Map();
  const broadcast = (game) => {
    if (pending.has(game.id)) return;
    pending.set(
      game.id,
      setTimeout(() => {
        pending.delete(game.id);
        io.to(gameRoom(game.id)).emit('state', store.publicState(game));
      }, BROADCAST_INTERVAL_MS),
    );
  };
  const sendMe = (game, player) => io.to(playerRoom(game.id, player.id)).emit('me', store.playerState(player));
  const brief = (p) => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color });

  io.on('connection', (socket) => {
    const handle = (event, fn) =>
      socket.on(event, (payload, ack) => {
        if (typeof ack !== 'function') return;
        try {
          ack({ ok: true, ...fn(payload && typeof payload === 'object' ? payload : {}) });
        } catch (err) {
          if (!(err instanceof GameError)) console.error(`[${event}]`, err);
          ack({ ok: false, error: err instanceof GameError ? err.message : 'Something went wrong. Please try again.' });
        }
      });

    const watch = (game) => socket.join(gameRoom(game.id));
    const asPlayer = (game, player) => {
      watch(game);
      socket.join(playerRoom(game.id, player.id));
    };

    handle('game:create', () => {
      const game = store.createGame();
      return { gameId: game.id, adminKey: game.adminKey };
    });

    handle('game:watch', ({ gameId }) => {
      const game = store.getGame(gameId);
      watch(game);
      return { state: store.publicState(game) };
    });

    handle('admin:watch', ({ gameId, adminKey }) => {
      const game = store.requireAdmin(gameId, adminKey);
      watch(game);
      return { state: store.publicState(game) };
    });

    handle('admin:start', ({ gameId, adminKey }) => {
      const game = store.startGame(gameId, adminKey);
      broadcast(game);
      return {};
    });

    handle('admin:kick', ({ gameId, adminKey, playerId }) => {
      const { game, player } = store.kickPlayer(gameId, adminKey, playerId);
      io.to(playerRoom(game.id, player.id)).emit('kicked');
      broadcast(game);
      return {};
    });

    handle('admin:undo', ({ gameId, adminKey }) => {
      const { game, hunter, target } = store.undoLastCapture(gameId, adminKey);
      broadcast(game);
      sendMe(game, hunter);
      sendMe(game, target);
      io.to(gameRoom(game.id)).emit('undo', { hunter: brief(hunter), target: brief(target) });
      return {};
    });

    handle('admin:end', ({ gameId, adminKey }) => {
      const game = store.endGame(gameId, adminKey);
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
      io.to(gameRoom(game.id)).emit('capture', { hunter: brief(hunter), target: brief(target), count: stolen.length });
      return { stolen, target: brief(target), me: store.playerState(hunter) };
    });
  });
}
