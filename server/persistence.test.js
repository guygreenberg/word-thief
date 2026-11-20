import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { GAME_TTL_MS, GameStore } from './game.js';
import { FileGamePersistence } from './persistence.js';

let dir;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'word-thief-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('saving games to disk', () => {
  it('restores games after a restart, so play (and undo) continue where they left off', () => {
    const store = new GameStore({ persistence: new FileGamePersistence(dir) });
    const game = store.createGame();
    const [a, b] = ['Alice', 'Bob', 'Carol'].map((n) => store.joinGame(game.id, n).player);
    store.startGame(game.id);
    store.capture(game.id, a.token, b.code);
    store.flush();

    const restarted = new GameStore({ persistence: new FileGamePersistence(dir) });
    assert.equal(restarted.restore(), 1);
    const restored = restarted.getGame(game.id);
    assert.equal(restored.status, 'active');
    assert.equal(restarted.findPlayerByToken(restored, a.token).words.length, 2);
    assert.equal(restored.players.get(b.id).status, 'out');

    restarted.undoLastCapture(game.id);
    assert.equal(restored.players.get(b.id).status, 'active');
    assert.equal(restarted.rejoinGame(game.id, 'carol').player.name, 'Carol');
    restarted.flush();
  });

  it('drops games that expired while the server was down and deletes their files', () => {
    let now = 1_000_000;
    const store = new GameStore({ now: () => now, persistence: new FileGamePersistence(dir) });
    store.createGame();
    store.flush();

    now += GAME_TTL_MS + 1;
    const restarted = new GameStore({ now: () => now, persistence: new FileGamePersistence(dir) });
    assert.equal(restarted.restore(), 0);
    assert.deepEqual(readdirSync(path.join(dir, 'games')), []);
  });

  it('skips a corrupted file instead of failing to start', () => {
    const persistence = new FileGamePersistence(dir);
    const store = new GameStore({ persistence });
    const game = store.createGame();
    store.flush();
    writeFileSync(path.join(dir, 'games', 'BROKEN.json'), '{ not json');

    const restarted = new GameStore({ persistence: new FileGamePersistence(dir) });
    assert.equal(restarted.restore(), 1);
    assert.ok(restarted.games.has(game.id));
  });

  it('deletes the file when a game is cleaned up', () => {
    let now = 1_000_000;
    const store = new GameStore({ now: () => now, persistence: new FileGamePersistence(dir) });
    store.createGame();
    store.flush();
    now += GAME_TTL_MS + 1;
    store.cleanup();
    store.flush();
    assert.deepEqual(readdirSync(path.join(dir, 'games')), []);
  });
});

describe('admin games list', () => {
  it('summarizes every game, newest first', () => {
    let now = 1000;
    const store = new GameStore({ now: () => now++ });
    const older = store.createGame();
    const newer = store.createGame();
    ['A', 'B', 'C'].forEach((n) => store.joinGame(newer.id, n));
    store.startGame(newer.id);
    const list = store.listGames();
    assert.deepEqual(list.map((g) => g.id), [newer.id, older.id]);
    assert.deepEqual(
      (({ status, playerCount, activeCount }) => ({ status, playerCount, activeCount }))(list[0]),
      { status: 'active', playerCount: 3, activeCount: 3 },
    );
  });
});
