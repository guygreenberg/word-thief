import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AVATARS, CAPTURE_CODE_LENGTH, DEFAULT_GAME_DURATION_MS, GAME_TTL_MS, GameError, GameStore, MAX_PLAYERS, MAX_WRONG_CODES_PER_MINUTE } from './game.js';
import { AVATAR_CHOICES } from '../client/src/constants.js';
import { ALL_WORDS } from './words.js';

function setup(names = ['Alice', 'Bob', 'Carol']) {
  const store = new GameStore();
  const game = store.createGame();
  const players = Object.fromEntries(names.map((n) => [n, store.joinGame(game.id, n).player]));
  return { store, game, players };
}

describe('word list', () => {
  it('has enough unique words for a full game', () => {
    assert.equal(new Set(ALL_WORDS).size, ALL_WORDS.length);
    assert.ok(ALL_WORDS.length >= MAX_PLAYERS);
  });
});

describe('joining', () => {
  it('deals each player one unique word', () => {
    const { players } = setup(['A', 'B', 'C', 'D', 'E']);
    const words = Object.values(players).flatMap((p) => p.words);
    assert.equal(words.length, 5);
    assert.equal(new Set(words).size, 5);
  });

  it('rejects duplicate (case-insensitive) and empty names', () => {
    const { store, game } = setup();
    assert.throws(() => store.joinGame(game.id, '  alice '), (e) => e instanceof GameError && e.code === 'NAME_TAKEN');
    assert.throws(() => store.joinGame(game.id, '   '), GameError);
  });

  it('rejects joining after the game starts', () => {
    const { store, game } = setup();
    store.startGame(game.id);
    assert.throws(() => store.joinGame(game.id, 'Late'), /already started/);
  });
});

describe('starting', () => {
  it('needs at least 3 players (but no admin login) and can only start once', () => {
    const { store, game } = setup(['Alice', 'Bob']);
    assert.throws(() => store.startGame(game.id), /at least 3/);
    store.joinGame(game.id, 'Carol');
    assert.equal(store.startGame(game.id).status, 'active');
    assert.throws(() => store.startGame(game.id), /already started/);
  });
});

describe('capturing', () => {
  it('moves all words to the hunter, eliminates the target, and ends with one winner', () => {
    const { store, game, players } = setup();
    const { Alice, Bob, Carol } = players;
    const allWords = [...Alice.words, ...Bob.words, ...Carol.words];
    store.startGame(game.id);

    store.capture(game.id, Alice.token, Bob.code);
    assert.equal(Alice.words.length, 2);
    assert.equal(Bob.status, 'out');
    assert.deepEqual(Bob.words, []);
    assert.equal(game.status, 'active');

    store.capture(game.id, Carol.token, Alice.code);
    assert.equal(Carol.words.length, 3);
    assert.deepEqual([...Carol.words].sort(), [...allWords].sort());
    assert.equal(game.status, 'finished');
    assert.equal(game.winnerId, Carol.id);
  });

  it('rejects invalid captures', () => {
    const { store, game, players } = setup();
    const { Alice, Bob, Carol } = players;
    assert.throws(() => store.capture(game.id, Alice.token, Bob.code), /hasn't started/);
    store.startGame(game.id);
    assert.throws(() => store.capture(game.id, Alice.token, Alice.code), /your own code/);
    assert.throws(() => store.capture(game.id, Alice.token, 'nope'), /doesn't match/);
    assert.throws(() => store.capture(game.id, 'bad-token', Bob.code), /not a player/);
    // Player ids are public on the board, so they must not work as capture codes.
    assert.throws(() => store.capture(game.id, Alice.token, Bob.id), /doesn't match/);
    store.capture(game.id, Alice.token, Bob.code);
    assert.throws(() => store.capture(game.id, Carol.token, Bob.code), /already out/);
    assert.throws(() => store.capture(game.id, Bob.token, Carol.code), /You're out/);
  });
});

describe('undo', () => {
  it('reverts captures in LIFO order, including a finishing capture', () => {
    const { store, game, players } = setup();
    const { Alice, Bob, Carol } = players;
    const [a, b, c] = [Alice.words[0], Bob.words[0], Carol.words[0]];
    store.startGame(game.id);
    store.capture(game.id, Alice.token, Bob.code);
    store.capture(game.id, Carol.token, Alice.code);

    store.undoLastCapture(game.id);
    assert.equal(game.status, 'active');
    assert.equal(game.winnerId, null);
    assert.deepEqual(Alice.words, [a, b]);
    assert.deepEqual(Carol.words, [c]);
    assert.equal(Alice.status, 'active');

    store.undoLastCapture(game.id);
    assert.deepEqual(Alice.words, [a]);
    assert.deepEqual(Bob.words, [b]);
    assert.equal(Bob.status, 'active');
    assert.throws(() => store.undoLastCapture(game.id), /Nothing to undo/);
  });
});

describe('ending early', () => {
  it('declares the player with the most words, or no winner on a tie', () => {
    const { store, game, players } = setup(['A', 'B', 'C', 'D']);
    store.startGame(game.id);
    store.capture(game.id, players.A.token, players.B.code);
    store.endGame(game.id);
    assert.equal(game.winnerId, players.A.id);
    assert.throws(() => store.undoLastCapture(game.id), /ended early/);

    const tie = setup();
    tie.store.startGame(tie.game.id);
    tie.store.endGame(tie.game.id);
    assert.equal(tie.game.winnerId, null);
  });
});

describe('public state', () => {
  it('hides secrets, words and word counts from players until the game is finished', () => {
    const { store, game, players } = setup();
    store.startGame(game.id);
    store.capture(game.id, players.Alice.token, players.Bob.code);
    const pub = store.publicState(game);
    const json = JSON.stringify(pub);
    for (const p of Object.values(players)) {
      assert.ok(!json.includes(p.token));
      assert.ok(!json.includes(p.code));
      assert.ok(!json.includes(`"${p.words[0] ?? p.word}"`));
    }
    assert.ok(pub.players.every((p) => p.wordCount === undefined));
    assert.equal(pub.events.find((e) => e.type === 'capture').count, undefined);

    const admin = store.publicState(game, { admin: true });
    assert.equal(admin.players.find((p) => p.id === players.Alice.id).wordCount, 2);
    assert.equal(admin.events.find((e) => e.type === 'capture').count, 1);

    store.capture(game.id, players.Alice.token, players.Carol.code);
    const winner = store.publicState(game).players.find((p) => p.id === players.Alice.id);
    assert.equal(winner.wordCount, 3);
    assert.equal(winner.words.length, 3);
  });
});

describe('player state', () => {
  it('keeps showing only the original word after stealing, plus the total count', () => {
    const { store, game, players } = setup();
    const original = players.Alice.words[0];
    store.startGame(game.id);
    store.capture(game.id, players.Alice.token, players.Bob.code);
    const me = store.playerState(players.Alice);
    assert.equal(me.word, original);
    assert.equal(me.wordCount, 2);
    assert.equal(me.words, undefined);
    assert.ok(!JSON.stringify(me).includes(players.Bob.word));
  });
});

describe('short capture codes', () => {
  it('gives each player a unique short code that works in any case, with spaces or dashes', () => {
    const { store, game, players } = setup(['A', 'B', 'C', 'D', 'E']);
    const codes = Object.values(players).map((p) => p.code);
    assert.equal(new Set(codes).size, codes.length);
    for (const code of codes) assert.match(code, new RegExp(`^[A-Z0-9]{${CAPTURE_CODE_LENGTH}}$`));

    store.startGame(game.id);
    const typed = ` ${players.B.code.slice(0, 3).toLowerCase()}-${players.B.code.slice(3)} `;
    store.capture(game.id, players.A.token, typed);
    assert.equal(players.B.status, 'out');
  });

  it('blocks a player after too many wrong codes, even if the next code is right', () => {
    let now = 1_000_000;
    const store = new GameStore({ now: () => now });
    const game = store.createGame();
    const [a, b] = ['A', 'B', 'C'].map((n) => store.joinGame(game.id, n).player);
    store.startGame(game.id);
    for (let i = 0; i < MAX_WRONG_CODES_PER_MINUTE; i++) {
      assert.throws(() => store.capture(game.id, a.token, 'ZZZZZZ'), /doesn't match/);
    }
    assert.throws(() => store.capture(game.id, a.token, b.code), /Too many wrong codes/);
    now += 61_000;
    store.capture(game.id, a.token, b.code);
    assert.equal(b.status, 'out');
  });
});

describe('rejoining', () => {
  it('returns the same player (and session token) for their original name, also after the game started', () => {
    const { store, game, players } = setup();
    store.startGame(game.id);
    store.capture(game.id, players.Alice.token, players.Bob.code);
    const { player } = store.rejoinGame(game.id, '  ALICE ');
    assert.equal(player.id, players.Alice.id);
    assert.equal(player.token, players.Alice.token);
    assert.equal(player.words.length, 2);
    assert.equal(game.events.at(-1).type, 'rejoin');
  });

  it('rejects unknown names and still blocks new players after the start', () => {
    const { store, game } = setup();
    store.startGame(game.id);
    assert.throws(() => store.rejoinGame(game.id, 'Zed'), /no player called "Zed"/);
    assert.throws(() => store.joinGame(game.id, 'Zed'), /already started/);
  });
});

describe('renaming', () => {
  it('changes the name, keeps it unique, and lets the player rejoin with the new name', () => {
    const { store, game, players } = setup();
    store.updateProfile(game.id, players.Alice.token, { name: 'Ali' });
    assert.equal(players.Alice.name, 'Ali');
    assert.deepEqual(
      (({ type, from }) => ({ type, from }))(game.events.at(-1)),
      { type: 'rename', from: 'Alice' },
    );
    assert.throws(() => store.updateProfile(game.id, players.Alice.token, { name: 'bob' }), /already taken/);
    assert.throws(() => store.updateProfile(game.id, 'bad-token', { name: 'X' }), /not a player/);
    assert.equal(store.rejoinGame(game.id, 'ali').player.id, players.Alice.id);
    // Renaming to a different casing of your own name is allowed.
    store.updateProfile(game.id, players.Alice.token, { name: 'ALI' });
    assert.equal(players.Alice.name, 'ALI');
  });
});

describe('changing avatar', () => {
  it('accepts only avatars from the list, alone or together with a new name', () => {
    const { store, game, players } = setup();
    const next = AVATARS.find((a) => a !== players.Alice.avatar);
    store.updateProfile(game.id, players.Alice.token, { avatar: next });
    assert.equal(players.Alice.avatar, next);
    assert.notEqual(game.events.at(-1).type, 'rename');

    assert.throws(() => store.updateProfile(game.id, players.Alice.token, { name: 'Ali', avatar: '💩<script>' }), /pick one of the avatars/);
    // Nothing changes when any part is invalid.
    assert.equal(players.Alice.name, 'Alice');

    store.updateProfile(game.id, players.Alice.token, { name: 'Ali', avatar: AVATARS[0] });
    assert.deepEqual([players.Alice.name, players.Alice.avatar], ['Ali', AVATARS[0]]);
  });

  it('offers players exactly the avatars the server accepts', () => {
    assert.deepEqual(AVATAR_CHOICES, AVATARS);
  });
});

describe('final scores', () => {
  it('counts every word a player stole, even if they were caught later', () => {
    const { store, game, players } = setup(['A', 'B', 'C', 'D']);
    store.startGame(game.id);
    store.capture(game.id, players.B.token, players.A.code);
    store.capture(game.id, players.C.token, players.B.code);
    store.endGame(game.id);
    const stolen = Object.fromEntries(store.publicState(game).players.map((p) => [p.name, p.stolenCount]));
    assert.deepEqual(stolen, { A: 0, B: 1, C: 2, D: 0 });
    assert.equal(store.publicState(game, { admin: false }).players[0].stolenCount, 0);
  });

  it('hides stolen counts from players while the game is running', () => {
    const { store, game, players } = setup();
    store.startGame(game.id);
    store.capture(game.id, players.Alice.token, players.Bob.code);
    assert.ok(store.publicState(game).players.every((p) => p.stolenCount === undefined));
    assert.equal(store.publicState(game, { admin: true }).players.find((p) => p.name === 'Alice').stolenCount, 1);
  });
});

describe('game end time', () => {
  it('defaults to two weeks and can be changed by the host to a future time', () => {
    let now = 1_000_000;
    const store = new GameStore({ now: () => now });
    const game = store.createGame();
    assert.equal(game.endsAt, now + DEFAULT_GAME_DURATION_MS);
    store.setEndsAt(game.id, now + 60_000);
    assert.equal(store.publicState(game).endsAt, now + 60_000);
    assert.throws(() => store.setEndsAt(game.id, now - 1), /in the future/);
    assert.throws(() => store.setEndsAt(game.id, 'soon'), /in the future/);
  });

  it('ends the game when time is up: most words wins, and it cannot be undone', () => {
    let now = 1_000_000;
    const store = new GameStore({ now: () => now });
    const game = store.createGame();
    const [a, b] = ['A', 'B', 'C'].map((n) => store.joinGame(game.id, n).player);
    store.startGame(game.id);
    store.capture(game.id, a.token, b.code);
    assert.deepEqual(store.expireDueGames(), []);

    now = game.endsAt;
    assert.deepEqual(store.expireDueGames(), [game]);
    assert.equal(game.status, 'finished');
    assert.equal(game.winnerId, a.id);
    assert.equal(game.events.at(-1).reason, 'time');
    assert.throws(() => store.undoLastCapture(game.id), /ended early/);
    assert.throws(() => store.setEndsAt(game.id, now + 1000), /already over/);
  });

  it('keeps long games around until 12 hours after they end', () => {
    let now = 1_000_000;
    const store = new GameStore({ now: () => now });
    const game = store.createGame();
    now += 3 * 24 * 60 * 60 * 1000; // idle for days, but still before its end time
    store.cleanup();
    assert.ok(store.games.has(game.id));
    now = game.endsAt + GAME_TTL_MS + 1;
    store.cleanup();
    assert.ok(!store.games.has(game.id));
  });
});
