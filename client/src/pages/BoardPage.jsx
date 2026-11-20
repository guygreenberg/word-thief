import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { request } from '../socket.js';
import { Avatar, Elapsed, FinalStandings, FullPageMessage, LocalhostWarning, Logo, MuteButton, QR, TimeLeft, useToast } from '../components/ui.jsx';
import { celebrate, play } from '../effects.js';
import { plural, useChange, useGameWatch, useSocketEvent } from '../hooks.js';
import { joinUrl } from '../links.js';

export default function BoardPage() {
  const id = useParams().gameId.toUpperCase();
  const { state, error } = useGameWatch(id);
  const [flash, setFlash] = useState(null);

  useSocketEvent('joined', () => play('pop'));
  useSocketEvent('capture', (c) => {
    play('steal');
    setFlash({ ...c, key: Date.now() });
  });
  useEffect(() => {
    if (!flash) return undefined;
    const t = setTimeout(() => setFlash(null), 3000);
    return () => clearTimeout(t);
  }, [flash]);
  useChange(state?.status, (prev, next) => {
    if (prev === 'lobby' && next === 'active') play('start');
    if (prev === 'active' && next === 'finished') {
      play('win');
      celebrate({ big: true });
    }
  });

  if (error && !state) return <FullPageMessage emoji="🤷" title={error} />;
  if (!state) return <FullPageMessage emoji="⏳" title="Loading board…" />;

  return (
    <div className="page board">
      <header className="topbar">
        <Logo size="md" />
        <div className="topbar-right">
          <span className="pill pill-code">#{id}</span>
          <TimeLeft state={state} />
          <Elapsed state={state} />
          <MuteButton />
          <Link className="btn btn-sm btn-ghost" to={`/admin/${id}`} title="Admin mode (login required)">
            🔐 Admin
          </Link>
          <button
            type="button"
            className="icon-btn"
            title="Fullscreen"
            aria-label="Toggle fullscreen"
            onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())}
          >
            ⛶
          </button>
        </div>
      </header>
      {state.status === 'lobby' && <BoardLobby state={state} />}
      {state.status === 'active' && <BoardGame state={state} />}
      {state.status === 'finished' && <BoardWinner state={state} />}
      {flash && <CaptureFlash key={flash.key} capture={flash} />}
    </div>
  );
}

function BoardLobby({ state }) {
  const missing = state.minPlayers - state.players.length;
  const toast = useToast();
  const [starting, setStarting] = useState(false);

  async function start() {
    setStarting(true);
    try {
      await request('game:start', { gameId: state.id });
    } catch (e) {
      play('error');
      toast({ emoji: '😬', text: e.message, tone: 'error' });
      setStarting(false);
    }
  }

  return (
    <div className="board-lobby">
      <section className="card text-center board-qr">
        <h1 className="shout">Scan to join!</h1>
        <LocalhostWarning />
        <QR value={joinUrl(state.id)} size={340} />
        <p className="join-url">{joinUrl(state.id).replace(/^https?:\/\//, '')}</p>
      </section>
      <section className="board-wall">
        <h2 className="shout-sm">
          {state.players.length === 0 ? 'Who dares to play? 👀' : `${plural(state.players.length, 'thief', 'thieves')} ready 🦹`}
        </h2>
        <div className="bubbles">
          {state.players.map((p) => (
            <div key={p.id} className="bubble pop-in" style={{ '--c': p.color }}>
              <Avatar player={p} size={56} />
              <span>{p.name}</span>
            </div>
          ))}
        </div>
        {missing > 0 ? (
          <p className="waiting bounce">Waiting for {missing} more…</p>
        ) : (
          <button type="button" className="btn btn-green btn-xl start-btn" onClick={start} disabled={starting}>
            {starting ? 'Starting…' : '🚀 Start game!'}
          </button>
        )}
      </section>
    </div>
  );
}

// The public board shows who is in or out but never word counts, so the room can't tell who is leading.
function BoardGame({ state }) {
  const byName = [...state.players].sort((a, b) => a.name.localeCompare(b.name));
  const active = byName.filter((p) => p.status === 'active');
  const out = [...state.players]
    .filter((p) => p.status === 'out')
    .sort((a, b) => b.eliminatedAt - a.eliminatedAt);
  const density = active.length <= 12 ? 'lg' : active.length <= 40 ? 'md' : 'sm';
  const lastSteal = [...state.events].reverse().find((e) => e.type === 'capture');

  return (
    <div className="board-game">
      <div className="board-stats">
        <span className="pill pill-big">🦹 {active.length} still in</span>
        <span className="pill pill-big">👻 {out.length} caught</span>
      </div>
      <div className={`tiles tiles-${density}`}>
        {active.map((p) => (
          <div key={p.id} className="tile" style={{ '--c': p.color }}>
            <Avatar player={p} size={density === 'sm' ? 40 : density === 'md' ? 56 : 80} />
            <span className="tile-name">{p.name}</span>
            <span className="tile-status">🦹 still in</span>
          </div>
        ))}
      </div>
      {out.length > 0 && (
        <section className="ghost-town">
          <h3>👻 Ghost town</h3>
          <div className="ghosts">
            {out.map((p) => (
              <span key={p.id} className="ghost" title={`caught by ${p.capturedBy}`}>
                👻 {p.name}
              </span>
            ))}
          </div>
        </section>
      )}
      {lastSteal && (
        <div className="ticker">
          Latest heist: 🦹 <b>{lastSteal.player}</b> caught <b>{lastSteal.target}</b>
        </div>
      )}
    </div>
  );
}

function BoardWinner({ state }) {
  const winner = state.winner && state.players.find((p) => p.id === state.winner.id);
  const timeUp = state.events.some((e) => e.type === 'finish' && e.reason === 'time');
  return (
    <div className="board-winner">
      <div className="text-center">
        {timeUp && <p className="tagline">⏰ Time's up!</p>}
        {winner ? (
          <>
            <div className="winner-avatar">
              <span className="crown big">👑</span>
              <Avatar player={winner} size={120} />
            </div>
            <h1 className="shout">{winner.name} wins!</h1>
            <p className="tagline">The ultimate Word Thief, holding {plural(winner.wordCount, 'word')} 🏆</p>
          </>
        ) : (
          <h1 className="shout">🤝 It's a tie!</h1>
        )}
      </div>
      <section className="card standings-card">
        <h2>📜 Final standings: words stolen</h2>
        <FinalStandings state={state} />
      </section>
    </div>
  );
}

function CaptureFlash({ capture }) {
  return (
    <div className="flash">
      <div className="flash-card pop-in">
        <div className="flash-avatars">
          <Avatar player={capture.hunter} size={110} />
          <span className="flash-arrow">💥</span>
          <Avatar player={capture.target} size={110} ghost />
        </div>
        <h1 className="shout">
          {capture.hunter.name} caught {capture.target.name}!
        </h1>
        <p className="tagline">{capture.target.name} said the word… and is OUT! 😱</p>
      </div>
    </div>
  );
}
