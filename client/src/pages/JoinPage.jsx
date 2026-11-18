import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { FullPageMessage, Logo, MuteButton } from '../components/ui.jsx';
import { play } from '../effects.js';
import { plural, useGameWatch } from '../hooks.js';
import { request } from '../socket.js';
import { storage } from '../storage.js';

const MAX_NAME = 20;

export default function JoinPage() {
  const id = useParams().gameId.toUpperCase();
  const navigate = useNavigate();
  const { state, error: loadError } = useGameWatch(id);
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [joining, setJoining] = useState(false);

  if (storage.getPlayerToken(id)) return <Navigate to={`/play/${id}`} replace />;
  if (loadError && !state) {
    return (
      <FullPageMessage emoji="🔍" title="Game not found">
        <p>Check the code ({id}) or scan the QR again.</p>
        <a className="btn btn-primary" href="/">Go home</a>
      </FullPageMessage>
    );
  }
  if (state && state.status !== 'lobby') {
    return (
      <FullPageMessage emoji="🏃" title="Too late, the heist has started!">
        <p>This game is already running. Ask the host to start a new one.</p>
        <a className="btn btn-primary" href={`/board/${id}`}>Watch the board</a>
      </FullPageMessage>
    );
  }

  async function submit(e) {
    e.preventDefault();
    setJoining(true);
    setError(null);
    try {
      const { token } = await request('player:join', { gameId: id, name });
      storage.setPlayerToken(id, token);
      play('pop');
      navigate(`/play/${id}`, { replace: true });
    } catch (err) {
      play('error');
      setError(err.message);
      setJoining(false);
    }
  }

  return (
    <div className="page center">
      <header className="topbar">
        <Logo size="sm" />
        <MuteButton />
      </header>
      <form className="card narrow text-center pop-in" onSubmit={submit}>
        <div className="big-emoji wiggle">🦹</div>
        <h2>Join game #{id}</h2>
        {state && <p className="muted">{plural(state.players.length, 'player')} already in</p>}
        <label className="label" htmlFor="name">What should we call you?</label>
        <input
          id="name"
          className="input input-lg"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_NAME}
          placeholder="Your name"
          autoComplete="nickname"
          autoFocus
          required
        />
        <p className="char-count">{name.length}/{MAX_NAME}</p>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={joining || !name.trim()}>
          {joining ? 'Joining…' : "Let me in! 🎲"}
        </button>
      </form>
    </div>
  );
}
