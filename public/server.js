/**
 * ╔══════════════════════════════════════════════╗
 * ║   MAYA — Multiplayer Game Server v2.0        ║
 * ║   Node.js + Socket.IO + Express              ║
 * ║   Games: Şişe (Bottle Spin), UNO, Ludo,     ║
 * ║          Domino, Film Bilgisi, Dama          ║
 * ╚══════════════════════════════════════════════╝
 *
 * Install:
 *   npm install express socket.io cors uuid
 *
 * Run:
 *   node server.js
 *   (or: PORT=3000 node server.js)
 */

'use strict';

const express   = require('express');
const http      = require('http');
const { Server }= require('socket.io');
const cors      = require('cors');
const path      = require('path');
const { v4: uuidv4 } = require('uuid');

/* ════════════════════════════════════════════════
   CONFIG
════════════════════════════════════════════════ */
const PORT       = process.env.PORT || 3000;
const MAX_ROOMS  = 300;
const MAX_PLAYERS_PER_ROOM = 8;
const ROOM_IDLE_MS = 60 * 60 * 1000; // 1 hour
const MSG_HISTORY  = 80;

/* ════════════════════════════════════════════════
   CHALLENGE DATA — Şişe Çevirme
════════════════════════════════════════════════ */
const CHALLENGES = [
  // 🎤 Söylə
  { cat:'🎤', text:'Şəkər Qayığı Oxu', desc:'İstənilən bir şarkının ilk bəndini söylə', xp:20 },
  { cat:'🎤', text:'Nağılçı', desc:'Sür\'ətlə 30 saniyə ərzində nağıl danış', xp:25 },
  { cat:'🎤', text:'Animal Sounds', desc:'3 heyvan səsini tək-tək çıxar', xp:15 },
  { cat:'🎤', text:'Tərif Yağışı', desc:'Solundakı oyunçuya 5 tərif söylə', xp:20 },
  { cat:'🎤', text:'Sür\'ətli Sayma', desc:'1-dən 30-a kimi əliflə say', xp:10 },

  // 💪 Hərəkət
  { cat:'💪', text:'10 Şıllaq', desc:'10 dənə mükəmməl şıllaq vur', xp:30 },
  { cat:'💪', text:'Plank', desc:'30 saniyə plankda dur', xp:35 },
  { cat:'💪', text:'Robot Rəqsi', desc:'10 saniyə robot kimi rəqs et', xp:20 },
  { cat:'💪', text:'Balanslı Poza', desc:'1 ayaq üstündə 15 saniyə dur', xp:25 },
  { cat:'💪', text:'Squat', desc:'15 dənə squat et', xp:30 },

  // 🧠 Zeka
  { cat:'🧠', text:'Palindrom', desc:'3 palindrom söz söylə (aynalı sözlər)', xp:30 },
  { cat:'🧠', text:'Azərbaycan Paytaxtı', desc:'5 ölkənin paytaxtını düzgün söylə', xp:25 },
  { cat:'🧠', text:'Sür\'ətli Hesab', desc:'12 × 7 = ? (cəld cavabla!)', xp:20 },
  { cat:'🧠', text:'Antonimlər', desc:'3 sözün antonimlərini söylə', xp:25 },
  { cat:'🧠', text:'Şair Kim?', desc:'"Vətən hər yerdədir, vətən hər bizdə" — kim deyib?', xp:30 },

  // 🎭 Aktyor
  { cat:'🎭', text:'Heyvan Ol', desc:'30 saniyə seçdiyin heyvanı canlandır', xp:25 },
  { cat:'🎭', text:'Mimika', desc:'3 duyğunu sözsüz mimikayla göstər', xp:20 },
  { cat:'🎭', text:'Sessiz Film', desc:'Hər hansı bir fəaliyyəti sözsüz göstər, digərləri tapıb', xp:30 },
  { cat:'🎭', text:'Dublyor', desc:'Komandadan birinin səsini taklit et', xp:35 },
  { cat:'🎭', text:'Şair Poz', desc:'Dramatik şair pozu al və 10 saniyə dayan', xp:15 },

  // 😂 Fun
  { cat:'😂', text:'5 Zarafat', desc:'Üst üstə 5 zarafat söylə', xp:25 },
  { cat:'😂', text:'Dilinə Bax', desc:'"Peter Piper picked a peck" — 3 dəfə art-art söylə', xp:20 },
  { cat:'😂', text:'Gülüş', desc:'45 saniyə gülüşü saxla, kimse güldürə bilməz', xp:30 },
  { cat:'😂', text:'Kompliment Yağışı', desc:'Sağındakı oyunçuya 3 gözlənilməz kompliment ver', xp:20 },
  { cat:'😂', text:'Əl Beyin', desc:'Hər iki əlinlə eyni vaxtda fərqli şəkil çək', xp:25 },

  // 🍀 Şans
  { cat:'🍀', text:'Sikkə Seçimi', desc:'Digərləri ya ya xəyır seçir — tapırsa azad, tapılmazsa ikiqat', xp:20 },
  { cat:'🍀', text:'İki Həqiqət Bir Yalan', desc:'2 həqiqət 1 yalan söylə, digərləri yalan tapıb', xp:30 },
  { cat:'🍀', text:'Gizli Rəqəm', desc:'1-10 arası düşün, digərləri 3 cəhddə tapmaya çalışır', xp:25 },
  { cat:'🍀', text:'Zəng Eti', desc:'Kontaktlar siyahısından 3-cü nəfəri zəng et (ya da öz yaratdığın)', xp:40 },
  { cat:'🍀', text:'Birini Seç', desc:'Otaqdakı hər kəs seni suala cavab verir — sən seçirsən kimi', xp:30 },
];

function randChallenge() {
  return CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
}

/* ════════════════════════════════════════════════
   UNO DATA
════════════════════════════════════════════════ */
const UNO_COLORS  = ['red','green','blue','yellow'];
const UNO_VALUES  = ['0','1','2','3','4','5','6','7','8','9','skip','reverse','+2'];
const UNO_SPECIAL = ['wild','wild+4'];

function buildUnoDeck() {
  const deck = [];
  UNO_COLORS.forEach(c => {
    UNO_VALUES.forEach(v => {
      deck.push({ c, v, id: uuidv4() });
      if (v !== '0') deck.push({ c, v, id: uuidv4() });
    });
  });
  UNO_SPECIAL.forEach(v => {
    for (let i = 0; i < 4; i++) deck.push({ c: 'wild', v, id: uuidv4() });
  });
  return shuffle(deck);
}

/* ════════════════════════════════════════════════
   LUDO DATA
════════════════════════════════════════════════ */
function buildLudoState(playerIds) {
  const colors = ['red','green','yellow','blue'];
  const pieces = {};
  playerIds.forEach((id, i) => {
    const col = colors[i % 4];
    pieces[id] = { color: col, tokens: [-1,-1,-1,-1] }; // -1 = home
  });
  return {
    board: {},
    pieces,
    turn: playerIds[0],
    dice: null,
    rolled: false,
    finished: [],
  };
}

/* ════════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════════ */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function genCode(len = 5) {
  return Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g,'').substring(0, len).padEnd(len, '0');
}

function colorFor(id) {
  const PALETTE = ['#ff6b35','#ff3d71','#00c8ff','#2ed573','#a29bfe','#fd79a8','#fdcb6e','#00b894'];
  let h = 0;
  for (const c of String(id)) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

/* ════════════════════════════════════════════════
   IN-MEMORY STORE
════════════════════════════════════════════════ */
const users = new Map();    // socketId → user
const rooms = new Map();    // roomId  → room
const userRoom = new Map(); // socketId → roomId

function getRoom(id) { return rooms.get(id); }
function getRoomByCode(code) {
  for (const r of rooms.values()) if (r.code === code) return r;
  return null;
}

function cleanupRooms() {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (now - room.lastActivity > ROOM_IDLE_MS && room.players.length === 0) {
      rooms.delete(id);
    }
  }
}
setInterval(cleanupRooms, 10 * 60 * 1000);

/* ════════════════════════════════════════════════
   ROOM SNAPSHOT (safe to send to client)
════════════════════════════════════════════════ */
function roomSnapshot(room) {
  return {
    id: room.id,
    name: room.name,
    code: room.code,
    game: room.game,
    host: room.host,
    players: room.players.map(p => ({
      id: p.id,
      display_name: p.display_name,
      avatar: p.avatar,
      photo: p.photo,
      color: p.color,
      slot: p.slot,
      xp: p.xp,
      level: p.level,
      wins: p.wins,
    })),
    current_turn: room.current_turn,
    current_turn_slot: room.current_turn_slot,
    spin_in_progress: room.spin_in_progress,
    spin_target_slot: room.spin_target_slot,
    game_state: room.game_state,
    started: room.started,
  };
}

function broadcastState(room, io) {
  const snap = roomSnapshot(room);
  io.to(room.id).emit('state', { room: snap, players: snap.players });
}

/* ════════════════════════════════════════════════
   EXPRESS + STATIC
════════════════════════════════════════════════ */
const app  = express();
const srv  = http.createServer(app);
const io   = new Server(srv, {
  cors: { origin: '*', methods: ['GET','POST'] },
  maxHttpBufferSize: 2e6,
  pingTimeout: 30000,
  pingInterval: 10000,
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ── REST Endpoints ── */
app.get('/api/rooms', (req, res) => {
  const { game } = req.query;
  const list = [];
  for (const r of rooms.values()) {
    if (game && r.game !== game) continue;
    if (r.players.length >= MAX_PLAYERS_PER_ROOM) continue;
    list.push({
      id: r.id, code: r.code, name: r.name,
      game: r.game, players: r.players.length,
      max: MAX_PLAYERS_PER_ROOM,
      host_name: r.players[0]?.display_name || '?',
    });
  }
  res.json({ rooms: list.slice(0, 30) });
});

app.get('/api/leaderboard', (req, res) => {
  const all = [];
  for (const u of users.values()) {
    all.push({ id:u.id, display_name:u.display_name, avatar:u.avatar,
               photo:u.photo, xp:u.xp||0, level:u.level||1, wins:u.wins||0 });
  }
  all.sort((a, b) => b.xp - a.xp);
  res.json({ leaders: all.slice(0, 20) });
});

app.get('/health', (req, res) => res.json({ ok: true, rooms: rooms.size, users: users.size }));

/* Fallback — serve index.html */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ════════════════════════════════════════════════
   SOCKET.IO EVENTS
════════════════════════════════════════════════ */
io.on('connection', socket => {
  console.log(`[+] ${socket.id} connected`);

  /* ── AUTH ── */
  socket.on('auth', (data) => {
    const user = {
      socketId: socket.id,
      id: data.id || socket.id,
      display_name: data.display_name || 'Oyunçu',
      avatar: data.avatar || '👤',
      photo: data.photo || null,
      color: data.color || colorFor(data.id || socket.id),
      xp: data.xp || 0,
      level: data.level || 1,
      wins: data.wins || 0,
    };
    users.set(socket.id, user);
  });

  /* Legacy login (sise.html compat) */
  socket.on('login', (data, cb) => {
    const user = {
      socketId: socket.id,
      id: data.tg_id || socket.id,
      display_name: data.first_name || 'Oyunçu',
      avatar: '👤',
      photo: data.photo || null,
      color: colorFor(data.tg_id || socket.id),
      xp: 0, level: 1, wins: 0,
    };
    users.set(socket.id, user);
    if (cb) cb({ ok: true });
  });

  /* ── JOIN ROOM ── */
  socket.on('join_room', (data, cb) => {
    const user = users.get(socket.id);
    if (!user) { if (cb) cb({ e: 'Auth yoxdur' }); return; }

    let room = null;

    // Join by code
    if (data.code) {
      room = getRoomByCode(data.code.toUpperCase());
      if (!room) { if (cb) cb({ e: 'Otaq tapılmadı: #' + data.code }); return; }
    }
    // Join by room_id
    else if (data.room_id) {
      room = getRoom(data.room_id);
      if (!room) { if (cb) cb({ e: 'Otaq tapılmadı' }); return; }
    }
    // Auto-join: find room with same game type or create one
    else {
      const game = data.game || 'sise';
      for (const r of rooms.values()) {
        if (r.game === game && r.players.length < MAX_PLAYERS_PER_ROOM) { room = r; break; }
      }
      if (!room) {
        // Create new room
        room = createRoom({ name: user.display_name + "'in otağı", game, host: user.id });
      }
    }

    if (room.players.length >= MAX_PLAYERS_PER_ROOM) {
      if (cb) cb({ e: 'Otaq dolu' }); return;
    }

    // Remove from previous room
    leaveCurrentRoom(socket, io);

    // Assign slot
    const usedSlots = new Set(room.players.map(p => p.slot));
    let slot = 1;
    while (usedSlots.has(slot)) slot++;

    const player = { ...user, slot };
    room.players.push(player);
    room.lastActivity = Date.now();

    socket.join(room.id);
    userRoom.set(socket.id, room.id);

    // Send history
    socket.emit('history', room.messages);

    // Broadcast join message
    const joinMsg = { msg_type:'system', body:`${user.display_name} otağa qoşuldu 🎉` };
    room.messages.push(joinMsg);
    if (room.messages.length > MSG_HISTORY) room.messages.shift();
    io.to(room.id).emit('new_msg', joinMsg);

    // Update turn if needed
    if (!room.current_turn) {
      room.current_turn = user.id;
      room.current_turn_slot = slot;
    }

    broadcastState(room, io);

    if (cb) cb({ ok: true, room_id: room.id, code: room.code, slot, game: room.game });
    console.log(`[~] ${user.display_name} joined room ${room.code} (${room.game})`);
  });

  /* ── CREATE ROOM ── */
  socket.on('create_room', (data, cb) => {
    const user = users.get(socket.id);
    if (!user) { if (cb) cb({ e: 'Auth yoxdur' }); return; }
    if (rooms.size >= MAX_ROOMS) { if (cb) cb({ e: 'Server dolu' }); return; }

    const room = createRoom({
      name: data.name || user.display_name + "'in otağı",
      game: data.game || 'sise',
      host: user.id,
    });

    if (cb) cb({ ok: true, room_id: room.id, code: room.code, game: room.game });
  });

  /* ── LIST ROOMS ── */
  socket.on('list_rooms', (data, cb) => {
    const game = data?.game;
    const list = [];
    for (const r of rooms.values()) {
      if (game && r.game !== game) continue;
      if (r.players.length >= MAX_PLAYERS_PER_ROOM) continue;
      list.push({ id:r.id, code:r.code, name:r.name, game:r.game,
                  players:r.players.length, max:MAX_PLAYERS_PER_ROOM,
                  host_name: r.players[0]?.display_name || '?' });
    }
    if (cb) cb({ rooms: list.slice(0, 20) });
  });

  /* ── LEAVE ROOM ── */
  socket.on('leave_room', () => leaveCurrentRoom(socket, io));

  /* ── SET BOTTLE ── */
  socket.on('set_bottle', (data) => {
    const user = users.get(socket.id);
    const roomId = userRoom.get(socket.id);
    if (!user || !roomId) return;
    const room = getRoom(roomId);
    if (!room) return;
    const p = room.players.find(pl => pl.id === user.id);
    if (p) { p.bottle_id = data.bottle_id; }
    broadcastState(room, io);
  });

  /* ── SPIN (Şişe) ── */
  socket.on('spin', (data, cb) => {
    const user = users.get(socket.id);
    const roomId = userRoom.get(socket.id) || data?.room_id;
    if (!user || !roomId) return;
    const room = getRoom(roomId);
    if (!room || room.game !== 'sise') return;

    if (room.spin_in_progress) return;
    if (room.players.length < 2) return;

    const me = room.players.find(p => p.id === user.id);
    if (!me) return;
    if (room.current_turn !== user.id && room.current_turn_slot !== me.slot) return;

    room.spin_in_progress = true;
    room.lastActivity = Date.now();

    // Pick random target (not self)
    const others = room.players.filter(p => p.id !== user.id);
    const target = others[Math.floor(Math.random() * others.length)];

    const angle = 1080 + Math.floor(Math.random() * 2880);
    const challenge = randChallenge();

    room.spin_target_slot = target.slot;
    room.pending_challenge = { challenge, target, spinner: user, xp: challenge.xp };

    broadcastState(room, io);

    // Broadcast spin event with challenge data
    const spinData = {
      angle,
      challenge,
      target_name: target.display_name,
      target_slot: target.slot,
      spin_by: user.id,
      spin_by_name: user.display_name,
    };
    io.to(room.id).emit('spin', spinData);

    const sysMsg = { msg_type:'system', body:`🍾 ${user.display_name} şişəni fırlatdı → ${target.display_name}` };
    room.messages.push(sysMsg);
    if (room.messages.length > MSG_HISTORY) room.messages.shift();
    io.to(room.id).emit('new_msg', sysMsg);
  });

  /* ── CHALLENGE DONE ── */
  socket.on('challenge_done', (data, cb) => {
    const user = users.get(socket.id);
    const roomId = userRoom.get(socket.id) || data?.room_id;
    if (!user || !roomId) return;
    const room = getRoom(roomId);
    if (!room || !room.pending_challenge) return;

    const { challenge, target, spinner, xp } = room.pending_challenge;
    const done = !!data.done;

    // Award XP
    if (done) {
      const tp = room.players.find(p => p.id === target.id);
      if (tp) { tp.xp = (tp.xp || 0) + xp; tp.wins = (tp.wins || 0) + 1; tp.level = Math.floor((tp.xp || 0) / 100) + 1; }
      const up = users.get([...users.keys()].find(k => users.get(k).id === target.id));
      if (up) { up.xp = (up.xp || 0) + xp; up.wins = (up.wins || 0) + 1; }
    }

    // Next turn: advance to next player
    const idx = room.players.findIndex(p => p.id === spinner.id);
    const nextIdx = (idx + 1) % room.players.length;
    const nextPlayer = room.players[nextIdx];
    room.current_turn      = nextPlayer.id;
    room.current_turn_slot = nextPlayer.slot;
    room.spin_in_progress  = false;
    room.spin_target_slot  = null;
    room.pending_challenge = null;

    const resultData = { done, target_name: target.display_name, xp_gained: done ? xp : 0 };
    io.to(room.id).emit('challenge_result', resultData);

    const sysMsg = {
      msg_type: 'system',
      body: done
        ? `✅ ${target.display_name} görəvi tamamladı! +${xp} XP`
        : `❌ ${target.display_name} görəvdən keçdi`,
    };
    room.messages.push(sysMsg);
    if (room.messages.length > MSG_HISTORY) room.messages.shift();
    io.to(room.id).emit('new_msg', sysMsg);

    broadcastState(room, io);
    room.lastActivity = Date.now();
  });

  /* ════════════════════════════════════════════
     UNO EVENTS
  ════════════════════════════════════════════ */
  socket.on('uno_start', (data) => {
    const user = users.get(socket.id);
    const roomId = userRoom.get(socket.id);
    if (!user || !roomId) return;
    const room = getRoom(roomId);
    if (!room || room.game !== 'uno') return;
    if (room.players.length < 2) return;

    const deck = buildUnoDeck();
    const hands = {};
    room.players.forEach(p => {
      hands[p.id] = deck.splice(0, 7);
    });

    let topCard = deck.pop();
    while (topCard.c === 'wild') {
      deck.unshift(topCard);
      topCard = deck.pop();
    }

    room.game_state = {
      deck,
      hands,
      pile: [topCard],
      top: topCard,
      turn: room.players[0].id,
      direction: 1,
      drawn: false,
      wildColor: null,
    };

    room.players.forEach(p => {
      const sock = [...users.entries()].find(([sid, u]) => u.id === p.id)?.[0];
      if (sock) io.to(sock).emit('uno_hand', { hand: hands[p.id] });
    });

    io.to(room.id).emit('uno_start', { top: topCard, turn: room.game_state.turn });
    broadcastState(room, io);
  });

  socket.on('uno_play', (data, cb) => {
    const user = users.get(socket.id);
    const roomId = userRoom.get(socket.id);
    if (!user || !roomId) return;
    const room = getRoom(roomId);
    if (!room || !room.game_state || room.game !== 'uno') return;

    const gs = room.game_state;
    if (gs.turn !== user.id) { if (cb) cb({ e: 'Sıra sizin deyil' }); return; }

    const hand = gs.hands[user.id];
    const cardIdx = hand.findIndex(c => c.id === data.card_id);
    if (cardIdx === -1) { if (cb) cb({ e: 'Kart yoxdur' }); return; }

    const card = hand[cardIdx];
    const top  = gs.top;

    const canPlay = card.c === 'wild'
      || card.c === (gs.wildColor || top.c)
      || card.v === top.v;

    if (!canPlay) { if (cb) cb({ e: 'Bu kartı oyna bilməzsən' }); return; }

    hand.splice(cardIdx, 1);
    gs.pile.push(card);
    gs.top = card;
    gs.drawn = false;

    if (card.c === 'wild') gs.wildColor = data.color || 'red';
    else gs.wildColor = null;

    // Handle special cards
    let skip = false;
    if (card.v === 'skip') skip = true;
    if (card.v === 'reverse') gs.direction *= -1;
    if (card.v === '+2') {
      const nextId = nextTurnId(room, gs, 1);
      const nHand = gs.hands[nextId];
      nHand.push(...gs.deck.splice(0, 2));
      const nSock = [...users.entries()].find(([sid, u]) => u.id === nextId)?.[0];
      if (nSock) io.to(nSock).emit('uno_hand', { hand: nHand });
      skip = true;
    }
    if (card.v === 'wild+4') {
      const nextId = nextTurnId(room, gs, 1);
      const nHand = gs.hands[nextId];
      nHand.push(...gs.deck.splice(0, 4));
      const nSock = [...users.entries()].find(([sid, u]) => u.id === nextId)?.[0];
      if (nSock) io.to(nSock).emit('uno_hand', { hand: nHand });
      skip = true;
    }

    // Check win
    if (hand.length === 0) {
      io.to(room.id).emit('uno_end', { winner: user.id, winner_name: user.display_name });
      room.game_state = null;
      return;
    }

    gs.turn = nextTurnId(room, gs, skip ? 2 : 1);

    const update = {
      top: gs.top, turn: gs.turn, wildColor: gs.wildColor,
      played_by: user.id, played_name: user.display_name,
      card_counts: Object.fromEntries(Object.entries(gs.hands).map(([k,v]) => [k, v.length])),
    };

    io.to(room.id).emit('uno_update', update);
    const mySock = socket.id;
    io.to(mySock).emit('uno_hand', { hand });
    if (cb) cb({ ok: true });
  });

  socket.on('uno_draw', (data, cb) => {
    const user = users.get(socket.id);
    const roomId = userRoom.get(socket.id);
    if (!user || !roomId) return;
    const room = getRoom(roomId);
    if (!room || !room.game_state || room.game !== 'uno') return;
    const gs = room.game_state;
    if (gs.turn !== user.id) { if (cb) cb({ e: 'Sıra sizin deyil' }); return; }
    if (gs.drawn) { if (cb) cb({ e: 'Artıq kart götürdünüz' }); return; }

    if (gs.deck.length === 0) gs.deck = shuffle(gs.pile.splice(0, gs.pile.length - 1));
    const card = gs.deck.pop();
    if (!card) { if (cb) cb({ e: 'Deste bitdi' }); return; }

    gs.hands[user.id].push(card);
    gs.drawn = true;
    socket.emit('uno_hand', { hand: gs.hands[user.id] });

    io.to(room.id).emit('uno_update', {
      top: gs.top, turn: gs.turn,
      card_counts: Object.fromEntries(Object.entries(gs.hands).map(([k,v]) => [k, v.length])),
    });
    if (cb) cb({ ok: true, card });
  });

  function nextTurnId(room, gs, steps = 1) {
    const ids = room.players.map(p => p.id);
    const ci  = ids.indexOf(gs.turn);
    const ni  = ((ci + gs.direction * steps) % ids.length + ids.length) % ids.length;
    return ids[ni];
  }

  /* ════════════════════════════════════════════
     LUDO EVENTS
  ════════════════════════════════════════════ */
  socket.on('ludo_start', () => {
    const user = users.get(socket.id);
    const roomId = userRoom.get(socket.id);
    if (!user || !roomId) return;
    const room = getRoom(roomId);
    if (!room || room.game !== 'ludo') return;
    room.game_state = buildLudoState(room.players.map(p => p.id));
    io.to(room.id).emit('ludo_start', room.game_state);
    broadcastState(room, io);
  });

  socket.on('ludo_roll', (data, cb) => {
    const user = users.get(socket.id);
    const roomId = userRoom.get(socket.id);
    if (!user || !roomId) return;
    const room = getRoom(roomId);
    if (!room || !room.game_state || room.game !== 'ludo') return;
    const gs = room.game_state;
    if (gs.turn !== user.id) { if (cb) cb({ e: 'Sıra sizin deyil' }); return; }
    if (gs.rolled) { if (cb) cb({ e: 'Artıq atdınız' }); return; }

    const dice = Math.floor(Math.random() * 6) + 1;
    gs.dice  = dice;
    gs.rolled = true;

    io.to(room.id).emit('ludo_roll', { player: user.id, dice });
    if (cb) cb({ ok: true, dice });
  });

  socket.on('ludo_move', (data, cb) => {
    const user = users.get(socket.id);
    const roomId = userRoom.get(socket.id);
    if (!user || !roomId) return;
    const room = getRoom(roomId);
    if (!room || !room.game_state || room.game !== 'ludo') return;
    const gs = room.game_state;
    if (gs.turn !== user.id) { if (cb) cb({ e: 'Sıra sizin deyil' }); return; }

    const pieces = gs.pieces[user.id];
    const tokenIdx = data.token;
    if (tokenIdx < 0 || tokenIdx > 3) { if (cb) cb({ e: 'Yanlış token' }); return; }

    let pos = pieces.tokens[tokenIdx];
    if (pos === -1 && gs.dice !== 6) { if (cb) cb({ e: '6 atmadan çıxa bilməzsən' }); return; }
    if (pos === -1) pos = 0; else pos += gs.dice;
    if (pos > 56) pos = 56; // max

    pieces.tokens[tokenIdx] = pos;

    const allHome = pieces.tokens.every(t => t === 56);
    if (allHome) {
      gs.finished.push(user.id);
      io.to(room.id).emit('ludo_win', { player: user.id, name: user.display_name, position: gs.finished.length });
    }

    // Next turn
    const ids = room.players.map(p => p.id);
    const ni  = (ids.indexOf(user.id) + 1) % ids.length;
    gs.turn   = ids[ni];
    gs.rolled = false;
    gs.dice   = null;

    io.to(room.id).emit('ludo_update', { pieces: gs.pieces, turn: gs.turn });
    broadcastState(room, io);
    if (cb) cb({ ok: true });
  });

  /* ════════════════════════════════════════════
     DAMA (Checkers) EVENTS
  ════════════════════════════════════════════ */
  socket.on('dama_start', () => {
    const user = users.get(socket.id);
    const roomId = userRoom.get(socket.id);
    if (!user || !roomId) return;
    const room = getRoom(roomId);
    if (!room || room.game !== 'dama') return;

    const ids = room.players.slice(0, 2).map(p => p.id);
    room.game_state = buildDamaBoard(ids);
    io.to(room.id).emit('dama_start', room.game_state);
    broadcastState(room, io);
  });

  socket.on('dama_move', (data, cb) => {
    const user = users.get(socket.id);
    const roomId = userRoom.get(socket.id);
    if (!user || !roomId) return;
    const room = getRoom(roomId);
    if (!room || !room.game_state || room.game !== 'dama') return;
    const gs = room.game_state;
    if (gs.turn !== user.id) { if (cb) cb({ e: 'Sıra sizin deyil' }); return; }

    gs.board[data.to] = gs.board[data.from];
    delete gs.board[data.from];
    if (data.captured) delete gs.board[data.captured];

    const ids = Object.keys(gs.players);
    const ni  = (ids.indexOf(user.id) + 1) % ids.length;
    gs.turn   = ids[ni];

    io.to(room.id).emit('dama_update', { board: gs.board, turn: gs.turn });
    if (cb) cb({ ok: true });
  });

  function buildDamaBoard(ids) {
    const board = {};
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 === 1) board[`${r},${c}`] = { owner: ids[0], king: false };
      }
    }
    for (let r = 5; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 === 1) board[`${r},${c}`] = { owner: ids[1], king: false };
      }
    }
    return { board, turn: ids[1], players: { [ids[0]]: 'white', [ids[1]]: 'black' } };
  }

  /* ════════════════════════════════════════════
     FILM (Trivia) EVENTS
  ════════════════════════════════════════════ */
  const FILM_QUESTIONS = [
    { q:'Titanik filminin rejissoru kim idi?', opts:['James Cameron','Steven Spielberg','Christopher Nolan','Ridley Scott'], a:0 },
    { q:'Avatar filmi hansı ildə çıxdı?', opts:['2007','2008','2009','2010'], a:2 },
    { q:'The Dark Knight — hansı superhero filmidir?', opts:['Superman','Batman','Spider-Man','Iron Man'], a:1 },
    { q:'Lord of the Rings — original dil nədir?', opts:['İngilis','Elfs dili','Latın','Fransız'], a:0 },
    { q:'Forrest Gump kimdir?', opts:['Cəsur ürək','Gump ailəsi','Tom Hanks personajı','Brad Pitt personajı'], a:2 },
    { q:'Matrix filminin qəhrəmanı kimdir?', opts:['Morpheus','Neo','Trinity','Agent Smith'], a:1 },
    { q:'"Şir Padşah"da Simbanın atası kimdir?', opts:['Scar','Mufasa','Rafiki','Timon'], a:1 },
    { q:'Inception rejissoru kimdir?', opts:['Steven Spielberg','Michael Bay','Christopher Nolan','Ridley Scott'], a:2 },
    { q:'Harry Potter kitabını kim yazdı?', opts:['Tolkien','Rowling','Stephen King','George R.R. Martin'], a:1 },
    { q:'James Bond — hansı ölkənin casusu?', opts:['ABŞ','Rusiya','Britaniya','Fransa'], a:2 },
  ];

  socket.on('film_next', (data, cb) => {
    const user = users.get(socket.id);
    const roomId = userRoom.get(socket.id);
    if (!user || !roomId) return;
    const room = getRoom(roomId);
    if (!room || room.game !== 'film') return;

    if (!room.game_state) room.game_state = { qIndex: 0, scores: {} };
    const gs = room.game_state;
    const q  = FILM_QUESTIONS[gs.qIndex % FILM_QUESTIONS.length];

    io.to(room.id).emit('film_question', {
      index: gs.qIndex,
      question: q.q,
      options: q.opts,
      total: FILM_QUESTIONS.length,
    });
    gs._timeoutId = setTimeout(() => {
      io.to(room.id).emit('film_answered', { correct: q.a, scores: gs.scores });
      gs.qIndex++;
    }, 15000);

    if (cb) cb({ ok: true });
  });

  socket.on('film_answer', (data, cb) => {
    const user = users.get(socket.id);
    const roomId = userRoom.get(socket.id);
    if (!user || !roomId) return;
    const room = getRoom(roomId);
    if (!room || !room.game_state || room.game !== 'film') return;
    const gs = room.game_state;
    const q  = FILM_QUESTIONS[gs.qIndex % FILM_QUESTIONS.length];

    const correct = data.answer === q.a;
    if (correct) gs.scores[user.id] = (gs.scores[user.id] || 0) + 10;

    io.to(room.id).emit('film_answer', {
      player: user.id, name: user.display_name, answer: data.answer, correct,
    });

    if (cb) cb({ ok: true, correct });
  });

  /* ════════════════════════════════════════════
     MESSAGES
  ════════════════════════════════════════════ */
  socket.on('msg', (data, cb) => {
    const user = users.get(socket.id);
    const roomId = userRoom.get(socket.id) || data?.room_id;
    if (!user || !roomId) return;
    const room = getRoom(roomId);
    if (!room) return;

    const text = String(data.text || '').trim().slice(0, 400);
    if (!text) return;

    const msg = {
      msg_type: 'chat',
      body: text,
      username: user.display_name,
      name: user.display_name,
      uid: user.id,
      photo_url: user.photo,
      name_color: user.color,
      ts: Date.now(),
    };
    room.messages.push(msg);
    if (room.messages.length > MSG_HISTORY) room.messages.shift();
    io.to(room.id).emit('new_msg', msg);
    if (cb) cb({ ok: true });
  });

  /* ── REACTION ── */
  socket.on('reaction', (data) => {
    const roomId = userRoom.get(socket.id) || data?.room_id;
    if (!roomId) return;
    io.to(roomId).emit('reaction', { emoji: data.emoji });
  });

  /* ── UPDATE PROFILE ── */
  socket.on('update_profile', (data) => {
    const user = users.get(socket.id);
    if (!user) return;
    if (data.display_name) user.display_name = String(data.display_name).slice(0, 30);
    if (data.avatar) user.avatar = data.avatar;
    if (data.photo !== undefined) user.photo = data.photo;
    if (data.bio !== undefined) user.bio = data.bio;

    const roomId = userRoom.get(socket.id);
    if (roomId) {
      const room = getRoom(roomId);
      if (room) {
        const p = room.players.find(pl => pl.id === user.id);
        if (p) Object.assign(p, { display_name: user.display_name, avatar: user.avatar, photo: user.photo });
        broadcastState(room, io);
      }
    }
  });

  /* ── LEADERBOARD ── */
  socket.on('leaderboard', (data, cb) => {
    const all = [];
    for (const u of users.values()) {
      all.push({ id:u.id, display_name:u.display_name, username:u.display_name,
                 avatar:u.avatar, photo:u.photo, xp:u.xp||0, level:u.level||1, wins:u.wins||0 });
    }
    all.sort((a, b) => b.xp - a.xp);
    if (cb) cb({ leaders: all.slice(0, 20) });
  });

  /* ── DISCONNECT ── */
  socket.on('disconnect', () => {
    console.log(`[-] ${socket.id} disconnected`);
    leaveCurrentRoom(socket, io);
    users.delete(socket.id);
  });
});

/* ════════════════════════════════════════════════
   ROOM HELPERS
════════════════════════════════════════════════ */
function createRoom({ name, game, host }) {
  const id = uuidv4();
  const room = {
    id,
    name: String(name || 'Otaq').slice(0, 50),
    code: genCode(5),
    game: game || 'sise',
    host,
    players: [],
    messages: [],
    current_turn: null,
    current_turn_slot: null,
    spin_in_progress: false,
    spin_target_slot: null,
    pending_challenge: null,
    game_state: null,
    started: false,
    createdAt: Date.now(),
    lastActivity: Date.now(),
  };
  rooms.set(id, room);
  console.log(`[+] Room created: ${room.code} (${game})`);
  return room;
}

function leaveCurrentRoom(socket, io) {
  const roomId = userRoom.get(socket.id);
  if (!roomId) return;
  const room = getRoom(roomId);
  userRoom.delete(socket.id);

  if (!room) return;
  const user = users.get(socket.id);
  const name = user?.display_name || 'Oyunçu';

  room.players = room.players.filter(p => p.id !== user?.id);
  socket.leave(roomId);

  if (room.players.length === 0) {
    rooms.delete(roomId);
    console.log(`[~] Room ${room.code} deleted (empty)`);
    return;
  }

  // Fix turn if needed
  if (room.current_turn === user?.id) {
    room.current_turn      = room.players[0].id;
    room.current_turn_slot = room.players[0].slot;
    room.spin_in_progress  = false;
  }

  const leaveMsg = { msg_type:'system', body:`${name} otaqdan ayrıldı 👋` };
  room.messages.push(leaveMsg);
  io.to(roomId).emit('new_msg', leaveMsg);
  broadcastState(room, io);
  room.lastActivity = Date.now();
}

/* ════════════════════════════════════════════════
   START
════════════════════════════════════════════════ */
srv.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log(`║  🔥 MAYA Server running on :${PORT}     ║`);
  console.log('║  Games: Şişe, UNO, Ludo, Dama, Film ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');
});
