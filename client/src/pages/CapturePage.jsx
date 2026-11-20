import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FullPageMessage } from '../components/ui.jsx';
import { request } from '../socket.js';
import { storage } from '../storage.js';

/** Opened when a player scans someone's QR with the phone's own camera app instead of the in-game scanner. */
export default function CapturePage() {
  const params = useParams();
  const id = params.gameId.toUpperCase();
  const navigate = useNavigate();
  const token = storage.getPlayerToken(id);
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    request('player:capture', { gameId: id, token, code: params.code })
      .then(({ count, target }) => navigate(`/play/${id}`, { replace: true, state: { stolen: { count, target } } }))
      .catch((e) => navigate(`/play/${id}`, { replace: true, state: { captureError: e.message } }));
  }, [id, token, params.code, navigate]);

  if (!token) {
    return (
      <FullPageMessage emoji="🕵️" title="That's a player's secret QR!">
        <p>Only players in this game can steal with it. Join the game first, then scan from inside Word Thief.</p>
        <a className="btn btn-primary" href={`/join/${id}`}>Join game #{id}</a>
      </FullPageMessage>
    );
  }
  return <FullPageMessage emoji="🦹" title="Stealing words…" />;
}
