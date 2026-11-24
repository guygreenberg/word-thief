import { randomBytes, randomInt } from 'node:crypto';
import { ALL_WORDS } from './words.js';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 300;
export const MAX_NAME_LENGTH = 20;
export const CAPTURE_CODE_LENGTH = 6;
// Short typed capture codes are guessable in theory, so wrong guesses are rate limited per player.
export const MAX_WRONG_CODES_PER_MINUTE = 8;
const MAX_EVENTS = 50;
// Games are kept this long after they end (or after their end time), then deleted.
export const GAME_TTL_MS = 12 * 60 * 60 * 1000;
export const DEFAULT_GAME_DURATION_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_GAME_DURATION_MS = 365 * 24 * 60 * 60 * 1000;
// Changed games are written to storage in batches, so a burst of steals becomes one write per game.
const SAVE_DELAY_MS = 200;
const SAVE_RETRY_MS = 5000;

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const AVATARS = [
  '🦊', '🐸', '🐼', '🐨', '🦁', '🐯', '🐵', '🐙', '🦄', '🐧', '🐢', '🦖', '🐳', '🦉', '🐝', '🦩',
  '🐷', '🐮', '🐰', '🐹', '🦝', '🦦', '🦥', '🐲', '👽', '🤖', '👻', '🎃', '🦀', '🐞', '🦔', '🐊',
];
const COLORS = ['#FF5FA2', '#FFD23F', '#3DDC97', '#4CC9F0', '#B388FF', '#FF8C42', '#7AE582', '#FF6B6B'];

export class GameError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

const randomCode = (length) =>
  Array.from({ length }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
const secret = () => randomBytes(16).toString('base64url');
const pick = (list) => list[randomInt(list.length)];
const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();

/** Capture codes are typed by hand, so accept any case, spaces and dashes. */
export const normalizeCode = (raw) => String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

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
  /** `persistence` (optional) saves games so they survive restarts; without it games live only in memory. */
  constructor({ now = () => Date.now(), persistence = null } = {}) {
    this.games = new Map();
    this.now = now;
    this.persistence = persistence;
    this.dirty = new Set();
    this.saveTimer = null;
  }

  /** Reloads saved games on startup, dropping ones that expired while the server was down. */
  restore() {
    if (!this.persistence) return 0;
    for (const data of this.persistence.loadAll()) {
      const game = deserializeGame(data);
      if (isExpired(game, this.now())) {
        this.persistence.remove(game.id);
        continue;
      }
      this.games.set(game.id, game);
    }
    return this.games.size;
  }

  /** Writes every changed game now (also called on shutdown so no change is lost). */
  flush() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (!this.persistence) return;
    for (const id of this.dirty) {
      try {
        const game = this.games.get(id);
        if (game) this.persistence.save(id, serializeGame(game));
        else this.persistence.remove(id);
        this.dirty.delete(id);
      } catch (err) {
        // A failed write must never crash the game: keep it dirty and retry shortly.
        console.error(`Could not save game ${id}: ${err.message}`);
      }
    }
    if (this.dirty.size) this.saveTimer = setTimeout(() => this.flush(), SAVE_RETRY_MS);
  }

  /** Summary of every game for the admin games list, newest first. */
  listGames() {
    return [...this.games.values()]
      .map((g) => {
        const players = [...g.players.values()];
        return {
          id: g.id,
          status: g.status,
          createdAt: g.createdAt,
          startedAt: g.startedAt,
          endedAt: g.endedAt,
          lastActivity: g.lastActivity,
          endsAt: g.endsAt,
          playerCount: players.length,
          activeCount: players.filter((p) => p.status === 'active').length,
          winner: g.winnerId ? g.players.get(g.winnerId)?.name ?? null : null,
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  createGame() {
    let id;
    do id = randomCode(5); while (this.games.has(id));
    const game = {
      id,
      status: 'lobby',
      createdAt: this.now(),
      endsAt: this.now() + DEFAULT_GAME_DURATION_MS,
      startedAt: null,
      endedAt: null,
      // True when the game was ended early (by the host or when time ran out); such endings can't be undone.
      endedByAdmin: false,
      winnerId: null,
      players: new Map(),
      wordPool: shuffle(ALL_WORDS),
      captures: [],
      events: [],
      lastActivity: this.now(),
    };
    this.games.set(id, game);
    this.#touch(game);
    return game;
  }

  getGame(gameId) {
    const game = this.games.get(String(gameId ?? '').toUpperCase());
    if (!game) throw new GameError('Game not found. Check the code and try again.');
    return game;
  }

  findPlayerByToken(game, token) {
    for (const player of game.players.values()) if (token && player.token === token) return player;
    throw new GameError("You're not a player in this game");
  }

  findPlayerByName(game, name) {
    return [...game.players.values()].find((p) => sameName(p.name, name));
  }

  joinGame(gameId, rawName) {
    const game = this.getGame(gameId);
    const name = normalizeName(rawName);
    if (this.findPlayerByName(game, name)) {
      throw new GameError(`"${name}" is already in this game. Is that you?`, 'NAME_TAKEN');
    }
    if (game.status !== 'lobby') {
      throw new GameError('This game has already started. If you were playing, type your original name to rejoin.');
    }
    if (game.players.size >= MAX_PLAYERS) throw new GameError(`This game is full (${MAX_PLAYERS} players)`);

    let id;
    do id = randomCode(8); while (game.players.has(id));
    const codes = new Set([...game.players.values()].map((p) => p.code));
    let code;
    do code = randomCode(CAPTURE_CODE_LENGTH); while (codes.has(code));
    const player = {
      id,
      token: secret(),
      code,
      word: null,
      // Words stolen over the whole game; kept when caught, so final standings credit every steal.
      stolenTotal: 0,
      wrongCodes: [],
      name,
      avatar: pick(AVATARS),
      color: pick(COLORS),
      words: [game.wordPool.pop()],
      status: 'active',
      joinedAt: this.now(),
      capturedById: null,
      eliminatedAt: null,
    };
    // The dealt word is the only one a player ever sees; stolen words just add to their count.
    player.word = player.words[0];
    game.players.set(id, player);
    this.#log(game, { type: 'join', player: id });
    return { game, player };
  }

  /** Lets a player who lost their session (closed browser, new phone) continue by typing their original name. */
  rejoinGame(gameId, rawName) {
    const game = this.getGame(gameId);
    const name = normalizeName(rawName);
    const player = this.findPlayerByName(game, name);
    if (!player) throw new GameError(`There's no player called "${name}" in this game`);
    this.#log(game, { type: 'rejoin', player: player.id });
    return { game, player };
  }

  /** Lets a player change their name and/or avatar. Both are validated before anything changes. */
  updateProfile(gameId, token, { name: rawName, avatar } = {}) {
    const game = this.getGame(gameId);
    const player = this.findPlayerByToken(game, token);
    const name = rawName === undefined ? player.name : normalizeName(rawName);
    const other = this.findPlayerByName(game, name);
    if (other && other.id !== player.id) throw new GameError(`"${name}" is already taken. Try another name!`);
    if (avatar !== undefined && !AVATARS.includes(avatar)) throw new GameError('Please pick one of the avatars');

    if (avatar !== undefined && avatar !== player.avatar) {
      player.avatar = avatar;
      this.#touch(game);
    }
    if (name !== player.name) {
      const from = player.name;
      player.name = name;
      this.#log(game, { type: 'rename', player: player.id, from });
    }
    return { game, player };
  }

  /**
   * Host removes a player at any stage. In the lobby their word goes back to the pool; once the game has
   * started their words leave with them. Undo history is cleared because earlier steals may involve them.
   */
  removePlayer(gameId, playerId) {
    const game = this.getGame(gameId);
    const player = game.players.get(playerId);
    if (!player) throw new GameError('Player not found');
    if (game.status === 'lobby') game.wordPool.push(...player.words);
    game.players.delete(playerId);
    // Keep the name so "caught by …" labels and the event feed still read well.
    game.formerNames = { ...game.formerNames, [player.id]: player.name };
    if (game.status !== 'lobby') game.captures = [];
    this.#log(game, { type: 'remove', target: player.id });

    if (game.status === 'active') {
      const remaining = [...game.players.values()].filter((p) => p.status === 'active');
      if (remaining.length <= 1) this.#finish(game, remaining[0]?.id ?? null, 'removed');
    }
    return { game, player };
  }

  deleteGame(gameId) {
    const game = this.getGame(gameId);
    this.games.delete(game.id);
    this.#markDirty(game.id);
    return game;
  }

  /** Host reopens an ended game. Pushes the end time out if it has already passed. */
  resumeGame(gameId) {
    const game = this.getGame(gameId);
    if (game.status !== 'finished') throw new GameError("The game hasn't ended");
    const stillIn = [...game.players.values()].filter((p) => p.status === 'active').length;
    if (game.startedAt && stillIn < 2) {
      throw new GameError('Only one player is still in, so there is nothing to resume. Undo a steal instead.');
    }
    game.status = game.startedAt ? 'active' : 'lobby';
    game.endedAt = null;
    game.winnerId = null;
    game.endedByAdmin = false;
    if (game.endsAt <= this.now()) game.endsAt = this.now() + DEFAULT_GAME_DURATION_MS;
    this.#log(game, { type: 'resume' });
    return game;
  }

  /** Started from the shared game screen, so no admin login is needed. */
  startGame(gameId) {
    const game = this.getGame(gameId);
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
    const cutoff = this.now() - 60_000;
    hunter.wrongCodes = hunter.wrongCodes.filter((t) => t > cutoff);
    if (hunter.wrongCodes.length >= MAX_WRONG_CODES_PER_MINUTE) {
      throw new GameError('Too many wrong codes. Wait a minute and try again ⏳');
    }
    const code = normalizeCode(targetCode);
    const target = code && [...game.players.values()].find((p) => p.code === code);
    if (!target) {
      hunter.wrongCodes.push(this.now());
      throw new GameError("That code doesn't match any player in this game");
    }
    if (target.id === hunter.id) throw new GameError("That's your own code, silly! 🙃");
    if (target.status !== 'active') throw new GameError(`${target.name} is already out of the game`);

    const stolen = target.words;
    hunter.words = [...hunter.words, ...stolen];
    hunter.stolenTotal += stolen.length;
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

  undoLastCapture(gameId) {
    const game = this.getGame(gameId);
    if (game.endedByAdmin) throw new GameError('The game was ended early (by the host or time) and cannot be undone');
    const last = game.captures.pop();
    if (!last) throw new GameError('Nothing to undo');
    const hunter = game.players.get(last.hunterId);
    const target = game.players.get(last.targetId);
    // Captures are undone strictly in LIFO order, so the stolen words are always the hunter's last ones.
    hunter.words = hunter.words.slice(0, hunter.words.length - last.words.length);
    hunter.stolenTotal -= last.words.length;
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

  endGame(gameId) {
    const game = this.getGame(gameId);
    if (game.status === 'finished') throw new GameError('The game is already over');
    this.#endEarly(game, 'host');
    return game;
  }

  /** Host changes when the game ends. `endsAt` is a timestamp in milliseconds. */
  setEndsAt(gameId, endsAt) {
    const game = this.getGame(gameId);
    if (game.status === 'finished') throw new GameError('The game is already over');
    const when = Number(endsAt);
    if (!Number.isFinite(when) || when <= this.now()) throw new GameError('Pick an end time in the future');
    if (when > this.now() + MAX_GAME_DURATION_MS) throw new GameError('A game can last at most one year');
    game.endsAt = when;
    this.#log(game, { type: 'deadline', endsAt: when });
    return game;
  }

  /** Ends every game whose end time has passed. Returns those games so they can be broadcast. */
  expireDueGames() {
    const due = [...this.games.values()].filter((g) => g.status !== 'finished' && g.endsAt <= this.now());
    for (const game of due) this.#endEarly(game, 'time');
    return due;
  }

  cleanup() {
    for (const [id, game] of this.games) {
      if (!isExpired(game, this.now())) continue;
      this.games.delete(id);
      this.#markDirty(id);
    }
  }

  /**
   * Shared game state. Word counts (and steal sizes) are only included for the host (`admin`) or once
   * the game is over, so players and the public board can't tell who is leading.
   */
  publicState(game, { admin = false } = {}) {
    const players = [...game.players.values()];
    const nameOf = (id) => game.players.get(id)?.name ?? game.formerNames?.[id] ?? null;
    const winner = game.winnerId ? game.players.get(game.winnerId) : null;
    const finished = game.status === 'finished';
    const showCounts = admin || finished;
    return {
      id: game.id,
      status: game.status,
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      createdAt: game.createdAt,
      startedAt: game.startedAt,
      endedAt: game.endedAt,
      endsAt: game.endsAt,
      canUndo: game.captures.length > 0 && !game.endedByAdmin,
      players: players.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        color: p.color,
        status: p.status,
        wordCount: showCounts ? p.words.length : undefined,
        stolenCount: showCounts ? p.stolenTotal : undefined,
        capturedBy: nameOf(p.capturedById),
        joinedAt: p.joinedAt,
        eliminatedAt: p.eliminatedAt,
        // Words stay secret until the game is over.
        words: finished ? p.words : undefined,
      })),
      events: game.events.slice(-20).map((e) => ({
        ...e,
        player: nameOf(e.player),
        target: nameOf(e.target),
        count: showCounts ? e.count : undefined,
      })),
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
      word: player.word,
      wordCount: player.words.length,
      status: player.status,
      capturedById: player.capturedById,
    };
  }

  #finish(game, winnerId, reason = 'captured') {
    game.status = 'finished';
    game.endedAt = this.now();
    game.winnerId = winnerId;
    this.#log(game, { type: 'finish', player: winnerId, reason });
  }

  /** Ends before one player holds every word: whoever holds the most words wins, a tie has no winner. */
  #endEarly(game, reason) {
    const ranked = [...game.players.values()].sort((a, b) => b.words.length - a.words.length);
    const isTie = ranked.length > 1 && ranked[0].words.length === ranked[1].words.length;
    game.endedByAdmin = true;
    this.#finish(game, ranked.length && !isTie ? ranked[0].id : null, reason);
  }

  #log(game, event) {
    game.events.push({ ...event, at: this.now() });
    if (game.events.length > MAX_EVENTS) game.events.shift();
    this.#touch(game);
  }

  #touch(game) {
    game.lastActivity = this.now();
    this.#markDirty(game.id);
  }

  #markDirty(id) {
    if (!this.persistence) return;
    this.dirty.add(id);
    this.saveTimer ??= setTimeout(() => this.flush(), SAVE_DELAY_MS);
  }
}

/** A game can be deleted 12 hours after it finished, or 12 hours after its end time if it never finished. */
function isExpired(game, now) {
  const endedAt = game.status === 'finished' ? game.lastActivity : game.endsAt;
  return endedAt + GAME_TTL_MS < now;
}

// Rate-limit timestamps are deliberately not saved: they only matter for the next minute.
export function serializeGame(game) {
  return {
    ...game,
    players: [...game.players.values()].map(({ wrongCodes, ...player }) => player),
  };
}

export function deserializeGame(data) {
  return {
    // Games saved before end times existed get the default duration.
    endsAt: data.createdAt + DEFAULT_GAME_DURATION_MS,
    ...data,
    players: new Map(
      data.players.map((p) => [
        p.id,
        {
          // Games saved before stolen totals existed: rebuild them from the steal history.
          stolenTotal: data.captures.filter((c) => c.hunterId === p.id).reduce((n, c) => n + c.words.length, 0),
          ...p,
          wrongCodes: [],
        },
      ]),
    ),
  };
}
