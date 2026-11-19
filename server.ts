import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type MapId =
  | 'metropolis'
  | 'iraq_ruins'
  | 'military_base'
  | 'industrial_port';

const VALID_MAPS = new Set<MapId>([
  'metropolis',
  'iraq_ruins',
  'military_base',
  'industrial_port',
]);

function sanitizeMapId(raw: unknown): MapId {
  const s = String(raw || '');
  return VALID_MAPS.has(s as MapId) ? (s as MapId) : 'metropolis';
}

type TeamId = 'free' | 'green' | 'red';
type TeamMode = 'free' | 'teams';

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  team: TeamId;
  text: string;
  timestamp: number;
}

interface VehicleNetState {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  driverId: string | null;
  passengerId: string | null;
}

interface ServerPlayer {
  id: string;
  uid?: string;
  name: string;
  outfitId: string;
  helmetId: string;
  primaryWeapon: string;
  secondaryWeapon: string;
  customGlbId?: string | null;
  customGlbFlip?: boolean;
  team: TeamId;
  isHost: boolean;
  ready: boolean;
  ws: WebSocket;
  // In-match live state
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  crouch: boolean;
  prone: boolean;
  ridingCarpet: boolean;
  parachuting: boolean;
  vehicleId: string | null;
  vehicleSeat: 0 | 1 | null;
  peek: number; // -1, 0, 1
  weaponId: string;
  emoteId: string;
  hp: number;
  alive: boolean;
  kills: number;
  deaths: number;
  damage: number;
  respawnAt: number;
}

interface ServerRoom {
  code: string;
  mapId: MapId;
  durationSec: number; // 0 = unlimited
  botCount: number;
  teamMode: TeamMode;
  status: 'lobby' | 'playing' | 'ended';
  hostId: string;
  startedAt: number;
  players: Map<string, ServerPlayer>;
  vehicles: Map<string, VehicleNetState>;
  chatHistory: ChatMessage[];
  timerHandle?: ReturnType<typeof setTimeout>;
}

const rooms = new Map<string, ServerRoom>();
const clientRoom = new Map<WebSocket, { roomCode: string; playerId: string }>();
const customGlbStore = new Map<string, Buffer>();
const MAX_CACHED_GLBS = 32;

function sanitizeGlbId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

function generateId(prefix = 'p'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function getSpawnPoint(index: number): { x: number; y: number; z: number } {
  const angle = (index * 2.39996) % (Math.PI * 2);
  const radius = 26 + (index % 4) * 14;
  return {
    x: Math.cos(angle) * radius,
    y: 0,
    z: Math.sin(angle) * radius,
  };
}

function sendJson(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastRoom(room: ServerRoom, payload: unknown, exceptId?: string) {
  const msg = JSON.stringify(payload);
  for (const p of room.players.values()) {
    if (exceptId && p.id === exceptId) continue;
    if (p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(msg);
    }
  }
}

function assignBalancedTeam(room: ServerRoom): TeamId {
  if (room.teamMode !== 'teams') return 'free';
  let g = 0;
  let r = 0;
  for (const p of room.players.values()) {
    if (p.team === 'green') g += 1;
    else if (p.team === 'red') r += 1;
  }
  return g <= r ? 'green' : 'red';
}

function serializeRoomState(room: ServerRoom) {
  return {
    code: room.code,
    mapId: room.mapId,
    durationSec: room.durationSec,
    botCount: room.botCount,
    teamMode: room.teamMode,
    status: room.status,
    hostId: room.hostId,
    startedAt: room.startedAt,
    players: Array.from(room.players.values()).map((p) => ({
      id: p.id,
      uid: p.uid,
      name: p.name,
      outfitId: p.outfitId,
      helmetId: p.helmetId,
      primaryWeapon: p.primaryWeapon,
      secondaryWeapon: p.secondaryWeapon,
      customGlbId: p.customGlbId ?? null,
      customGlbFlip: Boolean(p.customGlbFlip),
      team: p.team,
      isHost: p.isHost,
      ready: p.ready,
    })),
  };
}

function serializeMatchCombatants(room: ServerRoom) {
  return Array.from(room.players.values()).map((p) => ({
    id: p.id,
    name: p.name,
    outfitId: p.outfitId,
    helmetId: p.helmetId,
    weaponId: p.weaponId,
    customGlbId: p.customGlbId ?? null,
    customGlbFlip: Boolean(p.customGlbFlip),
    team: p.team,
    x: p.x,
    y: p.y,
    z: p.z,
    yaw: p.yaw,
    pitch: p.pitch,
    crouch: p.crouch,
    prone: Boolean(p.prone),
    ridingCarpet: Boolean(p.ridingCarpet),
    parachuting: Boolean(p.parachuting),
    vehicleId: p.vehicleId ?? null,
    vehicleSeat: p.vehicleSeat ?? null,
    peek: p.peek,
    emoteId: p.emoteId,
    hp: p.hp,
    alive: p.alive,
    kills: p.kills,
    deaths: p.deaths,
    damage: p.damage,
  }));
}

function endMatch(room: ServerRoom) {
  if (room.timerHandle) {
    clearTimeout(room.timerHandle);
    room.timerHandle = undefined;
  }
  if (room.status !== 'playing') return;
  room.status = 'ended';

  const rankings = Array.from(room.players.values())
    .map((p) => ({
      id: p.id,
      name: p.name,
      isBot: false,
      kills: p.kills,
      deaths: p.deaths,
      damage: p.damage,
      outfitId: p.outfitId,
    }))
    .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || b.damage - a.damage);

  broadcastRoom(room, {
    type: 'match_ended',
    rankings,
    room: serializeRoomState(room),
  });
}

function removeClientFromRoom(ws: WebSocket) {
  const link = clientRoom.get(ws);
  if (!link) return;
  clientRoom.delete(ws);

  const room = rooms.get(link.roomCode);
  if (!room) return;

  room.players.delete(link.playerId);
  for (const v of room.vehicles.values()) {
    if (v.driverId === link.playerId) v.driverId = null;
    if (v.passengerId === link.playerId) v.passengerId = null;
  }

  if (room.players.size === 0) {
    if (room.timerHandle) clearTimeout(room.timerHandle);
    rooms.delete(room.code);
    return;
  }

  if (room.hostId === link.playerId) {
    const nextHost = room.players.values().next().value;
    if (nextHost) {
      nextHost.isHost = true;
      room.hostId = nextHost.id;
    }
  }

  broadcastRoom(room, {
    type: 'player_left',
    playerId: link.playerId,
    room: serializeRoomState(room),
  });
}

async function startServer() {
  const app = express();
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, activeRooms: rooms.size });
  });

  app.use(
    '/models',
    express.static(path.resolve(__dirname, 'public/models'), {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.glb')) {
          res.setHeader('Content-Type', 'model/gltf-binary');
        }
      },
    }),
  );

  app.head('/api/custom-characters/:id', (req, res) => {
    const safeId = sanitizeGlbId(String(req.params.id || ''));
    if (!safeId || !customGlbStore.has(safeId)) {
      res.status(404).end();
      return;
    }
    res.status(200).end();
  });

  app.get('/api/custom-characters/:id', (req, res) => {
    const safeId = sanitizeGlbId(String(req.params.id || ''));
    const buf = safeId ? customGlbStore.get(safeId) : undefined;
    if (!buf) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.setHeader('Content-Type', 'model/gltf-binary');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buf);
  });

  app.post(
    '/api/custom-characters/:id',
    express.raw({ type: 'application/octet-stream', limit: '35mb' }),
    (req, res) => {
      const safeId = sanitizeGlbId(String(req.params.id || ''));
      if (!safeId || !Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({ error: 'Invalid GLB payload' });
        return;
      }
      if (!customGlbStore.has(safeId) && customGlbStore.size >= MAX_CACHED_GLBS) {
        const oldestKey = customGlbStore.keys().next().value;
        if (oldestKey) customGlbStore.delete(oldestKey);
      }
      customGlbStore.set(safeId, req.body);
      res.json({ ok: true, id: safeId, size: req.body.length });
    },
  );

  app.get('/api/rooms/:code', (req, res) => {
    const code = String(req.params.code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) {
      res.status(404).json({ exists: false, message: 'الغرفة غير موجودة' });
      return;
    }
    res.json({ exists: true, room: serializeRoomState(room) });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      const type = String(msg.type || '');
      if (type === 'ping') {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
        return;
      }

      if (type === 'create_room') {
        removeClientFromRoom(ws);
        const code = generateRoomCode();
        const playerId = generateId('p');
        const profile = (msg.profile as Record<string, unknown>) || {};
        const spawn = getSpawnPoint(0);

        const teamMode: TeamMode = msg.teamMode === 'teams' ? 'teams' : 'free';
        const player: ServerPlayer = {
          id: playerId,
          uid: profile.uid ? String(profile.uid) : undefined,
          name: String(profile.callsign || 'قائد_1').slice(0, 24),
          outfitId: String(profile.outfitId || 'woodland_specops'),
          helmetId: String(profile.helmetId || 'ballistic'),
          primaryWeapon: String(profile.primaryWeapon || 'm416'),
          secondaryWeapon: String(profile.secondaryWeapon || 'awm'),
          customGlbId: profile.customGlbId ? sanitizeGlbId(String(profile.customGlbId)) : null,
          customGlbFlip: Boolean(profile.customGlbFlip),
          team: teamMode === 'teams' ? 'green' : 'free',
          isHost: true,
          ready: true,
          ws,
          x: spawn.x,
          y: spawn.y,
          z: spawn.z,
          yaw: 0,
          pitch: 0,
          crouch: false,
          prone: false,
          ridingCarpet: false,
          parachuting: false,
          vehicleId: null,
          vehicleSeat: null,
          peek: 0,
          weaponId: String(profile.primaryWeapon || 'm416'),
          emoteId: 'none',
          hp: 100,
          alive: true,
          kills: 0,
          deaths: 0,
          damage: 0,
          respawnAt: 0,
        };

        const room: ServerRoom = {
          code,
          mapId: sanitizeMapId(msg.mapId),
          durationSec: Number(msg.durationSec ?? 300),
          botCount: Math.max(0, Math.min(24, Number(msg.botCount ?? 8))),
          teamMode,
          status: 'lobby',
          hostId: playerId,
          startedAt: 0,
          players: new Map([[playerId, player]]),
          vehicles: new Map(),
          chatHistory: [],
        };

        rooms.set(code, room);
        clientRoom.set(ws, { roomCode: code, playerId });

        sendJson(ws, {
          type: 'room_joined',
          playerId,
          room: serializeRoomState(room),
          chatHistory: room.chatHistory,
        });
        return;
      }

      if (type === 'join_room') {
        const code = String(msg.code || '').toUpperCase().trim();
        const room = rooms.get(code);
        if (!room) {
          sendJson(ws, { type: 'error', message: 'رمز الغرفة غير صحيح أو انتهت الغرفة' });
          return;
        }
        if (room.players.size >= 32) {
          sendJson(ws, { type: 'error', message: 'الغرفة ممتلئة حالياً' });
          return;
        }

        removeClientFromRoom(ws);
        const playerId = generateId('p');
        const profile = (msg.profile as Record<string, unknown>) || {};
        const spawn = getSpawnPoint(room.players.size);

        const player: ServerPlayer = {
          id: playerId,
          uid: profile.uid ? String(profile.uid) : undefined,
          name: String(profile.callsign || `مقاتل_${room.players.size + 1}`).slice(0, 32),
          outfitId: String(profile.outfitId || 'woodland_specops'),
          helmetId: String(profile.helmetId || 'ballistic'),
          primaryWeapon: String(profile.primaryWeapon || 'm416'),
          secondaryWeapon: String(profile.secondaryWeapon || 'awm'),
          customGlbId: profile.customGlbId ? sanitizeGlbId(String(profile.customGlbId)) : null,
          customGlbFlip: Boolean(profile.customGlbFlip),
          team: assignBalancedTeam(room),
          isHost: false,
          ready: true,
          ws,
          x: spawn.x,
          y: spawn.y,
          z: spawn.z,
          yaw: 0,
          pitch: 0,
          crouch: false,
          prone: false,
          ridingCarpet: false,
          parachuting: false,
          vehicleId: null,
          vehicleSeat: null,
          peek: 0,
          weaponId: String(profile.primaryWeapon || 'm416'),
          emoteId: 'none',
          hp: 100,
          alive: true,
          kills: 0,
          deaths: 0,
          damage: 0,
          respawnAt: 0,
        };

        room.players.set(playerId, player);
        clientRoom.set(ws, { roomCode: code, playerId });

        sendJson(ws, {
          type: 'room_joined',
          playerId,
          room: serializeRoomState(room),
          chatHistory: room.chatHistory,
          combatants: room.status === 'playing' ? serializeMatchCombatants(room) : undefined,
          vehicles: room.status === 'playing' ? Array.from(room.vehicles.values()) : undefined,
        });

        broadcastRoom(
          room,
          {
            type: 'room_updated',
            room: serializeRoomState(room),
            joinedPlayer: {
              id: player.id,
              name: player.name,
              outfitId: player.outfitId,
              helmetId: player.helmetId,
              weaponId: player.weaponId,
              customGlbId: player.customGlbId ?? null,
              customGlbFlip: Boolean(player.customGlbFlip),
              team: player.team,
              x: player.x,
              y: player.y,
              z: player.z,
            },
          },
          playerId,
        );
        return;
      }

      const link = clientRoom.get(ws);
      if (!link) return;
      const room = rooms.get(link.roomCode);
      if (!room) return;
      const player = room.players.get(link.playerId);
      if (!player) return;

      if (type === 'leave_room') {
        removeClientFromRoom(ws);
        return;
      }

      if (type === 'update_profile') {
        const profile = (msg.profile as Record<string, unknown>) || {};
        player.name = String(profile.callsign || player.name).slice(0, 32);
        player.outfitId = String(profile.outfitId || player.outfitId);
        player.helmetId = String(profile.helmetId || player.helmetId);
        player.primaryWeapon = String(profile.primaryWeapon || player.primaryWeapon);
        player.secondaryWeapon = String(profile.secondaryWeapon || player.secondaryWeapon);
        player.customGlbId = profile.customGlbId ? sanitizeGlbId(String(profile.customGlbId)) : null;
        player.customGlbFlip = Boolean(profile.customGlbFlip);
        player.weaponId = player.primaryWeapon;
        broadcastRoom(room, { type: 'room_updated', room: serializeRoomState(room) });
        return;
      }

      if (type === 'switch_team') {
        if (room.teamMode === 'teams') {
          const requested = msg.team === 'red' ? 'red' : 'green';
          player.team = requested;
          broadcastRoom(room, { type: 'room_updated', room: serializeRoomState(room) });
        }
        return;
      }

      if (type === 'chat_message') {
        const text = String(msg.text || '').trim().slice(0, 180);
        if (!text) return;
        const chatMsg: ChatMessage = {
          id: generateId('msg'),
          senderId: player.id,
          senderName: player.name,
          team: player.team,
          text,
          timestamp: Date.now(),
        };
        room.chatHistory.push(chatMsg);
        if (room.chatHistory.length > 35) room.chatHistory.shift();
        broadcastRoom(room, { type: 'chat_message', message: chatMsg });
        return;
      }

      if (type === 'update_room' && room.hostId === player.id) {
        if (msg.mapId) room.mapId = sanitizeMapId(msg.mapId);
        if (msg.durationSec !== undefined) room.durationSec = Number(msg.durationSec);
        if (msg.botCount !== undefined) {
          room.botCount = Math.max(0, Math.min(24, Number(msg.botCount)));
        }
        if (msg.teamMode === 'teams' || msg.teamMode === 'free') {
          if (room.teamMode !== msg.teamMode) {
            room.teamMode = msg.teamMode;
            let idx = 0;
            for (const p of room.players.values()) {
              p.team = room.teamMode === 'teams' ? (idx % 2 === 0 ? 'green' : 'red') : 'free';
              idx += 1;
            }
          }
        }
        broadcastRoom(room, { type: 'room_updated', room: serializeRoomState(room) });
        return;
      }

      if (type === 'start_match' && room.hostId === player.id) {
        if (room.timerHandle) clearTimeout(room.timerHandle);
        room.status = 'playing';
        room.startedAt = Date.now();
        room.vehicles.clear();

        let idx = 0;
        for (const p of room.players.values()) {
          const spawn = getSpawnPoint(idx++);
          p.x = spawn.x;
          p.y = spawn.y;
          p.z = spawn.z;
          p.hp = 100;
          p.alive = true;
          p.kills = 0;
          p.deaths = 0;
          p.damage = 0;
          p.emoteId = 'none';
          p.vehicleId = null;
          p.vehicleSeat = null;
          p.weaponId = p.primaryWeapon;
        }

        if (room.durationSec > 0) {
          room.timerHandle = setTimeout(() => {
            endMatch(room);
          }, room.durationSec * 1000);
        }

        broadcastRoom(room, {
          type: 'match_started',
          room: serializeRoomState(room),
          combatants: serializeMatchCombatants(room),
        });
        return;
      }

      if (type === 'end_match' && room.hostId === player.id) {
        endMatch(room);
        return;
      }

      if (type === 'back_to_lobby' && room.hostId === player.id) {
        if (room.timerHandle) clearTimeout(room.timerHandle);
        room.status = 'lobby';
        broadcastRoom(room, { type: 'room_updated', room: serializeRoomState(room) });
        return;
      }

      if (type === 'player_state' && room.status === 'playing') {
        player.x = Number(msg.x || 0);
        player.y = Number(msg.y || 0);
        player.z = Number(msg.z || 0);
        player.yaw = Number(msg.yaw || 0);
        player.pitch = Number(msg.pitch || 0);
        player.crouch = Boolean(msg.crouch);
        player.prone = Boolean(msg.prone);
        player.ridingCarpet = Boolean(msg.ridingCarpet);
        player.parachuting = Boolean(msg.parachuting);
        player.vehicleId = msg.vehicleId ? String(msg.vehicleId) : null;
        player.vehicleSeat = msg.vehicleSeat === 0 || msg.vehicleSeat === 1 ? msg.vehicleSeat : null;
        player.peek = Number(msg.peek || 0);
        player.weaponId = String(msg.weaponId || player.weaponId);
        player.emoteId = String(msg.emoteId || 'none');

        broadcastRoom(
          room,
          {
            type: 'remote_state',
            id: player.id,
            team: player.team,
            x: player.x,
            y: player.y,
            z: player.z,
            yaw: player.yaw,
            pitch: player.pitch,
            crouch: player.crouch,
            prone: player.prone,
            ridingCarpet: player.ridingCarpet,
            parachuting: player.parachuting,
            vehicleId: player.vehicleId,
            vehicleSeat: player.vehicleSeat,
            peek: player.peek,
            weaponId: player.weaponId,
            emoteId: player.emoteId,
            hp: player.hp,
            alive: player.alive,
          },
          player.id,
        );
        return;
      }

      if (type === 'vehicle_state' && room.status === 'playing') {
        const vid = String(msg.id || '');
        if (!vid) return;
        const vState: VehicleNetState = {
          id: vid,
          x: Number(msg.x || 0),
          y: Number(msg.y || 0),
          z: Number(msg.z || 0),
          yaw: Number(msg.yaw || 0),
          driverId: msg.driverId ? String(msg.driverId) : null,
          passengerId: msg.passengerId ? String(msg.passengerId) : null,
        };
        room.vehicles.set(vid, vState);
        broadcastRoom(
          room,
          {
            type: 'remote_vehicle',
            ...vState,
          },
          player.id,
        );
        return;
      }

      if (type === 'fire' && room.status === 'playing') {
        broadcastRoom(
          room,
          {
            type: 'remote_fire',
            id: player.id,
            origin: msg.origin,
            dir: msg.dir,
            weaponId: msg.weaponId,
          },
          player.id,
        );
        return;
      }

      if (type === 'throw_grenade' && room.status === 'playing') {
        const grenadeType =
          msg.grenadeType === 'smoke' || msg.grenadeType === 'molotov' ? msg.grenadeType : 'frag';
        broadcastRoom(
          room,
          {
            type: 'remote_grenade',
            id: player.id,
            grenadeType,
            origin: msg.origin,
            vel: msg.vel,
          },
          player.id,
        );
        return;
      }

      if (type === 'hit_player' && room.status === 'playing') {
        const targetId = String(msg.targetId || '');
        const dmg = Math.max(1, Math.min(280, Number(msg.damage || 20)));
        const isHeadshot = Boolean(msg.isHeadshot);
        const weaponName = String(msg.weaponName || 'سلاح');

        const victim = room.players.get(targetId);
        if (!victim || !victim.alive || victim.id === player.id) return;
        if (room.teamMode === 'teams' && player.team !== 'free' && player.team === victim.team) {
          return;
        }

        victim.hp = Math.max(0, victim.hp - dmg);
        player.damage += dmg;

        if (victim.hp <= 0) {
          victim.alive = false;
          victim.deaths += 1;
          player.kills += 1;

          broadcastRoom(room, {
            type: 'player_killed',
            killerId: player.id,
            killerName: player.name,
            victimId: victim.id,
            victimName: victim.name,
            weaponName,
            isHeadshot,
            scoreboard: serializeMatchCombatants(room).map((c) => ({
              id: c.id,
              name: c.name,
              kills: c.kills,
              deaths: c.deaths,
              damage: c.damage,
              outfitId: c.outfitId,
            })),
          });

          setTimeout(() => {
            if (room.status !== 'playing') return;
            const v = room.players.get(targetId);
            if (!v) return;
            const spawn = getSpawnPoint(Math.floor(Math.random() * 12));
            v.hp = 100;
            v.alive = true;
            v.x = spawn.x;
            v.y = spawn.y;
            v.z = spawn.z;
            broadcastRoom(room, {
              type: 'player_respawned',
              id: v.id,
              x: v.x,
              y: v.y,
              z: v.z,
              hp: v.hp,
            });
          }, 3000);
        } else {
          sendJson(victim.ws, {
            type: 'took_damage',
            attackerId: player.id,
            damage: dmg,
            hp: victim.hp,
          });
        }
      }
    });

    ws.on('close', () => {
      removeClientFromRoom(ws);
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT || 3000);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Warzone Strike 3D server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
