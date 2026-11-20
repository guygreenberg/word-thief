import { useParams } from 'react-router-dom';
import { Avatar, Elapsed, FullPageMessage, Leaderboard, Logo, MuteButton, StatusPill, useToast } from '../components/ui.jsx';
import { celebrate, play } from '../effects.js';
import { plural, rankPlayers, useAdminKey, useChange, useGameWatch, useSocketEvent } from '../hooks.js';

/** Host-only scoreboard with word counts. The public board deliberately hides counts. */
export default function AdminBoardPage() {
  const id = useParams().gameId.toUpperCase();
  const adminKey = useAdminKey(id);
  if (!adminKey) {
    return (
      <FullPageMessage emoji="🔒" title="Host access needed">
        <p>Open the score board from the host dashboard.</p>
      </FullPageMessage>
    );
  }
  return <AdminBoard id={id} adminKey={adminKey} />;
}

function AdminBoard({ id, adminKey }) {
  const { state, error } = useGameWatch(id, adminKey);
  const toast = useToast();

  useSocketEvent('capture', ({ hunter, target, count }) => {
    play('steal');
    toast({ emoji: '🦹', text: `${hunter.name} stole ${plural(count, 'word')} from ${target.name}!` });
  });
  useChange(state?.status, (prev, next) => {
    if (prev === 'active' && next === 'finished') {
      play('win');
      celebrate({ big: true });
    }
  });

  if (error && !state) return <FullPageMessage emoji="🤷" title={error} />;
  if (!state) return <FullPageMessage emoji="⏳" title="Loading score board…" />;

  const ranked = rankPlayers(state.players);
  const podium = ranked.filter((p) => p.status === 'active').slice(0, 3);
  const totalWords = state.players.length;

  return (
    <div className="page board">
      <header className="topbar">
        <Logo size="md" />
        <div className="topbar-right">
          <span className="pill pill-dark">🔒 Host only</span>
          <span className="pill pill-code">#{id}</span>
          <StatusPill status={state.status} />
          <Elapsed state={state} />
          <MuteButton />
        </div>
      </header>

      <h1 className="shout-sm text-center">📊 Score board</h1>
      {state.status === 'lobby' ? (
        <p className="waiting text-center">The game hasn't started yet: {plural(state.players.length, 'player')} joined.</p>
      ) : (
        <>
          <div className="score-podium">
            {podium.map((p, i) => (
              <div key={p.id} className={`card score-card score-${i + 1}`} style={{ '--c': p.color }}>
                <span className="score-medal">{['🥇', '🥈', '🥉'][i]}</span>
                <Avatar player={p} size={64} />
                <b className="score-name">{p.name}</b>
                <span className="score-count">{p.wordCount}</span>
                <span className="muted">
                  {p.wordCount === 1 ? 'word' : 'words'} · {Math.round((p.wordCount / totalWords) * 100)}%
                </span>
              </div>
            ))}
          </div>
          <section className="card">
            <Leaderboard players={state.players} showWords={state.status === 'finished'} columns />
          </section>
        </>
      )}
    </div>
  );
}
