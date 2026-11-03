const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const MAX = 6;
const rooms = {}; // 방코드 -> { players, mic, helperAt }

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const num = (v, lim) => Math.max(-lim, Math.min(lim, Number(v) || 0));

io.on('connection', (s) => {
  let room = null;
  const cur = () => room && rooms[room];

  s.on('join', ({ name, room: r } = {}) => {
    if (room) return;
    r = String(r || '노래방').slice(0, 20);
    name = String(name || '익명').slice(0, 10);
    const R = rooms[r] || (rooms[r] = { players: {}, mic: null, helperAt: 0 });
    if (Object.keys(R.players).length >= MAX) return s.emit('full');
    const used = new Set(Object.values(R.players).map((p) => p.color));
    let color = 0;
    while (used.has(color)) color++;
    const p = { id: s.id, name, color, x: (Math.random() - 0.5) * 6, z: 3 + Math.random() * 2, ry: 0 };
    R.players[s.id] = p;
    room = r;
    s.join(r);
    s.emit('init', { id: s.id, players: Object.values(R.players), mic: R.mic });
    s.to(r).emit('join', p);
  });

  s.on('move', (m = {}) => {
    const R = cur();
    if (!R) return;
    const p = R.players[s.id];
    p.x = num(m.x, 9.5);
    p.z = num(m.z, 7.5);
    p.ry = num(m.ry, 7);
    s.to(room).emit('move', { id: s.id, x: p.x, z: p.z, ry: p.ry });
  });

  s.on('chat', (text) => {
    if (!cur()) return;
    text = String(text || '').trim().slice(0, 120);
    if (text) io.to(room).emit('chat', { id: s.id, text });
  });

  s.on('emote', (type) => {
    if (!cur()) return;
    io.to(room).emit('emote', { id: s.id, type: type === 'clap' ? 'clap' : 'tmb' });
  });

  s.on('mic', () => {
    const R = cur();
    if (!R) return;
    if (R.mic === null) {
      R.mic = s.id;
      io.to(room).emit('mic', { id: s.id });
    } else if (R.mic === s.id) {
      R.mic = null;
      io.to(room).emit('mic', { id: null });
      io.to(room).emit('score', { id: s.id, score: 60 + Math.floor(Math.random() * 41) });
    }
  });

  s.on('helper', () => {
    const R = cur();
    if (!R || Date.now() - R.helperAt < 12000) return; // 12초 쿨타임
    R.helperAt = Date.now();
    io.to(room).emit('helper', { id: s.id });
  });

  s.on('disconnect', () => {
    const R = cur();
    if (!R) return;
    delete R.players[s.id];
    if (R.mic === s.id) {
      R.mic = null;
      io.to(room).emit('mic', { id: null });
    }
    io.to(room).emit('leave', s.id);
    if (!Object.keys(R.players).length) delete rooms[room];
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('노래방 서버 실행중: http://localhost:' + PORT));
