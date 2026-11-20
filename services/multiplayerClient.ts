import type {
  ChatMessage,
  GrenadeType,
  MapId,
  PlayerLoadout,
  RoomStateInfo,
  TeamId,
  TeamMode,
} from '../game/types';

export interface RemoteCombatantInit {
  id: string;
  name: string;
  outfitId: string;
  helmetId: string;
  weaponId: string;
  customGlbId?: string | null;
  customGlbFlip?: boolean;
  team?: TeamId;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  crouch: boolean;
  prone?: boolean;
  ridingCarpet?: boolean;
  parachuting?: boolean;
  vehicleId?: string | null;
  vehicleSeat?: 0 | 1 | null;
  peek: number;
  emoteId: string;
  hp: number;
  alive: boolean;
  kills: number;
  deaths: number;
  damage: number;
}

export interface RemoteStatePacket {
  id: string;
  team?: TeamId;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  crouch: boolean;
  prone?: boolean;
  ridingCarpet?: boolean;
  parachuting?: boolean;
  vehicleId?: string | null;
  vehicleSeat?: 0 | 1 | null;
  peek: number;
  weaponId: string;
  emoteId: string;
  hp: number;
  alive: boolean;
}

export interface VehicleNetState {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  driverId: string | null;
  passengerId: string | null;
}

export interface RemoteFirePacket {
  id: string;
  origin: [number, number, number];
  dir: [number, number, number];
  weaponId: string;
}

export interface KillPacket {
  killerId: string;
  killerName: string;
  victimId: string;
  victimName: string;
  weaponName: string;
  isHeadshot: boolean;
  scoreboard: {
    id: string;
    name: string;
    kills: number;
    deaths: number;
    damage: number;
    outfitId: string;
  }[];
}

export type ServerEvent =
  | { type: 'connected' }
  | { type: 'disconnected' }
  | { type: 'error'; message: string }
  | {
      type: 'room_joined';
      playerId: string;
      room: RoomStateInfo;
      chatHistory?: ChatMessage[];
      combatants?: RemoteCombatantInit[];
      vehicles?: VehicleNetState[];
    }
  | {
      type: 'room_updated';
      room: RoomStateInfo;
      joinedPlayer?: RemoteCombatantInit;
    }
  | { type: 'player_left'; playerId: string; room: RoomStateInfo }
  | {
      type: 'match_started';
      room: RoomStateInfo;
      combatants: RemoteCombatantInit[];
    }
  | ({ type: 'remote_state' } & RemoteStatePacket)
  | ({ type: 'remote_vehicle' } & VehicleNetState)
  | ({ type: 'remote_fire' } & RemoteFirePacket)
  | {
      type: 'remote_grenade';
      id: string;
      grenadeType?: GrenadeType;
      origin: [number, number, number];
      vel: [number, number, number];
    }
  | { type: 'chat_message'; message: ChatMessage }
  | ({ type: 'player_killed' } & KillPacket)
  | { type: 'took_damage'; attackerId: string; damage: number; hp: number }
  | { type: 'player_respawned'; id: string; x: number; y: number; z: number; hp: number }
  | {
      type: 'match_ended';
      rankings: {
        id: string;
        name: string;
        isBot: boolean;
        kills: number;
        deaths: number;
        damage: number;
        outfitId: string;
      }[];
      room: RoomStateInfo;
    };

const PUBLIC_APP_ORIGIN =
  import.meta.env.VITE_PUBLIC_APP_URL?.trim() ||
  'https://ais-pre-m4skqitq6dblyhmldofsjr-1011102364414.europe-west2.run.app';

export function getPublicAppOrigin(): string {
  if (typeof window === 'undefined') return PUBLIC_APP_ORIGIN;
  const { protocol, hostname } = window.location;
  if (
    protocol === 'file:' ||
    protocol === 'capacitor:' ||
    protocol === 'ionic:' ||
    (hostname === 'localhost' && !window.location.port)
  ) {
    return PUBLIC_APP_ORIGIN;
  }
  return window.location.origin;
}

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<(ev: ServerEvent) => void>();
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private pendingQueue: Record<string, unknown>[] = [];
  private manualClose = false;

  public connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.manualClose = false;
    const configuredUrl = import.meta.env.VITE_MULTIPLAYER_WS_URL?.trim();
    const { protocol, host } = window.location;
    const isNativeOrFile =
      protocol === 'file:' ||
      protocol === 'capacitor:' ||
      protocol === 'ionic:' ||
      (window.location.hostname === 'localhost' && !window.location.port);
    const proto = protocol === 'https:' ? 'wss:' : 'ws:';
    const url =
      configuredUrl ||
      (isNativeOrFile
        ? `${PUBLIC_APP_ORIGIN.replace(/^http/, 'ws')}/ws`
        : `${proto}//${host}/ws`);
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      if (this.heartbeatTimer) window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = window.setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 20000);
      while (this.pendingQueue.length > 0 && ws.readyState === WebSocket.OPEN) {
        const item = this.pendingQueue.shift();
        if (item) ws.send(JSON.stringify(item));
      }
      this.emit({ type: 'connected' });
    };

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as ServerEvent;
        this.emit(parsed);
      } catch {
        // ignore malformed packets
      }
    };

    ws.onclose = () => {
      if (this.heartbeatTimer) {
        window.clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
      this.emit({ type: 'disconnected' });
      if (!this.manualClose) {
        if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
        this.reconnectTimer = window.setTimeout(() => this.connect(), 2000);
      }
    };
  }

  public disconnect(): void {
    this.manualClose = true;
    this.pendingQueue = [];
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatTimer) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  public onEvent(cb: (ev: ServerEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(ev: ServerEvent): void {
    for (const cb of this.listeners) {
      cb(ev);
    }
  }

  private send(payload: Record<string, unknown>, queueIfConnecting = false): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (queueIfConnecting) {
        this.pendingQueue.push(payload);
        if (this.pendingQueue.length > 20) this.pendingQueue.shift();
        this.connect();
      }
      return;
    }
    this.ws.send(JSON.stringify(payload));
  }

  public createRoom(
    profile: PlayerLoadout & { uid?: string },
    mapId: MapId,
    durationSec: number,
    botCount: number,
    teamMode: TeamMode = 'free',
  ): void {
    this.send({ type: 'create_room', profile, mapId, durationSec, botCount, teamMode }, true);
  }

  public joinRoom(code: string, profile: PlayerLoadout & { uid?: string }): void {
    this.send({ type: 'join_room', code: code.toUpperCase().trim(), profile }, true);
  }

  public leaveRoom(): void {
    this.send({ type: 'leave_room' }, true);
  }

  public updateProfile(profile: PlayerLoadout & { uid?: string }): void {
    this.send({ type: 'update_profile', profile }, true);
  }

  public updateRoom(
    mapId: MapId,
    durationSec: number,
    botCount: number,
    teamMode?: TeamMode,
  ): void {
    this.send({ type: 'update_room', mapId, durationSec, botCount, teamMode }, true);
  }

  public switchTeam(team: TeamId): void {
    this.send({ type: 'switch_team', team }, true);
  }

  public sendChat(text: string): void {
    const clean = text.trim().slice(0, 180);
    if (!clean) return;
    this.send({ type: 'chat_message', text: clean }, true);
  }

  public startMatch(): void {
    this.send({ type: 'start_match' }, true);
  }

  public endMatch(): void {
    this.send({ type: 'end_match' }, true);
  }

  public backToLobby(): void {
    this.send({ type: 'back_to_lobby' }, true);
  }

  public sendPlayerState(state: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    crouch: boolean;
    prone?: boolean;
    ridingCarpet?: boolean;
    parachuting?: boolean;
    vehicleId?: string | null;
    vehicleSeat?: 0 | 1 | null;
    peek: number;
    weaponId: string;
    emoteId: string;
  }): void {
    this.send({ type: 'player_state', ...state });
  }

  public sendVehicleState(state: VehicleNetState): void {
    this.send({ type: 'vehicle_state', ...state });
  }

  public sendFire(origin: [number, number, number], dir: [number, number, number], weaponId: string): void {
    this.send({ type: 'fire', origin, dir, weaponId });
  }

  public sendGrenade(
    origin: [number, number, number],
    vel: [number, number, number],
    grenadeType: GrenadeType = 'frag',
  ): void {
    this.send({ type: 'throw_grenade', origin, vel, grenadeType });
  }

  public sendHit(targetId: string, damage: number, isHeadshot: boolean, weaponName: string): void {
    this.send({ type: 'hit_player', targetId, damage, isHeadshot, weaponName });
  }
}

export const multiplayerClient = new MultiplayerClient();
