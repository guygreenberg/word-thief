import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Avatar,
  FinalStandings,
  FullPageMessage,
  Leaderboard,
  Logo,
  Modal,
  MuteButton,
  QR,
  Scanner,
  TimeLeft,
  useToast,
} from '../components/ui.jsx';
import { AVATAR_CHOICES, CAPTURE_CODE_LENGTH, MAX_NAME_LENGTH } from '../constants.js';
import { celebrate, play, vibrate } from '../effects.js';
import { plural, useChange, useSocketEvent } from '../hooks.js';
import { parsePlayerQr, playerQrValue } from '../links.js';
import { onEveryConnect, request } from '../socket.js';
import { storage } from '../storage.js';

// Above this size, other players' steals are not toasted to avoid notification spam.
const TOAST_OTHERS_MAX_PLAYERS = 30;

export default function PlayPage() {
  const id = useParams().gameId.toUpperCase();
  const token = storage.getPlayerToken(id);
  if (!token) return <Navigate to={`/join/${id}`} replace />;
  return <PlayerGame id={id} token={token} />;
}

function PlayerGame({ id, token }) {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [me, setMe] = useState(null);
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [kicked, setKicked] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [stolen, setStolen] = useState(null);

  useEffect(
    () =>
      onEveryConnect(() =>
        request('player:resume', { gameId: id, token })
          .then((res) => {
            setMe(res.me);
            setState(res.state);
            setError(null);
          })
          .catch((e) => setError(e.message)),
      ),
    [id, token],
  );

  // Result handed over from CapturePage (native camera scan).
  useEffect(() => {
    const { stolen: result, captureError } = location.state ?? {};
    if (result) showSteal(result);
    if (captureError) {
      play('error');
      toast({ emoji: '🙅', text: captureError, tone: 'error' });
    }
    if (result || captureError) navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useSocketEvent('state', (s) => s.id === id && setState(s));
  useSocketEvent('me', (m) => setMe((prev) => (prev && prev.id === m.id ? m : prev)));
  useSocketEvent('kicked', () => {
    storage.setPlayerToken(id, null);
    setKicked(true);
  });
  useSocketEvent('capture', ({ hunter, target }) => {
    if (!me || hunter.id === me.id || target.id === me.id) return;
    if ((state?.players.length ?? 0) <= TOAST_OTHERS_MAX_PLAYERS) {
      toast({ emoji: '🦹', text: `${hunter.name} caught ${target.name}`, duration: 2500 });
    }
  });
  useSocketEvent('undo', ({ hunter, target }) => {
    if (!me) return;
    if (target.id === me.id) toast({ emoji: '🎉', text: "The host undid your capture. You're back in!", tone: 'success' });
    if (hunter.id === me.id) toast({ emoji: '↩️', text: `The host undid your steal from ${target.name}`, tone: 'error' });
  });

  useChange(me?.status, (prev, next) => {
    if (prev === 'active' && next === 'out') {
      setShowQr(false);
      setScanning(false);
      play('caught');
      vibrate([300, 100, 300, 100, 600]);
    }
  });
  useChange(state?.status, (prev, next) => {
    if (prev === 'lobby' && next === 'active') {
      play('start');
      vibrate(300);
      toast({ emoji: '🚀', text: 'The game has started! Go make them talk!', tone: 'success' });
    }
    if (prev === 'active' && next === 'finished') {
      setShowQr(false);
      setScanning(false);
      if (state.winner?.id === me?.id) {
        play('win');
        celebrate({ big: true });
      }
    }
  });

  function showSteal(result) {
    setStolen(result);
    play('steal');
    vibrate([100, 50, 100]);
    celebrate();
  }

  /** A failed camera scan closes the panel; a mistyped code keeps it open so it can be fixed. */
  async function steal(getCode, { keepOpenOnError = false } = {}) {
    if (!keepOpenOnError) setScanning(false);
    try {
      const res = await request('player:capture', { gameId: id, token, code: getCode() });
      setScanning(false);
      setMe(res.me);
      showSteal({ count: res.count, target: res.target });
    } catch (e) {
      play('error');
      toast({ emoji: '🙅', text: e.message, tone: 'error' });
    }
  }

  if (kicked) {
    return (
      <FullPageMessage emoji="🚪" title="You were removed from the game">
        <a className="btn btn-primary" href={`/join/${id}`}>Join again</a>
      </FullPageMessage>
    );
  }
  if (error && !me) {
    return (
      <FullPageMessage emoji="🤷" title="We couldn't find you in this game">
        <p>{error}</p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            storage.setPlayerToken(id, null);
            navigate(`/join/${id}`, { replace: true });
          }}
        >
          Join again
        </button>
      </FullPageMessage>
    );
  }
  if (!me || !state) return <FullPageMessage emoji="⏳" title="Loading…" />;

  const activeCount = state.players.filter((p) => p.status === 'active').length;
  const capturer = state.players.find((p) => p.id === me.capturedById);

  return (
    <div className="page player">
      <header className="topbar">
        <Logo size="sm" />
        <div className="topbar-right">
          <TimeLeft state={state} />
          <span className="pill pill-code">#{id}</span>
          <MuteButton />
        </div>
      </header>

      {state.status === 'finished' ? (
        <FinishedView me={me} state={state} />
      ) : me.status === 'out' ? (
        <CaughtView me={me} capturer={capturer} state={state} />
      ) : (
        <>
          <MeCard id={id} token={token} me={me} onUpdated={setMe} />

          <WordVault word={me.word} />

          {state.status === 'lobby' ? (
            <section className="card text-center">
              <p className="waiting bounce">⏳ Waiting for the host to start…</p>
              <p className="muted">{plural(state.players.length, 'player')} joined so far</p>
              <ul className="rules">
                <li>🤫 Never say your own word.</li>
                <li>🗣️ Get others to say <b>your</b> word out loud.</li>
                <li>🤐 When someone says it, tell them <b>secretly</b>: whisper or take them aside, so nobody else learns your word.</li>
                <li>📷 They show you their QR or code. Scan it (or type the code) to steal all their words.</li>
                <li>😱 If someone secretly tells you that you said their word, show them your QR. You're out!</li>
              </ul>
            </section>
          ) : (
            <>
              <p className="whisper-hint">🤫 Got someone? Tell them <b>secretly</b> before you steal!</p>
              <section className="action-buttons">
                <button type="button" className="btn btn-green btn-xl" onClick={() => setScanning(true)}>
                  📷 They said my word!
                  <small>Scan their QR or type their code</small>
                </button>
                <button type="button" className="btn btn-pink btn-xl" onClick={() => setShowQr(true)}>
                  😱 I said their word…
                  <small>Show my QR and code</small>
                </button>
              </section>
              <section className="card">
                <h3>🏁 {plural(activeCount, 'thief', 'thieves')} still in</h3>
                <div className="scroll-list">
                  <Leaderboard players={state.players} highlightId={me.id} showCounts={false} />
                </div>
              </section>
            </>
          )}
        </>
      )}

      {scanning && (
        <Modal onClose={() => setScanning(false)}>
          <StealPanel
            onScan={(data) => steal(() => parsePlayerQr(data, id))}
            onCode={(code) => steal(() => code, { keepOpenOnError: true })}
            onCancel={() => setScanning(false)}
          />
        </Modal>
      )}
      {showQr && (
        <Modal onClose={() => setShowQr(false)} className="qr-modal">
          <h2>Busted? 😅</h2>
          <p className="muted">Let the thief scan this. Your words go to them.</p>
          <QR value={playerQrValue(id, me.code)} size={Math.min(window.innerWidth - 100, 300)} label={`${me.avatar} ${me.name}`} />
          <p className="muted small">Camera not working? Show them this code (don't say it out loud!):</p>
          <p className="capture-code" aria-label="Your capture code">
            {me.code}
          </p>
        </Modal>
      )}
      {stolen && (
        <Modal onClose={() => setStolen(null)} className="text-center">
          <div className="big-emoji wiggle">💰</div>
          <h2>You stole {plural(stolen.count, 'word')}!</h2>
          <p>
            <b>{stolen.target.name}</b> is out of the game 👻
          </p>
          <p className="stolen-total">
            🦹 Stolen so far: <b>{me.wordCount - 1}</b>
          </p>
          <p className="muted">Your secret word stays the same. Go get the next one!</p>
          <button type="button" className="btn btn-primary btn-block" onClick={() => setStolen(null)}>
            Keep stealing 🦹
          </button>
        </Modal>
      )}
    </div>
  );
}

function MeCard({ id, token, me, onUpdated }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(me.name);
  const [avatar, setAvatar] = useState(me.avatar);
  const [saving, setSaving] = useState(false);

  function startEditing() {
    setName(me.name);
    setAvatar(me.avatar);
    setEditing(true);
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await request('player:update', { gameId: id, token, name, avatar });
      onUpdated(res.me);
      setEditing(false);
      toast({ emoji: res.me.avatar, text: `Looking good, ${res.me.name}!`, tone: 'success' });
    } catch (err) {
      play('error');
      toast({ emoji: '🙅', text: err.message, tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <section className="card me-card me-card-editing pop-in" style={{ '--c': me.color }}>
        <form className="profile-form" onSubmit={save}>
          <div className="profile-row">
            <Avatar player={{ ...me, avatar }} size={72} />
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_NAME_LENGTH}
              aria-label="Your name"
              required
            />
          </div>
          <p className="label">Pick your avatar</p>
          <div className="avatar-picker" role="radiogroup" aria-label="Avatar">
            {AVATAR_CHOICES.map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={a === avatar}
                aria-label={`Avatar ${a}`}
                className={`avatar-choice ${a === avatar ? 'avatar-choice-on' : ''}`}
                onClick={() => setAvatar(a)}
              >
                {a}
              </button>
            ))}
          </div>
          <div className="row">
            <button type="submit" className="btn btn-green" disabled={saving || !name.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      </section>
    );
  }

  return (
    <section className="card me-card pop-in" style={{ '--c': me.color }}>
      <Avatar player={me} size={72} />
      <div className="me-info">
        <h2>
          {me.name}
          <button
            type="button"
            className="icon-btn icon-btn-sm"
            aria-label="Change your name and avatar"
            title="Change your name and avatar"
            onClick={startEditing}
          >
            ✏️
          </button>
        </h2>
        <span className="pill pill-dark">🦹 {plural(me.wordCount - 1, 'word')} stolen</span>
      </div>
    </section>
  );
}

function StealPanel({ onScan, onCode, onCancel }) {
  const [mode, setMode] = useState('scan');
  const [code, setCode] = useState('');
  return (
    <>
      <h2>Steal their words 🦹</h2>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'scan'} className={mode === 'scan' ? 'tab-on' : ''} onClick={() => setMode('scan')}>
          📷 Scan QR
        </button>
        <button type="button" role="tab" aria-selected={mode === 'type'} className={mode === 'type' ? 'tab-on' : ''} onClick={() => setMode('type')}>
          ⌨️ Type code
        </button>
      </div>
      {mode === 'scan' ? (
        <Scanner onResult={onScan} onCancel={onCancel} />
      ) : (
        <form
          className="type-code"
          onSubmit={(e) => {
            e.preventDefault();
            onCode(code);
          }}
        >
          <p className="muted">Type the code shown under their QR</p>
          <input
            className="input input-lg code-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            maxLength={8}
            autoCapitalize="characters"
            autoComplete="off"
            autoFocus
            aria-label="Player code"
          />
          <button type="submit" className="btn btn-green btn-lg btn-block" disabled={code.replace(/[^A-Za-z0-9]/g, '').length < CAPTURE_CODE_LENGTH}>
            🦹 Steal!
          </button>
        </form>
      )}
    </>
  );
}

function WordVault({ word }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <section className={`card vault ${revealed ? 'vault-open' : ''}`}>
      <div className="vault-head">
        <h3>🤫 Your secret word</h3>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setRevealed((r) => !r)}>
          {revealed ? '🙈 Hide' : '👀 Peek'}
        </button>
      </div>
      <div className="word-cloud" onClick={() => setRevealed((r) => !r)}>
        <span className="word-chip">{revealed ? word : '•'.repeat(Math.min(word.length, 8))}</span>
      </div>
      <p className="muted small">Make someone say it, tell them secretly, then scan their QR or type their code!</p>
    </section>
  );
}

function CaughtView({ me, capturer, state }) {
  return (
    <>
      <section className="card text-center caught pop-in">
        <div className="big-emoji shake">😵</div>
        <h1 className="shout">BUSTED!</h1>
        <p>
          <b>{capturer?.name ?? 'Someone'}</b> got you to say their word and took all your words.
        </p>
        <p className="muted">You're a ghost now 👻 Stick around and watch the chaos!</p>
      </section>
      <section className="card">
        <h3>👀 Who's still in</h3>
        <div className="scroll-list">
          <Leaderboard players={state.players} highlightId={me.id} showCounts={false} />
        </div>
      </section>
    </>
  );
}

function FinishedView({ me, state }) {
  const won = state.winner?.id === me.id;
  const myWords = state.players.find((p) => p.id === me.id)?.words ?? [];
  const timeUp = state.events.some((e) => e.type === 'finish' && e.reason === 'time');
  return (
    <>
      <section className="card text-center pop-in">
        {timeUp && <p className="pill pill-urgent">⏰ Time's up!</p>}
        {won ? (
          <>
            <div className="big-emoji wiggle">🏆</div>
            <h1 className="shout">YOU WON!</h1>
            <p>You're the ultimate Word Thief with {plural(myWords.length, 'word')}!</p>
            <div className="word-cloud">
              {myWords.map((w) => (
                <span key={w} className="word-chip">{w}</span>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="big-emoji">🏁</div>
            <h1 className="shout">Game over!</h1>
            <p>{state.winner ? <><b>{state.winner.name}</b> is the ultimate Word Thief 🏆</> : "It's a tie!"}</p>
          </>
        )}
      </section>
      <section className="card">
        <h3>📜 Final standings: words stolen</h3>
        <FinalStandings state={state} highlightId={me.id} />
      </section>
    </>
  );
}
