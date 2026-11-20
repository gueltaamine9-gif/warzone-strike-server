import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  EMOTES,
  getMapSpec,
  getWeaponSpec,
  HELMETS,
  OUTFITS,
  WEAPONS,
  type CombatantStats,
  type EmoteId,
  type GrenadeType,
  type HelmetId,
  type KillFeedItem,
  type MapId,
  type OutfitId,
  type PlayerLoadout,
  type RoomPlayerInfo,
  type TeamId,
  type TeamMode,
  type VehicleKind,
  type WeaponId,
} from '../game/types';
import type {
  RemoteCombatantInit,
  RemoteFirePacket,
  RemoteStatePacket,
  VehicleNetState,
} from '../services/multiplayerClient';
import { loadGlbTemplate } from '../services/customCharacterStore';
import { soundEngine } from './audioEngine';
import { detectSoftwareWebGL } from './LobbyScene';
import {
  buildGameMap,
  type BuiltMap,
  type ElevatorUnit,
  type FlyingCarpetSpawn,
  type JumpPad,
  type SupplyCrate,
  type VehicleSpawn,
} from './mapBuilder';
import { createSoldierRig, type SoldierRig } from './soldierModel';
import { buildGrenadeMesh } from './vehiclesAndGrenades';
import { buildWeaponMesh } from './weaponsModel';

// Pre-allocated math helpers (zero GC inside animation loop)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _rayOrigin = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();

export interface MatchHudSnapshot {
  hp: number;
  armor: number;
  grenades: number;
  grenadeCounts: Record<GrenadeType, number>;
  selectedGrenadeType: GrenadeType;
  aimingGrenade: boolean;
  ammo: number;
  maxAmmo: number;
  reloading: boolean;
  activeSlot: 0 | 1;
  weapons: [WeaponId, WeaponId];
  scoped: boolean;
  crouch: boolean;
  prone: boolean;
  ridingCarpet: boolean;
  parachuting: boolean;
  inVehicle: VehicleKind | null;
  vehicleSeat: 0 | 1 | null;
  localTeam: TeamId;
  teamMode: TeamMode;
  peek: -1 | 0 | 1;
  alive: boolean;
  respawnSec: number;
  timeRemainingSec: number; // -1 = open/unlimited
  kills: number;
  deaths: number;
  aliveCount: number;
  totalCount: number;
  nearbyInteract: {
    kind:
      | 'elevator_up'
      | 'elevator_down'
      | 'elevator_call_up'
      | 'elevator_call_down'
      | 'jumppad'
      | 'carpet'
      | 'medkit'
      | 'weapon'
      | 'grenade_drop'
      | 'drive_car'
      | 'drive_motorcycle'
      | 'ride_passenger';
    weaponId?: WeaponId;
    grenadeType?: GrenadeType;
  } | null;
  hitMarker: 'none' | 'body' | 'head';
  damageFlash: number;
  burning: boolean;
  scopeTargetDist: number;
  playerPos: { x: number; z: number; yaw: number };
  radarDots: { x: number; z: number; type: 'enemy' | 'ally' | 'crate' | 'elevator' | 'jumppad' | 'carpet' }[];
  scoreboard: CombatantStats[];
  killFeed: KillFeedItem[];
}

interface BotActor {
  id: string;
  name: string;
  rig: SoldierRig;
  x: number;
  y: number;
  z: number;
  velX: number;
  velY: number;
  velZ: number;
  grounded: boolean;
  airLaunchUntil: number;
  yaw: number;
  targetYaw: number;
  pitch: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  respawnAt: number;
  outfitId: OutfitId;
  helmetId: HelmetId;
  weaponId: WeaponId;
  kills: number;
  deaths: number;
  damage: number;
  moveTarget: THREE.Vector3;
  nextThinkAt: number;
  nextLosAt: number;
  cachedHasLos: boolean;
  nextFireAt: number;
  burstLeft: number;
  strafeDir: number;
  nextStrafeFlip: number;
  flankSign: number;
  state: 'patrol' | 'advance' | 'cover' | 'engage' | 'retreat' | 'flank';
  peek: number;
  crouch: boolean;
  prone: boolean;
  recoil: number;
  inCoverUntil: number;
  nextGrenadeAt: number;
  nextJumpAt: number;
  prevCheckX: number;
  prevCheckZ: number;
  nextStuckCheckAt: number;
  targetActorId?: string;
  burnUntil?: number;
  nextBurnTickAt?: number;
  burnedByLocal?: boolean;
}

interface RemoteActor {
  id: string;
  name: string;
  rig: SoldierRig;
  team: TeamId;
  x: number;
  y: number;
  z: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  yaw: number;
  targetYaw: number;
  pitch: number;
  crouch: boolean;
  prone: boolean;
  ridingCarpet: boolean;
  parachuting: boolean;
  vehicleId: string | null;
  vehicleSeat: 0 | 1 | null;
  peek: number;
  weaponId: WeaponId;
  outfitId: OutfitId;
  helmetId: HelmetId;
  customGlbId?: string | null;
  customGlbFlip?: boolean;
  emote: EmoteId;
  hp: number;
  alive: boolean;
  kills: number;
  deaths: number;
  damage: number;
  recoil: number;
}

interface TracerBeam {
  line: THREE.Line;
  expiresAt: number;
}

interface ActiveGrenade {
  type: GrenadeType;
  mesh: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  hasLanded: boolean;
  landAt: number;
  explodeAt: number;
  isLocalOwner: boolean;
  ownerBotId?: string;
}

interface SmokeZone {
  group: THREE.Group;
  pos: THREE.Vector3;
  radius: number;
  startedAt: number;
  expiresAt: number;
}

interface FireZone {
  group: THREE.Group;
  pos: THREE.Vector3;
  radius: number;
  startedAt: number;
  expiresAt: number;
  nextTickAt: number;
  isLocalOwner: boolean;
  ownerBotId?: string;
}

interface BlastEffect {
  sphere: THREE.Mesh;
  ring: THREE.Mesh;
  startedAt: number;
  duration: number;
}

export interface MatchEngineOptions {
  container: HTMLElement;
  mapId: MapId;
  durationSec: number;
  botCount: number;
  isOnline: boolean;
  teamMode?: TeamMode;
  localTeam?: TeamId;
  localPlayerId: string;
  loadout: PlayerLoadout;
  sensitivity?: number;
  initialRemotes?: RemoteCombatantInit[];
  initialVehicles?: VehicleNetState[];
  onHudUpdate: (hud: MatchHudSnapshot) => void;
  onMatchEnd: (rankings: CombatantStats[]) => void;
  onSendState?: (state: {
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
    peek: number;
    weaponId: string;
    emoteId: string;
  }) => void;
  onSendVehicleState?: (state: VehicleNetState) => void;
  onSendFire?: (origin: [number, number, number], dir: [number, number, number], weaponId: string) => void;
  onSendGrenade?: (
    origin: [number, number, number],
    vel: [number, number, number],
    grenadeType: GrenadeType,
  ) => void;
  onSendHit?: (targetId: string, damage: number, isHeadshot: boolean, weaponName: string) => void;
}

export class MatchEngine {
  private opts: MatchEngineOptions;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private map: BuiltMap;
  private isSoftwareGl: boolean;
  private clock = new THREE.Clock();
  private frameId = 0;
  private disposed = false;

  // Local player state
  private localRig: SoldierRig;
  private pos = new THREE.Vector3(0, 0, 20);
  private velX = 0;
  private velY = 0;
  private velZ = 0;
  private grounded = true;
  private airLaunchUntil = 0;
  private yaw = 0;
  private pitch = 0.04;
  private sensitivity: number;
  private crouch = false;
  private prone = false;
  private ridingCarpet = false;
  private parachuting = false;
  private carpetAscendHeld = false;
  private carpetDescendHeld = false;
  private activeCarpetSpawn: FlyingCarpetSpawn | null = null;
  private peek: -1 | 0 | 1 = 0;
  private scoped = false;
  private hp = 100;
  private armor = 60;
  private alive = true;
  private respawnAt = 0;
  private kills = 0;
  private deaths = 0;
  private damageDealt = 0;
  private weapons: [WeaponId, WeaponId];
  private ammo: [number, number];
  private activeSlot: 0 | 1 = 0;
  private grenadeCounts: Record<GrenadeType, number> = { frag: 3, smoke: 2, molotov: 2 };
  private selectedGrenadeType: GrenadeType = 'frag';
  private aimingGrenade = false;
  private activeVehicleId: string | null = null;
  private activeVehicleSeat: 0 | 1 | null = null;
  private teamMode: TeamMode;
  private localTeam: TeamId;
  private reloadingUntil = 0;
  private nextFireAt = 0;
  private meleeStart = 0;
  private meleeUntil = 0;
  private nextMeleeAt = 0;
  private recoilAmount = 0;
  private emote: EmoteId = 'none';
  private emoteUntil = 0;

  // Grenade Trajectory Preview & Zones
  private arcLine: THREE.Line;
  private arcTargetRing: THREE.Mesh;
  private activeGrenades: ActiveGrenade[] = [];
  private smokeZones: SmokeZone[] = [];
  private fireZones: FireZone[] = [];
  private blasts: BlastEffect[] = [];
  private sharedSmokePuffGeo = new THREE.SphereGeometry(1, 8, 7);
  private sharedFireScorchGeo = new THREE.CircleGeometry(4.5, 16);
  private sharedFireEmberGeo = new THREE.RingGeometry(0.4, 4.4, 16);
  private sharedFireFlameGeo = new THREE.ConeGeometry(0.42, 1.45, 5);
  private sharedBlastSphereGeo = new THREE.SphereGeometry(1, 10, 8);
  private sharedBlastRingGeo = new THREE.RingGeometry(0.8, 1.4, 18);

  // Camera smoothing
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camFov = 68;
  private peekCamOffset = 0;

  // Input state
  private keys: Record<string, boolean> = {};
  private joyVec = { x: 0, y: 0 };
  private fireHeld = false;

  // Actors & FX
  private bots: BotActor[] = [];
  private remotes = new Map<string, RemoteActor>();
  private tracers: TracerBeam[] = [];
  private muzzleFlashLight: THREE.PointLight;
  private muzzleFlashUntil = 0;
  private hitMarker: 'none' | 'body' | 'head' = 'none';
  private hitMarkerUntil = 0;
  private damageFlash = 0;
  private burnUntil = 0;
  private nextBurnTickAt = 0;
  private burningRemotes = new Map<string, { until: number; nextTickAt: number }>();

  // Timing
  private matchStartTime = performance.now();
  private matchEnded = false;
  private lastHudEmit = 0;
  private lastNetEmit = 0;
  private lastVehicleNetEmit = 0;
  private lastFootstep = 0;
  private nearbyElevator: ElevatorUnit | null = null;
  private nearbyJumpPad: JumpPad | null = null;
  private nearbyCrate: SupplyCrate | null = null;
  private nearbyCarpet: FlyingCarpetSpawn | null = null;
  private nearbyVehicle: VehicleSpawn | null = null;
  private lastVehicleRamAt = new Map<string, number>();

  constructor(opts: MatchEngineOptions) {
    this.opts = opts;
    this.teamMode = opts.teamMode ?? 'free';
    this.localTeam = opts.localTeam ?? 'free';
    this.sensitivity = opts.sensitivity ?? 1.0;
    this.isSoftwareGl = detectSoftwareWebGL();
    this.weapons = [opts.loadout.primaryWeapon, opts.loadout.secondaryWeapon];
    this.ammo = [
      getWeaponSpec(this.weapons[0]).magSize,
      getWeaponSpec(this.weapons[1]).magSize,
    ];

    const renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.24;
    const isTouchDevice =
      (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) ||
      navigator.maxTouchPoints > 0;
    const maxPr = isTouchDevice ? 1.0 : 1.35;
    renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, maxPr));
    renderer.shadowMap.enabled = !this.isSoftwareGl && !isTouchDevice;
    renderer.shadowMap.type = THREE.BasicShadowMap;
    renderer.setSize(opts.container.clientWidth || window.innerWidth, opts.container.clientHeight || window.innerHeight);
    opts.container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const mapSpec = getMapSpec(opts.mapId);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(mapSpec.skyColor);
    scene.fog = new THREE.FogExp2(mapSpec.fogColor, mapSpec.fogDensity * 0.72);

    if (!this.isSoftwareGl && !isTouchDevice) {
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
    }
    this.scene = scene;

    const aspect = (opts.container.clientWidth || window.innerWidth) / (opts.container.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(68, aspect, 0.1, 520);
    _raycaster.camera = this.camera;

    // Bright, Clear 3-Point Tactical Lighting
    const hemi = new THREE.HemisphereLight(0xa5bedb, 0x3b352d, 0.96);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2dc, 1.85);
    sun.position.set(55, 85, 45);
    sun.castShadow = !this.isSoftwareGl && !isTouchDevice;
    sun.shadow.mapSize.set(512, 512);
    const d = 90;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 220;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);

    const rim = new THREE.DirectionalLight(0x94a3b8, 0.72);
    rim.position.set(-50, 35, -60);
    scene.add(rim);

    this.muzzleFlashLight = new THREE.PointLight(0xfbbf24, 0, 12, 2);
    scene.add(this.muzzleFlashLight);

    // Grenade Trajectory Arc & Target Ring
    const arcGeo = new THREE.BufferGeometry();
    const arcPts = new Float32Array(26 * 3);
    arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPts, 3));
    this.arcLine = new THREE.Line(
      arcGeo,
      new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.92 }),
    );
    this.arcLine.visible = false;
    this.arcLine.frustumCulled = false;
    scene.add(this.arcLine);

    this.arcTargetRing = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 0.95, 28),
      new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
    );
    this.arcTargetRing.rotation.x = -Math.PI / 2;
    this.arcTargetRing.visible = false;
    scene.add(this.arcTargetRing);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    this.map = buildGameMap(opts.mapId, maxAniso);
    scene.add(this.map.group);

    // Spawn local player facing arena center
    const spawn = this.map.spawnPoints[0] || new THREE.Vector3(0, 0, 35);
    this.pos.copy(spawn);
    this.pos.y = this.map.getTerrainHeight(this.pos.x, this.pos.z);
    this.yaw = Math.atan2(-this.pos.x, -this.pos.z);

    this.localRig = createSoldierRig(
      opts.localPlayerId,
      opts.loadout.outfitId,
      opts.loadout.helmetId,
      this.weapons[0],
      maxAniso,
    );
    this.localRig.setTeamMarker(this.teamMode === 'teams' ? this.localTeam : 'free');
    this.localRig.root.position.copy(this.pos);
    this.localRig.root.rotation.y = this.yaw;
    scene.add(this.localRig.root);

    this.camPos.set(this.pos.x - Math.sin(this.yaw) * 3.5, this.pos.y + 2.1, this.pos.z - Math.cos(this.yaw) * 3.5);
    this.camLook.set(this.pos.x + Math.sin(this.yaw) * 15, this.pos.y + 1.5, this.pos.z + Math.cos(this.yaw) * 15);

    this.spawnBots(opts.botCount, maxAniso);

    if (opts.loadout.customGlbId) {
      const targetGlbId = opts.loadout.customGlbId;
      const flip = Boolean(opts.loadout.customGlbFlip);
      const applyBots = Boolean(opts.loadout.applyGlbToBots);
      loadGlbTemplate(targetGlbId).then((tpl) => {
        if (this.disposed || !tpl) return;
        this.localRig.setCustomGlb(tpl, flip);
        if (applyBots) {
          for (const b of this.bots) {
            b.rig.setCustomGlb(tpl, flip);
          }
        }
      });
    }

    if (opts.initialRemotes) {
      for (const rc of opts.initialRemotes) {
        if (rc.id !== opts.localPlayerId) {
          this.upsertRemoteActor(rc);
        }
      }
    }

    if (opts.initialVehicles) {
      for (const vState of opts.initialVehicles) {
        this.applyRemoteVehicle(vState);
      }
    }

    if (!this.isSoftwareGl) {
      renderer.compile(scene, this.camera);
    }

    this.bindEvents();
    this.tick();
  }

  private spawnBots(count: number, maxAniso: number) {
    const botNames = [
      'الصقر_الأسود', 'ذئب_الصحراء', 'شبح_الليل', 'رعد_الشمال', 'نسر_الفرات',
      'فهد_العاصفة', 'كاسر_الحصار', 'حارس_الحدود', 'قناص_الغابة', 'برق_الجنوب',
      'سيف_النصر', 'مدفع_الشرق', 'ظل_المدينة', 'عقاب_الجبل', 'مقاتل_النخبة',
      'درع_الحديد', 'صياد_الأهداف', 'زوبعة_الرمال', 'ليث_الميدان', 'طيف_الظلام',
    ];
    const skinTones = [0xc49575, 0xa87654, 0xd4aa8a, 0x8c5e3f];

    for (let i = 0; i < count; i++) {
      const outfit = OUTFITS[i % OUTFITS.length].id;
      const helmet = HELMETS[i % HELMETS.length].id;
      const weapon = WEAPONS[i % WEAPONS.length].id;
      const id = `bot_${i + 1}`;
      const name = `${botNames[i % botNames.length]}${i >= botNames.length ? `_${Math.floor(i / botNames.length) + 1}` : ''}`;

      const sp = this.map.spawnPoints[(i + 1) % this.map.spawnPoints.length];
      const angle = (i * 2.39996) % (Math.PI * 2);
      const bx = sp.x + Math.cos(angle) * (4 + (i % 4) * 3);
      const bz = sp.z + Math.sin(angle) * (4 + (i % 4) * 3);
      const by = this.map.getTerrainHeight(bx, bz);

      const rig = createSoldierRig(id, outfit, helmet, weapon, maxAniso, {
        showHealthBar: true,
        skinTone: skinTones[i % skinTones.length],
        labelName: name,
        isAlly: false,
      });
      rig.root.position.set(bx, by, bz);
      this.scene.add(rig.root);

      const initialTarget =
        this.map.coverSpots.length > 0
          ? this.map.coverSpots[i % this.map.coverSpots.length].clone()
          : new THREE.Vector3((Math.random() - 0.5) * 60, 0, (Math.random() - 0.5) * 60);

      this.bots.push({
        id,
        name,
        rig,
        x: bx,
        y: by,
        z: bz,
        velX: 0,
        velY: 0,
        velZ: 0,
        grounded: true,
        airLaunchUntil: 0,
        yaw: Math.random() * Math.PI * 2,
        targetYaw: Math.random() * Math.PI * 2,
        pitch: 0,
        hp: 145,
        maxHp: 145,
        alive: true,
        respawnAt: 0,
        outfitId: outfit,
        helmetId: helmet,
        weaponId: weapon,
        kills: 0,
        deaths: 0,
        damage: 0,
        moveTarget: initialTarget,
        nextThinkAt: performance.now() + 200 + Math.random() * 500,
        nextLosAt: performance.now() + (i % 6) * 35,
        cachedHasLos: false,
        nextFireAt: performance.now() + 700 + Math.random() * 900,
        burstLeft: 3 + (i % 3),
        strafeDir: i % 2 === 0 ? 1 : -1,
        nextStrafeFlip: performance.now() + 900 + Math.random() * 900,
        flankSign: i % 2 === 0 ? 1 : -1,
        state: 'patrol',
        peek: 0,
        crouch: false,
        prone: false,
        recoil: 0,
        inCoverUntil: 0,
        nextGrenadeAt: performance.now() + 6500 + Math.random() * 7000,
        nextJumpAt: performance.now() + 2500 + Math.random() * 3500,
        prevCheckX: bx,
        prevCheckZ: bz,
        nextStuckCheckAt: performance.now() + 800,
      });
    }
  }

  private isFriendlyTeam(team?: TeamId): boolean {
    return this.teamMode === 'teams' && this.localTeam !== 'free' && team === this.localTeam;
  }

  public upsertRemoteActor(init: RemoteCombatantInit) {
    if (init.id === this.opts.localPlayerId) return;
    if (this.remotes.has(init.id)) return;
    const rTeam: TeamId = init.team ?? 'free';
    const isAlly = this.isFriendlyTeam(rTeam);
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const rig = createSoldierRig(
      init.id,
      (init.outfitId as OutfitId) || 'woodland_specops',
      (init.helmetId as HelmetId) || 'ballistic',
      (init.weaponId as WeaponId) || 'm416',
      maxAniso,
      {
        showHealthBar: true,
        labelName: init.name,
        isAlly,
      },
    );
    rig.setHealthBar(init.hp ?? 100, init.name, isAlly, rTeam);
    rig.setTeamMarker(this.teamMode === 'teams' ? rTeam : 'free');
    rig.root.position.set(init.x, init.y, init.z);
    this.scene.add(rig.root);

    const customGlbId = init.customGlbId ?? null;
    const customGlbFlip = Boolean(init.customGlbFlip);

    this.remotes.set(init.id, {
      id: init.id,
      name: init.name,
      rig,
      team: rTeam,
      x: init.x,
      y: init.y,
      z: init.z,
      targetX: init.x,
      targetY: init.y,
      targetZ: init.z,
      yaw: init.yaw || 0,
      targetYaw: init.yaw || 0,
      pitch: init.pitch || 0,
      crouch: Boolean(init.crouch),
      prone: Boolean(init.prone),
      ridingCarpet: Boolean(init.ridingCarpet),
      parachuting: Boolean(init.parachuting),
      vehicleId: init.vehicleId ?? null,
      vehicleSeat: init.vehicleSeat ?? null,
      peek: Number(init.peek || 0),
      weaponId: (init.weaponId as WeaponId) || 'm416',
      outfitId: (init.outfitId as OutfitId) || 'woodland_specops',
      helmetId: (init.helmetId as HelmetId) || 'ballistic',
      customGlbId,
      customGlbFlip,
      emote: (init.emoteId as EmoteId) || 'none',
      hp: init.hp ?? 100,
      alive: init.alive ?? true,
      kills: init.kills ?? 0,
      deaths: init.deaths ?? 0,
      damage: init.damage ?? 0,
      recoil: 0,
    });

    if (customGlbId) {
      loadGlbTemplate(customGlbId).then((tpl) => {
        if (this.disposed || !tpl) return;
        const current = this.remotes.get(init.id);
        if (current && current.customGlbId === customGlbId) {
          current.rig.setCustomGlb(tpl, current.customGlbFlip);
        }
      });
    }
  }

  public syncRemoteRosterModels(players: RoomPlayerInfo[], teamMode?: TeamMode) {
    if (teamMode) this.teamMode = teamMode;
    const selfPlayer = players.find((p) => p.id === this.opts.localPlayerId);
    if (selfPlayer) this.localTeam = selfPlayer.team;
    this.localRig.setTeamMarker(this.teamMode === 'teams' ? this.localTeam : 'free');

    for (const p of players) {
      if (p.id === this.opts.localPlayerId) continue;
      const r = this.remotes.get(p.id);
      if (!r) continue;
      r.name = p.name;
      r.team = p.team ?? 'free';
      if (r.outfitId !== p.outfitId || r.helmetId !== p.helmetId) {
        r.outfitId = p.outfitId;
        r.helmetId = p.helmetId;
        r.rig.setLoadout(r.outfitId, r.helmetId, r.weaponId);
      }
      r.rig.setHealthBar(r.hp, r.name, this.isFriendlyTeam(r.team), r.team);
      r.rig.setTeamMarker(this.teamMode === 'teams' ? r.team : 'free');

      const nextGlbId = p.customGlbId ?? null;
      const nextFlip = Boolean(p.customGlbFlip);
      if (nextGlbId !== (r.customGlbId ?? null) || nextFlip !== Boolean(r.customGlbFlip)) {
        r.customGlbId = nextGlbId;
        r.customGlbFlip = nextFlip;
        if (nextGlbId) {
          loadGlbTemplate(nextGlbId).then((tpl) => {
            if (this.disposed) return;
            const current = this.remotes.get(p.id);
            if (current && current.customGlbId === nextGlbId) {
              current.rig.setCustomGlb(tpl, Boolean(current.customGlbFlip));
            }
          });
        } else {
          r.rig.setCustomGlb(null, false);
        }
      }
    }
  }

  public removeRemoteActor(id: string) {
    const r = this.remotes.get(id);
    if (!r) return;
    for (const v of this.map.vehicles) {
      if (v.driverId === id) v.driverId = null;
      if (v.passengerId === id) v.passengerId = null;
    }
    this.scene.remove(r.rig.root);
    r.rig.dispose();
    this.remotes.delete(id);
  }

  public applyRemoteState(pkt: RemoteStatePacket) {
    const r = this.remotes.get(pkt.id);
    if (!r) return;
    if (pkt.team) r.team = pkt.team;
    r.targetX = pkt.x;
    r.targetY = pkt.y;
    r.targetZ = pkt.z;
    r.targetYaw = pkt.yaw;
    r.pitch = pkt.pitch;
    r.crouch = pkt.crouch;
    r.prone = Boolean(pkt.prone);
    r.ridingCarpet = Boolean(pkt.ridingCarpet);
    r.parachuting = Boolean(pkt.parachuting);
    r.vehicleId = pkt.vehicleId ?? null;
    r.vehicleSeat = pkt.vehicleSeat ?? null;
    r.peek = pkt.peek;
    r.emote = (pkt.emoteId as EmoteId) || 'none';
    r.hp = pkt.hp;
    r.alive = pkt.alive;
    r.rig.root.visible = pkt.alive;
    r.rig.setHealthBar(pkt.hp, r.name, this.isFriendlyTeam(r.team), r.team);
    r.rig.setTeamMarker(this.teamMode === 'teams' ? r.team : 'free');
    if (pkt.weaponId && pkt.weaponId !== r.weaponId) {
      r.weaponId = pkt.weaponId as WeaponId;
      r.rig.setLoadout(r.outfitId, r.helmetId, r.weaponId);
    }
  }

  public applyRemoteVehicle(pkt: VehicleNetState) {
    const v = this.map.vehicles.find((item) => item.id === pkt.id);
    if (!v) return;
    const isDrivingLocally = this.activeVehicleId === v.id && this.activeVehicleSeat === 0;
    if (!isDrivingLocally) {
      const dist = Math.hypot(pkt.x - v.x, pkt.z - v.z);
      v.x = pkt.x;
      v.y = pkt.y;
      v.z = pkt.z;
      v.yaw = pkt.yaw;
      v.rig.group.position.set(v.x, v.y, v.z);
      v.rig.group.rotation.y = v.yaw;
      if (dist > 0.01) {
        v.wheelSpin += dist * 2.2;
        v.rig.wheels.forEach((w) => {
          w.rotation.x = v.wheelSpin;
        });
      }
    }
    if (this.activeVehicleId !== v.id || this.activeVehicleSeat !== 0) {
      v.driverId = pkt.driverId;
    }
    if (this.activeVehicleId !== v.id || this.activeVehicleSeat !== 1) {
      v.passengerId = pkt.passengerId;
    }
  }

  public applyRemoteFire(pkt: RemoteFirePacket) {
    const r = this.remotes.get(pkt.id);
    if (r) {
      r.recoil = 0.22;
      const dist = Math.hypot(r.x - this.pos.x, r.z - this.pos.z);
      soundEngine.playGunshot(pkt.weaponId as WeaponId, dist);
    }
    const origin = new THREE.Vector3(...pkt.origin);
    const dir = new THREE.Vector3(...pkt.dir);
    const end = origin.clone().addScaledVector(dir, 90);
    this.spawnTracer(origin, end, 0xfef08a);
  }

  public applyRemoteGrenade(
    origin: [number, number, number],
    vel: [number, number, number],
    grenadeType: GrenadeType = 'frag',
  ) {
    this.spawnGrenadeProjectile(
      new THREE.Vector3(...origin),
      new THREE.Vector3(...vel),
      false,
      grenadeType,
    );
  }

  public applyNetworkDamage(hp: number) {
    this.hp = hp;
    this.damageFlash = 1.0;
  }

  public applyNetworkKill(
    killerId: string,
    _killerName: string,
    victimId: string,
    _victimName: string,
    _weaponName: string,
    _isHeadshot: boolean,
    scoreboard: { id: string; kills: number; deaths: number; damage: number }[],
  ) {
    if (killerId === this.opts.localPlayerId) {
      soundEngine.playKillChime();
      this.grenadeCounts.frag = Math.min(6, this.grenadeCounts.frag + 1);
    }
    if (victimId === this.opts.localPlayerId) {
      this.alive = false;
      this.burnUntil = 0;
      this.respawnAt = performance.now() + 3000;
      this.localRig.root.visible = false;
      this.scoped = false;
      this.aimingGrenade = false;
      this.exitActiveVehicle();
      this.dismountCarpet();
      this.parachuting = false;
    } else {
      const r = this.remotes.get(victimId);
      if (r) {
        r.alive = false;
        r.rig.root.visible = false;
        r.vehicleId = null;
        r.vehicleSeat = null;
      }
      this.burningRemotes.delete(victimId);
      for (const v of this.map.vehicles) {
        if (v.driverId === victimId) v.driverId = null;
        if (v.passengerId === victimId) v.passengerId = null;
      }
    }
    for (const row of scoreboard) {
      if (row.id === this.opts.localPlayerId) {
        this.kills = row.kills;
        this.deaths = row.deaths;
        this.damageDealt = row.damage;
      } else {
        const r = this.remotes.get(row.id);
        if (r) {
          r.kills = row.kills;
          r.deaths = row.deaths;
          r.damage = row.damage;
        }
      }
    }
  }

  public applyNetworkRespawn(id: string, x: number, y: number, z: number, hp: number) {
    if (id === this.opts.localPlayerId) {
      this.pos.set(x, y, z);
      this.hp = hp;
      this.burnUntil = 0;
      this.alive = true;
      this.prone = false;
      this.crouch = false;
      this.ridingCarpet = false;
      this.parachuting = false;
      this.activeVehicleId = null;
      this.activeVehicleSeat = null;
      this.velX = 0;
      this.velY = 0;
      this.velZ = 0;
      this.airLaunchUntil = 0;
      this.localRig.root.visible = true;
    } else {
      const r = this.remotes.get(id);
      if (r) {
        r.x = x;
        r.y = y;
        r.z = z;
        r.targetX = x;
        r.targetY = y;
        r.targetZ = z;
        r.hp = hp;
        r.alive = true;
        r.vehicleId = null;
        r.vehicleSeat = null;
        r.rig.root.visible = true;
        r.rig.setHealthBar(hp, r.name, this.isFriendlyTeam(r.team), r.team);
        r.rig.setTeamMarker(this.teamMode === 'teams' ? r.team : 'free');
      }
    }
  }

  // ======================== HUD / TOUCH CONTROLS API ========================
  public updatePlayerLoadout(
    outfitId: OutfitId,
    helmetId: HelmetId,
    callsign: string,
    customGlbId?: string | null,
    customGlbFlip?: boolean,
  ) {
    this.opts.loadout = {
      ...this.opts.loadout,
      outfitId,
      helmetId,
      callsign,
      customGlbId,
      customGlbFlip,
    };
    this.localRig.setLoadout(outfitId, helmetId, this.weapons[this.activeSlot]);
    if (customGlbId) {
      loadGlbTemplate(customGlbId).then((tpl) => {
        if (!this.disposed) this.localRig.setCustomGlb(tpl, Boolean(customGlbFlip));
      });
    } else if (customGlbId === null) {
      this.localRig.setCustomGlb(null, false);
    }
  }

  public setSensitivity(val: number) {
    this.sensitivity = THREE.MathUtils.clamp(val, 0.3, 2.5);
  }

  public setJoystick(x: number, y: number) {
    this.joyVec.x = THREE.MathUtils.clamp(x, -1, 1);
    this.joyVec.y = THREE.MathUtils.clamp(y, -1, 1);
  }

  public addLookDelta(dx: number, dy: number) {
    const fovScale = THREE.MathUtils.clamp(this.camFov / 68, 0.065, 1.0);
    const baseSens = 0.0042 * fovScale * this.sensitivity;
    if (this.activeVehicleId && this.activeVehicleSeat === 0) {
      this.pitch = THREE.MathUtils.clamp(this.pitch - dy * baseSens, -0.36, 0.48);
      return;
    }
    this.yaw -= dx * baseSens;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * baseSens, -0.78, 0.88);
  }

  public setCarpetAscend(held: boolean) {
    this.carpetAscendHeld = held;
  }

  public setCarpetDescend(held: boolean) {
    this.carpetDescendHeld = held;
  }

  public dismountCarpet() {
    if (!this.ridingCarpet) return;
    this.ridingCarpet = false;
    this.carpetAscendHeld = false;
    this.carpetDescendHeld = false;
    if (this.activeCarpetSpawn) {
      this.activeCarpetSpawn.available = false;
      this.activeCarpetSpawn.respawnAt = performance.now() + 8000;
      this.activeCarpetSpawn = null;
    }
    const groundHere = this.map.getTerrainHeight(this.pos.x, this.pos.z);
    if (this.pos.y - groundHere > 4.2) {
      this.parachuting = true;
      this.grounded = false;
      this.velY = -2.0;
      soundEngine.playParachuteOpen();
    } else {
      soundEngine.playUiClick();
    }
  }

  public triggerJump() {
    if (!this.alive) return;
    if (this.ridingCarpet || this.parachuting || this.activeVehicleId) return;
    if (this.prone) {
      this.prone = false;
      this.crouch = false;
      soundEngine.playUiClick();
      return;
    }
    if (this.grounded) {
      this.velY = 7.4;
      this.grounded = false;
      this.crouch = false;
      soundEngine.playFootstep();
    }
  }

  public toggleCrouch() {
    if (this.activeVehicleId) return;
    if (this.ridingCarpet) {
      this.crouch = !this.crouch;
      return;
    }
    this.crouch = !this.crouch;
    if (this.crouch) this.prone = false;
    soundEngine.playUiClick();
  }

  public toggleProne() {
    if (!this.alive || this.ridingCarpet || this.parachuting || this.activeVehicleId) return;
    this.prone = !this.prone;
    if (this.prone) {
      this.crouch = false;
      this.peek = 0;
    }
    soundEngine.playUiClick();
  }

  public togglePeek(dir: -1 | 1) {
    if (this.prone) return;
    this.peek = this.peek === dir ? 0 : dir;
    soundEngine.playUiClick();
  }

  public setFireHeld(held: boolean) {
    this.fireHeld = held;
    if (held) soundEngine.unlock();
  }

  public triggerMelee() {
    if (!this.alive) return;
    const now = performance.now();
    if (now < this.nextMeleeAt) return;
    soundEngine.unlock();

    this.meleeStart = now;
    this.meleeUntil = now + 360;
    this.nextMeleeAt = now + 440;
    this.emote = 'none';
    this.scoped = false;

    const enemyMeshes: THREE.Object3D[] = [];
    for (const b of this.bots) {
      if (b.alive) enemyMeshes.push(b.rig.root);
    }
    for (const r of this.remotes.values()) {
      if (r.alive && !this.isFriendlyTeam(r.team)) enemyMeshes.push(r.rig.root);
    }

    _raycaster.camera = this.camera;
    _rayOrigin.set(this.pos.x, this.pos.y + (this.prone ? 0.36 : this.crouch ? 1.0 : 1.45), this.pos.z);
    this.camera.getWorldDirection(_rayDir);
    _raycaster.set(_rayOrigin, _rayDir);
    _raycaster.far = 2.7;

    let hitEnemy = false;
    const actorHits = enemyMeshes.length > 0 ? _raycaster.intersectObjects(enemyMeshes, true) : [];

    // Also allow generous close-quarter fist radius check in front cone
    let targetId = '';
    let isHead = false;
    if (actorHits.length > 0) {
      targetId = String(actorHits[0].object.userData.actorId || '');
      isHead = actorHits[0].object.userData.hitZone === 'head';
      hitEnemy = Boolean(targetId);
    } else {
      const fwdX = Math.sin(this.yaw);
      const fwdZ = Math.cos(this.yaw);
      let bestD = 2.45;
      for (const b of this.bots) {
        if (!b.alive) continue;
        const dx = b.x - this.pos.x;
        const dz = b.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < bestD && Math.abs(b.y - this.pos.y) < 1.6) {
          const dot = (dx / Math.max(0.01, d)) * fwdX + (dz / Math.max(0.01, d)) * fwdZ;
          if (dot > 0.35) {
            bestD = d;
            targetId = b.id;
            hitEnemy = true;
          }
        }
      }
      for (const r of this.remotes.values()) {
        if (!r.alive || this.isFriendlyTeam(r.team)) continue;
        const dx = r.x - this.pos.x;
        const dz = r.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < bestD && Math.abs(r.y - this.pos.y) < 1.6) {
          const dot = (dx / Math.max(0.01, d)) * fwdX + (dz / Math.max(0.01, d)) * fwdZ;
          if (dot > 0.35) {
            bestD = d;
            targetId = r.id;
            hitEnemy = true;
          }
        }
      }
    }

    soundEngine.playPunch(hitEnemy);

    if (hitEnemy && targetId) {
      const dmg = isHead ? 72 : 42;
      this.hitMarker = isHead ? 'head' : 'body';
      this.hitMarkerUntil = now + 200;
      soundEngine.playHitMarker(isHead);

      const bot = this.bots.find((b) => b.id === targetId);
      if (bot && bot.alive) {
        bot.hp -= dmg;
        this.damageDealt += dmg;
        bot.rig.setHealthBar(bot.hp, bot.name, false, 'free', bot.maxHp);
        bot.targetYaw = Math.atan2(this.pos.x - bot.x, this.pos.z - bot.z);
        if (bot.hp <= 0) {
          this.handleBotKilledByLocal(bot, now);
        }
      } else if (this.remotes.has(targetId)) {
        const rem = this.remotes.get(targetId)!;
        if (!this.isFriendlyTeam(rem.team)) {
          this.opts.onSendHit?.(targetId, dmg, isHead, 'ضربة يد');
        }
      }
    }
  }

  public toggleScope() {
    this.scoped = !this.scoped;
    soundEngine.playUiClick();
  }

  public switchWeapon(slot: 0 | 1) {
    if (this.activeSlot === slot) return;
    this.activeSlot = slot;
    this.reloadingUntil = 0;
    this.scoped = false;
    this.localRig.setLoadout(this.opts.loadout.outfitId, this.opts.loadout.helmetId, this.weapons[slot]);
    soundEngine.playReload();
  }

  public triggerReload() {
    const spec = getWeaponSpec(this.weapons[this.activeSlot]);
    if (this.ammo[this.activeSlot] >= spec.magSize) return;
    if (this.reloadingUntil > performance.now()) return;
    this.reloadingUntil = performance.now() + spec.reloadMs;
    this.scoped = false;
    soundEngine.playReload();
  }

  public triggerEmote(emote: Exclude<EmoteId, 'none'>) {
    const spec = EMOTES.find((e) => e.id === emote);
    this.emote = emote;
    this.emoteUntil = performance.now() + (spec?.durationMs || 3200);
    this.scoped = false;
  }

  private handleBotKilledByLocal(bot: BotActor, now: number) {
    bot.alive = false;
    bot.deaths += 1;
    bot.respawnAt = now + 3500;
    bot.rig.root.visible = false;
    this.spawnDeathWeaponDrop(bot.x, bot.y, bot.z, bot.weaponId);
    this.spawnDeathGrenadeDrop(bot.x, bot.y, bot.z);
    this.kills += 1;
    this.grenadeCounts.frag = Math.min(6, this.grenadeCounts.frag + 1);
    soundEngine.playKillChime();
  }

  // ======================== GRENADES (FRAG, SMOKE, MOLOTOV) ========================
  public setGrenadeType(type: GrenadeType) {
    this.selectedGrenadeType = type;
    this.lastHudEmit = 0;
    soundEngine.playUiClick();
  }

  public getSelectedGrenadeType(): GrenadeType {
    return this.selectedGrenadeType;
  }

  public cancelGrenadeAim() {
    this.aimingGrenade = false;
    this.arcLine.visible = false;
    this.arcTargetRing.visible = false;
  }

  public startGrenadeAim() {
    if (!this.alive || this.grenadeCounts[this.selectedGrenadeType] <= 0) return;
    soundEngine.unlock();
    this.aimingGrenade = true;
    this.scoped = false;
    soundEngine.playGrenadePin();
  }

  public releaseGrenadeThrow() {
    if (!this.aimingGrenade) return;
    this.aimingGrenade = false;
    this.arcLine.visible = false;
    this.arcTargetRing.visible = false;

    const gType = this.selectedGrenadeType;
    if (!this.alive || this.grenadeCounts[gType] <= 0) return;
    this.grenadeCounts[gType] -= 1;

    const { origin, vel } = this.computeGrenadeLaunch();
    this.spawnGrenadeProjectile(origin.clone(), vel.clone(), true, gType);
    this.opts.onSendGrenade?.([origin.x, origin.y, origin.z], [vel.x, vel.y, vel.z], gType);
  }

  private getSurfaceHeightAt(x: number, z: number, maxY = 100): number {
    let h = this.map.getTerrainHeight(x, z);
    for (const w of this.map.walkableFloors) {
      if (x >= w.minX && x <= w.maxX && z >= w.minZ && z <= w.maxZ) {
        if (w.maxY <= maxY + 0.35 && w.maxY > h) {
          h = w.maxY;
        }
      }
    }
    return h;
  }

  private computeGrenadeLaunch(): { origin: THREE.Vector3; vel: THREE.Vector3 } {
    const origin = _v1.set(
      this.pos.x,
      this.pos.y + (this.prone ? 0.55 : this.crouch ? 1.2 : 1.62),
      this.pos.z,
    );
    // Long-range tactical throw (~38m max cap when aimed at 45 deg, still bounded)
    const speed = 25.5;
    const launchPitch = THREE.MathUtils.clamp(this.pitch + 0.42, -0.28, 1.15);
    const cosP = Math.cos(launchPitch);
    const vel = _v2.set(
      Math.sin(this.yaw) * cosP * speed,
      Math.sin(launchPitch) * speed,
      Math.cos(this.yaw) * cosP * speed,
    );
    return { origin, vel };
  }

  private updateGrenadeArcPreview() {
    if (!this.aimingGrenade || !this.alive) {
      this.arcLine.visible = false;
      this.arcTargetRing.visible = false;
      return;
    }

    const { origin, vel } = this.computeGrenadeLaunch();
    const attr = this.arcLine.geometry.getAttribute('position') as THREE.BufferAttribute;
    const gravity = -16.5;
    let landingX = origin.x;
    let landingY = origin.y;
    let landingZ = origin.z;
    let landed = false;

    for (let i = 0; i < 26; i++) {
      const t = i * 0.105;
      const px = origin.x + vel.x * t;
      const py = origin.y + vel.y * t + 0.5 * gravity * t * t;
      const pz = origin.z + vel.z * t;
      const groundH = this.getSurfaceHeightAt(px, pz, landingY + 1.2);

      if (!landed && py <= groundH + 0.06) {
        landed = true;
        landingX = px;
        landingY = groundH + 0.06;
        landingZ = pz;
      }
      attr.setXYZ(i, landed ? landingX : px, landed ? landingY : py, landed ? landingZ : pz);
      if (!landed) {
        landingX = px;
        landingY = Math.max(groundH + 0.06, py);
        landingZ = pz;
      }
    }
    attr.needsUpdate = true;
    const arcColor =
      this.selectedGrenadeType === 'smoke'
        ? 0x38bdf8
        : this.selectedGrenadeType === 'molotov'
          ? 0xf97316
          : 0xf59e0b;
    (this.arcLine.material as THREE.LineBasicMaterial).color.setHex(arcColor);
    (this.arcTargetRing.material as THREE.MeshBasicMaterial).color.setHex(
      this.selectedGrenadeType === 'smoke' ? 0x38bdf8 : 0xef4444,
    );
    this.arcLine.visible = true;
    this.arcTargetRing.position.set(
      landingX,
      this.getSurfaceHeightAt(landingX, landingZ, landingY + 0.5) + 0.08,
      landingZ,
    );
    this.arcTargetRing.visible = true;
  }

  private spawnGrenadeProjectile(
    origin: THREE.Vector3,
    vel: THREE.Vector3,
    isLocalOwner: boolean,
    type: GrenadeType = 'frag',
    ownerBotId?: string,
  ) {
    const mesh = buildGrenadeMesh(type);
    mesh.position.copy(origin);
    this.scene.add(mesh);

    this.activeGrenades.push({
      type,
      mesh,
      pos: origin,
      vel,
      hasLanded: false,
      landAt: 0,
      explodeAt: Infinity, // NEVER explode mid-air before touching ground/floor!
      isLocalOwner,
      ownerBotId,
    });
  }

  private disposeGroupResources(grp: THREE.Object3D) {
    grp.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (m.geometry && !m.userData.sharedGeo) m.geometry.dispose();
      if (m.material) {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach((mat) => mat.dispose());
      }
    });
  }

  private detonateGrenade(
    type: GrenadeType,
    pos: THREE.Vector3,
    isLocalOwner: boolean,
    ownerBotId?: string,
  ) {
    const distToPlayer = pos.distanceTo(this.pos);
    const now = performance.now();

    if (type === 'smoke') {
      soundEngine.playSmokeHiss(distToPlayer);
      const smokeGroup = new THREE.Group();
      smokeGroup.position.copy(pos);
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        const rOff = i < 2 ? 0.8 : 2.2 + (i % 3) * 0.65;
        const puffMat = new THREE.MeshStandardMaterial({
          color: i % 2 === 0 ? 0xcbd5e1 : 0x94a3b8,
          roughness: 0.96,
          metalness: 0.0,
          transparent: true,
          opacity: 0.62,
          depthWrite: false,
        });
        const puff = new THREE.Mesh(this.sharedSmokePuffGeo, puffMat);
        puff.position.set(
          Math.cos(ang) * rOff,
          1.1 + (i % 4) * 0.65,
          Math.sin(ang) * rOff,
        );
        const s = 1.75 + (i % 3) * 0.55;
        puff.scale.set(s, s * 0.85, s);
        puff.userData.sharedGeo = true;
        puff.userData.baseX = puff.position.x;
        puff.userData.baseY = puff.position.y;
        puff.userData.baseZ = puff.position.z;
        puff.userData.phase = i * 0.7;
        puff.raycast = () => {};
        smokeGroup.add(puff);
      }
      this.scene.add(smokeGroup);
      this.smokeZones.push({
        group: smokeGroup,
        pos: pos.clone(),
        radius: 6.2,
        startedAt: now,
        expiresAt: now + 11000,
      });
      return;
    }

    if (type === 'molotov') {
      soundEngine.playMolotovShatterFire(distToPlayer);
      const fireGroup = new THREE.Group();
      fireGroup.position.copy(pos);

      const scorch = new THREE.Mesh(
        this.sharedFireScorchGeo,
        new THREE.MeshBasicMaterial({
          color: 0x1c120c,
          transparent: true,
          opacity: 0.62,
          depthWrite: false,
        }),
      );
      scorch.rotation.x = -Math.PI / 2;
      scorch.position.y = 0.04;
      scorch.userData.sharedGeo = true;
      scorch.raycast = () => {};
      fireGroup.add(scorch);

      const emberRing = new THREE.Mesh(
        this.sharedFireEmberGeo,
        new THREE.MeshBasicMaterial({
          color: 0xf97316,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.58,
          depthWrite: false,
        }),
      );
      emberRing.rotation.x = -Math.PI / 2;
      emberRing.position.y = 0.06;
      emberRing.userData.sharedGeo = true;
      emberRing.raycast = () => {};
      fireGroup.add(emberRing);

      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        const rad = i === 0 ? 0 : 1.0 + (i % 3) * 1.2;
        const fMat = new THREE.MeshBasicMaterial({
          color: i % 2 === 0 ? 0xf97316 : 0xfacc15,
          transparent: true,
          opacity: 0.84,
        });
        const flame = new THREE.Mesh(this.sharedFireFlameGeo, fMat);
        flame.position.set(Math.cos(ang) * rad, 0.62, Math.sin(ang) * rad);
        flame.userData.sharedGeo = true;
        flame.userData.phase = i * 1.1;
        flame.raycast = () => {};
        fireGroup.add(flame);
      }

      this.scene.add(fireGroup);
      this.fireZones.push({
        group: fireGroup,
        pos: pos.clone(),
        radius: 4.7,
        startedAt: now,
        expiresAt: now + 8500,
        nextTickAt: now, // Ignite immediately on shatter
        isLocalOwner,
        ownerBotId,
      });
      return;
    }

    // FRAG GRENADE (Lethal direct hit in front of target; >= 50% HP splash at mid-range)
    soundEngine.playExplosion(distToPlayer);

    const sphere = new THREE.Mesh(
      this.sharedBlastSphereGeo,
      new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.85 }),
    );
    sphere.position.copy(pos);
    sphere.userData.sharedGeo = true;
    const ring = new THREE.Mesh(
      this.sharedBlastRingGeo,
      new THREE.MeshBasicMaterial({ color: 0xfbbf24, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, pos.y + 0.12, pos.z);
    ring.userData.sharedGeo = true;
    this.scene.add(sphere, ring);

    this.blasts.push({
      sphere,
      ring,
      startedAt: now,
      duration: 520,
    });

    if (!isLocalOwner && !ownerBotId) return;

    const ownerBot = ownerBotId ? this.bots.find((b) => b.id === ownerBotId) : undefined;
    const blastRadius = 10.5;
    const directKillRadius = 3.6;

    for (const bot of this.bots) {
      if (!bot.alive || (ownerBotId && bot.id === ownerBotId)) continue;
      const dx = bot.x - pos.x;
      const dz = bot.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d <= blastRadius && Math.abs(bot.y - pos.y) < 4.8) {
        let dmg: number;
        if (d <= directKillRadius) {
          dmg = 220; // Exploding right in front -> instant kill
        } else {
          const t = THREE.MathUtils.clamp((d - directKillRadius) / (blastRadius - directKillRadius), 0, 1);
          dmg = Math.round(bot.maxHp * THREE.MathUtils.lerp(0.85, 0.55, t)); // 55%-85% HP splash
        }
        bot.hp -= dmg;
        if (isLocalOwner) {
          this.damageDealt += dmg;
          this.hitMarker = 'body';
          this.hitMarkerUntil = now + 220;
        } else if (ownerBot) {
          ownerBot.damage += dmg;
        }
        if (d > 0.05) {
          const push = (1 - d / (blastRadius + 2)) * 9.5;
          bot.velX += (dx / d) * push;
          bot.velZ += (dz / d) * push;
          bot.velY = Math.max(bot.velY, 3.8);
          bot.grounded = false;
        }
        bot.rig.setHealthBar(bot.hp, bot.name, false, 'free', bot.maxHp);
        if (bot.hp <= 0) {
          if (isLocalOwner) {
            this.handleBotKilledByLocal(bot, now);
          } else {
            bot.alive = false;
            bot.deaths += 1;
            bot.respawnAt = now + 3500;
            bot.rig.root.visible = false;
            this.spawnDeathWeaponDrop(bot.x, bot.y, bot.z, bot.weaponId);
            this.spawnDeathGrenadeDrop(bot.x, bot.y, bot.z);
            if (ownerBot) ownerBot.kills += 1;
          }
        }
      }
    }

    if (isLocalOwner) {
      for (const r of this.remotes.values()) {
        if (!r.alive || this.isFriendlyTeam(r.team)) continue;
        const d = Math.hypot(r.x - pos.x, r.z - pos.z);
        if (d <= blastRadius && Math.abs(r.y - pos.y) < 4.8) {
          let dmg: number;
          if (d <= directKillRadius) {
            dmg = 155;
          } else {
            const t = THREE.MathUtils.clamp((d - directKillRadius) / (blastRadius - directKillRadius), 0, 1);
            dmg = Math.round(100 * THREE.MathUtils.lerp(0.85, 0.55, t));
          }
          this.opts.onSendHit?.(r.id, dmg, false, 'قنبلة شظايا');
        }
      }
    }

    if (this.alive && distToPlayer <= blastRadius * 0.85) {
      let dmg: number;
      if (isLocalOwner) {
        if (distToPlayer <= 2.9) {
          dmg = 155;
        } else {
          const t = THREE.MathUtils.clamp((distToPlayer - 2.9) / (blastRadius * 0.85 - 2.9), 0, 1);
          dmg = Math.round(100 * THREE.MathUtils.lerp(0.76, 0.52, t));
        }
      } else {
        // Bot-thrown frag vs player: thrilling tactical hit with fair survival counterplay
        if (distToPlayer <= 2.8) {
          dmg = 68;
        } else {
          const t = THREE.MathUtils.clamp((distToPlayer - 2.8) / (blastRadius * 0.85 - 2.8), 0, 1);
          dmg = Math.round(THREE.MathUtils.lerp(48, 22, t));
        }
      }
      this.applyLocalDamage(dmg, distToPlayer <= 2.9);
      if (!this.alive && ownerBot) ownerBot.kills += 1;
    }
  }

  private applyLocalDamage(dmg: number, ignoreArmor = false) {
    if (!this.alive || dmg <= 0) return;
    const armorAbsorb = ignoreArmor ? 0 : Math.min(this.armor, dmg * 0.45);
    this.armor -= armorAbsorb;
    this.hp = Math.max(0, this.hp - Math.round(dmg - armorAbsorb));
    this.damageFlash = 0.85;
    if (this.hp <= 0) {
      this.alive = false;
      this.burnUntil = 0;
      this.deaths += 1;
      this.respawnAt = performance.now() + 3000;
      this.localRig.root.visible = false;
      this.scoped = false;
      this.prone = false;
      this.aimingGrenade = false;
      this.exitActiveVehicle();
      this.dismountCarpet();
      this.parachuting = false;
    }
  }

  private isBlockedBySmoke(ax: number, az: number, bx: number, bz: number): boolean {
    if (this.smokeZones.length === 0) return false;
    const dx = bx - ax;
    const dz = bz - az;
    const lenSq = dx * dx + dz * dz;
    if (lenSq < 0.01) return false;
    for (const sz of this.smokeZones) {
      const t = THREE.MathUtils.clamp(((sz.pos.x - ax) * dx + (sz.pos.z - az) * dz) / lenSq, 0, 1);
      const cx = ax + dx * t;
      const cz = az + dz * t;
      const dist = Math.hypot(cx - sz.pos.x, cz - sz.pos.z);
      if (dist < sz.radius * 0.92) return true;
    }
    return false;
  }

  private spawnDeathGrenadeDrop(x: number, y: number, z: number) {
    const dynamicGrenades = this.map.crates.filter((c) => c.isDynamicDrop && c.isGrenadeDrop);
    if (dynamicGrenades.length >= 16) {
      const oldest = dynamicGrenades[0];
      this.map.group.remove(oldest.mesh);
      this.disposeGroupResources(oldest.mesh);
      const idx = this.map.crates.indexOf(oldest);
      if (idx >= 0) this.map.crates.splice(idx, 1);
    }

    const roll = Math.random();
    const gType: GrenadeType = roll < 0.5 ? 'frag' : roll < 0.78 ? 'smoke' : 'molotov';
    const ox = x + 0.72;
    const oz = z + 0.35;
    const gy = Math.max(y, this.map.getTerrainHeight(ox, oz));

    const dropGroup = new THREE.Group();
    dropGroup.position.set(ox, gy, oz);

    const ringColor = gType === 'smoke' ? 0x38bdf8 : gType === 'molotov' ? 0xf97316 : 0x22c55e;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.24, 16),
      new THREE.MeshBasicMaterial({ color: ringColor, side: THREE.DoubleSide, transparent: true, opacity: 0.78 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    ring.raycast = () => {};
    dropGroup.add(ring);

    const gMesh = buildGrenadeMesh(gType);
    gMesh.scale.setScalar(1.05);
    gMesh.position.set(0, 0.16, 0);
    gMesh.traverse((ch) => {
      ch.raycast = () => {};
    });
    dropGroup.add(gMesh);

    const marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.05, 0),
      new THREE.MeshBasicMaterial({ color: ringColor }),
    );
    marker.position.y = 0.45;
    marker.raycast = () => {};
    dropGroup.add(marker);

    this.map.group.add(dropGroup);
    this.map.crates.push({
      id: `gdrop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      x: ox,
      y: gy,
      z: oz,
      grenadeType: gType,
      isGrenadeDrop: true,
      isDynamicDrop: true,
      available: true,
      respawnAt: 0,
      mesh: dropGroup,
    });
  }

  private spawnDeathWeaponDrop(x: number, y: number, z: number, weaponId: WeaponId) {
    // Limit active dynamic enemy drops to 14 to keep scene light & clean
    const dynamicDrops = this.map.crates.filter((c) => c.isDynamicDrop && !c.isGrenadeDrop);
    if (dynamicDrops.length >= 14) {
      const oldest = dynamicDrops[0];
      this.map.group.remove(oldest.mesh);
      this.disposeGroupResources(oldest.mesh);
      const idx = this.map.crates.indexOf(oldest);
      if (idx >= 0) this.map.crates.splice(idx, 1);
    }

    const dropGroup = new THREE.Group();
    const gy = Math.max(y, this.map.getTerrainHeight(x, z));
    dropGroup.position.set(x, gy, z);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.24, 0.34, 20),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.75 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    ring.raycast = () => {};
    dropGroup.add(ring);

    const wModel = buildWeaponMesh(weaponId);
    wModel.group.scale.set(0.92, 0.92, 0.92);
    wModel.group.position.set(0, 0.2, 0);
    wModel.group.rotation.z = 0.2;
    wModel.group.traverse((ch) => {
      ch.raycast = () => {};
    });
    dropGroup.add(wModel.group);

    const marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.065, 0),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 }),
    );
    marker.position.y = 0.56;
    marker.raycast = () => {};
    dropGroup.add(marker);

    this.map.group.add(dropGroup);
    this.map.crates.push({
      id: `drop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      x,
      y: gy,
      z,
      weaponId,
      isGroundWeapon: true,
      isDynamicDrop: true,
      available: true,
      respawnAt: 0,
      mesh: dropGroup,
    });
  }

  // ======================== VEHICLES (CAR & 2-SEAT MOTORCYCLE) ========================
  public exitActiveVehicle() {
    if (!this.activeVehicleId) return;
    const v = this.map.vehicles.find((item) => item.id === this.activeVehicleId);
    const prevSeat = this.activeVehicleSeat;
    this.activeVehicleId = null;
    this.activeVehicleSeat = null;
    if (v) {
      if (prevSeat === 0 && v.driverId === this.opts.localPlayerId) {
        v.driverId = null;
        v.velX = 0;
        v.velZ = 0;
      }
      if (prevSeat === 1 && v.passengerId === this.opts.localPlayerId) {
        v.passengerId = null;
      }
      const sideSign = prevSeat === 1 ? 1 : -1;
      const exitDist = v.kind === 'car' ? 2.1 : 1.35;
      this.pos.set(
        v.x + Math.cos(v.yaw) * exitDist * sideSign,
        this.map.getTerrainHeight(v.x + Math.cos(v.yaw) * exitDist * sideSign, v.z - Math.sin(v.yaw) * exitDist * sideSign),
        v.z - Math.sin(v.yaw) * exitDist * sideSign,
      );
      this.grounded = true;
      this.velY = 0;
      this.opts.onSendVehicleState?.({
        id: v.id,
        x: Number(v.x.toFixed(2)),
        y: Number(v.y.toFixed(2)),
        z: Number(v.z.toFixed(2)),
        yaw: Number(v.yaw.toFixed(3)),
        driverId: v.driverId,
        passengerId: v.passengerId,
      });
    }
    soundEngine.playUiClick();
  }

  private getSeatWorldPos(v: VehicleSpawn, seat: 0 | 1, out: THREE.Vector3): THREE.Vector3 {
    const off = v.rig.seatOffsets[seat];
    const cos = Math.cos(v.yaw);
    const sin = Math.sin(v.yaw);
    return out.set(
      v.x + off.x * cos + off.z * sin,
      v.y + off.y,
      v.z - off.x * sin + off.z * cos,
    );
  }

  private launchFromJumpPad(pad: JumpPad) {
    const now = performance.now();
    const targetY = pad.targetY ?? this.map.getTerrainHeight(pad.targetX, pad.targetZ);
    const g = 18.5;
    // High ballistic sky arc that clears all rooftops & perimeter walls cleanly without clipping!
    const peakY = Math.max(this.pos.y, targetY) + (pad.isRooftop ? 11.5 : 15.5);
    const vy = Math.sqrt(2 * g * Math.max(2, peakY - this.pos.y));
    const tUp = vy / g;
    const tDown = Math.sqrt((2 * Math.max(0.5, peakY - targetY)) / g);
    const flightTime = tUp + tDown;

    this.velY = vy;
    this.velX = (pad.targetX - this.pos.x) / flightTime;
    this.velZ = (pad.targetZ - this.pos.z) / flightTime;
    this.grounded = false;
    this.parachuting = false;
    this.prone = false;
    this.crouch = false;
    this.airLaunchUntil = now + flightTime * 1000 + 80;
    pad.cooldownUntil = now + 2200;
    soundEngine.playJumpPadLaunch();
  }

  public triggerInteract() {
    if (this.activeVehicleId) {
      this.exitActiveVehicle();
      return;
    }
    if (this.ridingCarpet) {
      this.dismountCarpet();
      return;
    }
    if (this.nearbyElevator) {
      const el = this.nearbyElevator;
      const inCabin =
        Math.abs(this.pos.x - el.x) <= el.halfW &&
        Math.abs(this.pos.z - el.z) <= el.halfD &&
        Math.abs(this.pos.y - el.currentY) < 1.25;
      if (inCabin) {
        el.targetY = Math.abs(el.currentY - el.minY) < 1.2 ? el.maxY : el.minY;
      } else {
        const playerAtRoof = this.pos.y > (el.minY + el.maxY) * 0.5;
        el.targetY = playerAtRoof ? el.maxY : el.minY;
      }
      soundEngine.playElevatorHum();
      return;
    }
    if (this.nearbyVehicle) {
      const v = this.nearbyVehicle;
      if (!v.driverId) {
        v.driverId = this.opts.localPlayerId;
        this.activeVehicleId = v.id;
        this.activeVehicleSeat = 0;
      } else if (!v.passengerId) {
        v.passengerId = this.opts.localPlayerId;
        this.activeVehicleId = v.id;
        this.activeVehicleSeat = 1;
      } else {
        return;
      }
      this.prone = false;
      this.crouch = false;
      this.parachuting = false;
      this.ridingCarpet = false;
      this.grounded = true;
      if (this.activeVehicleSeat === 0) {
        this.yaw = v.yaw;
      }
      this.getSeatWorldPos(v, this.activeVehicleSeat, this.pos);
      this.opts.onSendVehicleState?.({
        id: v.id,
        x: Number(v.x.toFixed(2)),
        y: Number(v.y.toFixed(2)),
        z: Number(v.z.toFixed(2)),
        yaw: Number(v.yaw.toFixed(3)),
        driverId: v.driverId,
        passengerId: v.passengerId,
      });
      soundEngine.playPickup();
      return;
    }
    if (this.nearbyCarpet && this.nearbyCarpet.available) {
      this.activeCarpetSpawn = this.nearbyCarpet;
      this.nearbyCarpet.available = false;
      this.nearbyCarpet.mesh.visible = false;
      this.ridingCarpet = true;
      this.parachuting = false;
      this.prone = false;
      this.crouch = false;
      this.grounded = false;
      this.pos.y = Math.max(this.pos.y + 1.4, this.nearbyCarpet.y + 1.8);
      this.velY = 0;
      soundEngine.playCarpetLaunch();
      return;
    }
    if (this.nearbyJumpPad && performance.now() >= this.nearbyJumpPad.cooldownUntil) {
      this.launchFromJumpPad(this.nearbyJumpPad);
      return;
    }
    if (this.nearbyCrate && this.nearbyCrate.available) {
      const c = this.nearbyCrate;
      if (c.isGrenadeDrop && c.grenadeType) {
        this.grenadeCounts[c.grenadeType] = Math.min(6, this.grenadeCounts[c.grenadeType] + 1);
      } else if (c.isMedkit) {
        this.hp = Math.min(100, this.hp + 55);
        this.armor = Math.min(100, this.armor + 35);
        this.grenadeCounts.frag = Math.min(6, this.grenadeCounts.frag + 1);
      } else if (c.weaponId) {
        this.weapons[this.activeSlot] = c.weaponId;
        this.ammo[this.activeSlot] = getWeaponSpec(c.weaponId).magSize;
        this.localRig.setLoadout(this.opts.loadout.outfitId, this.opts.loadout.helmetId, c.weaponId);
      }
      c.available = false;
      if (c.isDynamicDrop) {
        this.map.group.remove(c.mesh);
        this.disposeGroupResources(c.mesh);
        const idx = this.map.crates.indexOf(c);
        if (idx >= 0) this.map.crates.splice(idx, 1);
      } else {
        c.respawnAt = performance.now() + 18000;
        c.mesh.visible = false;
      }
      soundEngine.playPickup();
    }
  }

  public finishMatchNow() {
    if (this.matchEnded) return;
    this.matchEnded = true;
    this.opts.onMatchEnd(this.buildScoreboard());
  }

  // ======================== INPUT LISTENERS (NEVER LOCK CURSOR!) ========================
  private onKeyDown = (e: KeyboardEvent) => {
    this.keys[e.code] = true;
    if (e.code === 'Space') this.triggerJump();
    if (e.code === 'KeyC') this.toggleCrouch();
    if (e.code === 'KeyZ') this.toggleProne();
    if (e.code === 'KeyQ') this.togglePeek(-1);
    if (e.code === 'KeyE') this.togglePeek(1);
    if (e.code === 'KeyR') this.triggerReload();
    if (e.code === 'Digit1') this.switchWeapon(0);
    if (e.code === 'Digit2') this.switchWeapon(1);
    if (e.code === 'KeyF') this.triggerInteract();
    if (e.code === 'KeyV') this.triggerMelee();
    if (e.code === 'KeyG' && !e.repeat) this.startGrenadeAim();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
    if (e.code === 'KeyG') this.releaseGrenadeThrow();
  };

  private onResize = () => {
    if (this.disposed) return;
    const w = this.opts.container.clientWidth || window.innerWidth;
    const h = this.opts.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private bindEvents() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);
  }

  // ======================== PHYSICS & COLLISION ========================
  private resolveActorPosition(
    pos: THREE.Vector3,
    prevY: number,
    isCrouching = false,
    isProne = false,
    isFlying = false,
  ): { floorY: number; hitWall: boolean } {
    const r = isFlying ? 0.34 : 0.42;
    const bodyHeight = isProne ? 0.55 : isCrouching ? 1.25 : isFlying ? 1.4 : 1.78;
    const maxStep = isFlying ? 0.95 : 0.72;
    let hitWall = false;

    const maxR = this.map.arenaRadius - 2;
    const dist = Math.hypot(pos.x, pos.z);
    if (dist > maxR) {
      pos.x = (pos.x / dist) * maxR;
      pos.z = (pos.z / dist) * maxR;
      hitWall = true;
    }

    for (const c of this.map.colliders) {
      if (pos.y + bodyHeight <= c.minY + 0.05) continue;
      if (pos.y >= c.maxY - maxStep) continue;

      const closestX = THREE.MathUtils.clamp(pos.x, c.minX, c.maxX);
      const closestZ = THREE.MathUtils.clamp(pos.z, c.minZ, c.maxZ);
      const dx = pos.x - closestX;
      const dz = pos.z - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < r * r) {
        hitWall = true;
        if (distSq > 0.00001) {
          const d = Math.sqrt(distSq);
          const push = r - d;
          pos.x += (dx / d) * push;
          pos.z += (dz / d) * push;
        } else {
          const ox = Math.min(Math.abs(pos.x - c.minX), Math.abs(c.maxX - pos.x));
          const oz = Math.min(Math.abs(pos.z - c.minZ), Math.abs(c.maxZ - pos.z));
          if (ox < oz) {
            pos.x = Math.abs(pos.x - c.minX) < Math.abs(c.maxX - pos.x) ? c.minX - r : c.maxX + r;
          } else {
            pos.z = Math.abs(pos.z - c.minZ) < Math.abs(c.maxZ - pos.z) ? c.minZ - r : c.maxZ + r;
          }
        }
      }
    }

    let floorY = this.map.getTerrainHeight(pos.x, pos.z);

    for (const w of this.map.walkableFloors) {
      if (pos.x >= w.minX - 0.2 && pos.x <= w.maxX + 0.2 && pos.z >= w.minZ - 0.2 && pos.z <= w.maxZ + 0.2) {
        if (prevY >= w.maxY - 0.85 && w.maxY > floorY) {
          floorY = w.maxY;
        }
      }
    }

    for (const ramp of this.map.ramps) {
      if (pos.x >= ramp.minX && pos.x <= ramp.maxX && pos.z >= ramp.minZ && pos.z <= ramp.maxZ) {
        const t =
          ramp.axis === 'z'
            ? (pos.z - ramp.minZ) / Math.max(0.01, ramp.maxZ - ramp.minZ)
            : (pos.x - ramp.minX) / Math.max(0.01, ramp.maxX - ramp.minX);
        const ry = THREE.MathUtils.lerp(ramp.startY, ramp.endY, THREE.MathUtils.clamp(t, 0, 1));
        if (prevY >= ry - 1.1 && ry > floorY) {
          floorY = ry;
        }
      }
    }

    for (const el of this.map.elevators) {
      if (
        Math.abs(pos.x - el.x) <= el.halfW &&
        Math.abs(pos.z - el.z) <= el.halfD &&
        prevY >= el.currentY - 0.9 &&
        el.currentY > floorY
      ) {
        floorY = el.currentY;
      }
    }

    return { floorY, hitWall };
  }

  // ======================== SHOOTING & BALLISTICS ========================
  private spawnTracer(start: THREE.Vector3, end: THREE.Vector3, colorHex: number) {
    // Realistic brief supersonic ballistic streak (starts slightly ahead of barrel, fades fast)
    const dir = end.clone().sub(start);
    const totalLen = dir.length();
    if (totalLen < 0.8) return;
    dir.normalize();
    const sPt = start.clone().addScaledVector(dir, Math.min(1.4, totalLen * 0.25));
    const ePt = start.clone().addScaledVector(dir, Math.min(totalLen, 55));
    const geo = new THREE.BufferGeometry().setFromPoints([sPt, ePt]);
    const mat = new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity: 0.42 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, expiresAt: performance.now() + 42 });
  }

  private spawnImpactSpark(point: THREE.Vector3, isFlesh: boolean) {
    const spark = new THREE.Mesh(
      new THREE.SphereGeometry(isFlesh ? 0.09 : 0.11, 6, 6),
      new THREE.MeshBasicMaterial({
        color: isFlesh ? 0xdc2626 : 0xfde68a,
        transparent: true,
        opacity: 0.88,
      }),
    );
    spark.position.copy(point);
    this.scene.add(spark);
    window.setTimeout(() => {
      if (this.disposed) return;
      this.scene.remove(spark);
      spark.geometry.dispose();
      (spark.material as THREE.Material).dispose();
    }, 65);
  }

  private tryLocalFire(now: number) {
    if (!this.alive || !this.fireHeld || this.aimingGrenade || now < this.meleeUntil) return;
    if (this.reloadingUntil > now) return;

    const weaponId = this.weapons[this.activeSlot];
    const spec = getWeaponSpec(weaponId);

    if (now < this.nextFireAt) return;
    if (this.ammo[this.activeSlot] <= 0) {
      this.triggerReload();
      return;
    }

    try {
      this.ammo[this.activeSlot] -= 1;
      this.nextFireAt = now + spec.fireRateMs;
      this.recoilAmount = Math.min(0.42, this.recoilAmount + spec.recoilKick * 4.2);
      this.pitch = THREE.MathUtils.clamp(this.pitch + spec.recoilKick * (this.scoped ? 0.5 : 0.85), -0.78, 0.88);
      this.emote = 'none';

      soundEngine.playGunshot(weaponId, 0);

      this.localRig.muzzlePoint.getWorldPosition(_v1);
      this.muzzleFlashLight.position.copy(_v1);
      this.muzzleFlashLight.intensity = 5.2;
      this.muzzleFlashUntil = now + 45;

      const enemyMeshes: THREE.Object3D[] = [];
      for (const b of this.bots) {
        if (b.alive) enemyMeshes.push(b.rig.root);
      }
      for (const r of this.remotes.values()) {
        if (r.alive && !this.isFriendlyTeam(r.team)) enemyMeshes.push(r.rig.root);
      }

      _raycaster.camera = this.camera;
      const pellets = spec.pellets || 1;
      const spreadFactor = this.scoped
        ? spec.hasOpticalScope
          ? spec.spread * 0.15
          : spec.spread * 0.42
        : spec.spread;

      for (let p = 0; p < pellets; p++) {
        _rayOrigin.copy(this.camera.position);
        this.camera.getWorldDirection(_rayDir);
        _rayDir.x += (Math.random() - 0.5) * spreadFactor;
        _rayDir.y += (Math.random() - 0.5) * spreadFactor;
        _rayDir.z += (Math.random() - 0.5) * spreadFactor;
        _rayDir.normalize();

        _raycaster.set(_rayOrigin, _rayDir);
        _raycaster.far = spec.range;

        const wallHits = _raycaster.intersectObjects(this.map.raycastTargets, true);
        const wallDist = wallHits.length > 0 ? wallHits[0].distance : spec.range;

        const actorHits = enemyMeshes.length > 0 ? _raycaster.intersectObjects(enemyMeshes, true) : [];
        let hitPoint = _rayOrigin.clone().addScaledVector(_rayDir, wallDist);
        let hitEnemy = false;

        if (actorHits.length > 0 && actorHits[0].distance < wallDist) {
          const hit = actorHits[0];
          hitPoint = hit.point.clone();
          hitEnemy = true;
          const targetId = String(hit.object.userData.actorId || '');
          const isHead = hit.object.userData.hitZone === 'head';
          const dmg = Math.round(spec.damage * (isHead ? spec.headshotMult : 1));

          this.hitMarker = isHead ? 'head' : 'body';
          this.hitMarkerUntil = now + 180;
          soundEngine.playHitMarker(isHead);

          const bot = this.bots.find((b) => b.id === targetId);
          if (bot && bot.alive) {
            bot.hp -= dmg;
            this.damageDealt += dmg;
            bot.rig.setHealthBar(bot.hp, bot.name, false, 'free', bot.maxHp);
            bot.targetYaw = Math.atan2(this.pos.x - bot.x, this.pos.z - bot.z);
            bot.targetActorId = this.opts.localPlayerId;
            if (bot.hp < 55 && this.map.coverSpots.length > 0) {
              bot.crouch = true;
              bot.peek = 0;
            }
            if (bot.hp <= 0) {
              this.handleBotKilledByLocal(bot, now);
            }
          } else if (this.remotes.has(targetId)) {
            const rem = this.remotes.get(targetId)!;
            if (!this.isFriendlyTeam(rem.team)) {
              this.opts.onSendHit?.(targetId, dmg, isHead, spec.nameAr);
            }
          }
        }

        if (p === 0) {
          this.opts.onSendFire?.(
            [_v1.x, _v1.y, _v1.z],
            [_rayDir.x, _rayDir.y, _rayDir.z],
            weaponId,
          );
          this.spawnTracer(_v1.clone(), hitPoint, 0xfef08a);
        }
        if (hitEnemy || wallHits.length > 0) {
          if (p < 2) this.spawnImpactSpark(hitPoint, hitEnemy);
        }
      }

      if (this.ammo[this.activeSlot] <= 0) {
        this.triggerReload();
      }
    } catch (err) {
      console.error('Fire step recovered:', err);
    }
  }

  // ======================== PRO TACTICAL BOT AI (ALL-VS-ALL FAIR) ========================
  private updateBots(dt: number, now: number) {
    for (const bot of this.bots) {
      if (!bot.alive) {
        if (now >= bot.respawnAt) {
          const sp = this.map.spawnPoints[Math.floor(Math.random() * this.map.spawnPoints.length)];
          bot.x = sp.x + (Math.random() - 0.5) * 6;
          bot.z = sp.z + (Math.random() - 0.5) * 6;
          bot.y = this.map.getTerrainHeight(bot.x, bot.z);
          bot.velX = 0;
          bot.velY = 0;
          bot.velZ = 0;
          bot.grounded = true;
          bot.airLaunchUntil = 0;
          bot.hp = 145;
          bot.maxHp = 145;
          bot.alive = true;
          bot.crouch = false;
          bot.prone = false;
          bot.peek = 0;
          bot.state = 'patrol';
          bot.burnUntil = 0;
          bot.nextBurnTickAt = 0;
          bot.burnedByLocal = false;
          bot.nextGrenadeAt = now + 5000 + Math.random() * 6000;
          bot.prevCheckX = bot.x;
          bot.prevCheckZ = bot.z;
          bot.nextStuckCheckAt = now + 700;
          bot.rig.root.visible = true;
          bot.rig.setHealthBar(145, bot.name, false, 'free', 145);
        }
        continue;
      }

      // Lingering Molotov burn-over-time DoT on bots (drains HP even after stepping away)
      if (bot.burnUntil && now < bot.burnUntil) {
        if (now >= (bot.nextBurnTickAt ?? 0)) {
          bot.nextBurnTickAt = now + 520;
          const dotDmg = 14;
          bot.hp -= dotDmg;
          if (bot.burnedByLocal) this.damageDealt += dotDmg;
          bot.rig.setHealthBar(bot.hp, bot.name, false, 'free', bot.maxHp);
          this.spawnImpactSpark(_v1.set(bot.x, bot.y + 1.05, bot.z), false);
          if (bot.hp <= 0) {
            if (bot.burnedByLocal) {
              this.handleBotKilledByLocal(bot, now);
            } else {
              bot.alive = false;
              bot.deaths += 1;
              bot.respawnAt = now + 3500;
              bot.rig.root.visible = false;
              this.spawnDeathWeaponDrop(bot.x, bot.y, bot.z, bot.weaponId);
              this.spawnDeathGrenadeDrop(bot.x, bot.y, bot.z);
            }
            continue;
          }
        }
      }

      bot.recoil = THREE.MathUtils.damp(bot.recoil, 0, 12, dt);

      // Fair Free-For-All Target Acquisition (Player + Other Bots + Enemy Remotes equally)
      let targetPos: THREE.Vector3 | null = null;
      let targetScore = 98;
      let targetDist = 98;
      let targetIsPlayer = false;
      let targetBot: BotActor | null = null;
      let targetRemote: RemoteActor | null = null;
      let chosenTargetId: string | undefined;

      if (this.alive) {
        const pd = Math.hypot(this.pos.x - bot.x, this.pos.z - bot.z);
        const score = bot.targetActorId === this.opts.localPlayerId ? pd - 5 : pd;
        if (pd < 98 && score < targetScore) {
          targetScore = score;
          targetDist = pd;
          targetPos = this.pos;
          targetIsPlayer = true;
          chosenTargetId = this.opts.localPlayerId;
        }
      }

      for (const other of this.bots) {
        if (other === bot || !other.alive) continue;
        const od = Math.hypot(other.x - bot.x, other.z - bot.z);
        const score = bot.targetActorId === other.id ? od - 8 : od;
        if (od < 98 && score < targetScore) {
          targetScore = score;
          targetDist = od;
          targetPos = _v2.set(other.x, other.y, other.z);
          targetIsPlayer = false;
          targetBot = other;
          targetRemote = null;
          chosenTargetId = other.id;
        }
      }

      for (const rem of this.remotes.values()) {
        if (!rem.alive || this.isFriendlyTeam(rem.team)) continue;
        const rd = Math.hypot(rem.x - bot.x, rem.z - bot.z);
        const score = bot.targetActorId === rem.id ? rd - 5 : rd;
        if (rd < 98 && score < targetScore) {
          targetScore = score;
          targetDist = rd;
          targetPos = _v2.set(rem.x, rem.y, rem.z);
          targetIsPlayer = false;
          targetBot = null;
          targetRemote = rem;
          chosenTargetId = rem.id;
        }
      }
      bot.targetActorId = chosenTargetId;

      // Throttled tactical Line-Of-Sight check (~210ms) + Smoke Grenade visual occlusion
      if (!targetPos) {
        bot.cachedHasLos = false;
      } else if (now >= bot.nextLosAt) {
        bot.nextLosAt = now + 200 + Math.random() * 80;
        if (this.isBlockedBySmoke(bot.x, bot.z, targetPos.x, targetPos.z)) {
          bot.cachedHasLos = false;
        } else {
          _rayOrigin.set(bot.x, bot.y + (bot.prone ? 0.35 : 1.45), bot.z);
          _rayDir
            .set(targetPos.x - bot.x, targetPos.y + 1.25 - _rayOrigin.y, targetPos.z - bot.z)
            .normalize();
          _raycaster.set(_rayOrigin, _rayDir);
          _raycaster.far = Math.max(0.5, targetDist - 0.5);
          const blocked = _raycaster.intersectObjects(this.map.raycastTargets, true);
          bot.cachedHasLos = blocked.length === 0;
        }
      }
      const hasLos = bot.cachedHasLos;

      let desiredVx = 0;
      let desiredVz = 0;

      if (targetPos) {
        const dx = targetPos.x - bot.x;
        const dz = targetPos.z - bot.z;
        const enemyYaw = Math.atan2(dx, dz);
        bot.targetYaw = enemyYaw;
        bot.peek = 0;

        if (now >= bot.nextStrafeFlip) {
          bot.nextStrafeFlip = now + 680 + Math.random() * 780;
          bot.strafeDir = Math.random() < 0.5 ? 1 : -1;
        }

        // Pro Tactical Decision Engine (Cover, Retreat/Backpedal, Flank, Advance, Engage)
        if (now >= bot.nextThinkAt) {
          bot.nextThinkAt = now + 560 + Math.random() * 620;
          const bSpec = getWeaponSpec(bot.weaponId);
          const isLongRange = bSpec.type === 'sniper' || bSpec.type === 'dmr';
          const isCqb = bSpec.type === 'shotgun' || bSpec.type === 'smg' || bSpec.type === 'pistol';
          const idealDist = isLongRange ? 36 : isCqb ? 11 : 22;

          if (bot.hp < 52 && this.map.coverSpots.length > 0 && now >= bot.inCoverUntil) {
            // Find safest cover spot AWAY from the enemy (retreat to cover!)
            let bestSpot = this.map.coverSpots[0];
            let bestScore = Infinity;
            for (const sp of this.map.coverSpots) {
              const dSelf = Math.hypot(sp.x - bot.x, sp.z - bot.z);
              const dEnemy = Math.hypot(sp.x - targetPos.x, sp.z - targetPos.z);
              const score = dSelf - dEnemy * 0.65;
              if (score < bestScore && dSelf < 40) {
                bestScore = score;
                bestSpot = sp;
              }
            }
            bot.moveTarget.copy(bestSpot);
            bot.state = targetDist < 24 ? 'retreat' : 'cover';
            bot.inCoverUntil = now + 2600;
            bot.prone = false;
            bot.crouch = false;
          } else if (bot.hp < 65 && targetDist < 14 && hasLos) {
            // Close pressure when wounded -> tactical fighting retreat (backpedal while shooting!)
            bot.state = 'retreat';
            bot.crouch = false;
            bot.prone = false;
          } else if (!hasLos && targetDist < 38) {
            // Enemy behind cover -> flank sideways around cover!
            bot.state = 'flank';
            if (Math.random() < 0.35) bot.flankSign *= -1;
            bot.crouch = false;
            bot.prone = false;
          } else if (targetDist > idealDist + 10) {
            bot.state = 'advance';
            bot.crouch = false;
            bot.prone = false;
          } else {
            bot.state = 'engage';
            const roll = Math.random();
            bot.prone = bot.hp < 34 && roll < 0.16;
            bot.crouch = !bot.prone && (isLongRange || roll < 0.42);
          }
        }

        // Pro Grenade Throwing (Frag / Molotov / Smoke) equally against bots & player!
        if (
          now >= bot.nextGrenadeAt &&
          targetDist >= 11 &&
          targetDist <= 34 &&
          this.activeGrenades.length < 5
        ) {
          bot.nextGrenadeAt = now + 9500 + Math.random() * 6500;
          const throwRoll = Math.random();
          let gType: GrenadeType = 'frag';
          let aimX = targetPos.x;
          let aimZ = targetPos.z;
          if (bot.hp < 50) {
            gType = throwRoll < 0.55 ? 'smoke' : 'molotov';
            if (gType === 'smoke') {
              aimX = THREE.MathUtils.lerp(bot.x, targetPos.x, 0.35);
              aimZ = THREE.MathUtils.lerp(bot.z, targetPos.z, 0.35);
            }
          } else {
            gType = throwRoll < 0.62 ? 'frag' : 'molotov';
          }
          const gdx = aimX - bot.x;
          const gdz = aimZ - bot.z;
          const gd = Math.max(4, Math.hypot(gdx, gdz));
          const flightT = THREE.MathUtils.clamp(gd / 18.5, 0.72, 1.85);
          const origin = new THREE.Vector3(bot.x, bot.y + 1.55, bot.z);
          const vel = new THREE.Vector3(
            gdx / flightT,
            (targetPos.y - origin.y + 0.5 * 16.5 * flightT * flightT) / flightT,
            gdz / flightT,
          );
          this.spawnGrenadeProjectile(origin, vel, false, gType, bot.id);
        }

        // Movement Execution per Tactical State
        if (bot.state === 'retreat') {
          bot.crouch = false;
          bot.prone = false;
          bot.targetYaw = enemyYaw; // Always keep weapon pointed at threat while retreating!
          const backYaw = enemyYaw + Math.PI + Math.sin(now * 0.004 + bot.x) * 0.42;
          desiredVx = Math.sin(backYaw) * 6.5;
          desiredVz = Math.cos(backYaw) * 6.5;
        } else if (bot.state === 'cover') {
          const distCover = Math.hypot(bot.moveTarget.x - bot.x, bot.moveTarget.z - bot.z);
          if (distCover > 1.25) {
            bot.crouch = false;
            bot.prone = false;
            const toCoverYaw = Math.atan2(bot.moveTarget.x - bot.x, bot.moveTarget.z - bot.z);
            bot.targetYaw = hasLos || targetDist < 28 ? enemyYaw : toCoverYaw;
            desiredVx = Math.sin(toCoverYaw) * 6.7;
            desiredVz = Math.cos(toCoverYaw) * 6.7;
          } else {
            bot.crouch = true;
            bot.targetYaw = enemyYaw;
            // Subtle cover peek lean while crouching in cover
            bot.peek = Math.sin(now * 0.0045) > 0.35 ? bot.strafeDir * 0.45 : 0;
            const rightX = -Math.cos(enemyYaw);
            const rightZ = Math.sin(enemyYaw);
            desiredVx = rightX * bot.strafeDir * 1.8;
            desiredVz = rightZ * bot.strafeDir * 1.8;
            if (now >= bot.inCoverUntil) {
              bot.peek = 0;
              bot.state = 'flank';
            }
          }
        } else if (bot.state === 'flank') {
          bot.crouch = false;
          bot.prone = false;
          const flankYaw = enemyYaw + bot.flankSign * 0.82;
          desiredVx = Math.sin(flankYaw) * 6.6;
          desiredVz = Math.cos(flankYaw) * 6.6;
        } else if (bot.state === 'advance') {
          bot.crouch = false;
          bot.prone = false;
          const advSpd = 6.6;
          const weave = Math.sin(now * 0.0035 + bot.z) * 0.38;
          const advYaw = enemyYaw + weave;
          desiredVx = Math.sin(advYaw) * advSpd;
          desiredVz = Math.cos(advYaw) * advSpd;
        } else {
          const bSpec = getWeaponSpec(bot.weaponId);
          const isLongRange = bSpec.type === 'sniper' || bSpec.type === 'dmr';
          const minPreferred = isLongRange ? 24 : bSpec.type === 'shotgun' ? 6 : 12;
          const maxPreferred = isLongRange ? 46 : bSpec.type === 'shotgun' ? 14 : 26;
          const strafeSpd = bot.prone ? 1.6 : bot.crouch ? 3.4 : 5.4;
          const rightX = -Math.cos(enemyYaw);
          const rightZ = Math.sin(enemyYaw);
          const pushSign = targetDist > maxPreferred ? 0.56 : targetDist < minPreferred ? -0.68 : 0;
          desiredVx = (rightX * bot.strafeDir + Math.sin(enemyYaw) * pushSign) * strafeSpd;
          desiredVz = (rightZ * bot.strafeDir + Math.cos(enemyYaw) * pushSign) * strafeSpd;

          // Tactical Combat Jump Dodge in open firefights
          if (bot.grounded && !bot.prone && now >= bot.nextJumpAt && targetDist < 22 && hasLos) {
            bot.nextJumpAt = now + 3800 + Math.random() * 4200;
            if (Math.random() < 0.45) {
              bot.velY = 6.5;
              bot.grounded = false;
              bot.crouch = false;
            }
          }
        }

        // Balanced & exciting firefight (competitive bot-vs-bot & fair vs player!)
        const engageMaxRange =
          getWeaponSpec(bot.weaponId).type === 'sniper' || getWeaponSpec(bot.weaponId).type === 'dmr' ? 78 : 56;
        if (hasLos && targetDist < engageMaxRange && now >= bot.nextFireAt) {
          const spec = getWeaponSpec(bot.weaponId);
          if (bot.burstLeft > 0) {
            bot.burstLeft -= 1;
            bot.nextFireAt = now + Math.max(155, spec.fireRateMs * 1.65);
          } else {
            bot.burstLeft = spec.type === 'sniper' ? 1 : 2 + Math.floor(Math.random() * 3);
            bot.nextFireAt = now + (spec.type === 'sniper' ? 1450 : 900) + Math.random() * 680;
          }

          bot.recoil = 0.2;
          const dToPlayer = Math.hypot(bot.x - this.pos.x, bot.z - this.pos.z);
          if (dToPlayer < 75) {
            soundEngine.playGunshot(bot.weaponId, dToPlayer);
          }

          _rayOrigin.set(bot.x, bot.y + (bot.prone ? 0.35 : bot.crouch ? 1.05 : 1.45), bot.z);
          _rayDir
            .set(targetPos.x - bot.x, targetPos.y + 1.2 - _rayOrigin.y, targetPos.z - bot.z)
            .normalize();
          const endPt = _rayOrigin.clone().addScaledVector(_rayDir, targetDist);
          this.spawnTracer(_rayOrigin.clone(), endPt, 0xfef08a);

          const hitChance = targetIsPlayer || targetRemote
            ? targetDist < 16
              ? 0.16
              : targetDist < 34
                ? 0.10
                : 0.05
            : targetDist < 16
              ? 0.34
              : targetDist < 34
                ? 0.23
                : 0.13;
          if (Math.random() < hitChance) {
            this.spawnImpactSpark(endPt, targetIsPlayer || Boolean(targetRemote));
            const dmg = Math.round(spec.damage * (targetIsPlayer || targetRemote ? 0.19 : 0.42));
            if (targetIsPlayer && this.alive) {
              this.applyLocalDamage(dmg);
              if (!this.alive) bot.kills += 1;
            } else if (targetBot && targetBot.alive) {
              targetBot.hp -= dmg;
              targetBot.targetActorId = bot.id;
              targetBot.rig.setHealthBar(targetBot.hp, targetBot.name, false, 'free', targetBot.maxHp);
              if (targetBot.hp <= 0) {
                targetBot.alive = false;
                targetBot.deaths += 1;
                targetBot.respawnAt = now + 3500;
                targetBot.rig.root.visible = false;
                this.spawnDeathWeaponDrop(targetBot.x, targetBot.y, targetBot.z, targetBot.weaponId);
                this.spawnDeathGrenadeDrop(targetBot.x, targetBot.y, targetBot.z);
                bot.kills += 1;
              }
            } else if (targetRemote && targetRemote.alive && Math.hypot(targetRemote.x - bot.x, targetRemote.z - bot.z) < 60) {
              // Bots engage nearby remote opponents visually too
              bot.damage += Math.round(dmg * 0.5);
            }
          }
        }
      } else {
        // Patrol actively between cover spots & jump pads to reach rooftops too
        bot.state = 'patrol';
        bot.crouch = false;
        bot.prone = false;
        bot.peek = 0;
        if (now >= bot.nextThinkAt || Math.hypot(bot.moveTarget.x - bot.x, bot.moveTarget.z - bot.z) < 2.5) {
          bot.nextThinkAt = now + 2400 + Math.random() * 2000;
          if (this.map.jumpPads.length > 0 && Math.random() < 0.22) {
            const pad = this.map.jumpPads[Math.floor(Math.random() * this.map.jumpPads.length)];
            bot.moveTarget.set(pad.x, pad.y, pad.z);
          } else if (this.map.coverSpots.length > 0 && Math.random() < 0.78) {
            bot.moveTarget.copy(
              this.map.coverSpots[Math.floor(Math.random() * this.map.coverSpots.length)],
            );
          } else {
            const r = this.map.arenaRadius * 0.65;
            bot.moveTarget.set((Math.random() - 0.5) * r * 2, 0, (Math.random() - 0.5) * r * 2);
          }
        }
        const dx = bot.moveTarget.x - bot.x;
        const dz = bot.moveTarget.z - bot.z;
        bot.targetYaw = Math.atan2(dx, dz);
        desiredVx = Math.sin(bot.targetYaw) * 5.4;
        desiredVz = Math.cos(bot.targetYaw) * 5.4;
      }

      // Avoid active Molotov fire patches & incoming unlanded Frag grenades!
      for (const fz of this.fireZones) {
        const fx = bot.x - fz.pos.x;
        const fzd = bot.z - fz.pos.z;
        const fd = Math.hypot(fx, fzd);
        if (fd > 0.05 && fd < fz.radius + 2.2) {
          const flee = ((fz.radius + 2.2 - fd) / fz.radius) * 7.5;
          desiredVx += (fx / fd) * flee;
          desiredVz += (fzd / fd) * flee;
        }
      }
      for (const ag of this.activeGrenades) {
        if (ag.type !== 'frag' || ag.ownerBotId === bot.id) continue;
        const gx = bot.x - ag.pos.x;
        const gz = bot.z - ag.pos.z;
        const gd = Math.hypot(gx, gz);
        if (gd > 0.05 && gd < 6.8) {
          const evade = ((6.8 - gd) / 6.8) * 8.0;
          desiredVx += (gx / gd) * evade;
          desiredVz += (gz / gd) * evade;
        }
      }

      // Stuck Recovery (if trying to sprint and stalled on a crate/corner, flip flank & jump!)
      if (now >= bot.nextStuckCheckAt) {
        bot.nextStuckCheckAt = now + 550;
        const movedSinceCheck = Math.hypot(bot.x - bot.prevCheckX, bot.z - bot.prevCheckZ);
        bot.prevCheckX = bot.x;
        bot.prevCheckZ = bot.z;
        if (Math.hypot(desiredVx, desiredVz) > 3.0 && movedSinceCheck < 0.55) {
          bot.strafeDir *= -1;
          bot.flankSign *= -1;
          if (bot.grounded && !bot.prone) {
            bot.velY = 6.1;
            bot.grounded = false;
            bot.crouch = false;
          }
        }
      }

      // Bot-to-bot tactical separation force (prevents bots from ever clumping in the middle!)
      for (const other of this.bots) {
        if (other === bot || !other.alive) continue;
        const sx = bot.x - other.x;
        const sz = bot.z - other.z;
        const sd = Math.hypot(sx, sz);
        if (sd > 0.05 && sd < 6.0) {
          const push = ((6.0 - sd) / 6.0) * 4.4;
          desiredVx += (sx / sd) * push;
          desiredVz += (sz / sd) * push;
        }
      }

      // Check Jump Pads for bots too (high parabolic arc clears buildings!)
      if (bot.grounded && now >= bot.airLaunchUntil) {
        for (const pad of this.map.jumpPads) {
          if (now >= pad.cooldownUntil && Math.hypot(bot.x - pad.x, bot.z - pad.z) < pad.radius && Math.abs(bot.y - pad.y) < 1.5) {
            const targetY = pad.targetY ?? this.map.getTerrainHeight(pad.targetX, pad.targetZ);
            const g = 18.5;
            const peakY = Math.max(bot.y, targetY) + (pad.isRooftop ? 11.5 : 15.5);
            const vy = Math.sqrt(2 * g * Math.max(2, peakY - bot.y));
            const tUp = vy / g;
            const tDown = Math.sqrt((2 * Math.max(0.5, peakY - targetY)) / g);
            const flightTime = tUp + tDown;
            bot.velY = vy;
            bot.velX = (pad.targetX - bot.x) / flightTime;
            bot.velZ = (pad.targetZ - bot.z) / flightTime;
            bot.grounded = false;
            bot.airLaunchUntil = now + flightTime * 1000 + 80;
            bot.prone = false;
            bot.crouch = false;
            pad.cooldownUntil = now + 2600;
            break;
          }
        }
      }

      if (now >= bot.airLaunchUntil) {
        bot.velX = THREE.MathUtils.damp(bot.velX, desiredVx, 11, dt);
        bot.velZ = THREE.MathUtils.damp(bot.velZ, desiredVz, 11, dt);
      }

      bot.x += bot.velX * dt;
      bot.z += bot.velZ * dt;

      if (!bot.grounded) {
        bot.velY -= 18.5 * dt;
        bot.y += bot.velY * dt;
      }

      // Smoothly turn yaw toward targetYaw (shortest angle)
      let angleDiff = bot.targetYaw - bot.yaw;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      bot.yaw += angleDiff * Math.min(1, 11 * dt);

      _v3.set(bot.x, bot.y, bot.z);
      const prevBotY = bot.y;
      const { floorY, hitWall: botHitWall } = this.resolveActorPosition(_v3, prevBotY, bot.crouch, bot.prone);
      bot.x = _v3.x;
      bot.z = _v3.z;
      if (botHitWall && (!bot.grounded || now < bot.airLaunchUntil)) {
        bot.velX *= 0.12;
        bot.velZ *= 0.12;
        bot.airLaunchUntil = 0;
        bot.velY = Math.min(bot.velY, -1.5);
      }
      if (bot.y <= floorY + 0.04) {
        bot.y = floorY;
        bot.velY = 0;
        bot.grounded = true;
      } else if (bot.y > floorY + 0.25 && bot.grounded) {
        bot.grounded = false;
      }

      const prevBotX = bot.rig.root.position.x;
      const prevBotZ = bot.rig.root.position.z;
      const dispX = (bot.x - prevBotX) / Math.max(0.001, dt);
      const dispZ = (bot.z - prevBotZ) / Math.max(0.001, dt);
      const botActualSpeed = Math.hypot(dispX, dispZ);
      const botFwdDot = dispX * Math.sin(bot.yaw) + dispZ * Math.cos(bot.yaw);
      const botStrafeDot = dispX * -Math.cos(bot.yaw) + dispZ * Math.sin(bot.yaw);
      bot.rig.root.position.set(bot.x, bot.y, bot.z);
      bot.rig.root.rotation.y = bot.yaw;
      bot.rig.updateAnimation({
        dt,
        time: this.clock.elapsedTime,
        moveSpeed: botActualSpeed > 0.15 ? botActualSpeed : 0,
        moveForward: botActualSpeed > 0.15 ? botFwdDot : 0,
        moveStrafe: botActualSpeed > 0.15 ? botStrafeDot : 0,
        crouch: bot.crouch,
        prone: bot.prone,
        grounded: bot.grounded,
        peek: bot.peek,
        aimPitch: bot.pitch,
        emote: 'none',
        recoil: bot.recoil,
      });
    }
  }

  private buildScoreboard(): CombatantStats[] {
    const list: CombatantStats[] = [
      {
        id: this.opts.localPlayerId,
        name: this.opts.loadout.callsign,
        isBot: false,
        isSelf: true,
        kills: this.kills,
        deaths: this.deaths,
        damage: this.damageDealt,
        outfitId: this.opts.loadout.outfitId,
        team: this.localTeam,
      },
    ];
    for (const r of this.remotes.values()) {
      list.push({
        id: r.id,
        name: r.name,
        isBot: false,
        isSelf: false,
        kills: r.kills,
        deaths: r.deaths,
        damage: r.damage,
        outfitId: r.outfitId,
        team: r.team,
      });
    }
    for (const b of this.bots) {
      list.push({
        id: b.id,
        name: b.name,
        isBot: true,
        isSelf: false,
        kills: b.kills,
        deaths: b.deaths,
        damage: b.damage,
        outfitId: b.outfitId,
      });
    }
    return list.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || b.damage - a.damage);
  }

  // ======================== MAIN TICK LOOP ========================
  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = () => {
    if (this.disposed) return;
    const dt = Math.min(0.05, this.clock.getDelta());
    const elapsed = this.clock.elapsedTime;
    const now = performance.now();

    let timeRemainingSec = -1;
    if (this.opts.durationSec > 0) {
      const passedSec = (now - this.matchStartTime) / 1000;
      timeRemainingSec = Math.max(0, Math.ceil(this.opts.durationSec - passedSec));
      if (!this.opts.isOnline && timeRemainingSec <= 0 && !this.matchEnded) {
        this.finishMatchNow();
        return;
      }
    }

    if (this.reloadingUntil > 0 && now >= this.reloadingUntil) {
      this.reloadingUntil = 0;
      this.ammo[this.activeSlot] = getWeaponSpec(this.weapons[this.activeSlot]).magSize;
    }

    if (!this.alive && !this.opts.isOnline && now >= this.respawnAt) {
      const sp = this.map.spawnPoints[Math.floor(Math.random() * this.map.spawnPoints.length)];
      this.pos.copy(sp);
      this.pos.y = this.map.getTerrainHeight(this.pos.x, this.pos.z);
      this.hp = 100;
      this.armor = 60;
      this.burnUntil = 0;
      this.grenadeCounts.frag = Math.max(2, this.grenadeCounts.frag);
      this.grenadeCounts.smoke = Math.max(1, this.grenadeCounts.smoke);
      this.grenadeCounts.molotov = Math.max(1, this.grenadeCounts.molotov);
      this.alive = true;
      this.prone = false;
      this.crouch = false;
      this.ridingCarpet = false;
      this.parachuting = false;
      this.activeVehicleId = null;
      this.activeVehicleSeat = null;
      this.velX = 0;
      this.velY = 0;
      this.velZ = 0;
      this.airLaunchUntil = 0;
      this.localRig.root.visible = true;
    }

    if (this.emote !== 'none' && now > this.emoteUntil) {
      this.emote = 'none';
    }

    // Update Moving Elevators (Real Call + Ride Pass-Through Lift)
    this.nearbyElevator = null;
    for (const el of this.map.elevators) {
      const prevElY = el.currentY;
      if (Math.abs(el.currentY - el.targetY) > 0.02) {
        const dir = el.targetY > el.currentY ? 1 : -1;
        el.currentY += dir * el.speed * dt;
        if ((dir > 0 && el.currentY >= el.targetY) || (dir < 0 && el.currentY <= el.targetY)) {
          el.currentY = el.targetY;
        }
        el.platform.position.y = el.currentY;
        el.indicatorMat.color.setHex(0xf59e0b);
      } else {
        el.indicatorMat.color.setHex(0x10b981);
      }

      if (
        this.alive &&
        !this.activeVehicleId &&
        Math.abs(this.pos.x - el.x) <= el.halfW + 1.55 &&
        Math.abs(this.pos.z - el.z) <= el.halfD + 1.55
      ) {
        if (
          Math.abs(this.pos.x - el.x) <= el.halfW &&
          Math.abs(this.pos.z - el.z) <= el.halfD &&
          Math.abs(this.pos.y - prevElY) < 1.15
        ) {
          this.pos.y += el.currentY - prevElY;
          if (Math.abs(el.currentY - el.targetY) > 0.02) {
            this.grounded = true;
            this.velY = 0;
          }
        }
        if (
          Math.abs(this.pos.y - el.currentY) < 1.35 ||
          Math.abs(this.pos.y - el.minY) < 1.65 ||
          Math.abs(this.pos.y - el.maxY) < 1.65
        ) {
          this.nearbyElevator = el;
        }
      }
    }

    // Update Flying Carpet Spawns ("الحصيرة الطائرة")
    this.nearbyCarpet = null;
    for (const cs of this.map.carpetSpawns) {
      if (!cs.available) {
        if (cs !== this.activeCarpetSpawn && now >= cs.respawnAt) {
          cs.available = true;
          cs.mesh.visible = true;
        }
        continue;
      }
      cs.mesh.children[0].position.y = 0.72 + Math.sin(elapsed * 3.2) * 0.08;
      cs.mesh.children[0].rotation.y += dt * 0.7;
      cs.mesh.children[2].rotation.y += dt * 2.2;
      if (
        this.alive &&
        !this.ridingCarpet &&
        !this.activeVehicleId &&
        Math.hypot(this.pos.x - cs.x, this.pos.z - cs.z) < 2.6 &&
        Math.abs(this.pos.y - cs.y) < 2.1
      ) {
        this.nearbyCarpet = cs;
      }
    }

    // Detect Nearby Driveable Cars & 2-Seat Motorcycles
    this.nearbyVehicle = null;
    if (this.alive && !this.activeVehicleId && !this.ridingCarpet) {
      let bestVD = 3.2;
      for (const v of this.map.vehicles) {
        const d = Math.hypot(this.pos.x - v.x, this.pos.z - v.z);
        if (d < bestVD && Math.abs(this.pos.y - v.y) < 2.2 && (!v.driverId || !v.passengerId)) {
          bestVD = d;
          this.nearbyVehicle = v;
        }
      }
    }

    // Update Ground Weapon Drops, Grenade Drops & Supply Crates
    this.nearbyCrate = null;
    for (const c of this.map.crates) {
      if (!c.available) {
        if (!c.isDynamicDrop && now >= c.respawnAt) {
          c.available = true;
          c.mesh.visible = true;
        }
        continue;
      }
      if (c.isGrenadeDrop) {
        c.mesh.children[1].rotation.y += dt * 1.8;
        c.mesh.children[2].position.y = 0.45 + Math.sin(elapsed * 3.5) * 0.05;
      } else if (c.isGroundWeapon) {
        c.mesh.children[1].rotation.y += dt * 1.4;
        c.mesh.children[2].position.y = 0.56 + Math.sin(elapsed * 3) * 0.05;
      } else {
        c.mesh.children[2].rotation.y += dt * 2.2;
        c.mesh.children[2].position.y = 1.18 + Math.sin(elapsed * 3) * 0.08;
      }
      if (
        this.alive &&
        !this.activeVehicleId &&
        Math.hypot(this.pos.x - c.x, this.pos.z - c.z) < 2.35 &&
        Math.abs(this.pos.y - c.y) < 1.8
      ) {
        this.nearbyCrate = c;
      }
    }

    // Animate Ground & Rooftop Jump Circles + trigger launch (step inside OR tap interact button!)
    this.nearbyJumpPad = null;
    for (const pad of this.map.jumpPads) {
      pad.chevrons.children.forEach((ring, idx) => {
        const cycle = (elapsed * 1.45 + idx * 0.33) % 1;
        ring.position.y = 0.28 + cycle * 1.9;
        ring.scale.setScalar(1.0 - cycle * 0.3);
      });
      pad.ringMat.color.setHex(now < pad.cooldownUntil ? 0xf59e0b : pad.isRooftop ? 0x38bdf8 : 0x22d3ee);

      if (this.alive && !this.ridingCarpet && !this.activeVehicleId && Math.abs(this.pos.y - pad.y) < 1.65) {
        const dPad = Math.hypot(this.pos.x - pad.x, this.pos.z - pad.z);
        if (this.grounded && now >= pad.cooldownUntil && dPad < pad.radius * 0.85) {
          this.launchFromJumpPad(pad);
        } else if (now >= pad.cooldownUntil && dPad < pad.radius + 1.05) {
          this.nearbyJumpPad = pad;
        }
      }
    }

    // Local Movement Input (WASD + Virtual Analog Joystick — Smooth PUBG-style Sprint/Walk/Strafe, Vehicles, Carpet & Parachute)
    let moveFwd = (this.keys['KeyW'] || this.keys['ArrowUp'] ? 1 : 0) - (this.keys['KeyS'] || this.keys['ArrowDown'] ? 1 : 0);
    let moveRight = (this.keys['KeyD'] || this.keys['ArrowRight'] ? 1 : 0) - (this.keys['KeyA'] || this.keys['ArrowLeft'] ? 1 : 0);

    moveFwd -= this.joyVec.y;
    moveRight += this.joyVec.x;

    const fwdX = Math.sin(this.yaw);
    const fwdZ = Math.cos(this.yaw);
    const rightX = -Math.cos(this.yaw);
    const rightZ = Math.sin(this.yaw);

    const inputLen = Math.hypot(moveFwd, moveRight);
    let moveSpeed = 0;
    let moveForwardSpeed = 0;
    let moveStrafeSpeed = 0;
    const activeVehicle = this.activeVehicleId
      ? this.map.vehicles.find((item) => item.id === this.activeVehicleId) || null
      : null;

    if (activeVehicle && this.alive) {
      // Driving Seat (0): steer smoothly along vehicle heading & lock chase camera behind vehicle!
      if (this.activeVehicleSeat === 0) {
        const maxVehSpeed = activeVehicle.kind === 'motorcycle' ? 23.5 : 19.5;
        const turnRate = activeVehicle.kind === 'motorcycle' ? 2.65 : 2.05;
        let throttle = moveFwd;
        // If player drags joystick left/right with minimal forward input, apply smooth turning throttle
        if (Math.abs(moveRight) > 0.22 && Math.abs(throttle) < 0.22) {
          throttle = Math.abs(moveRight) * 0.58;
        }
        const steerSign = throttle < -0.15 ? -1 : 1;
        if (Math.abs(moveRight) > 0.08) {
          this.emote = 'none';
          activeVehicle.yaw -= moveRight * turnRate * steerSign * dt;
        }

        const vehFwdX = Math.sin(activeVehicle.yaw);
        const vehFwdZ = Math.cos(activeVehicle.yaw);
        let targetVx = 0;
        let targetVz = 0;
        if (Math.abs(throttle) > 0.08 || Math.abs(moveRight) > 0.22) {
          this.emote = 'none';
          const spdFactor = THREE.MathUtils.clamp(throttle, -0.55, 1.0);
          targetVx = vehFwdX * maxVehSpeed * spdFactor;
          targetVz = vehFwdZ * maxVehSpeed * spdFactor;
        }

        activeVehicle.velX = THREE.MathUtils.damp(activeVehicle.velX, targetVx, 7.5, dt);
        activeVehicle.velZ = THREE.MathUtils.damp(activeVehicle.velZ, targetVz, 7.5, dt);
        const curSpd = Math.hypot(activeVehicle.velX, activeVehicle.velZ);
        if (activeVehicle.rig.frontSteerGroup) {
          activeVehicle.rig.frontSteerGroup.rotation.y = THREE.MathUtils.damp(
            activeVehicle.rig.frontSteerGroup.rotation.y,
            -moveRight * 0.45,
            10,
            dt,
          );
        }
        if (curSpd > 0.35) {
          const spinSign = throttle < -0.15 ? -1 : 1;
          activeVehicle.wheelSpin += curSpd * dt * 2.4 * spinSign;
          activeVehicle.rig.wheels.forEach((w) => {
            w.rotation.x = activeVehicle.wheelSpin;
          });
          soundEngine.playVehicleEngine(activeVehicle.kind === 'motorcycle', curSpd / maxVehSpeed);
        }

        // Smoothly lock chase camera directly behind the vehicle while driving
        let camYDiff = activeVehicle.yaw - this.yaw;
        while (camYDiff > Math.PI) camYDiff -= Math.PI * 2;
        while (camYDiff < -Math.PI) camYDiff += Math.PI * 2;
        this.yaw += camYDiff * Math.min(1, 14 * dt);

        activeVehicle.x += activeVehicle.velX * dt;
        activeVehicle.z += activeVehicle.velZ * dt;

        // Vehicle perimeter & solid collider resolution
        const vr = activeVehicle.kind === 'car' ? 1.55 : 0.85;
        const maxVR = this.map.arenaRadius - 3;
        const vDist = Math.hypot(activeVehicle.x, activeVehicle.z);
        if (vDist > maxVR) {
          activeVehicle.x = (activeVehicle.x / vDist) * maxVR;
          activeVehicle.z = (activeVehicle.z / vDist) * maxVR;
        }
        for (const c of this.map.colliders) {
          if (activeVehicle.y + 1.8 <= c.minY + 0.05 || activeVehicle.y >= c.maxY - 0.5) continue;
          const cx = THREE.MathUtils.clamp(activeVehicle.x, c.minX, c.maxX);
          const cz = THREE.MathUtils.clamp(activeVehicle.z, c.minZ, c.maxZ);
          const dx = activeVehicle.x - cx;
          const dz = activeVehicle.z - cz;
          const dSq = dx * dx + dz * dz;
          if (dSq < vr * vr && dSq > 0.0001) {
            const d = Math.sqrt(dSq);
            const push = vr - d;
            activeVehicle.x += (dx / d) * push;
            activeVehicle.z += (dz / d) * push;
            activeVehicle.velX *= 0.4;
            activeVehicle.velZ *= 0.4;
          }
        }
        activeVehicle.y = this.map.getTerrainHeight(activeVehicle.x, activeVehicle.z);
        activeVehicle.rig.group.position.set(activeVehicle.x, activeVehicle.y, activeVehicle.z);
        activeVehicle.rig.group.rotation.y = activeVehicle.yaw;

        // Vehicle Ramming Physics: knocking away & damaging bots or enemy players on impact!
        if (curSpd > 3.2) {
          const ramR = activeVehicle.kind === 'car' ? 2.25 : 1.35;
          const dirX = activeVehicle.velX / curSpd;
          const dirZ = activeVehicle.velZ / curSpd;
          const sideX = -dirZ;
          const sideZ = dirX;
          const ramDmg = Math.min(115, Math.round(curSpd * 4.2));

          for (const bot of this.bots) {
            if (!bot.alive) continue;
            const dx = bot.x - activeVehicle.x;
            const dz = bot.z - activeVehicle.z;
            const d = Math.hypot(dx, dz);
            if (d < ramR && Math.abs(bot.y - activeVehicle.y) < 2.2) {
              const lastHit = this.lastVehicleRamAt.get(bot.id) || 0;
              if (now - lastHit < 550) continue;
              this.lastVehicleRamAt.set(bot.id, now);

              const sideSign = dx * sideX + dz * sideZ >= 0 ? 1 : -1;
              const knockHoriz = Math.max(8, curSpd * 1.15);
              bot.velX = dirX * knockHoriz + sideX * sideSign * 4.8;
              bot.velZ = dirZ * knockHoriz + sideZ * sideSign * 4.8;
              bot.velY = Math.min(10.5, 4.8 + curSpd * 0.25);
              bot.grounded = false;
              bot.airLaunchUntil = now + 450;
              bot.prone = false;
              bot.crouch = false;
              bot.x += (d > 0.05 ? dx / d : dirX) * (ramR - d + 0.45);
              bot.z += (d > 0.05 ? dz / d : dirZ) * (ramR - d + 0.45);

              bot.hp -= ramDmg;
              this.damageDealt += ramDmg;
              bot.rig.setHealthBar(bot.hp, bot.name, false, 'free', bot.maxHp);
              this.hitMarker = 'body';
              this.hitMarkerUntil = now + 200;
              soundEngine.playVehicleRamImpact();
              soundEngine.playHitMarker(false);
              this.spawnImpactSpark(_v1.set(bot.x, bot.y + 0.9, bot.z), true);
              if (bot.hp <= 0) {
                this.handleBotKilledByLocal(bot, now);
              }
            }
          }

          for (const rem of this.remotes.values()) {
            if (!rem.alive || rem.vehicleId === activeVehicle.id || this.isFriendlyTeam(rem.team)) continue;
            const dx = rem.x - activeVehicle.x;
            const dz = rem.z - activeVehicle.z;
            const d = Math.hypot(dx, dz);
            if (d < ramR && Math.abs(rem.y - activeVehicle.y) < 2.2) {
              const lastHit = this.lastVehicleRamAt.get(rem.id) || 0;
              if (now - lastHit < 550) continue;
              this.lastVehicleRamAt.set(rem.id, now);
              this.hitMarker = 'body';
              this.hitMarkerUntil = now + 200;
              soundEngine.playVehicleRamImpact();
              soundEngine.playHitMarker(false);
              this.spawnImpactSpark(_v1.set(rem.x, rem.y + 0.9, rem.z), true);
              this.opts.onSendHit?.(
                rem.id,
                ramDmg,
                false,
                activeVehicle.kind === 'car' ? 'صدم سيارة' : 'صدم دراجة نارية',
              );
            }
          }
        }

        if (this.opts.isOnline && now - this.lastVehicleNetEmit > 65) {
          this.lastVehicleNetEmit = now;
          this.opts.onSendVehicleState?.({
            id: activeVehicle.id,
            x: Number(activeVehicle.x.toFixed(2)),
            y: Number(activeVehicle.y.toFixed(2)),
            z: Number(activeVehicle.z.toFixed(2)),
            yaw: Number(activeVehicle.yaw.toFixed(3)),
            driverId: activeVehicle.driverId,
            passengerId: activeVehicle.passengerId,
          });
        }
      }

      this.getSeatWorldPos(activeVehicle, this.activeVehicleSeat ?? 0, this.pos);
      this.grounded = true;
      this.velX = 0;
      this.velY = 0;
      this.velZ = 0;
    } else {
      let desiredVx = 0;
      let desiredVz = 0;

      if (this.alive && inputLen > 0.08) {
        this.emote = 'none';
        const clampedMag = Math.min(1, inputLen);
        const normFwd = moveFwd / Math.max(1, inputLen);
        const normRight = moveRight / Math.max(1, inputLen);

        if (this.ridingCarpet) {
          const carpetSpeed = 17.2 * clampedMag;
          desiredVx = (fwdX * normFwd + rightX * normRight) * carpetSpeed;
          desiredVz = (fwdZ * normFwd + rightZ * normRight) * carpetSpeed;
        } else if (this.parachuting) {
          const glideSpeed = 7.4 * clampedMag;
          desiredVx = (fwdX * normFwd + rightX * normRight) * glideSpeed;
          desiredVz = (fwdZ * normFwd + rightZ * normRight) * glideSpeed;
        } else {
          const isSprintingInput = clampedMag >= 0.7 && normFwd > 0.32 && !this.crouch && !this.prone && !this.scoped;
          const maxRate = this.prone
            ? 2.25
            : this.crouch
              ? 4.1
              : this.scoped
                ? 3.3
                : isSprintingInput
                  ? 8.6
                  : normFwd < -0.2
                    ? 4.8
                    : 5.9;
          const targetSpd = maxRate * (isSprintingInput ? clampedMag : Math.max(0.55, clampedMag));

          desiredVx = (fwdX * normFwd + rightX * normRight) * targetSpd;
          desiredVz = (fwdZ * normFwd + rightZ * normRight) * targetSpd;

          const stepInterval = this.prone ? 420 : this.crouch ? 370 : isSprintingInput ? 225 : 315;
          if (this.grounded && now - this.lastFootstep > stepInterval) {
            this.lastFootstep = now;
            soundEngine.playFootstep();
          }
        }
      }

      if (this.ridingCarpet) {
        this.velX = THREE.MathUtils.damp(this.velX, desiredVx, 12, dt);
        this.velZ = THREE.MathUtils.damp(this.velZ, desiredVz, 12, dt);
        const wantUp = this.carpetAscendHeld || Boolean(this.keys['Space']);
        const wantDown = this.carpetDescendHeld || Boolean(this.keys['KeyC']);
        const targetVy = wantUp ? 10.2 : wantDown ? -9.5 : 0;
        this.velY = THREE.MathUtils.damp(this.velY, targetVy, 10, dt);
      } else if (this.parachuting) {
        this.velX = THREE.MathUtils.damp(this.velX, desiredVx, 6, dt);
        this.velZ = THREE.MathUtils.damp(this.velZ, desiredVz, 6, dt);
      } else if (now >= this.airLaunchUntil) {
        const accel = this.grounded ? 22 : 7;
        this.velX = THREE.MathUtils.damp(this.velX, desiredVx, accel, dt);
        this.velZ = THREE.MathUtils.damp(this.velZ, desiredVz, accel, dt);
      } else {
        this.velX += desiredVx * 0.45 * dt;
        this.velZ += desiredVz * 0.45 * dt;
      }

      this.pos.x += this.velX * dt;
      this.pos.z += this.velZ * dt;

      moveSpeed = Math.hypot(this.velX, this.velZ);
      moveForwardSpeed = this.velX * fwdX + this.velZ * fwdZ;
      moveStrafeSpeed = this.velX * rightX + this.velZ * rightZ;

      const prevY = this.pos.y;
      if (this.ridingCarpet) {
        this.pos.y = THREE.MathUtils.clamp(this.pos.y + this.velY * dt, 0.7, 58);
        this.grounded = false;
      } else if (!this.grounded) {
        this.velY -= 18.5 * dt;
        if (this.parachuting) {
          this.velY = Math.max(-4.4, this.velY);
        }
        this.pos.y += this.velY * dt;
      }

      const { floorY, hitWall } = this.resolveActorPosition(
        this.pos,
        prevY,
        this.crouch,
        this.prone,
        this.ridingCarpet,
      );

      if (hitWall && !this.ridingCarpet && (!this.grounded || now < this.airLaunchUntil)) {
        this.velX *= 0.1;
        this.velZ *= 0.1;
        this.airLaunchUntil = 0;
        this.velY = Math.min(this.velY, -1.5);
      }

      if (this.ridingCarpet) {
        if (this.pos.y < floorY + 0.75) {
          this.pos.y = floorY + 0.75;
          if (this.velY < 0) this.velY = 0;
        }
        this.grounded = false;
        this.parachuting = false;
      } else {
        if (
          !this.grounded &&
          !this.parachuting &&
          now >= this.airLaunchUntil &&
          this.velY < -4.2 &&
          this.pos.y - floorY > 4.6
        ) {
          this.parachuting = true;
          soundEngine.playParachuteOpen();
        }

        if (this.pos.y <= floorY + 0.03) {
          this.pos.y = floorY;
          this.velY = 0;
          this.grounded = true;
          this.parachuting = false;
        } else if (this.pos.y > floorY + 0.22 && this.grounded) {
          this.grounded = false;
        }
      }
    }

    this.recoilAmount = THREE.MathUtils.damp(this.recoilAmount, 0, 14, dt);
    this.damageFlash = THREE.MathUtils.damp(this.damageFlash, 0, 6, dt);

    const punchProgress =
      now < this.meleeUntil && this.meleeUntil > this.meleeStart
        ? (now - this.meleeStart) / (this.meleeUntil - this.meleeStart)
        : 0;

    // Update Local Soldier Visual Rig (allows manual shooting even while driving/riding!)
    this.localRig.root.position.copy(this.pos);
    this.localRig.root.rotation.y =
      activeVehicle && this.activeVehicleSeat === 0 ? activeVehicle.yaw : this.yaw;
    this.localRig.updateAnimation({
      dt,
      time: elapsed,
      moveSpeed: moveSpeed > 0.15 ? moveSpeed : 0,
      moveForward: moveSpeed > 0.15 ? moveForwardSpeed : 0,
      moveStrafe: moveSpeed > 0.15 ? moveStrafeSpeed : 0,
      crouch: this.crouch,
      prone: this.prone,
      grounded: this.grounded,
      peek: this.peek,
      aimPitch: this.pitch,
      emote: this.emote,
      recoil: this.recoilAmount,
      throwingGrenade: this.aimingGrenade,
      punchProgress,
      ridingCarpet: this.ridingCarpet,
      parachuting: this.parachuting,
      inVehicle: activeVehicle ? activeVehicle.kind : null,
    });

    // Update Grenade Aim Arc & Projectiles (ONLY detonate after touching ground/floor!)
    this.updateGrenadeArcPreview();
    for (let i = this.activeGrenades.length - 1; i >= 0; i--) {
      const g = this.activeGrenades[i];
      const prevGY = g.pos.y;
      g.vel.y -= 16.5 * dt;
      g.pos.addScaledVector(g.vel, dt);

      // Reflect off building/wall colliders mid-flight
      for (const c of this.map.colliders) {
        if (g.pos.y < c.minY || g.pos.y > c.maxY) continue;
        if (g.pos.x >= c.minX - 0.12 && g.pos.x <= c.maxX + 0.12 && g.pos.z >= c.minZ - 0.12 && g.pos.z <= c.maxZ + 0.12) {
          const ox = Math.min(Math.abs(g.pos.x - c.minX), Math.abs(c.maxX - g.pos.x));
          const oz = Math.min(Math.abs(g.pos.z - c.minZ), Math.abs(c.maxZ - g.pos.z));
          if (ox < oz) g.vel.x *= -0.45;
          else g.vel.z *= -0.45;
        }
      }

      const gh = this.getSurfaceHeightAt(g.pos.x, g.pos.z, prevGY + 0.35);
      let explodeNow = false;
      if (g.pos.y <= gh + 0.1) {
        g.pos.y = gh + 0.1;
        if (!g.hasLanded) {
          g.hasLanded = true;
          g.landAt = now;
          if (g.type === 'molotov') {
            explodeNow = true;
          } else if (g.type === 'smoke') {
            g.explodeAt = now + 350;
          } else {
            g.explodeAt = now + 1050;
          }
        }
        g.vel.y = Math.abs(g.vel.y) * 0.36;
        g.vel.x *= 0.62;
        g.vel.z *= 0.62;
      }

      g.mesh.position.copy(g.pos);
      if (!g.hasLanded || Math.hypot(g.vel.x, g.vel.z) > 0.4) {
        g.mesh.rotation.x += dt * 9;
        g.mesh.rotation.z += dt * 5;
      }

      if (explodeNow || (g.hasLanded && now >= g.explodeAt)) {
        this.scene.remove(g.mesh);
        this.disposeGroupResources(g.mesh);
        this.activeGrenades.splice(i, 1);
        this.detonateGrenade(g.type, g.pos, g.isLocalOwner, g.ownerBotId);
      }
    }

    // Animate & Expire Volumetric Smoke Clouds
    for (let i = this.smokeZones.length - 1; i >= 0; i--) {
      const sz = this.smokeZones[i];
      if (now >= sz.expiresAt) {
        this.scene.remove(sz.group);
        this.disposeGroupResources(sz.group);
        this.smokeZones.splice(i, 1);
        continue;
      }
      const age = (now - sz.startedAt) / 1000;
      const remain = (sz.expiresAt - now) / 1000;
      const fade = remain < 2.2 ? remain / 2.2 : Math.min(1, age / 0.8);
      sz.group.children.forEach((child) => {
        const m = child as THREE.Mesh;
        const ph = Number(m.userData.phase || 0);
        m.position.x = Number(m.userData.baseX || 0) + Math.sin(elapsed * 0.8 + ph) * 0.35;
        m.position.y = Number(m.userData.baseY || 1) + Math.cos(elapsed * 0.9 + ph) * 0.25;
        (m.material as THREE.MeshStandardMaterial).opacity = 0.62 * fade;
      });
    }

    // Animate & Tick Burning Molotov Fire Zones
    for (let i = this.fireZones.length - 1; i >= 0; i--) {
      const fz = this.fireZones[i];
      if (now >= fz.expiresAt) {
        this.scene.remove(fz.group);
        this.disposeGroupResources(fz.group);
        this.fireZones.splice(i, 1);
        continue;
      }
      const remain = (fz.expiresAt - now) / 1000;
      const fade = remain < 1.5 ? remain / 1.5 : 1;
      fz.group.children.forEach((child, idx) => {
        if (idx >= 2) {
          const ph = Number(child.userData.phase || 0);
          child.scale.y = (0.78 + Math.sin(elapsed * 14 + ph) * 0.35) * fade;
          child.scale.x = (0.85 + Math.cos(elapsed * 10 + ph) * 0.2) * fade;
          child.scale.z = child.scale.x;
        }
      });

      if (now >= fz.nextTickAt) {
        fz.nextTickAt = now + 400;
        if (this.alive && Math.hypot(this.pos.x - fz.pos.x, this.pos.z - fz.pos.z) < fz.radius && Math.abs(this.pos.y - fz.pos.y) < 3.0) {
          this.applyLocalDamage(fz.ownerBotId ? 10 : 16, true);
          this.burnUntil = Math.max(this.burnUntil, now + (fz.ownerBotId ? 2800 : 4200));
          if (this.nextBurnTickAt < now) this.nextBurnTickAt = now + 550;
        }
        if (fz.isLocalOwner || fz.ownerBotId) {
          const ownerBot = fz.ownerBotId ? this.bots.find((b) => b.id === fz.ownerBotId) : undefined;
          for (const bot of this.bots) {
            if (!bot.alive || (fz.ownerBotId && bot.id === fz.ownerBotId)) continue;
            if (Math.hypot(bot.x - fz.pos.x, bot.z - fz.pos.z) < fz.radius && Math.abs(bot.y - fz.pos.y) < 3.0) {
              bot.hp -= 20;
              if (fz.isLocalOwner) {
                this.damageDealt += 20;
                bot.burnedByLocal = true;
              } else if (ownerBot) {
                ownerBot.damage += 20;
              }
              bot.burnUntil = Math.max(bot.burnUntil ?? 0, now + 4500);
              if ((bot.nextBurnTickAt ?? 0) < now) bot.nextBurnTickAt = now + 520;
              bot.rig.setHealthBar(bot.hp, bot.name, false, 'free', bot.maxHp);
              if (bot.hp <= 0) {
                if (fz.isLocalOwner) {
                  this.handleBotKilledByLocal(bot, now);
                } else {
                  bot.alive = false;
                  bot.deaths += 1;
                  bot.respawnAt = now + 3500;
                  bot.rig.root.visible = false;
                  this.spawnDeathWeaponDrop(bot.x, bot.y, bot.z, bot.weaponId);
                  this.spawnDeathGrenadeDrop(bot.x, bot.y, bot.z);
                  if (ownerBot) ownerBot.kills += 1;
                }
              }
            }
          }
          if (fz.isLocalOwner) {
            for (const r of this.remotes.values()) {
              if (!r.alive || this.isFriendlyTeam(r.team)) continue;
              if (Math.hypot(r.x - fz.pos.x, r.z - fz.pos.z) < fz.radius && Math.abs(r.y - fz.pos.y) < 3.0) {
                this.opts.onSendHit?.(r.id, 18, false, 'زجاجة حارقة');
                const existing = this.burningRemotes.get(r.id);
                this.burningRemotes.set(r.id, {
                  until: now + 4000,
                  nextTickAt: existing && existing.nextTickAt > now ? existing.nextTickAt : now + 600,
                });
              }
            }
          }
        }
      }
    }

    // Lingering Burn-Over-Time on local player & online opponents
    if (this.alive && now < this.burnUntil && now >= this.nextBurnTickAt) {
      this.nextBurnTickAt = now + 550;
      this.applyLocalDamage(10, true);
    }
    for (const [remId, burn] of this.burningRemotes.entries()) {
      const rem = this.remotes.get(remId);
      if (!rem || !rem.alive || now >= burn.until) {
        this.burningRemotes.delete(remId);
        continue;
      }
      if (now >= burn.nextTickAt) {
        burn.nextTickAt = now + 600;
        this.opts.onSendHit?.(remId, 10, false, 'حريق المولوتوف');
      }
    }

    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i];
      const t = (now - b.startedAt) / b.duration;
      if (t >= 1) {
        this.scene.remove(b.sphere, b.ring);
        (b.sphere.material as THREE.Material).dispose();
        (b.ring.material as THREE.Material).dispose();
        this.blasts.splice(i, 1);
      } else {
        const sc = 1 + t * 6.5;
        b.sphere.scale.setScalar(sc);
        (b.sphere.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - t);
        b.ring.scale.setScalar(1 + t * 8.5);
        (b.ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - t);
      }
    }

    this.tryLocalFire(now);
    this.updateBots(dt, now);

    // Update Remote Online Friends (including passengers sitting on cars/motorcycles!)
    for (const r of this.remotes.values()) {
      const prevRx = r.x;
      const prevRz = r.z;
      const remVeh = r.vehicleId
        ? this.map.vehicles.find((item) => item.id === r.vehicleId) || null
        : null;
      if (remVeh && r.vehicleSeat !== null) {
        this.getSeatWorldPos(remVeh, r.vehicleSeat, _v1);
        r.x = _v1.x;
        r.y = _v1.y;
        r.z = _v1.z;
      } else {
        r.x = THREE.MathUtils.damp(r.x, r.targetX, 14, dt);
        r.y = THREE.MathUtils.damp(r.y, r.targetY, 14, dt);
        r.z = THREE.MathUtils.damp(r.z, r.targetZ, 14, dt);
      }

      let yDiff = r.targetYaw - r.yaw;
      while (yDiff > Math.PI) yDiff -= Math.PI * 2;
      while (yDiff < -Math.PI) yDiff += Math.PI * 2;
      r.yaw += yDiff * Math.min(1, 14 * dt);

      r.recoil = THREE.MathUtils.damp(r.recoil, 0, 12, dt);

      const vx = (r.x - prevRx) / Math.max(0.001, dt);
      const vz = (r.z - prevRz) / Math.max(0.001, dt);
      const spd = remVeh ? 0 : Math.hypot(vx, vz);
      const rFwd = vx * Math.sin(r.yaw) + vz * Math.cos(r.yaw);
      const rStrafe = vx * -Math.cos(r.yaw) + vz * Math.sin(r.yaw);
      r.rig.root.position.set(r.x, r.y, r.z);
      r.rig.root.rotation.y = r.yaw;
      r.rig.updateAnimation({
        dt,
        time: elapsed,
        moveSpeed: spd,
        moveForward: rFwd,
        moveStrafe: rStrafe,
        crouch: r.crouch,
        prone: r.prone,
        grounded: true,
        peek: r.peek,
        aimPitch: r.pitch,
        emote: r.emote,
        recoil: r.recoil,
        ridingCarpet: r.ridingCarpet,
        parachuting: r.parachuting,
        inVehicle: remVeh ? remVeh.kind : null,
      });
    }

    // Update Camera (Vehicle chase camera stays centered behind vehicle; on-foot 360 stays untouched!)
    const activeWeaponSpec = getWeaponSpec(this.weapons[this.activeSlot]);
    const isSniperScope = this.scoped && activeWeaponSpec.hasOpticalScope && this.alive;

    this.peekCamOffset = THREE.MathUtils.damp(this.peekCamOffset, this.prone ? 0 : this.peek * 0.56, 14, dt);
    const eyeHeight = activeVehicle
      ? activeVehicle.kind === 'car'
        ? 1.15
        : 1.28
      : this.prone
        ? 0.42
        : this.crouch
          ? 1.12
          : 1.56;

    const cFwdX = Math.sin(this.yaw) * Math.cos(this.pitch);
    const cFwdY = Math.sin(this.pitch);
    const cFwdZ = Math.cos(this.yaw) * Math.cos(this.pitch);

    if (isSniperScope) {
      const targetCamX = this.pos.x + rightX * this.peekCamOffset + cFwdX * 0.35;
      const targetCamY = this.pos.y + eyeHeight;
      const targetCamZ = this.pos.z + rightZ * this.peekCamOffset + cFwdZ * 0.35;
      this.camPos.set(targetCamX, targetCamY, targetCamZ);
      this.camLook.set(targetCamX + cFwdX * 30, targetCamY + cFwdY * 30, targetCamZ + cFwdZ * 30);
    } else {
      const camDist = activeVehicle
        ? this.scoped
          ? activeVehicle.kind === 'car'
            ? 4.2
            : 3.2
          : activeVehicle.kind === 'car'
            ? 5.6
            : 4.2
        : this.scoped
          ? 1.78
          : this.parachuting
            ? 4.4
            : this.ridingCarpet
              ? 3.8
              : this.prone
                ? 2.7
                : 3.2;
      const shoulderOffset = (activeVehicle ? 0 : this.scoped ? 0.62 : 0.54) + this.peekCamOffset;
      const camLift = activeVehicle
        ? activeVehicle.kind === 'car'
          ? 1.05
          : 0.88
        : this.prone
          ? 0.48
          : this.parachuting
            ? 0.72
            : 0.32;
      const anchorX = activeVehicle ? activeVehicle.x : this.pos.x;
      const anchorY = activeVehicle ? activeVehicle.y : this.pos.y;
      const anchorZ = activeVehicle ? activeVehicle.z : this.pos.z;
      const targetCamX = anchorX - cFwdX * camDist + rightX * shoulderOffset;
      const targetCamY = anchorY + eyeHeight + camLift - cFwdY * camDist * 0.72;
      const targetCamZ = anchorZ - cFwdZ * camDist + rightZ * shoulderOffset;

      _v1.set(anchorX + rightX * shoulderOffset, anchorY + eyeHeight, anchorZ + rightZ * shoulderOffset);
      _v2.set(targetCamX - _v1.x, targetCamY - _v1.y, targetCamZ - _v1.z);
      const rayLen = _v2.length();
      if (rayLen > 0.1) {
        _raycaster.set(_v1, _v2.normalize());
        _raycaster.far = rayLen;
        const hits = _raycaster.intersectObjects(this.map.raycastTargets, true);
        if (hits.length > 0 && hits[0].distance < rayLen) {
          const safeDist = Math.max(0.88, hits[0].distance - 0.2);
          _v1.addScaledVector(_v2, safeDist);
          this.camPos.lerp(_v1, 1 - Math.exp(-22 * dt));
        } else {
          this.camPos.set(
            THREE.MathUtils.damp(this.camPos.x, targetCamX, 18, dt),
            THREE.MathUtils.damp(this.camPos.y, targetCamY, 18, dt),
            THREE.MathUtils.damp(this.camPos.z, targetCamZ, 18, dt),
          );
        }
      }

      const lookTargetX = anchorX + rightX * (shoulderOffset * 0.65) + cFwdX * 26;
      const lookTargetY = anchorY + eyeHeight + cFwdY * 26;
      const lookTargetZ = anchorZ + rightZ * (shoulderOffset * 0.65) + cFwdZ * 26;
      this.camLook.set(lookTargetX, lookTargetY, lookTargetZ);
    }

    const headDist = Math.hypot(
      this.camPos.x - this.pos.x,
      this.camPos.y - (this.pos.y + eyeHeight),
      this.camPos.z - this.pos.z,
    );
    this.localRig.root.visible = this.alive && !isSniperScope && headDist > 0.85;

    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    if (Math.abs(this.peekCamOffset) > 0.01) {
      this.camera.rotateZ(-this.peekCamOffset * 0.12);
    }

    const targetFov = this.scoped && this.alive ? activeWeaponSpec.scopeZoom : 68;
    if (Math.abs(this.camFov - targetFov) > 0.1) {
      this.camFov = THREE.MathUtils.damp(this.camFov, targetFov, 16, dt);
      this.camera.fov = this.camFov;
      this.camera.updateProjectionMatrix();
    }

    if (now > this.muzzleFlashUntil) {
      this.muzzleFlashLight.intensity = 0;
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      if (now >= this.tracers[i].expiresAt) {
        const t = this.tracers[i];
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        (t.line.material as THREE.Material).dispose();
        this.tracers.splice(i, 1);
      }
    }

    if (this.opts.isOnline && now - this.lastNetEmit > 50) {
      this.lastNetEmit = now;
      this.opts.onSendState?.({
        x: Number(this.pos.x.toFixed(2)),
        y: Number(this.pos.y.toFixed(2)),
        z: Number(this.pos.z.toFixed(2)),
        yaw: Number(this.yaw.toFixed(3)),
        pitch: Number(this.pitch.toFixed(3)),
        crouch: this.crouch,
        prone: this.prone,
        ridingCarpet: this.ridingCarpet,
        parachuting: this.parachuting,
        vehicleId: this.activeVehicleId,
        vehicleSeat: this.activeVehicleSeat,
        peek: this.peek,
        weaponId: this.weapons[this.activeSlot],
        emoteId: this.emote,
      });
    }

    if (now - this.lastHudEmit > 80) {
      this.lastHudEmit = now;
      if (now > this.hitMarkerUntil) this.hitMarker = 'none';

      let nearbyInteract: MatchHudSnapshot['nearbyInteract'] = null;
      if (this.nearbyElevator) {
        const el = this.nearbyElevator;
        const inCabin =
          Math.abs(this.pos.x - el.x) <= el.halfW &&
          Math.abs(this.pos.z - el.z) <= el.halfD &&
          Math.abs(this.pos.y - el.currentY) < 1.25;
        if (inCabin) {
          const goingUp = Math.abs(el.currentY - el.minY) < 1.2;
          nearbyInteract = { kind: goingUp ? 'elevator_up' : 'elevator_down' };
        } else {
          const playerAtRoof = this.pos.y > (el.minY + el.maxY) * 0.5;
          nearbyInteract = { kind: playerAtRoof ? 'elevator_call_up' : 'elevator_call_down' };
        }
      } else if (this.nearbyVehicle) {
        const v = this.nearbyVehicle;
        nearbyInteract = {
          kind: !v.driverId
            ? v.kind === 'car'
              ? 'drive_car'
              : 'drive_motorcycle'
            : 'ride_passenger',
        };
      } else if (this.nearbyCarpet) {
        nearbyInteract = { kind: 'carpet' };
      } else if (this.nearbyJumpPad) {
        nearbyInteract = { kind: 'jumppad' };
      } else if (this.nearbyCrate && this.nearbyCrate.available) {
        if (this.nearbyCrate.isGrenadeDrop && this.nearbyCrate.grenadeType) {
          nearbyInteract = { kind: 'grenade_drop', grenadeType: this.nearbyCrate.grenadeType };
        } else if (this.nearbyCrate.isMedkit) {
          nearbyInteract = { kind: 'medkit' };
        } else if (this.nearbyCrate.weaponId) {
          nearbyInteract = { kind: 'weapon', weaponId: this.nearbyCrate.weaponId };
        }
      }

      const radarDots: MatchHudSnapshot['radarDots'] = [];
      for (const b of this.bots) {
        if (b.alive) radarDots.push({ x: b.x, z: b.z, type: 'enemy' });
      }
      for (const r of this.remotes.values()) {
        if (r.alive) {
          radarDots.push({
            x: r.x,
            z: r.z,
            type: this.isFriendlyTeam(r.team) ? 'ally' : 'enemy',
          });
        }
      }
      for (const c of this.map.crates) {
        if (c.available) radarDots.push({ x: c.x, z: c.z, type: 'crate' });
      }
      for (const el of this.map.elevators) {
        radarDots.push({ x: el.x, z: el.z, type: 'elevator' });
      }
      for (const jp of this.map.jumpPads) {
        radarDots.push({ x: jp.x, z: jp.z, type: 'jumppad' });
      }
      for (const cs of this.map.carpetSpawns) {
        if (cs.available) radarDots.push({ x: cs.x, z: cs.z, type: 'carpet' });
      }

      const sb = this.buildScoreboard();
      const aliveCount =
        (this.alive ? 1 : 0) +
        this.bots.filter((b) => b.alive).length +
        Array.from(this.remotes.values()).filter((r) => r.alive).length;

      let scopeTargetDist = 0;
      if (isSniperScope) {
        _raycaster.camera = this.camera;
        _rayOrigin.copy(this.camera.position);
        this.camera.getWorldDirection(_rayDir);
        _raycaster.set(_rayOrigin, _rayDir);
        _raycaster.far = activeWeaponSpec.range;
        const enemyMeshes: THREE.Object3D[] = [];
        for (const b of this.bots) if (b.alive) enemyMeshes.push(b.rig.root);
        for (const r of this.remotes.values()) if (r.alive) enemyMeshes.push(r.rig.root);
        const actorHit = enemyMeshes.length > 0 ? _raycaster.intersectObjects(enemyMeshes, true) : [];
        const wallHit = _raycaster.intersectObjects(this.map.raycastTargets, true);
        if (actorHit.length > 0 && (wallHit.length === 0 || actorHit[0].distance <= wallHit[0].distance)) {
          scopeTargetDist = Math.round(actorHit[0].distance);
        } else if (wallHit.length > 0) {
          scopeTargetDist = Math.round(wallHit[0].distance);
        }
      }

      this.opts.onHudUpdate({
        hp: this.hp,
        armor: Math.round(this.armor),
        ammo: this.ammo[this.activeSlot],
        maxAmmo: activeWeaponSpec.magSize,
        grenades: this.grenadeCounts[this.selectedGrenadeType],
        grenadeCounts: { ...this.grenadeCounts },
        selectedGrenadeType: this.selectedGrenadeType,
        aimingGrenade: this.aimingGrenade,
        reloading: this.reloadingUntil > now,
        activeSlot: this.activeSlot,
        weapons: [this.weapons[0], this.weapons[1]],
        scoped: this.scoped && this.alive,
        crouch: this.crouch,
        prone: this.prone,
        ridingCarpet: this.ridingCarpet,
        parachuting: this.parachuting,
        inVehicle: activeVehicle ? activeVehicle.kind : null,
        vehicleSeat: this.activeVehicleSeat,
        localTeam: this.localTeam,
        teamMode: this.teamMode,
        peek: this.peek,
        alive: this.alive,
        respawnSec: this.alive ? 0 : Math.max(1, Math.ceil((this.respawnAt - now) / 1000)),
        timeRemainingSec,
        kills: this.kills,
        deaths: this.deaths,
        aliveCount,
        totalCount: 1 + this.bots.length + this.remotes.size,
        nearbyInteract,
        hitMarker: this.hitMarker,
        damageFlash: this.damageFlash,
        burning: this.alive && now < this.burnUntil,
        scopeTargetDist,
        playerPos: { x: this.pos.x, z: this.pos.z, yaw: this.yaw },
        radarDots,
        scoreboard: sb,
        killFeed: [],
      });
    }

    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onResize);

    this.activeGrenades.forEach((g) => this.disposeGroupResources(g.mesh));
    this.smokeZones.forEach((sz) => this.disposeGroupResources(sz.group));
    this.fireZones.forEach((fz) => this.disposeGroupResources(fz.group));
    this.sharedSmokePuffGeo.dispose();
    this.sharedFireScorchGeo.dispose();
    this.sharedFireEmberGeo.dispose();
    this.sharedFireFlameGeo.dispose();
    this.sharedBlastSphereGeo.dispose();
    this.sharedBlastRingGeo.dispose();
    this.localRig.dispose();
    this.bots.forEach((b) => b.rig.dispose());
    this.remotes.forEach((r) => r.rig.dispose());
    this.map.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.opts.container) {
      this.opts.container.removeChild(this.renderer.domElement);
    }
  }
}
