const origin = () => window.location.origin;

export const isLocalOnlyHost = () => ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

export const joinUrl = (gameId) => `${origin()}/join/${gameId}`;
export const boardPath = (gameId) => `/board/${gameId}`;
export const adminBoardPath = (gameId) => `/admin/${gameId}/board`;
export const playerQrValue = (gameId, code) => `${origin()}/c/${gameId}/${encodeURIComponent(code)}`;

/** Extracts the player capture code from a scanned QR, or throws a friendly error. */
export function parsePlayerQr(data, expectedGameId) {
  let url;
  try {
    url = new URL(data);
  } catch {
    throw new Error("That doesn't look like a Word Thief QR code 🤔");
  }
  if (/^\/join\//.test(url.pathname)) throw new Error("That's the join code, not a player! Scan a player's QR 😉");
  const match = url.pathname.match(/^\/c\/([^/]+)\/([^/]+)$/);
  if (!match) throw new Error("That doesn't look like a Word Thief QR code 🤔");
  const [, gameId, code] = match;
  if (gameId.toUpperCase() !== expectedGameId.toUpperCase()) throw new Error('That player is in a different game!');
  return decodeURIComponent(code);
}
