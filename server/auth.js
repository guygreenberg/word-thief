import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { GameError } from './game.js';

const digest = (value) => createHash('sha256').update(String(value ?? '')).digest();

/**
 * Checks the host login. Credentials come from the environment (never from source control) and
 * failed attempts are rate limited per client to slow down password guessing.
 */
export class AdminAuth {
  constructor({ username, password, now = () => Date.now(), maxFailures = 5, windowMs = 60_000, sessionTtlMs = 12 * 60 * 60 * 1000 }) {
    this.username = username;
    this.password = password;
    this.now = now;
    this.maxFailures = maxFailures;
    this.windowMs = windowMs;
    this.failures = new Map();
    this.sessionTtlMs = sessionTtlMs;
    this.sessions = new Map();
  }

  get configured() {
    return Boolean(this.username && this.password);
  }

  verify(clientId, username, password) {
    if (!this.configured) throw new GameError('Admin login is not set up on the server (ADMIN_USERNAME / ADMIN_PASSWORD)');
    const cutoff = this.now() - this.windowMs;
    const recent = (this.failures.get(clientId) ?? []).filter((t) => t > cutoff);
    if (recent.length >= this.maxFailures) throw new GameError('Too many failed logins. Wait a minute and try again ⏳');

    // Compare fixed-length digests in constant time; check both so timing doesn't reveal which one was wrong.
    const userOk = timingSafeEqual(digest(username), digest(this.username));
    const passOk = timingSafeEqual(digest(password), digest(this.password));
    if (!(userOk && passOk)) {
      recent.push(this.now());
      this.failures.set(clientId, recent);
      throw new GameError('Wrong username or password');
    }
    this.failures.delete(clientId);
  }

  /** Verifies the credentials and returns a session token that unlocks admin mode for every game. */
  login(clientId, username, password) {
    this.verify(clientId, username, password);
    const token = randomBytes(24).toString('base64url');
    this.sessions.set(token, this.now() + this.sessionTtlMs);
    return token;
  }

  requireSession(token) {
    const expiresAt = typeof token === 'string' ? this.sessions.get(token) : undefined;
    if (!expiresAt || expiresAt < this.now()) {
      if (expiresAt) this.sessions.delete(token);
      throw new GameError('Please log in to admin mode', 'NOT_AUTHORIZED');
    }
  }

  logout(token) {
    this.sessions.delete(token);
  }
}
