import { useEffect, useRef, useState } from 'react';
import { onMuteChange, isMuted } from './effects.js';
import { onEveryConnect, request, socket } from './socket.js';
import { storage } from './storage.js';

export function useSocketEvent(event, handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const fn = (...args) => ref.current(...args);
    socket.on(event, fn);
    return () => socket.off(event, fn);
  }, [event]);
}

/** Live game state. With an admin key it is the host view, which includes word counts. */
export function useGameWatch(gameId, adminKey) {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [errorCode, setErrorCode] = useState(null);
  const id = gameId.toUpperCase();

  useSocketEvent(adminKey ? 'adminState' : 'state', (s) => s.id === id && setState(s));
  useEffect(
    () =>
      onEveryConnect(() =>
        request(adminKey ? 'admin:watch' : 'game:watch', { gameId: id, adminKey })
          .then((res) => {
            setState(res.state);
            setError(null);
            setErrorCode(null);
          })
          .catch((e) => {
            setError(e.message);
            setErrorCode(e.code ?? null);
          }),
      ),
    [id, adminKey],
  );
  return { state, error, errorCode };
}

/** Admin key for this game, obtained by logging in and remembered on this device. */
export function useAdminKey(gameId) {
  const [adminKey, setAdminKeyState] = useState(() => storage.getAdminKey(gameId));
  const setAdminKey = (key) => {
    storage.setAdminKey(gameId, key);
    setAdminKeyState(key);
  };
  return [adminKey, setAdminKey];
}

export function useConnected() {
  const [connected, setConnected] = useState(socket.connected);
  useEffect(() => {
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    socket.on('connect', on);
    socket.on('disconnect', off);
    return () => {
      socket.off('connect', on);
      socket.off('disconnect', off);
    };
  }, []);
  return connected;
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function useMuted() {
  const [muted, setMutedState] = useState(isMuted());
  useEffect(() => onMuteChange(setMutedState), []);
  return muted;
}

/** Calls `fn(prev, next)` when `value` changes (skips the first render). */
export function useChange(value, fn) {
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value) fn(prev.current, value);
    prev.current = value;
  });
}

export function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

export function rankPlayers(players) {
  return [...players].sort(
    (a, b) =>
      (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) ||
      b.wordCount - a.wordCount ||
      (b.eliminatedAt ?? 0) - (a.eliminatedAt ?? 0) ||
      a.joinedAt - b.joinedAt,
  );
}
