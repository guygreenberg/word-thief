import { randomBytes, randomInt } from 'node:crypto';
import { ALL_WORDS } from './words.js';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 300;
export const MAX_NAME_LENGTH = 20;
const MAX_EVENTS = 50;
const GAME_TTL_MS = 12 * 60 * 60 * 1000;

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const AVATARS = [
  '🦊', '🐸', '🐼', '🐨', '🦁', '🐯', '🐵', '🐙', '🦄', '🐧', '🐢', '🦖', '🐳', '🦉', '🐝', '🦩',
  '🐷', '🐮', '🐰', '🐹', '🦝', '🦦', '🦥', '🐲', '👽', '🤖', '👻', '🎃', '🦀', '🐞', '🦔', '🐊',
];
const COLORS = ['#FF5FA2', '#FFD23F', '#3DDC97', '#4CC9F0', '#B388FF', '#FF8C42', '#7AE582', '#FF6B6B'];

export class GameError extends Error {}

const randomCode = (length) =>
  Array.from({ length }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
const secret = () => randomBytes(16).toString('base64url');
const pick = (list) => list[randomInt(list.length)];

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function normalizeName(raw) {
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!name) throw new GameError('Please enter your name');
  if ([...name].length > MAX_NAME_LENGTH) {
    throw new GameError(`Name must be at most ${MAX_NAME_LENGTH} characters`);
  }
  return name;
}

export class GameStore {
  constructor({ now = () => Date.now() } = {}) {
    this.games = new Map();
    this.now = now;
  }

  createGame() {
    let id;
    do id = randomCode(5); while (this.games.has(id));
    const game = {
      id,
      adminKey: secret(),
      status: 'lobby',
      createdAt: this.now(),
      startedAt: null,
      endedAt: null,
      endedByAdmin: false,
      winnerId: null,
      players: new Map(),
      wordPool: shuffle(ALL_WORDS),
      captures: [],
      events: [],
      lastActivity: this.now(),
    };
    this.games.set(id, game);
    return game;
  }

  getGame(gameId) {
    const game = this.games.get(String(gameId ?? '').toUpperCase());
    if (!game) throw new GameError('Game not found. Check the code and try again.');
    return game;
  }

  requireAdmin(gameId, adminKey) {
    const game = this.getGame(gameId);
    if (!adminKey || adminKey !== game.adminKey) throw new GameError('Not authorized to manage this game');
    return game;
  }

  findPlayerByToken(game, token) {
    for (const player of game.players.values()) if (token && player.token === token) return player;
    throw new GameError("You're not a player in this game");
  }

  joinGame(gameId, rawName) {
    const game = this.getGame(gameId);
    if (game.status !== 'lobby') throw new GameError('This game has already started. Ask the host for a new one!');
    if (game.players.size >= MAX_PLAYERS) throw new GameError(`This game is full (${MAX_PLAYERS} players)`);
    const name = normalizeName(rawName);
    const taken = [...game.players.values()].some((p) => p.name.toLowerCase() === name.toLowerCase());
    if (taken) throw new GameError(`"${name}" is already taken. Try another name!`);

    let id;
    do id = randomCode(8); while (game.players.has(id));
    const player = {
      id,
      token: secret(),
      code: secret(),
      name,
      avatar: pick(AVATARS),
      color: pick(COLORS),
      words: [game.wordPool.pop()],
      status: 'active',
      joinedAt: this.now(),
      capturedById: null,
      eliminatedAt: null,
    };
    game.players.set(id, player);
    this.#log(game, { type: 'join', player: id });
    return { game, player };
  }

  kickPlayer(gameId, adminKey, playerId) {
    const game = this.requireAdmin(gameId, adminKey);
    if (game.status !== 'lobby') throw new GameError('Players can only be removed before the game starts');
    const player = game.players.get(playerId);
    if (!player) throw new GameError('Player not found');
    game.wordPool.push(...player.words);
    game.players.delete(playerId);
    this.#touch(game);
    return { game, player };
  }

  startGame(gameId, adminKey) {
    const game = this.requireAdmin(gameId, adminKey);
    if (game.status !== 'lobby') throw new GameError('The game has already started');
    if (game.players.size < MIN_PLAYERS) throw new GameError(`Need at least ${MIN_PLAYERS} players to start`);
    game.status = 'active';
    game.startedAt = this.now();
    this.#log(game, { type: 'start' });
    return game;
  }

  capture(gameId, hunterToken, targetCode) {
    const game = this.getGame(gameId);
    if (game.status === 'lobby') throw new GameError("The game hasn't started yet. Hold your horses! 🐴");
    if (game.status === 'finished') throw new GameError('The game is over!');
    const hunter = this.findPlayerByToken(game, hunterToken);
    if (hunter.status !== 'active') throw new GameError("You're out of the game. No more stealing! 👻");
    const target = [...game.players.values()].find((p) => p.code === targetCode);
    if (!target) throw new GameError("That QR code isn't a player in this game");
    if (target.id === hunter.id) throw new GameError("That's your own code, silly! 🙃");
    if (target.status !== 'active') throw new GameError(`${target.name} is already out of the game`);

    const stolen = target.words;
    hunter.words = [...hunter.words, ...stolen];
    target.words = [];
    target.status = 'out';
    target.capturedById = hunter.id;
    target.eliminatedAt = this.now();
    game.captures.push({ hunterId: hunter.id, targetId: target.id, words: stolen });
    this.#log(game, { type: 'capture', player: hunter.id, target: target.id, count: stolen.length });

    const remaining = [...game.players.values()].filter((p) => p.status === 'active');
    if (remaining.length === 1) this.#finish(game, remaining[0].id);
    return { game, hunter, target, stolen };
  }

  undoLastCapture(gameId, adminKey) {
    const game = this.requireAdmin(gameId, adminKey);
    if (game.endedByAdmin) throw new GameError('The game was ended by the host and cannot be undone');
    const last = game.captures.pop();
    if (!last) throw new GameError('Nothing to undo');
    const hunter = game.players.get(last.hunterId);
    const target = game.players.get(last.targetId);
    // Captures are undone strictly in LIFO order, so the stolen words are always the hunter's last ones.
    hunter.words = hunter.words.slice(0, hunter.words.length - last.words.length);
    target.words = last.words;
    target.status = 'active';
    target.capturedById = null;
    target.eliminatedAt = null;
    if (game.status === 'finished') {
      game.status = 'active';
      game.winnerId = null;
      game.endedAt = null;
    }
    this.#log(game, { type: 'undo', player: hunter.id, target: target.id, count: last.words.length });
    return { game, hunter, target };
  }

  endGame(gameId, adminKey) {
    const game = this.requireAdmin(gameId, adminKey);
    if (game.status === 'finished') throw new GameError('The game is already over');
    const ranked = [...game.players.values()].sort((a, b) => b.words.length - a.words.length);
    const isTie = ranked.length > 1 && ranked[0].words.length === ranked[1].words.length;
    game.endedByAdmin = true;
    this.#finish(game, ranked.length && !isTie ? ranked[0].id : null);
    return game;
  }

  cleanup() {
    const cutoff = this.now() - GAME_TTL_MS;
    for (const [id, game] of this.games) if (game.lastActivity < cutoff) this.games.delete(id);
  }

  publicState(game) {
    const players = [...game.players.values()];
    const nameOf = (id) => game.players.get(id)?.name ?? null;
    const winner = game.winnerId ? game.players.get(game.winnerId) : null;
    const finished = game.status === 'finished';
    return {
      id: game.id,
      status: game.status,
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      createdAt: game.createdAt,
      startedAt: game.startedAt,
      endedAt: game.endedAt,
      canUndo: game.captures.length > 0 && !game.endedByAdmin,
      players: players.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        color: p.color,
        status: p.status,
        wordCount: p.words.length,
        capturedBy: nameOf(p.capturedById),
        joinedAt: p.joinedAt,
        eliminatedAt: p.eliminatedAt,
        // Words stay secret until the game is over.
        words: finished ? p.words : undefined,
      })),
      events: game.events.slice(-20).map((e) => ({ ...e, player: nameOf(e.player), target: nameOf(e.target) })),
      winner: winner ? { id: winner.id, name: winner.name, avatar: winner.avatar, color: winner.color } : null,
    };
  }

  playerState(player) {
    return {
      id: player.id,
      code: player.code,
      name: player.name,
      avatar: player.avatar,
      color: player.color,
      words: player.words,
      status: player.status,
      capturedById: player.capturedById,
    };
  }

  #finish(game, winnerId) {
    game.status = 'finished';
    game.endedAt = this.now();
    game.winnerId = winnerId;
    this.#log(game, { type: 'finish', player: winnerId });
  }

  #log(game, event) {
    game.events.push({ ...event, at: this.now() });
    if (game.events.length > MAX_EVENTS) game.events.shift();
    this.#touch(game);
  }

  #touch(game) {
    game.lastActivity = this.now();
  }
}
