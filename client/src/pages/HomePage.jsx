import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo, MuteButton, useToast } from '../components/ui.jsx';
import { play } from '../effects.js';
import { request } from '../socket.js';
import { storage } from '../storage.js';

const STEPS = [
  ['📱', 'Scan & join', 'Scan the QR on the big screen, type your name and get a secret word.'],
  ['🗣️', 'Make them say it', "Chat, trick and tease other players until they say YOUR word out loud."],
  ['🤫', 'Tell them secretly', 'When they say your word, whisper it to them or pull them aside, so nobody else finds out your word.'],
  ['📷', 'Scan & steal', 'They show you their QR (or code). Scan it and all their words become yours. They are out!'],
  ['🏆', 'Last thief wins', 'Keep stealing until you hold every single word in the game.'],
];

export default function HomePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [creating, setCreating] = useState(false);

  async function hostGame() {
    setCreating(true);
    try {
      const { gameId, adminKey } = await request('game:create');
      storage.setAdminKey(gameId, adminKey);
      play('pop');
      navigate(`/admin/${gameId}`);
    } catch (e) {
      toast({ emoji: '😬', text: e.message, tone: 'error' });
      setCreating(false);
    }
  }

  function join(e) {
    e.preventDefault();
    const id = code.trim().toUpperCase();
    if (id) navigate(`/join/${id}`);
  }

  return (
    <div className="page home">
      <header className="topbar">
        <span />
        <MuteButton />
      </header>
      <section className="hero text-center">
        <Logo size="xl" />
        <p className="tagline">Make your friends say your word… then steal everything they've got! 🤫</p>
      </section>

      <section className="home-actions">
        <div className="card">
          <h3>🎤 Hosting a party?</h3>
          <p className="muted">Create a game and put the join QR on a big screen.</p>
          <button type="button" className="btn btn-primary btn-lg" onClick={hostGame} disabled={creating}>
            {creating ? 'Creating…' : '✨ Host a new game'}
          </button>
        </div>
        <form className="card" onSubmit={join}>
          <h3>🙋 Got a game code?</h3>
          <p className="muted">Usually you just scan the QR, but typing works too.</p>
          <div className="row">
            <input
              className="input code-input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCDE"
              maxLength={5}
              autoCapitalize="characters"
              aria-label="Game code"
            />
            <button type="submit" className="btn btn-yellow" disabled={!code.trim()}>
              Join
            </button>
          </div>
        </form>
      </section>

      <section className="steps">
        {STEPS.map(([emoji, title, text], i) => (
          <div key={title} className="card step" style={{ animationDelay: `${i * 0.1}s` }}>
            <span className="step-num">{i + 1}</span>
            <div className="big-emoji">{emoji}</div>
            <h4>{title}</h4>
            <p>{text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
