import React, { useEffect, useRef, useState } from 'react';
import {
  LogOut,
  Shield,
  Smile,
  Trophy,
  Volume2,
  VolumeX,
  PackageOpen,
  Settings,
  ArrowUp,
  ArrowDown,
  Wind,
  MessageSquare,
  Send,
  CarFront,
  DoorOpen,
} from 'lucide-react';
import type { MatchEngine, MatchHudSnapshot } from '../engine/MatchEngine';
import type { HudControlId, HudLayoutConfig } from '../game/hudLayout';
import {
  EMOTES,
  getWeaponSpec,
  type ChatMessage,
  type GrenadeType,
  type WeaponId,
} from '../game/types';
import { TRANSLATIONS, type AppLang } from '../i18n/translations';
import {
  PubgBulletIcon,
  PubgCrouchIcon,
  PubgFistIcon,
  PubgGrenadeIcon,
  PubgJumpIcon,
  PubgMolotovIcon,
  PubgPeekIcon,
  PubgProneIcon,
  PubgReloadIcon,
  PubgScopeIcon,
  PubgSmokeGrenadeIcon,
  WeaponMiniSilhouette,
} from './PubgIcons';

interface GameHUDProps {
  engineRef: React.RefObject<MatchEngine | null>;
  hud: MatchHudSnapshot;
  hudLayout: HudLayoutConfig;
  isOnline: boolean;
  isHost: boolean;
  lang: AppLang;
  muted: boolean;
  chatMessages: ChatMessage[];
  onSendChat: (text: string) => void;
  onToggleMuted: () => void;
  onOpenSettings: () => void;
  onExitMatch: () => void;
  onFinishMatch: () => void;
}

export function GameHUD({
  engineRef,
  hud,
  hudLayout,
  isOnline,
  isHost,
  lang,
  muted,
  chatMessages,
  onSendChat,
  onToggleMuted,
  onOpenSettings,
  onExitMatch,
  onFinishMatch,
}: GameHUDProps) {
  const t = TRANSLATIONS[lang];
  const [showEmotes, setShowEmotes] = useState(false);
  const [showLiveBoard, setShowLiveBoard] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [seenChatCount, setSeenChatCount] = useState(chatMessages.length);
  const [showGrenadePicker, setShowGrenadePicker] = useState(false);
  const [joyKnob, setJoyKnob] = useState({ x: 0, y: 0 });

  const joyActiveRef = useRef<number | null>(null);
  const joyOriginRef = useRef({ x: 0, y: 0 });
  const lookTouchRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const grenadePointerRef = useRef<{
    id: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
    aimStarted: boolean;
  } | null>(null);
  const grenadeHoldTimerRef = useRef<number | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (showChat) {
      setSeenChatCount(chatMessages.length);
      if (chatScrollRef.current) {
        chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
      }
    }
  }, [showChat, chatMessages.length]);

  useEffect(() => {
    return () => {
      if (grenadeHoldTimerRef.current) window.clearTimeout(grenadeHoldTimerRef.current);
    };
  }, []);

  const unreadChatCount = Math.max(0, chatMessages.length - seenChatCount);

  const activeWeapon = getWeaponSpec(hud.weapons[hud.activeSlot]);
  const isSniperView = hud.scoped && activeWeapon.hasOpticalScope && hud.alive;

  const hudPosStyle = (id: HudControlId): React.CSSProperties => {
    const cfg = hudLayout[id];
    return {
      left: `${cfg.xPct}%`,
      top: `${cfg.yPct}%`,
      transform: `translate(-50%, -50%) scale(${cfg.scale})`,
    };
  };

  const formatTime = (sec: number) => {
    if (sec < 0) return t.openTime;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Virtual Analog Joystick handlers (pointer events work identically on mouse and Android touch)
  const handleJoyDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    joyActiveRef.current = e.pointerId;
    const rect = e.currentTarget.getBoundingClientRect();
    joyOriginRef.current = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    updateJoyFromClient(e.clientX, e.clientY);
  };

  const updateJoyFromClient = (cx: number, cy: number) => {
    const maxR = 44;
    let dx = cx - joyOriginRef.current.x;
    let dy = cy - joyOriginRef.current.y;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }
    setJoyKnob({ x: dx, y: dy });
    engineRef.current?.setJoystick(dx / maxR, dy / maxR);
  };

  const handleJoyMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (joyActiveRef.current !== e.pointerId) return;
    e.stopPropagation();
    updateJoyFromClient(e.clientX, e.clientY);
  };

  const handleJoyUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (joyActiveRef.current !== e.pointerId) return;
    e.stopPropagation();
    joyActiveRef.current = null;
    setJoyKnob({ x: 0, y: 0 });
    engineRef.current?.setJoystick(0, 0);
  };

  // Free-cursor drag-to-look (NEVER locks mouse pointer so all HUD buttons stay clickable!)
  const handleLookDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    lookTouchRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };

  const handleLookMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!lookTouchRef.current || lookTouchRef.current.id !== e.pointerId) return;
    if (e.pointerType === 'mouse' && (e.buttons & 1) === 0) {
      lookTouchRef.current = null;
      return;
    }
    const dx = e.clientX - lookTouchRef.current.x;
    const dy = e.clientY - lookTouchRef.current.y;
    lookTouchRef.current.x = e.clientX;
    lookTouchRef.current.y = e.clientY;
    engineRef.current?.addLookDelta(dx * 1.35, dy * 1.35);
  };

  const handleLookUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (lookTouchRef.current?.id === e.pointerId) {
      lookTouchRef.current = null;
    }
  };

  // Single-tap Grenade button opens the 3-grenade picker (Frag / Smoke / Molotov).
  // Long-press (>175ms) or hold-and-drag aims the throw arc anywhere and releases to throw!
  const clearGrenadeTimer = () => {
    if (grenadeHoldTimerRef.current) {
      window.clearTimeout(grenadeHoldTimerRef.current);
      grenadeHoldTimerRef.current = null;
    }
  };

  const handleGrenadeDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!hud.alive) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    grenadePointerRef.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      aimStarted: false,
    };
    clearGrenadeTimer();
    grenadeHoldTimerRef.current = window.setTimeout(() => {
      const ref = grenadePointerRef.current;
      if (ref && ref.id === e.pointerId && hud.grenades > 0) {
        ref.aimStarted = true;
        setShowGrenadePicker(false);
        engineRef.current?.startGrenadeAim();
      }
    }, 175);
  };

  const handleGrenadeMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const ref = grenadePointerRef.current;
    if (!ref || ref.id !== e.pointerId) return;
    e.stopPropagation();
    const movedFromStart = Math.hypot(e.clientX - ref.startX, e.clientY - ref.startY);
    const dx = e.clientX - ref.x;
    const dy = e.clientY - ref.y;
    ref.x = e.clientX;
    ref.y = e.clientY;
    if (!ref.aimStarted && movedFromStart > 10) {
      clearGrenadeTimer();
      if (hud.grenades > 0) {
        ref.aimStarted = true;
        setShowGrenadePicker(false);
        engineRef.current?.startGrenadeAim();
      }
    }
    if (ref.aimStarted) {
      engineRef.current?.addLookDelta(dx * 1.25, dy * 1.25);
    }
  };

  const handleGrenadeUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const ref = grenadePointerRef.current;
    if (!ref || ref.id !== e.pointerId) return;
    e.stopPropagation();
    clearGrenadeTimer();
    const wasAiming = ref.aimStarted;
    grenadePointerRef.current = null;
    if (wasAiming) {
      engineRef.current?.releaseGrenadeThrow();
    } else {
      engineRef.current?.cancelGrenadeAim();
      setShowGrenadePicker((prev) => !prev);
    }
  };

  const handleGrenadeCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!grenadePointerRef.current || grenadePointerRef.current.id !== e.pointerId) return;
    e.stopPropagation();
    clearGrenadeTimer();
    grenadePointerRef.current = null;
    engineRef.current?.cancelGrenadeAim();
  };

  const handleSelectGrenadeType = (type: GrenadeType) => {
    engineRef.current?.cancelGrenadeAim();
    engineRef.current?.setGrenadeType(type);
    setShowGrenadePicker(false);
  };

  const grenadeName = (type: GrenadeType) =>
    type === 'smoke' ? t.smokeGrenade : type === 'molotov' ? t.molotovGrenade : t.fragGrenade;

  const renderInteractLabel = () => {
    if (!hud.nearbyInteract) return '';
    if (hud.nearbyInteract.kind === 'elevator_up') return t.useElevatorUp;
    if (hud.nearbyInteract.kind === 'elevator_down') return t.useElevatorDown;
    if (hud.nearbyInteract.kind === 'elevator_call_up') return t.callElevatorUp;
    if (hud.nearbyInteract.kind === 'elevator_call_down') return t.callElevatorDown;
    if (hud.nearbyInteract.kind === 'jumppad') return t.launchJumpPad;
    if (hud.nearbyInteract.kind === 'carpet') return t.rideCarpet;
    if (hud.nearbyInteract.kind === 'drive_car') return t.driveCar;
    if (hud.nearbyInteract.kind === 'drive_motorcycle') return t.driveMotorcycle;
    if (hud.nearbyInteract.kind === 'ride_passenger') return t.ridePassenger;
    if (hud.nearbyInteract.kind === 'grenade_drop' && hud.nearbyInteract.grenadeType) {
      return `${t.pickupGrenades}: ${grenadeName(hud.nearbyInteract.grenadeType)}`;
    }
    if (hud.nearbyInteract.kind === 'weapon' && hud.nearbyInteract.weaponId) {
      return `${t.pickupWeapon}: ${getWeaponSpec(hud.nearbyInteract.weaponId).nameAr}`;
    }
    return t.pickupWeapon;
  };

  const handleSendChat = () => {
    const txt = chatInput.trim();
    if (!txt) return;
    onSendChat(txt);
    setChatInput('');
  };

  return (
    <div className="fixed inset-0 z-20 pointer-events-none select-none">
      {/* Open-screen Drag-to-Look Surface (Touch & Mouse Drag, zero pointer lock) */}
      <div
        onPointerDown={handleLookDown}
        onPointerMove={handleLookMove}
        onPointerUp={handleLookUp}
        onPointerCancel={handleLookUp}
        className="absolute inset-0 pointer-events-auto"
      />

      {/* Red Damage Vignette */}
      {hud.damageFlash > 0.05 && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(circle, transparent 52%, rgba(220, 38, 38, ${Math.min(0.65, hud.damageFlash * 0.6)}) 100%)`,
          }}
        />
      )}

      {/* Molotov Burn Vignette + Compact Alert */}
      {hud.burning && hud.alive && (
        <>
          <div
            className="absolute inset-0 pointer-events-none animate-pulse"
            style={{
              background:
                'radial-gradient(circle, transparent 58%, rgba(249, 115, 22, 0.42) 100%)',
            }}
          />
          <div className="absolute top-16 left-1/2 -translate-x-1/2 pointer-events-none px-3 py-1 rounded bg-orange-950/85 border border-orange-500/70 text-orange-300 text-xs font-extrabold shadow-lg">
            🔥 تحترق!
          </div>
        </>
      )}

      {/* Optical Sniper Mil-Dot Scope Overlay (100% centered optical lens) */}
      {isSniperView && (
        <div className="fixed inset-0 pointer-events-none flex items-center justify-center overflow-hidden">
          <div
            className="relative w-[min(74vh,84vw)] h-[min(74vh,84vw)] rounded-full border-[3px] border-neutral-900 flex items-center justify-center overflow-hidden"
            style={{
              boxShadow: '0 0 0 100vmax rgba(0, 0, 0, 0.96), inset 0 0 38px rgba(0, 0, 0, 0.85)',
            }}
          >
            {/* Horizontal & Vertical Crosshair Axes */}
            <div className="absolute inset-x-0 h-[1.5px] bg-black/85" />
            <div className="absolute inset-y-0 w-[1.5px] bg-black/85" />
            {/* Mil-Dot Rangefinder Ticks */}
            {[-28, -20, -12, 12, 20, 28].map((pct) => (
              <React.Fragment key={pct}>
                <div
                  className="absolute w-[1.5px] h-2.5 bg-black/90"
                  style={{ left: `calc(50% + ${pct}%)` }}
                />
                <div
                  className="absolute h-[1.5px] w-2.5 bg-black/90"
                  style={{ top: `calc(50% + ${pct}%)` }}
                />
              </React.Fragment>
            ))}
            {/* Stadia thicker outer bars */}
            <div className="absolute left-0 w-[20%] h-[3px] bg-black" />
            <div className="absolute right-0 w-[20%] h-[3px] bg-black" />
            <div className="absolute bottom-0 h-[20%] w-[3px] bg-black" />
            {/* Illuminated center dot */}
            <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.95)] z-10" />
            <div className="absolute bottom-6 flex items-center gap-2 pointer-events-none">
              <span className="text-[11px] font-mono-num font-bold bg-black/80 border border-amber-400/45 px-2 py-0.5 rounded text-amber-300">
                {activeWeapon.id === 'amr' || activeWeapon.id === 'barrett'
                  ? '20X OPTIC'
                  : activeWeapon.id === 'awm' || activeWeapon.id === 'cheytac'
                    ? '15X OPTIC'
                    : activeWeapon.id === 'm24' || activeWeapon.id === 'kar98'
                      ? '8X OPTIC'
                      : '6X OPTIC'}
              </span>
              {hud.scopeTargetDist > 0 && (
                <span className="text-[11px] font-mono-num font-bold bg-black/80 border border-emerald-400/45 px-2 py-0.5 rounded text-emerald-300">
                  {hud.scopeTargetDist}m
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Center Crosshair (PUBG small transparent circle) + Hit Marker */}
      {!isSniperView && hud.alive && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-6 h-6 flex items-center justify-center">
            <div
              className={`rounded-full border transition-all flex items-center justify-center ${
                hud.scoped
                  ? 'w-2.5 h-2.5 border-sky-300/90 bg-sky-400/10 shadow-[0_0_5px_rgba(56,189,248,0.65)]'
                  : 'w-4 h-4 border-white/70 bg-white/[0.04] shadow-[0_0_4px_rgba(0,0,0,0.45)]'
              }`}
            >
              <div className="w-0.5 h-0.5 rounded-full bg-white/95" />
            </div>
            {hud.hitMarker !== 'none' && (
              <div
                className={`absolute inset-0 flex items-center justify-center ${
                  hud.hitMarker === 'head' ? 'text-red-500 scale-125' : 'text-amber-400'
                }`}
              >
                <div className="w-5 h-0.5 bg-current rotate-45 absolute" />
                <div className="w-5 h-0.5 bg-current -rotate-45 absolute" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Grenade Aiming Hint */}
      {hud.aimingGrenade && hud.alive && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-neutral-900/75 border border-amber-400/50 text-amber-300 px-3 py-1 rounded-md text-[11px] font-bold pointer-events-none">
          {t.holdToAimGrenade}
        </div>
      )}

      {/* Parachute Gliding Indicator */}
      {hud.parachuting && hud.alive && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-sky-950/85 border border-sky-400/60 text-sky-200 px-3 py-1 rounded-md text-[11px] font-bold pointer-events-none flex items-center gap-1.5 shadow">
          <Wind className="w-3.5 h-3.5 text-sky-300 animate-pulse" />
          <span>{t.parachutingLabel}</span>
        </div>
      )}

      {/* Respawn Overlay */}
      {!hud.alive && (
        <div className="absolute inset-0 bg-black/55 flex items-center justify-center pointer-events-none">
          <div className="bg-[#11151c]/95 border border-red-500/40 rounded-xl px-8 py-5 text-center">
            <div className="text-red-400 font-bold text-lg">{t.eliminated}</div>
            <div className="text-sm text-gray-300 mt-1 font-mono-num">
              {t.respawningIn} {hud.respawnSec}s
            </div>
          </div>
        </div>
      )}

      {/* TOP-LEFT: Compact Circular Tactical Radar Minimap (Customizable) */}
      <div style={hudPosStyle('radar')} className="absolute pointer-events-none">
        <div className="w-14 h-14 rounded-full bg-neutral-900/70 border border-white/25 relative overflow-hidden shadow">
          <div className="absolute inset-1.5 rounded-full border border-white/10" />
          <div className="absolute inset-x-0 top-1/2 h-px bg-white/10" />
          <div className="absolute inset-y-0 left-1/2 w-px bg-white/10" />
          {hud.radarDots.map((dot, idx) => {
            const dx = dot.x - hud.playerPos.x;
            const dz = dot.z - hud.playerPos.z;
            const cos = Math.cos(hud.playerPos.yaw);
            const sin = Math.sin(hud.playerPos.yaw);
            const rx = -(dx * cos - dz * sin);
            const rz = -(dx * sin + dz * cos);
            const scale = 0.85;
            const rawX = rx * scale;
            const rawY = rz * scale;
            const rDist = Math.hypot(rawX, rawY);
            const maxR = 44;
            const clampedScale = rDist > maxR ? maxR / rDist : 1;
            const px = 50 + rawX * clampedScale;
            const py = 50 + rawY * clampedScale;
            const colorClass =
              dot.type === 'ally'
                ? 'bg-emerald-400 w-1.5 h-1.5 ring-1 ring-white/80'
                : dot.type === 'enemy'
                  ? 'bg-red-500 w-1.5 h-1.5'
                  : dot.type === 'elevator'
                    ? 'bg-sky-400 w-1.5 h-1.5'
                    : dot.type === 'jumppad'
                      ? 'bg-cyan-300 w-1.5 h-1.5'
                      : dot.type === 'carpet'
                        ? 'bg-purple-400 w-1.5 h-1.5'
                        : 'bg-amber-400 w-1 h-1';
            return (
              <div
                key={idx}
                className={`absolute rounded-full -translate-x-1/2 -translate-y-1/2 ${colorClass}`}
                style={{ left: `${px}%`, top: `${py}%` }}
              />
            );
          })}
          {/* Player Center Arrow */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-emerald-400 rotate-45 border border-black" />
        </div>
      </div>

      {/* TOP-CENTER: Compact Match Status, Team Badge, Timer, Alive, Kills (Customizable) */}
      <div
        style={hudPosStyle('topStatus')}
        className="absolute pointer-events-auto flex items-center gap-1.5 bg-neutral-900/75 border border-white/20 px-2.5 py-1 rounded-lg text-[11px] whitespace-nowrap"
      >
        {hud.teamMode === 'teams' && hud.localTeam !== 'free' && (
          <>
            <span
              className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                hud.localTeam === 'green'
                  ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/50'
                  : 'bg-red-500/25 text-red-300 border border-red-400/50'
              }`}
            >
              {hud.localTeam === 'green' ? t.greenTeam : t.redTeam}
            </span>
            <span className="text-white/20">|</span>
          </>
        )}
        <div className="flex items-center gap-1">
          <span className="text-gray-300">{t.timeLabel}</span>
          <span className="font-mono-num font-bold text-amber-400">
            {formatTime(hud.timeRemainingSec)}
          </span>
        </div>
        <span className="text-white/20">|</span>
        <div className="flex items-center gap-1">
          <span className="text-gray-300">{t.killsLabel}</span>
          <span className="font-mono-num font-bold text-emerald-400">{hud.kills}</span>
        </div>
        <span className="text-white/20">|</span>
        <div className="flex items-center gap-1">
          <span className="text-gray-300">{t.aliveLabel}</span>
          <span className="font-mono-num font-bold text-white">
            {hud.aliveCount}/{hud.totalCount}
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowLiveBoard((s) => !s);
          }}
          className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-amber-300 flex items-center gap-1 text-[10px]"
          title={t.leaderboardBtn}
        >
          <Trophy className="w-3 h-3" />
          <span className="hidden sm:inline">{t.leaderboardBtn}</span>
        </button>
      </div>

      {/* TOP-RIGHT: Compact Quick Actions (Customizable) */}
      <div
        style={hudPosStyle('topActions')}
        className="absolute flex items-center gap-1 pointer-events-auto whitespace-nowrap"
      >
        {isOnline && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowChat((s) => !s);
              setShowEmotes(false);
            }}
            className={`relative px-2 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1 ${
              showChat
                ? 'bg-emerald-500/80 border-emerald-200 text-black'
                : 'bg-neutral-700/55 border-white/25 hover:bg-neutral-600/65 text-white'
            }`}
            title={t.chatBtn}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.chatBtn}</span>
            {unreadChatCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[15px] h-3.5 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                {unreadChatCount}
              </span>
            )}
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowEmotes((s) => !s);
            setShowChat(false);
          }}
          className="px-2 py-1.5 rounded-lg bg-neutral-700/55 border border-white/25 hover:bg-neutral-600/65 text-[11px] font-semibold text-white flex items-center gap-1"
        >
          <Smile className="w-3.5 h-3.5 text-amber-300" />
          <span className="hidden sm:inline">{t.emotesBtn}</span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleMuted();
          }}
          className="p-1.5 rounded-lg bg-neutral-700/55 border border-white/25 text-white hover:bg-neutral-600/65"
          aria-label={t.soundEffects}
        >
          {muted ? <VolumeX className="w-3.5 h-3.5 text-red-400" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenSettings();
          }}
          className="p-1.5 rounded-lg bg-neutral-700/55 border border-white/25 text-white hover:bg-neutral-600/65"
          title={t.settings}
          aria-label={t.settings}
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
        {(!isOnline || isHost) && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFinishMatch();
            }}
            className="px-2 py-1.5 rounded-lg bg-neutral-700/55 border border-amber-400/45 hover:bg-amber-500/30 text-amber-300 text-[11px] font-bold"
          >
            {t.endAndRank}
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onExitMatch();
          }}
          className="p-1.5 rounded-lg bg-neutral-700/55 border border-red-400/45 hover:bg-red-500/35 text-red-300"
          title={t.backToLobby}
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Top-Right Drawers (Emotes & Squad Chat) kept at full readable size */}
      <div className="absolute top-12 right-2 flex flex-col items-end gap-2">

        {/* Emotes Wheel Popover (8 Emotes) */}
        {showEmotes && (
          <div className="pointer-events-auto bg-[#11151c]/95 border border-amber-500/35 rounded-xl p-2 grid grid-cols-2 gap-1.5 w-60 max-h-64 overflow-y-auto shadow-xl">
            {EMOTES.map((em) => (
              <button
                key={em.id}
                onClick={(e) => {
                  e.stopPropagation();
                  engineRef.current?.triggerEmote(em.id);
                  setShowEmotes(false);
                }}
                className="px-2.5 py-2 rounded-lg bg-white/5 hover:bg-amber-500/20 text-xs font-semibold text-gray-100 text-center"
              >
                {em.nameAr}
              </button>
            ))}
          </div>
        )}

        {/* Collapsible Live Squad Chat Drawer */}
        {isOnline && showChat && (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="pointer-events-auto bg-[#0f141c]/95 border border-emerald-500/35 rounded-xl p-2.5 w-72 sm:w-80 flex flex-col gap-2 shadow-2xl"
          >
            <div className="flex items-center justify-between text-xs font-bold text-emerald-300 border-b border-white/10 pb-1">
              <span>{t.chatBtn}</span>
              <button
                onClick={() => setShowChat(false)}
                className="text-gray-400 hover:text-white text-[11px]"
              >
                {t.close}
              </button>
            </div>
            <div ref={chatScrollRef} className="max-h-36 overflow-y-auto space-y-1 text-xs">
              {chatMessages.map((msg) => (
                <div key={msg.id} className="bg-white/5 rounded px-2 py-1">
                  <span
                    className={`font-bold ${
                      msg.team === 'green'
                        ? 'text-emerald-400'
                        : msg.team === 'red'
                          ? 'text-red-400'
                          : 'text-amber-300'
                    }`}
                  >
                    {msg.senderName}:{' '}
                  </span>
                  <span className="text-gray-100 break-words">{msg.text}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {[t.quickChat1, t.quickChat2, t.quickChat3].map((qt, qi) => (
                <button
                  key={qi}
                  onClick={() => onSendChat(qt)}
                  className="px-2 py-0.5 rounded bg-white/8 hover:bg-emerald-500/25 text-[10px] text-gray-200 border border-white/10"
                >
                  {qt}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendChat();
              }}
              onTouchStart={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5"
            >
              <input
                type="text"
                enterKeyHint="send"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onTouchStart={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation();
                }}
                onKeyUp={(e) => e.stopPropagation()}
                placeholder={t.chatPlaceholder}
                maxLength={140}
                className="flex-1 bg-black/50 border border-white/15 focus:border-emerald-400 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
              />
              <button
                type="submit"
                className="p-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black"
                aria-label={t.sendChatBtn}
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Live Scoreboard Drawer */}
      {showLiveBoard && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 w-[92vw] max-w-lg bg-[#11151c]/95 border border-white/15 rounded-xl p-3 pointer-events-auto max-h-[55vh] overflow-y-auto">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10 text-xs font-bold text-amber-400">
            <span>{t.leaderboardBtn}</span>
            <button onClick={() => setShowLiveBoard(false)} className="text-gray-400 hover:text-white">
              {t.close}
            </button>
          </div>
          <div className="space-y-1 text-xs">
            {hud.scoreboard.slice(0, 12).map((row, idx) => (
              <div
                key={row.id}
                className={`flex items-center justify-between px-2 py-1.5 rounded ${
                  row.isSelf ? 'bg-amber-500/15 text-amber-200 font-bold' : 'text-gray-200'
                }`}
              >
                <span>
                  {idx + 1}. {row.name}
                </span>
                <span className="font-mono-num">
                  {t.colKills}: {row.kills} · {t.colDeaths}: {row.deaths}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contextual Interact / Vehicle / Elevator / Rooftop Jump Circle / Carpet / Weapon / Grenade Pickup Prompt */}
      {hud.nearbyInteract && hud.alive && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            engineRef.current?.triggerInteract();
          }}
          className={`pointer-events-auto absolute top-[57%] left-1/2 -translate-x-1/2 font-bold text-[11px] px-3 py-1.5 rounded-lg flex items-center gap-1.5 border transition-colors shadow-md ${
            hud.nearbyInteract.kind === 'jumppad'
              ? 'bg-cyan-950/85 hover:bg-cyan-400 hover:text-black text-cyan-200 border-cyan-400/75'
              : hud.nearbyInteract.kind === 'carpet'
                ? 'bg-purple-950/90 hover:bg-amber-400 hover:text-black text-amber-200 border-amber-400/80'
                : hud.nearbyInteract.kind === 'drive_car' ||
                    hud.nearbyInteract.kind === 'drive_motorcycle' ||
                    hud.nearbyInteract.kind === 'ride_passenger'
                  ? 'bg-emerald-950/90 hover:bg-emerald-400 hover:text-black text-emerald-200 border-emerald-400/80'
                  : hud.nearbyInteract.kind.startsWith('elevator')
                    ? 'bg-emerald-950/85 hover:bg-emerald-400 hover:text-black text-emerald-200 border-emerald-400/75'
                    : 'bg-neutral-800/85 hover:bg-amber-500 hover:text-black text-amber-300 border-amber-400/60'
          }`}
        >
          {hud.nearbyInteract.kind === 'drive_car' ||
          hud.nearbyInteract.kind === 'drive_motorcycle' ||
          hud.nearbyInteract.kind === 'ride_passenger' ? (
            <CarFront className="w-3.5 h-3.5" />
          ) : (
            <PackageOpen className="w-3.5 h-3.5" />
          )}
          <span>{renderInteractLabel()}</span>
        </button>
      )}

      {/* Vehicle Riding / Driving Exit Control (Fire & Scope stay 100% under manual player control!) */}
      {hud.inVehicle && hud.alive && (
        <div
          className="pointer-events-auto absolute top-[26%] right-3 flex flex-col gap-2"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              engineRef.current?.exitActiveVehicle();
            }}
            className="px-3.5 py-2.5 rounded-xl bg-red-900/90 hover:bg-red-500 border border-red-400/75 text-white text-xs font-bold flex items-center gap-2 shadow-lg"
          >
            <DoorOpen className="w-4 h-4" />
            <span>{t.exitVehicle}</span>
          </button>
        </div>
      )}

      {/* Flying Carpet Aerial Controls (Ascend, Descend, Dismount -> Parachute) */}
      {hud.ridingCarpet && hud.alive && (
        <div
          className="pointer-events-auto absolute top-[26%] right-3 flex flex-col gap-2"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              engineRef.current?.setCarpetAscend(true);
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              engineRef.current?.setCarpetAscend(false);
            }}
            onPointerCancel={(e) => {
              e.stopPropagation();
              engineRef.current?.setCarpetAscend(false);
            }}
            className="px-3 py-2 rounded-xl bg-purple-950/85 active:bg-amber-400 active:text-black border border-amber-400/70 text-amber-200 text-xs font-bold flex items-center gap-1.5 shadow-lg touch-none"
          >
            <ArrowUp className="w-4 h-4" />
            <span>{t.carpetAscend}</span>
          </button>

          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              engineRef.current?.setCarpetDescend(true);
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              engineRef.current?.setCarpetDescend(false);
            }}
            onPointerCancel={(e) => {
              e.stopPropagation();
              engineRef.current?.setCarpetDescend(false);
            }}
            className="px-3 py-2 rounded-xl bg-purple-950/85 active:bg-amber-400 active:text-black border border-amber-400/70 text-amber-200 text-xs font-bold flex items-center gap-1.5 shadow-lg touch-none"
          >
            <ArrowDown className="w-4 h-4" />
            <span>{t.carpetDescend}</span>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              engineRef.current?.dismountCarpet();
            }}
            className="px-3 py-2 rounded-xl bg-red-900/85 hover:bg-red-500 border border-red-400/70 text-white text-xs font-bold shadow-lg"
          >
            {t.dismountCarpet}
          </button>
        </div>
      )}

      {/* ================= LEFT ANALOG JOYSTICK (Customizable Position & Scale) ================= */}
      <div
        onPointerDown={handleJoyDown}
        onPointerMove={handleJoyMove}
        onPointerUp={handleJoyUp}
        onPointerCancel={handleJoyUp}
        style={hudPosStyle('joystick')}
        className="pointer-events-auto absolute w-32 h-32 rounded-full bg-neutral-800/45 border-2 border-white/25 flex items-center justify-center touch-none"
      >
        <div className="w-20 h-20 rounded-full border border-white/15 pointer-events-none" />
        <div
          className="w-12 h-12 rounded-full bg-neutral-300/65 border-2 border-white/60 pointer-events-none"
          style={{
            transform: `translate(${joyKnob.x}px, ${joyKnob.y}px)`,
          }}
        />
      </div>

      {/* ================= FIRE, FIST & ZOOM/SCOPE ================= */}
      <button
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          engineRef.current?.setFireHeld(true);
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          engineRef.current?.setFireHeld(false);
        }}
        onPointerCancel={() => engineRef.current?.setFireHeld(false)}
        style={hudPosStyle('fire')}
        className="pointer-events-auto absolute w-16 h-16 sm:w-[70px] sm:h-[70px] rounded-full bg-neutral-800/55 active:bg-red-600/75 border-2 border-white/35 text-white font-bold flex flex-col items-center justify-center touch-none shadow-lg"
        title={t.fire}
        aria-label={t.fire}
      >
        <PubgBulletIcon className="w-9 h-9" />
      </button>

      <button
        onPointerDown={(e) => {
          e.stopPropagation();
          engineRef.current?.triggerMelee();
        }}
        style={hudPosStyle('fist')}
        className="pointer-events-auto absolute w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-neutral-800/55 active:bg-amber-500/75 active:text-black border-2 border-white/30 text-white flex flex-col items-center justify-center touch-none shadow-md"
        title={t.punch}
        aria-label={t.punch}
      >
        <PubgFistIcon className="w-6 h-6" />
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation();
          engineRef.current?.toggleScope();
        }}
        style={hudPosStyle('scope')}
        className={`pointer-events-auto absolute w-11 h-11 sm:w-12 sm:h-12 rounded-full border-2 flex items-center justify-center transition-colors shadow-md ${
          hud.scoped
            ? 'bg-sky-500/75 text-black border-sky-200'
            : 'bg-neutral-800/55 text-white border-white/30 hover:bg-neutral-700/60'
        }`}
        title={t.scope}
        aria-label={t.scope}
      >
        <PubgScopeIcon className="w-5 h-5" />
      </button>

      {/* ================= GRENADE (FRAG / SMOKE / MOLOTOV LONG-PRESS PICKER) & RELOAD ================= */}
      {showGrenadePicker && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            left: `${hudLayout.grenade.xPct}%`,
            top: `${Math.max(18, hudLayout.grenade.yPct - 15)}%`,
            transform: 'translate(-50%, -50%)',
          }}
          className="pointer-events-auto absolute z-30 bg-[#10151e]/95 border border-amber-400/50 rounded-xl p-2 flex items-center gap-2 shadow-2xl"
        >
          {(
            [
              { type: 'frag' as const, label: t.fragGrenade, Icon: PubgGrenadeIcon, color: 'text-emerald-300' },
              { type: 'smoke' as const, label: t.smokeGrenade, Icon: PubgSmokeGrenadeIcon, color: 'text-sky-300' },
              { type: 'molotov' as const, label: t.molotovGrenade, Icon: PubgMolotovIcon, color: 'text-orange-400' },
            ]
          ).map(({ type, label, Icon, color }) => {
            const count = hud.grenadeCounts[type];
            const active = hud.selectedGrenadeType === type;
            return (
              <button
                key={type}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectGrenadeType(type);
                }}
                className={`px-2.5 py-2 rounded-lg border flex flex-col items-center gap-1 min-w-[62px] transition-colors ${
                  active
                    ? 'bg-amber-500/25 border-amber-400 text-white'
                    : 'bg-white/5 border-white/15 text-gray-300 hover:bg-white/10'
                }`}
              >
                <Icon className={`w-6 h-6 ${color}`} />
                <span className="text-[10px] font-bold leading-tight">{label}</span>
                <span className="font-mono-num text-[10px] text-amber-300 font-bold">x{count}</span>
              </button>
            );
          })}
        </div>
      )}

      <button
        onPointerDown={handleGrenadeDown}
        onPointerMove={handleGrenadeMove}
        onPointerUp={handleGrenadeUp}
        onPointerCancel={handleGrenadeCancel}
        style={hudPosStyle('grenade')}
        className={`pointer-events-auto absolute w-11 h-11 rounded-full border-2 flex items-center justify-center touch-none transition-colors ${
          hud.aimingGrenade
            ? 'bg-amber-500/75 text-black border-amber-200'
            : hud.selectedGrenadeType === 'smoke'
              ? 'bg-sky-900/65 text-sky-200 border-sky-300/60 hover:bg-sky-800/70'
              : hud.selectedGrenadeType === 'molotov'
                ? 'bg-orange-950/75 text-orange-300 border-orange-400/70 hover:bg-orange-900/80'
                : 'bg-neutral-800/50 text-white border-white/25 hover:bg-neutral-700/60'
        }`}
        title={t.holdSwitchGrenadeHint}
        aria-label={t.grenade}
      >
        {hud.selectedGrenadeType === 'smoke' ? (
          <PubgSmokeGrenadeIcon className="w-6 h-6" />
        ) : hud.selectedGrenadeType === 'molotov' ? (
          <PubgMolotovIcon className="w-6 h-6" />
        ) : (
          <PubgGrenadeIcon className="w-6 h-6" />
        )}
        <span className="absolute -bottom-1 -right-1 font-mono-num text-[10px] font-bold bg-black/80 text-amber-300 border border-white/25 px-1.5 rounded-full leading-tight">
          {hud.grenades}
        </span>
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation();
          engineRef.current?.triggerReload();
        }}
        style={hudPosStyle('reload')}
        className={`pointer-events-auto absolute w-11 h-11 rounded-full border-2 flex items-center justify-center transition-colors ${
          hud.reloading
            ? 'bg-amber-500/70 text-black border-amber-200 animate-pulse'
            : 'bg-neutral-800/50 text-white border-white/25 hover:bg-neutral-700/60'
        }`}
        title={t.reload}
        aria-label={t.reload}
      >
        <PubgReloadIcon className="w-5 h-5" />
      </button>

      {/* ================= TWO OPPOSING PEEK BUTTONS ================= */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          engineRef.current?.togglePeek(-1);
        }}
        style={hudPosStyle('peekLeft')}
        className={`pointer-events-auto absolute w-12 h-10 rounded-xl border-2 flex items-center justify-center transition-colors ${
          hud.peek === -1
            ? 'bg-amber-500/75 text-black border-amber-200'
            : 'bg-neutral-800/50 text-white border-white/25 hover:bg-neutral-700/60'
        }`}
        title="Q"
        aria-label="Peek Left"
      >
        <PubgPeekIcon dir="left" className="w-6 h-5" />
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation();
          engineRef.current?.togglePeek(1);
        }}
        style={hudPosStyle('peekRight')}
        className={`pointer-events-auto absolute w-12 h-10 rounded-xl border-2 flex items-center justify-center transition-colors ${
          hud.peek === 1
            ? 'bg-amber-500/75 text-black border-amber-200'
            : 'bg-neutral-800/50 text-white border-white/25 hover:bg-neutral-700/60'
        }`}
        title="E"
        aria-label="Peek Right"
      >
        <PubgPeekIcon dir="right" className="w-6 h-5" />
      </button>

      {/* ================= PRONE (GREEN), CROUCH & JUMP ================= */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          engineRef.current?.toggleProne();
        }}
        style={hudPosStyle('prone')}
        className={`pointer-events-auto absolute w-12 h-12 sm:w-13 sm:h-13 rounded-full border-2 flex items-center justify-center transition-colors shadow-md ${
          hud.prone
            ? 'bg-emerald-400 text-black border-white shadow-[0_0_12px_rgba(52,211,153,0.8)]'
            : 'bg-emerald-600/75 text-white border-emerald-300/85 hover:bg-emerald-500/85'
        }`}
        title={t.prone}
        aria-label={t.prone}
      >
        <PubgProneIcon className="w-6 h-6" />
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation();
          engineRef.current?.toggleCrouch();
        }}
        style={hudPosStyle('crouch')}
        className={`pointer-events-auto absolute w-13 h-13 sm:w-14 sm:h-14 rounded-full border-2 flex items-center justify-center transition-colors ${
          hud.crouch
            ? 'bg-amber-500/75 text-black border-amber-200'
            : 'bg-neutral-800/50 text-white border-white/30 hover:bg-neutral-700/60'
        }`}
        title={t.crouch}
        aria-label={t.crouch}
      >
        <PubgCrouchIcon className="w-7 h-7" />
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation();
          engineRef.current?.triggerJump();
        }}
        style={hudPosStyle('jump')}
        className="pointer-events-auto absolute w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-neutral-800/50 active:bg-amber-500/75 active:text-black border-2 border-white/30 text-white flex items-center justify-center transition-colors"
        title={t.jump}
        aria-label={t.jump}
      >
        <PubgJumpIcon className="w-7 h-7" />
      </button>

      {/* Health, Armor & PUBG Weapon Slots (Sleek compact overlay controllable via Settings) */}
      <div
        style={hudPosStyle('weapons')}
        className="pointer-events-auto absolute flex flex-col items-center gap-1"
      >
        {/* HP & Armor Bar */}
        <div className="flex items-center gap-1.5 bg-neutral-900/70 border border-white/20 px-2.5 py-0.5 rounded-md w-48 sm:w-56">
          <div className="flex-1 h-1.5 bg-white/15 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                hud.hp > 40 ? 'bg-emerald-500' : 'bg-red-500'
              }`}
              style={{ width: `${hud.hp}%` }}
            />
          </div>
          <span className="font-mono-num text-[11px] font-bold text-white w-7 text-center">
            {hud.hp}
          </span>
          <div className="flex items-center gap-0.5 text-[10px] text-sky-400 font-mono-num">
            <Shield className="w-3 h-3" />
            <span>{hud.armor}</span>
          </div>
        </div>

        {/* 2 Weapon Switcher Slots with Mini Firearm Silhouettes */}
        <div className="flex items-center gap-1.5">
          {([0, 1] as const).map((slot) => {
            const wSpec = getWeaponSpec(hud.weapons[slot]);
            const active = hud.activeSlot === slot;
            return (
              <button
                key={slot}
                onClick={(e) => {
                  e.stopPropagation();
                  engineRef.current?.switchWeapon(slot);
                }}
                className={`px-2 py-0.5 rounded-md border text-start min-w-[98px] transition-colors ${
                  active
                    ? 'bg-neutral-700/70 border-amber-400 text-white'
                    : 'bg-neutral-900/65 border-white/20 text-gray-300 hover:text-white'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] gap-1.5">
                  <span className="font-bold truncate">{wSpec.nameAr}</span>
                  <span className="font-mono-num text-amber-300">
                    {active ? `${hud.ammo}/${hud.maxAmmo}` : `${slot + 1}`}
                  </span>
                </div>
                <WeaponMiniSilhouette weaponId={wSpec.id} className="w-10 h-3 text-white/80 mt-0.5" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
