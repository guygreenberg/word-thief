import { io } from 'socket.io-client';

export const socket = io({ transports: ['websocket', 'polling'] });

export function request(event, payload = {}) {
  return new Promise((resolve, reject) => {
    socket.timeout(10_000).emit(event, payload, (err, res) => {
      if (err) return reject(new Error('Connection problem. Please try again.'));
      if (!res.ok) return reject(Object.assign(new Error(res.error), { code: res.errorCode }));
      resolve(res);
    });
  });
}

/** Runs `subscribe` now (if connected) and after every reconnect, since socket rooms are lost on disconnect. */
export function onEveryConnect(subscribe) {
  if (socket.connected) subscribe();
  socket.on('connect', subscribe);
  return () => socket.off('connect', subscribe);
}
