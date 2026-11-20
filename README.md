# 🦹 Word Thief

A real-life party game played on phones. Every player gets a secret everyday word. Get other
players to **say your word out loud**, then scan their QR code to steal **all** their words.
They're out. The last thief standing, holding every word in the game, wins.

- **Host / admin**: web dashboard (laptop or phone) with a join QR, live leaderboard, undo, and end game.
- **Presentation board**: full-screen view for a TV or projector showing who is still in and who is out (no word counts, so the room can't tell who is leading), steal animations, and a winner screen.
- **Host score board**: host-only full-screen view with every player's word count, sorted from high to low.
- **Players**: mobile web app (no install). Join by scanning a QR, see your secret words, scan a QR or type a code to steal, change your name, and rejoin by name if you lose the page.
- 3 to 300 players per game, real-time over WebSockets, with synthesized sound effects, confetti, and vibration.

## How a game runs

1. Host opens the site and clicks **Host a new game**. The dashboard shows a join QR. Click
   **Present board** to open the big-screen view.
2. Players scan the QR, enter a name, and get a random word plus their own player QR.
3. Once 3 or more players have joined, the host clicks **Start game**.
4. When player A makes player B say A's word, A tells B **secretly** (whisper or step aside) so the
   other players don't learn A's word. B taps **"I said their word…"** to show their QR and a short
   code, and A taps **"They said my word!"** to scan the QR or type the code. B's words move to A and
   B is out. Scanning with the phone's normal camera app also works.
5. The game ends automatically when one player holds every word. The host can also end it early;
   the player with the most words wins.

The host can **undo the last steal** (for disputes or mis-scans) and remove players before the game starts.

Names are unique within a game (case-insensitive). A player who closes the browser or switches phones
scans the game QR again and types their original name to get back in, even after the game started.
Players can rename themselves at any time with the ✏️ button.

## Tech

| Part     | Stack                                                                 |
| -------- | --------------------------------------------------------------------- |
| Server   | Node.js, Express 5, Socket.io, in-memory game store (`server/`)       |
| Client   | React 19, React Router, Vite (`client/`)                              |
| QR       | `qrcode.react` (generate), `qr-scanner` (camera scan)                 |
| Effects  | Web Audio API synth sounds, `canvas-confetti`                         |

Security model: each player has a secret **token** (kept in the browser's localStorage) used to act,
and a separate 6-character **capture code** shown in their QR and on the "I said their word" screen.
Public IDs shown on the board can't be used to steal, and wrong codes are rate-limited (8 per minute)
to stop guessing. Words stay hidden from everyone else until the game ends. Rejoining needs only the
player's name, which keeps it easy at a party but means anyone who knows a name can take over that
player; the host sees every rejoin in the live feed. The admin key is kept in
localStorage. **Copy admin link** lets the host open the dashboard on another device.

## Run locally

Requires Node.js 20+.

```bash
npm install
npm run dev          # server on :3001 + Vite on http://localhost:5173
npm test             # game-rule tests
```

Phone cameras only work on HTTPS (or `localhost`). To test with real phones on your Wi-Fi, run
`npm run dev:https`, open `https://<your-laptop-ip>:5173` on the phones, and accept the self-signed
certificate warning.

Production build:

```bash
npm run build && npm start   # serves the app + sockets on $PORT (default 3001)
```

## Deploy to the cloud

The app is a single container (`Dockerfile`) that serves both the UI and the WebSocket server.
Any host with WebSocket support and HTTPS works:

- **Render**: push to GitHub, then *New + → Blueprint* and pick the repo (uses `render.yaml`).
- **Railway / Fly.io / Google Cloud Run / Azure Container Apps**: deploy the `Dockerfile`; the app
  listens on `$PORT`. On Cloud Run, enable session affinity.

Keep it to **one instance**: game state is held in memory, so games are lost on restart and can't be
shared across replicas. Games are cleaned up after 12 hours of inactivity. To scale out or survive
restarts later, move `GameStore` to Redis and add the Socket.io Redis adapter.
