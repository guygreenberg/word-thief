import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AdminLogin,
  Avatar,
  Elapsed,
  EventFeed,
  FullPageMessage,
  Leaderboard,
  LocalhostWarning,
  Logo,
  MuteButton,
  QR,
  StatusPill,
  useToast,
} from '../components/ui.jsx';
import { celebrate, play } from '../effects.js';
import { plural, useAdminKey, useChange, useGameWatch, useSocketEvent } from '../hooks.js';
import { adminBoardPath, boardPath, joinUrl } from '../links.js';
import { request } from '../socket.js';

export default function AdminPage() {
  const id = useParams().gameId.toUpperCase();
  const [adminKey, setAdminKey] = useAdminKey(id);
  if (!adminKey) return <AdminLogin gameId={id} onLogin={setAdminKey} />;
  return <AdminDashboard id={id} adminKey={adminKey} onLogout={() => setAdminKey(null)} />;
}

function AdminDashboard({ id, adminKey, onLogout }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { state, error, errorCode } = useGameWatch(id, adminKey);
  const [busy, setBusy] = useState(false);

  // A stale key (e.g. after a server restart) sends the host back to the login form.
  useEffect(() => {
    if (errorCode === 'NOT_AUTHORIZED') onLogout();
  }, [errorCode, onLogout]);
  useSocketEvent('joined', () => play('pop'));
  useSocketEvent('capture', ({ hunter, target }) => {
    play('steal');
    toast({ emoji: '🦹', text: `${hunter.name} caught ${target.name}!` });
  });
  useChange(state?.status, (prev, next) => {
    if (prev === 'lobby' && next === 'active') play('start');
    if (prev === 'active' && next === 'finished') {
      play('win');
      celebrate({ big: true });
    }
  });

  if (error && !state) {
    return (
      <FullPageMessage emoji="🤷" title="Can't open this game">
        <p>{error}</p>
        <a className="btn btn-primary" href="/">Go home</a>
      </FullPageMessage>
    );
  }
  if (!state) return <FullPageMessage emoji="⏳" title="Loading game…" />;

  async function run(event, extra = {}, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    try {
      await request(event, { gameId: id, adminKey, ...extra });
    } catch (e) {
      play('error');
      toast({ emoji: '😬', text: e.message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  const active = state.players.filter((p) => p.status === 'active');
  const out = state.players.length - active.length;
  const enough = state.players.length >= state.minPlayers;

  return (
    <div className="page admin">
      <header className="topbar">
        <Logo size="sm" />
        <div className="topbar-right">
          <span className="pill pill-code">#{id}</span>
          <StatusPill status={state.status} />
          <Elapsed state={state} />
          <MuteButton />
        </div>
      </header>

      <div className="toolbar">
        <a className="btn btn-blue" href={boardPath(id)} target="_blank" rel="noreferrer">
          📺 Present board
        </a>
        <a className="btn btn-yellow" href={adminBoardPath(id)} target="_blank" rel="noreferrer" title="Word counts, for the host only">
          📊 Score board (host only)
        </a>
        {state.canUndo && (
          <button
            type="button"
            className="btn btn-yellow"
            disabled={busy}
            onClick={() => run('admin:undo', {}, 'Undo the most recent steal? The player gets their words back.')}
          >
            ↩️ Undo last steal
          </button>
        )}
        {state.status === 'active' && (
          <button
            type="button"
            className="btn btn-red"
            disabled={busy}
            onClick={() => run('admin:end', {}, 'End the game now? The player with the most words wins.')}
          >
            🏁 End game
          </button>
        )}
        {state.status === 'finished' && (
          <button type="button" className="btn btn-primary" onClick={() => navigate('/')}>
            ✨ New game
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            navigate(boardPath(id));
            onLogout();
          }}
        >
          🚪 Exit admin mode
        </button>
      </div>

      {state.status === 'lobby' ? (
        <div className="admin-grid">
          <section className="card text-center">
            <h2>Scan to join! 📱</h2>
            <LocalhostWarning />
            <QR value={joinUrl(id)} size={260} />
            <p className="join-url">{joinUrl(id).replace(/^https?:\/\//, '')}</p>
            <p className="muted">
              Game code <b className="code">{id}</b>
            </p>
          </section>
          <section className="card">
            <h2>
              Players <span className="count-badge">{state.players.length}</span>
            </h2>
            <p className="hint">
              {enough
                ? '🚀 Ready! Start the game from the game screen.'
                : `⏳ Need at least ${state.minPlayers} players to start (${state.minPlayers - state.players.length} more)`}
            </p>
            {state.players.length === 0 ? (
              <p className="muted">No one yet… invite your friends! 🥳</p>
            ) : (
              <ul className="chips">
                {state.players.map((p) => (
                  <li key={p.id} className="chip pop-in">
                    <Avatar player={p} size={30} />
                    <span>{p.name}</span>
                    <button
                      type="button"
                      className="chip-x"
                      aria-label={`Remove ${p.name}`}
                      onClick={() => run('admin:kick', { playerId: p.id }, `Remove ${p.name} from the game?`)}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : (
        <div className="admin-grid">
          <section className="card">
            {state.status === 'finished' && <WinnerBanner state={state} />}
            <div className="stats">
              <Stat emoji="🦹" value={active.length} label="still in" />
              <Stat emoji="👻" value={out} label="caught" />
              <Stat emoji="🔤" value={state.players.length} label="words" />
            </div>
            <Leaderboard players={state.players} showWords={state.status === 'finished'} />
          </section>
          <section className="card">
            <h2>Live feed 📣</h2>
            <EventFeed events={state.events} limit={15} />
          </section>
        </div>
      )}
    </div>
  );
}

function Stat({ emoji, value, label }) {
  return (
    <div className="stat">
      <span className="stat-emoji">{emoji}</span>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function WinnerBanner({ state }) {
  return (
    <div className="winner-banner">
      {state.winner ? (
        <>
          <span className="big-emoji">🏆</span>
          <div>
            <h2>{state.winner.name} wins!</h2>
            <p>The ultimate Word Thief 🦹</p>
          </div>
        </>
      ) : (
        <h2>🤝 It's a tie! Game over.</h2>
      )}
    </div>
  );
}
