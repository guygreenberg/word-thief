import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AdminAuth } from './auth.js';

describe('admin login', () => {
  it('accepts only the configured username and password', () => {
    const auth = new AdminAuth({ username: 'admin', password: 's3cret!' });
    auth.verify('ip', 'admin', 's3cret!');
    assert.throws(() => auth.verify('ip', 'admin', 'wrong'), /Wrong username or password/);
    assert.throws(() => auth.verify('ip', 'root', 's3cret!'), /Wrong username or password/);
  });

  it('refuses every login when credentials are not configured', () => {
    const auth = new AdminAuth({ username: 'admin', password: '' });
    assert.equal(auth.configured, false);
    assert.throws(() => auth.verify('ip', 'admin', ''), /not set up/);
  });

  it('locks a client out after repeated failures, then lets it retry after the window', () => {
    let now = 0;
    const auth = new AdminAuth({ username: 'admin', password: 'pw', now: () => now, maxFailures: 3 });
    for (let i = 0; i < 3; i++) assert.throws(() => auth.verify('ip1', 'admin', 'x'), /Wrong/);
    assert.throws(() => auth.verify('ip1', 'admin', 'pw'), /Too many failed logins/);
    auth.verify('ip2', 'admin', 'pw');
    now += 61_000;
    auth.verify('ip1', 'admin', 'pw');
  });
});
