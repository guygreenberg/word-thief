import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { FullPageMessage, Logo, MuteButton } from '../components/ui.jsx';
import { MAX_NAME_LENGTH } from '../constants.js';
import { play } from '../effects.js';
import { plural, useGameWatch } from '../hooks.js';
import { request } from '../socket.js';
import { storage } from '../storage.js';

export default function JoinPage() {
  const id = useParams().gameId.toUpperCase();
  const navigate = useNavigate();
  const { state, error: loadError } = useGameWatch(id);
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // Set when the typed name already belongs to a player, so we can offer to continue as them.
  const [takenName, setTakenName] = useState(null);

  if (storage.getPlayerToken(id)) return <Navigate to={`/play/${id}`} replace />;
  if (loadError && !state) {
    return (
      <FullPageMessage emoji="🔍" title="Game not found">
        <p>Check the code ({id}) or scan the QR again.</p>
        <a className="btn btn-primary" href="/">Go home</a>
      </FullPageMessage>
    );
  }
  if (!state) return <FullPageMessage emoji="⏳" title="Loading…" />;

  const started = state.status !== 'lobby';

  async function enter(event, payload) {
    setBusy(true);
    setError(null);
    try {
      const { token } = await request(event, { gameId: id, ...payload });
      storage.setPlayerToken(id, token);
      play('pop');
      navigate(`/play/${id}`, { replace: true });
    } catch (err) {
      play('error');
      if (err.code === 'NAME_TAKEN') setTakenName(name.trim());
      else setError(err.message);
      setBusy(false);
    }
  }

  function submit(e) {
    e.preventDefault();
    enter(started ? 'player:rejoin' : 'player:join', { name });
  }

  if (takenName) {
    return (
      <div className="page center">
        <div className="card narrow text-center pop-in">
          <div className="big-emoji">🤔</div>
          <h2>"{takenName}" is already in this game</h2>
          <p className="muted">If that's you (maybe you closed the browser), continue where you left off.</p>
          <div className="stack">
            <button type="button" className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={() => enter('player:rejoin', { name: takenName })}>
              🔁 Yes, I'm {takenName}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={() => {
                setTakenName(null);
                setName('');
              }}
            >
              No, I'll pick another name
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page center">
      <header className="topbar">
        <Logo size="sm" />
        <MuteButton />
      </header>
      <form className="card narrow text-center pop-in" onSubmit={submit}>
        <div className="big-emoji wiggle">{started ? '🔁' : '🦹'}</div>
        <h2>{started ? `Rejoin game #${id}` : `Join game #${id}`}</h2>
        {started ? (
          <p className="muted">The game is already running. Type the name you played with to get back in.</p>
        ) : (
          <p className="muted">{plural(state.players.length, 'player')} already in</p>
        )}
        <label className="label" htmlFor="name">
          {started ? 'Your original name' : 'What should we call you?'}
        </label>
        <input
          id="name"
          className="input input-lg"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_NAME_LENGTH}
          placeholder="Your name"
          autoComplete="nickname"
          autoFocus
          required
        />
        <p className="char-count">
          {name.length}/{MAX_NAME_LENGTH}
        </p>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy || !name.trim()}>
          {busy ? 'One sec…' : started ? 'Get back in 🔁' : 'Let me in! 🎲'}
        </button>
        {!started && <p className="muted small">Already joined and lost your page? Type your original name.</p>}
        {started && (
          <a className="btn btn-ghost btn-block spaced" href={`/board/${id}`}>
            📺 Just watch the board
          </a>
        )}
      </form>
    </div>
  );
}
