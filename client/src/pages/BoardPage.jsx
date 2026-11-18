import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Avatar, Elapsed, FullPageMessage, LocalhostWarning, Logo, MuteButton, QR } from '../components/ui.jsx';
import { celebrate, play } from '../effects.js';
import { plural, rankPlayers, useChange, useGameWatch, useSocketEvent } from '../hooks.js';
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
          <Elapsed state={state} />
          <MuteButton />
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
        <p className="waiting bounce">
          {missing > 0 ? `Waiting for ${missing} more…` : 'Waiting for the host to start the game…'}
        </p>
      </section>
    </div>
  );
}

function BoardGame({ state }) {
  const ranked = rankPlayers(state.players);
  const active = ranked.filter((p) => p.status === 'active');
  const out = ranked.filter((p) => p.status === 'out');
  const density = active.length <= 12 ? 'lg' : active.length <= 40 ? 'md' : 'sm';
  const lastSteal = [...state.events].reverse().find((e) => e.type === 'capture');

  return (
    <div className="board-game">
      <div className="board-stats">
        <span className="pill pill-big">🦹 {active.length} still in</span>
        <span className="pill pill-big">👻 {out.length} caught</span>
        <span className="pill pill-big">🔤 {state.players.length} words in play</span>
      </div>
      <div className={`tiles tiles-${density}`}>
        {active.map((p, i) => (
          <div key={p.id} className={`tile ${i === 0 && p.wordCount > 1 ? 'tile-leader' : ''}`} style={{ '--c': p.color }}>
            {i === 0 && p.wordCount > 1 && <span className="crown">👑</span>}
            <Avatar player={p} size={density === 'sm' ? 40 : density === 'md' ? 56 : 80} />
            <span className="tile-name">{p.name}</span>
            <span className="tile-count" key={p.wordCount}>
              {p.wordCount}
              <small>{p.wordCount === 1 ? 'word' : 'words'}</small>
            </span>
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
          Latest heist: 🦹 <b>{lastSteal.player}</b> stole {plural(lastSteal.count, 'word')} from <b>{lastSteal.target}</b>
        </div>
      )}
    </div>
  );
}

function BoardWinner({ state }) {
  const winner = state.winner && state.players.find((p) => p.id === state.winner.id);
  const ranked = rankPlayers(state.players);
  return (
    <div className="board-winner text-center">
      {winner ? (
        <>
          <div className="winner-avatar">
            <span className="crown big">👑</span>
            <Avatar player={winner} size={160} />
          </div>
          <h1 className="shout">{winner.name} wins!</h1>
          <p className="tagline">The ultimate Word Thief, holding {plural(winner.wordCount, 'word')} 🏆</p>
          <div className="word-cloud">
            {winner.words.map((w, i) => (
              <span key={w} className="word-chip pop-in" style={{ animationDelay: `${Math.min(i * 0.05, 3)}s` }}>
                {w}
              </span>
            ))}
          </div>
        </>
      ) : (
        <>
          <h1 className="shout">🤝 It's a tie!</h1>
          <div className="podium">
            {ranked.slice(0, 3).map((p) => (
              <div key={p.id} className="card podium-item">
                <Avatar player={p} size={72} />
                <b>{p.name}</b>
                <span>{plural(p.wordCount, 'word')}</span>
              </div>
            ))}
          </div>
        </>
      )}
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
          {capture.hunter.name} stole {plural(capture.count, 'word')}!
        </h1>
        <p className="tagline">{capture.target.name} said the word… and is OUT! 😱</p>
      </div>
    </div>
  );
}
