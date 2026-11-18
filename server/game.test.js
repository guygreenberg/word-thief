import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GameError, GameStore, MAX_PLAYERS } from './game.js';
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
    assert.throws(() => store.joinGame(game.id, '  alice '), GameError);
    assert.throws(() => store.joinGame(game.id, '   '), GameError);
  });

  it('rejects joining after the game starts', () => {
    const { store, game } = setup();
    store.startGame(game.id, game.adminKey);
    assert.throws(() => store.joinGame(game.id, 'Late'), /already started/);
  });
});

describe('starting', () => {
  it('requires the admin key and at least 3 players', () => {
    const { store, game } = setup(['Alice', 'Bob']);
    assert.throws(() => store.startGame(game.id, 'wrong'), /Not authorized/);
    assert.throws(() => store.startGame(game.id, game.adminKey), /at least 3/);
    store.joinGame(game.id, 'Carol');
    assert.equal(store.startGame(game.id, game.adminKey).status, 'active');
  });
});

describe('capturing', () => {
  it('moves all words to the hunter, eliminates the target, and ends with one winner', () => {
    const { store, game, players } = setup();
    const { Alice, Bob, Carol } = players;
    const allWords = [...Alice.words, ...Bob.words, ...Carol.words];
    store.startGame(game.id, game.adminKey);

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
    store.startGame(game.id, game.adminKey);
    assert.throws(() => store.capture(game.id, Alice.token, Alice.code), /your own code/);
    assert.throws(() => store.capture(game.id, Alice.token, 'nope'), /isn't a player/);
    assert.throws(() => store.capture(game.id, 'bad-token', Bob.code), /not a player/);
    // Player ids are public on the board, so they must not work as capture codes.
    assert.throws(() => store.capture(game.id, Alice.token, Bob.id), /isn't a player/);
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
    store.startGame(game.id, game.adminKey);
    store.capture(game.id, Alice.token, Bob.code);
    store.capture(game.id, Carol.token, Alice.code);

    store.undoLastCapture(game.id, game.adminKey);
    assert.equal(game.status, 'active');
    assert.equal(game.winnerId, null);
    assert.deepEqual(Alice.words, [a, b]);
    assert.deepEqual(Carol.words, [c]);
    assert.equal(Alice.status, 'active');

    store.undoLastCapture(game.id, game.adminKey);
    assert.deepEqual(Alice.words, [a]);
    assert.deepEqual(Bob.words, [b]);
    assert.equal(Bob.status, 'active');
    assert.throws(() => store.undoLastCapture(game.id, game.adminKey), /Nothing to undo/);
  });
});

describe('ending early', () => {
  it('declares the player with the most words, or no winner on a tie', () => {
    const { store, game, players } = setup(['A', 'B', 'C', 'D']);
    store.startGame(game.id, game.adminKey);
    store.capture(game.id, players.A.token, players.B.code);
    store.endGame(game.id, game.adminKey);
    assert.equal(game.winnerId, players.A.id);
    assert.throws(() => store.undoLastCapture(game.id, game.adminKey), /ended by the host/);

    const tie = setup();
    tie.store.startGame(tie.game.id, tie.game.adminKey);
    tie.store.endGame(tie.game.id, tie.game.adminKey);
    assert.equal(tie.game.winnerId, null);
  });
});

describe('public state', () => {
  it('hides words and secrets until the game is finished', () => {
    const { store, game, players } = setup();
    store.startGame(game.id, game.adminKey);
    const json = JSON.stringify(store.publicState(game));
    for (const p of Object.values(players)) {
      assert.ok(!json.includes(p.token));
      assert.ok(!json.includes(p.code));
      assert.ok(!json.includes(`"${p.words[0]}"`));
    }
    store.capture(game.id, players.Alice.token, players.Bob.code);
    store.capture(game.id, players.Alice.token, players.Carol.code);
    const winner = store.publicState(game).players.find((p) => p.id === players.Alice.id);
    assert.equal(winner.words.length, 3);
  });
});
