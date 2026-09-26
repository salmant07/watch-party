const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// roomCode -> Set of socket ids currently in that room (max 2)
const rooms = {};

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing chars (0/O, 1/I)
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

io.on('connection', (socket) => {
  // Create a new room, return its code to the creator
  socket.on('create-room', (callback) => {
    let code;
    do {
      code = generateRoomCode();
    } while (rooms[code]);

    rooms[code] = new Set([socket.id]);
    socket.join(code);
    socket.roomCode = code;
    socket.isHost = true;
    callback({ ok: true, roomCode: code });
  });

  // Join an existing room by code
  socket.on('join-room', (rawCode, callback) => {
    const code = (rawCode || '').toUpperCase().trim();
    const room = rooms[code];

    if (!room) {
      callback({ ok: false, error: 'Room not found. Check the code and try again.' });
      return;
    }
    if (room.size >= 2) {
      callback({ ok: false, error: 'That room already has two people in it.' });
      return;
    }

    room.add(socket.id);
    socket.join(code);
    socket.roomCode = code;
    socket.isHost = false;
    callback({ ok: true, roomCode: code });

    // Tell the other person in the room someone joined, so they can start the call
    socket.to(code).emit('peer-joined');
  });

  // WebRTC signaling relay (offer/answer/ICE candidates) — passed through untouched
  socket.on('signal', (data) => {
    if (socket.roomCode) {
      socket.to(socket.roomCode).emit('signal', data);
    }
  });

  // Movie playback sync (play / pause / seek) — relay to the other person in the room
  socket.on('video-sync', (data) => {
    if (socket.roomCode) {
      socket.to(socket.roomCode).emit('video-sync', data);
    }
  });

  // Mic/camera on-off state, so the other side can show an accurate icon
  socket.on('media-state', (data) => {
    if (socket.roomCode) {
      socket.to(socket.roomCode).emit('media-state', data);
    }
  });

  // Optional: let a newly connected peer ask "what's the current playback position?"
  socket.on('request-sync-state', () => {
    if (socket.roomCode) {
      socket.to(socket.roomCode).emit('request-sync-state');
    }
  });

  socket.on('disconnect', () => {
    const code = socket.roomCode;
    if (code && rooms[code]) {
      rooms[code].delete(socket.id);
      socket.to(code).emit('peer-left');
      if (rooms[code].size === 0) {
        delete rooms[code];
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Watch Party server running on port ${PORT}`);
});
