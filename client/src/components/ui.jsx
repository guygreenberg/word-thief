import { QRCodeSVG } from 'qrcode.react';
import QrScanner from 'qr-scanner';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { setMuted } from '../effects.js';
import { formatDuration, plural, rankPlayers, useConnected, useMuted, useNow } from '../hooks.js';
import { isLocalOnlyHost } from '../links.js';
import { request } from '../socket.js';

export function Logo({ size = 'md', to = '/' }) {
  return (
    <Link to={to} className={`logo logo-${size}`} aria-label="Word Thief home">
      <span className="logo-mask">🦹</span>
      <span className="logo-text">
        WORD<span>THIEF</span>
      </span>
    </Link>
  );
}

export function Avatar({ player, size = 48, ghost = false }) {
  return (
    <span
      className={`avatar ${ghost ? 'avatar-ghost' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.55, background: ghost ? '#ddd' : player.color }}
    >
      {ghost ? '👻' : player.avatar}
    </span>
  );
}

export function LocalhostWarning() {
  if (!isLocalOnlyHost()) return null;
  return (
    <p className="hint">
      ⚠️ This page is open on <b>localhost</b>, so phones can't use this QR. Open it through your network
      or public address (for example <code>https://&lt;laptop-ip&gt;:5173</code> or a tunnel URL).
    </p>
  );
}

export function QR({ value, size = 220, label }) {
  return (
    <figure className="qr">
      <QRCodeSVG value={value} size={size} level="M" marginSize={1} bgColor="#ffffff" fgColor="#1d1340" />
      {label && <figcaption>{label}</figcaption>}
    </figure>
  );
}

export function MuteButton() {
  const muted = useMuted();
  return (
    <button
      type="button"
      className="icon-btn"
      onClick={() => setMuted(!muted)}
      aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
      title={muted ? 'Unmute' : 'Mute'}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}

export function ConnectionBanner() {
  const connected = useConnected();
  const [show, setShow] = useState(false);
  // Delay so the banner doesn't flash during the initial connect or brief network blips.
  useEffect(() => {
    if (connected) return setShow(false);
    const t = setTimeout(() => setShow(true), 1500);
    return () => clearTimeout(t);
  }, [connected]);
  if (!show) return null;
  return <div className="conn-banner">📡 Reconnecting…</div>;
}

export function Elapsed({ state }) {
  const now = useNow();
  if (!state.startedAt) return null;
  return <span className="pill pill-dark">⏱ {formatDuration((state.endedAt ?? now) - state.startedAt)}</span>;
}

export function StatusPill({ status }) {
  const map = {
    lobby: ['🟡', 'Waiting for players'],
    active: ['🟢', 'Game on!'],
    finished: ['🏁', 'Game over'],
  };
  const [icon, text] = map[status];
  return (
    <span className={`pill pill-${status}`}>
      {icon} {text}
    </span>
  );
}

/** Ranked by word count when `showCounts`; otherwise just who is in or out, alphabetically, revealing nothing. */
export function Leaderboard({ players, highlightId, limit, showWords = false, columns = false, showCounts = true }) {
  const ranked = showCounts
    ? rankPlayers(players)
    : [...players].sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'active' ? -1 : 1));
  const shown = limit ? ranked.slice(0, limit) : ranked;
  const max = Math.max(1, ...players.map((p) => p.wordCount));
  return (
    <ol className={`leaderboard ${columns ? 'leaderboard-cols' : ''}`}>
      {shown.map((p, i) => {
        const out = p.status === 'out';
        return (
          <li key={p.id} className={`lb-row ${out ? 'lb-out' : ''} ${p.id === highlightId ? 'lb-me' : ''}`}>
            <span className="lb-rank">{out ? '💀' : showCounts ? (['🥇', '🥈', '🥉'][i] ?? i + 1) : '🦹'}</span>
            <Avatar player={p} size={36} ghost={out} />
            <span className="lb-main">
              <span className="lb-name">
                {p.name}
                {p.id === highlightId && <em> (you)</em>}
              </span>
              {out ? (
                <span className="lb-sub">caught by {p.capturedBy ?? '???'}</span>
              ) : !showCounts ? (
                <span className="lb-sub">still in</span>
              ) : (
                <span className="lb-bar">
                  <span style={{ width: `${(p.wordCount / max) * 100}%`, background: p.color }} />
                </span>
              )}
              {showWords && p.words?.length > 0 && <span className="lb-sub">{p.words.join(' · ')}</span>}
            </span>
            {!out && showCounts && <span className="lb-count">{plural(p.wordCount, 'word')}</span>}
          </li>
        );
      })}
      {limit && ranked.length > limit && <li className="lb-more">…and {ranked.length - limit} more</li>}
    </ol>
  );
}

export function EventFeed({ events, limit = 8 }) {
  const recent = [...events].reverse().slice(0, limit);
  if (!recent.length) return <p className="muted">Nothing has happened yet…</p>;
  return (
    <ul className="feed">
      {recent.map((e) => (
        <li key={`${e.at}-${e.type}-${e.player}-${e.target}`}>
          <span className="feed-time">{new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          <EventText event={e} />
        </li>
      ))}
    </ul>
  );
}

function EventText({ event: e }) {
  switch (e.type) {
    case 'join':
      return <span>👋 <b>{e.player}</b> joined</span>;
    case 'rejoin':
      return <span>🔁 <b>{e.player}</b> rejoined</span>;
    case 'rename':
      return <span>✏️ <b>{e.from}</b> is now <b>{e.player}</b></span>;
    case 'start':
      return <span>🚀 The game started!</span>;
    case 'capture':
      return <span>🦹 <b>{e.player}</b> stole {plural(e.count, 'word')} from <b>{e.target}</b></span>;
    case 'undo':
      return <span>↩️ Host undid <b>{e.player}</b>'s steal from <b>{e.target}</b></span>;
    case 'finish':
      return e.player ? <span>🏆 <b>{e.player}</b> won!</span> : <span>🏁 Game ended</span>;
    default:
      return null;
  }
}

/** Admin mode login. `gameId` (optional) only changes the "back" link. */
export function AdminLogin({ gameId, onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { adminKey } = await request('admin:login', { username, password });
      onLogin(adminKey);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="page center">
      <header className="topbar">
        <Logo size="sm" />
      </header>
      <form className="card narrow text-center pop-in" onSubmit={submit}>
        <div className="big-emoji">🔐</div>
        <h2>Admin mode</h2>
        <p className="muted">{gameId ? `Game #${gameId}. ` : ''}Log in to manage games.</p>
        <label className="label" htmlFor="admin-user">Username</label>
        <input id="admin-user" className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" autoFocus required />
        <label className="label" htmlFor="admin-pass">Password</label>
        <input id="admin-pass" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        {error && <p className="error-text">{error}</p>}
        <button type="submit" className="btn btn-primary btn-lg btn-block spaced" disabled={busy}>
          {busy ? 'Checking…' : 'Log in'}
        </button>
        <Link className="btn btn-ghost btn-block spaced" to={gameId ? `/board/${gameId}` : '/'}>
          ← {gameId ? 'Back to the game screen' : 'Back home'}
        </Link>
      </form>
    </div>
  );
}

export function Modal({ children, onClose, className = '' }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal card pop-in ${className}`} onClick={(e) => e.stopPropagation()} role="dialog">
        {onClose && (
          <button type="button" className="modal-close icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

export function Scanner({ onResult, onCancel }) {
  const videoRef = useRef(null);
  const [error, setError] = useState(null);
  const handled = useRef(false);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    const scanner = new QrScanner(
      videoRef.current,
      ({ data }) => {
        if (handled.current) return;
        handled.current = true;
        scanner.stop();
        onResultRef.current(data);
      },
      { preferredCamera: 'environment', highlightScanRegion: true, highlightCodeOutline: true, returnDetailedScanResult: true },
    );
    scanner.start().catch(() => setError('Camera is unavailable. Please allow camera access and make sure the site uses HTTPS.'));
    return () => scanner.destroy();
  }, []);

  return (
    <div className="scanner">
      {error ? <p className="error-text">{error}</p> : <video ref={videoRef} muted playsInline />}
      <p className="muted">Point your camera at the other player's QR code</p>
      <button type="button" className="btn btn-ghost" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((toast) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-3), { id, ...toast }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), toast.duration ?? 3500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone ?? 'info'} pop-in`}>
            {t.emoji && <span className="toast-emoji">{t.emoji}</span>}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function FloatingEmojis() {
  const items = ['🦹', '💬', '🤫', '🗝️', '💰', '🎭', '🔤', '😱', '🤐', '💎'];
  return (
    <div className="floaties" aria-hidden="true">
      {items.map((e, i) => (
        <span key={i} style={{ left: `${(i * 97) % 100}%`, animationDelay: `${i * -2.3}s`, animationDuration: `${14 + (i % 5) * 3}s` }}>
          {e}
        </span>
      ))}
    </div>
  );
}

export function FullPageMessage({ emoji, title, children }) {
  return (
    <div className="page center">
      <div className="card narrow text-center pop-in">
        <div className="big-emoji">{emoji}</div>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
