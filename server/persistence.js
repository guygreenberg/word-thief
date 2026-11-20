import { accessSync, constants, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const GAME_FILE = /^[A-Z0-9]+\.json$/;

/** Saves each game as its own JSON file under `<dataDir>/games`, e.g. on a Render persistent disk. */
export class FileGamePersistence {
  constructor(dataDir) {
    this.dir = path.join(dataDir, 'games');
    mkdirSync(this.dir, { recursive: true });
    // Fail fast with a clear message instead of silently losing games later.
    accessSync(this.dir, constants.W_OK);
  }

  loadAll() {
    const games = [];
    for (const file of readdirSync(this.dir)) {
      if (!GAME_FILE.test(file)) continue;
      try {
        games.push(JSON.parse(readFileSync(path.join(this.dir, file), 'utf8')));
      } catch (err) {
        console.error(`Skipping unreadable game file ${file}: ${err.message}`);
      }
    }
    return games;
  }

  /** Writes to a temp file and renames it, so a crash mid-write never leaves a half-written game. */
  save(id, data) {
    const file = this.#file(id);
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, file);
  }

  remove(id) {
    rmSync(this.#file(id), { force: true });
  }

  #file(id) {
    if (!/^[A-Z0-9]+$/.test(id)) throw new Error(`Invalid game id: ${id}`);
    return path.join(this.dir, `${id}.json`);
  }
}
