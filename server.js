const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const MAX = 6;        
const MAXD = 8;       
const HSLOTS = 4;     
const ACTS = ['clap', 'tmb', 'smoke', 'pour', 'drink', 'water', 'dance', 'hug', 'slap', 'burn', 'stop'];
const TARGETED = ['hug', 'slap', 'burn'];
const rooms = {}; 

const LINES = {
  f: [
    '오빠~ 오늘 왜 이렇게 멋있어요~?',
    '자~ 한잔 받으세요 오빠~ 🥃',
    '어머~ 노래 너무 잘하시네~ 👏',
    '{name}님~ 한 곡만 불러주세요~ 네에~?',
    '건배~! 원샷 가요 원샷~!',
    '오빠 안주도 좀 드세요~ 속 버려요~',
    '어머 목소리 좋으시다~ 가수 하셔야겠어요~',
    '술 떨어지면 말씀하세요~ 바로 따라드릴게요~',
    '{name}님 오늘 완전 스타네~ ✨',
    '오빠 얼굴 빨개졌어~ 귀여워~ 😘',
    '우리 건배 한번 해요~ 짠~!',
    '오늘 기분 좋은 일 있으셨어요~?',
    '{name}님 옆에 앉아도 돼요~?',
    '어머~ 오늘 분위기 완전 좋다~ 💕',
    '사장님~ 오늘은 제가 서비스 많이 드릴게요~',
    '노래 한 곡 더! 한 곡 더! 👏👏',
  ],
  m: [
    '형님~ 한잔 받으십쇼!',
    '사장님 오늘 컨디션 최고십니다!',
    '{name} 형님~ 노래 한 곡 땡기셔야죠~!',
    '자~ 원샷 갑니다 형님!',
    '와~ 형님 가수 하셔야겠는데요?',
    '안주 좀 드시면서 하세요 형님~',
    '{name}님 오늘 분위기 메이커십니다!',
    '술 떨어지셨네~ 제가 따라드리겠습니다!',
    '형님 어디 가세요~ 한 잔 더 하셔야죠~',
    '{name} 형님~ 건배 한번 하시죠! 짠!',
    '캬~ 형님 목소리 죽이는데요!',
    '오늘 제가 확실하게 모시겠습니다 형님!',
    '한 곡 더! 한 곡 더! 👏👏',
    '사장님 오늘 완전 멋지십니다~ 😎',
  ],
};

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const num = (v, lim) => Math.max(-lim, Math.min(lim, Number(v) || 0));

io.on('connection', (s) => {
  let room = null;
  const cur = () => room && rooms[room];

  s.on('join', ({ name, room: r, gender } = {}) => {
    if (room) return;
    r = String(r || '노래방').slice(0, 20);
    name = String(name || '익명').slice(0, 10);
    gender = gender === 'f' ? 'f' : 'm';
    const R = rooms[r] || (rooms[r] = { players: {}, mic: null, helperAt: 0, helpers: [], hid: 0 });
    if (Object.keys(R.players).length >= MAX) return s.emit('full');
    const used = new Set(Object.values(R.players).map((p) => p.color));
    let color = 0;
    while (used.has(color)) color++;
    const p = {
      id: s.id, name, gender, color,
      x: (Math.random() - 0.5) * 3, z: -4.8 + Math.random() * 1.6, ry: 0,
      seat: null, drunk: 0,
    };
    R.players[s.id] = p;
    room = r;
    s.join(r);
    s.emit('init', { id: s.id, players: Object.values(R.players), mic: R.mic, helpers: R.helpers });
    s.to(r).emit('join', p);
  });

  s.on('move', (m = {}) => {
    const R = cur();
    if (!R) return;
    const p = R.players[s.id];
    if (!p || p.seat !== null) return; 
    p.x = num(m.x, 4);
    p.z = num(m.z, 5.5);
    p.ry = num(m.ry, 7);
    s.to(room).emit('move', { id: s.id, x: p.x, z: p.z, ry: p.ry });
  });

  s.on('chat', (text) => {
    if (!cur()) return;
    text = String(text || '').trim().slice(0, 120);
    if (text) io.to(room).emit('chat', { id: s.id, text });
  });

  s.on('emote', (e) => {
    const R = cur();
    if (!R) return;
    const type = typeof e === 'string' ? e : e && e.type;
    if (!ACTS.includes(type)) return;
    const p = R.players[s.id];
    if (!p) return;
    const out = { id: s.id, type };
    
    // 도우미도 타겟팅 가능하도록 수정
    if (TARGETED.includes(type)) {
      let t = R.players[e && e.target] || R.helpers.find(h => h.id === (e && e.target));
      if (!t || t.id === s.id) return;
      
      // 대상이 유저인데 앉아있다면 실패. (도우미는 앉을 일이 없으므로 seat 체크 무시)
      if (p.seat !== null || (t.seat !== undefined && t.seat !== null)) return;
      
      out.target = t.id;
    }
    
    if (type === 'dance' && p.seat !== null) return;
    io.to(room).emit('emote', out);
    if (type === 'drink') {
      p.drunk = Math.min(MAXD, p.drunk + 1);
      io.to(room).emit('drunk', { id: s.id, level: p.drunk });
    } else if (type === 'water') {
      p.drunk = 0; 
      io.to(room).emit('drunk', { id: s.id, level: 0 });
    }
  });

  s.on('sit', (m = {}) => {
    const R = cur();
    if (!R) return;
    const p = R.players[s.id];
    if (!p) return;
    if (m.seat === null || m.seat === undefined) {
      p.seat = null;
    } else {
      const seat = Number(m.seat);
      if (!Number.isInteger(seat) || seat < 0 || seat > 40) return;
      if (Object.values(R.players).some((q) => q.id !== s.id && q.seat === seat)) return s.emit('sitfail');
      p.seat = seat;
    }
    p.x = num(m.x, 4);
    p.z = num(m.z, 5.5);
    p.ry = num(m.ry, 7);
    s.to(room).emit('sit', { id: s.id, seat: p.seat, x: p.x, z: p.z, ry: p.ry });
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

  s.on('helper', (g) => {
    const R = cur();
    if (!R || Date.now() - R.helperAt < 3000) return;
    if (R.helpers.length >= HSLOTS) return s.emit('notice', '도우미 자리가 꽉 찼어요! (최대 ' + HSLOTS + '명)');
    const used = new Set(R.helpers.map((h) => h.spot));
    let spot = 0;
    while (used.has(spot)) spot++;
    const h = { id: 'h' + ++R.hid, gender: g === 'm' ? 'm' : 'f', spot };
    R.helpers.push(h);
    R.helperAt = Date.now();
    io.to(room).emit('helper', Object.assign({ by: s.id }, h));
  });

  s.on('helperBye', () => {
    const R = cur();
    if (!R) return;
    if (!R.helpers.length) return s.emit('notice', '내보낼 도우미가 없어요');
    const h = R.helpers.shift();
    io.to(room).emit('helperLeave', { id: h.id, by: s.id });
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

setInterval(() => {
  for (const k in rooms) {
    const R = rooms[k];
    if (!R.helpers.length || Math.random() < 0.35) continue;
    const h = R.helpers[Math.floor(Math.random() * R.helpers.length)];
    const L = LINES[h.gender];
    const ps = Object.values(R.players);
    const text = L[Math.floor(Math.random() * L.length)].replace(
      '{name}',
      ps.length ? ps[Math.floor(Math.random() * ps.length)].name : '손님'
    );
    io.to(k).emit('helperSay', { id: h.id, text });
  }
}, 6000);

setInterval(() => {
  for (const k in rooms) {
    const R = rooms[k];
    for (const id in R.players) {
      const p = R.players[id];
      if (p.drunk > 0) {
        p.drunk--;
        io.to(k).emit('drunk', { id, level: p.drunk });
      }
    }
  }
}, 20000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('노래방 서버 실행중: http://localhost:' + PORT));