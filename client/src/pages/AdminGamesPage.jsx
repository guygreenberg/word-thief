import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AdminLogin, FullPageMessage, Logo, MuteButton, StatusPill, useToast } from '../components/ui.jsx';
import { formatDuration, plural, useAdminKey, useNow } from '../hooks.js';
import { boardPath } from '../links.js';
import { request } from '../socket.js';

const REFRESH_MS = 3000;

export default function AdminGamesPage() {
  const [adminKey, setAdminKey] = useAdminKey();
  // Stable so the polling effect below doesn't restart on every render.
  const onLogout = useCallback(() => setAdminKey(null), [setAdminKey]);
  if (!adminKey) return <AdminLogin onLogin={setAdminKey} />;
  return <GamesList adminKey={adminKey} onLogout={onLogout} />;
}

function GamesList({ adminKey, onLogout }) {
  const navigate = useNavigate();
  const toast = useToast();
  const now = useNow();
  const [games, setGames] = useState(null);
  const [error, setError] = useState(null);
  const [showFinished, setShowFinished] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      request('admin:games', { adminKey })
        .then((res) => !cancelled && (setGames(res.games), setError(null)))
        .catch((e) => {
          if (cancelled) return;
          if (e.code === 'NOT_AUTHORIZED') onLogout();
          else setError(e.message);
        });
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [adminKey, onLogout]);

  async function hostGame() {
    setCreating(true);
    try {
      const { gameId } = await request('game:create');
      navigate(boardPath(gameId));
    } catch (e) {
      toast({ emoji: '😬', text: e.message, tone: 'error' });
      setCreating(false);
    }
  }

  function logout() {
    request('admin:logout', { adminKey }).catch(() => {});
    onLogout();
    navigate('/');
  }

  if (!games) return <FullPageMessage emoji="⏳" title={error ?? 'Loading games…'} />;

  const running = games.filter((g) => g.status !== 'finished');
  const finished = games.filter((g) => g.status === 'finished');
  const shown = showFinished ? games : running;

  return (
    <div className="page admin">
      <header className="topbar">
        <Logo size="sm" />
        <div className="topbar-right">
          <span className="pill pill-dark">🔐 Admin</span>
          <MuteButton />
        </div>
      </header>

      <div className="toolbar">
        <button type="button" className="btn btn-primary" onClick={hostGame} disabled={creating}>
          {creating ? 'Creating…' : '✨ Host a new game'}
        </button>
        <label className="btn btn-ghost toggle">
          <input type="checkbox" checked={showFinished} onChange={(e) => setShowFinished(e.target.checked)} />
          Show finished ({finished.length})
        </label>
        <button type="button" className="btn btn-ghost" onClick={logout}>
          🚪 Exit admin mode
        </button>
      </div>

      <section className="card">
        <h2>
          🎮 {showFinished ? 'All games' : 'Active games'} <span className="count-badge">{shown.length}</span>
        </h2>
        {shown.length === 0 ? (
          <p className="muted">No {showFinished ? '' : 'active '}games right now. Host one! 🥳</p>
        ) : (
          <ul className="games-list">
            {shown.map((g) => (
              <li key={g.id} className="game-row pop-in">
                <span className="code game-code">#{g.id}</span>
                <span className="game-info">
                  <StatusPill status={g.status} />
                  <span className="muted small">
                    {g.status === 'lobby' && `${plural(g.playerCount, 'player')} waiting`}
                    {g.status === 'active' && `${g.activeCount} of ${plural(g.playerCount, 'player')} still in`}
                    {g.status === 'finished' && (g.winner ? `🏆 ${g.winner} won` : 'Ended with a tie')}
                    {' · '}
                    {g.startedAt
                      ? `${g.status === 'finished' ? 'played' : 'running'} ${formatDuration((g.endedAt ?? now) - g.startedAt)}`
                      : `created ${new Date(g.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                  </span>
                </span>
                <span className="game-actions">
                  <Link className="btn btn-sm btn-yellow" to={`/admin/${g.id}`}>
                    ⚙️ Manage
                  </Link>
                  <Link className="btn btn-sm btn-blue" to={boardPath(g.id)}>
                    📺 Game screen
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
