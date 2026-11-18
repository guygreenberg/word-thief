const key = {
  admin: (gameId) => `wordthief:admin:${gameId}`,
  player: (gameId) => `wordthief:player:${gameId}`,
  muted: 'wordthief:muted',
};

const read = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k, v) => {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    // Private mode or storage disabled: the session still works until reload.
  }
};

export const storage = {
  getAdminKey: (gameId) => read(key.admin(gameId)),
  setAdminKey: (gameId, adminKey) => write(key.admin(gameId), adminKey),
  getPlayerToken: (gameId) => read(key.player(gameId)),
  setPlayerToken: (gameId, token) => write(key.player(gameId), token),
  isMuted: () => read(key.muted) === '1',
  setMuted: (muted) => write(key.muted, muted ? '1' : null),
};
