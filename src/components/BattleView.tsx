import { useEffect, useRef, useState } from 'react';
import { MatchEngine, type MatchHudSnapshot } from '../engine/MatchEngine';
import {
  multiplayerClient,
  type RemoteCombatantInit,
  type VehicleNetState,
} from '../services/multiplayerClient';
import type { HudLayoutConfig } from '../game/hudLayout';
import type {
  ChatMessage,
  CombatantStats,
  MapId,
  PlayerLoadout,
  TeamId,
  TeamMode,
} from '../game/types';
import type { AppLang } from '../i18n/translations';
import { GameHUD } from './GameHUD';
import { ScoreboardModal } from './ScoreboardModal';

interface BattleViewProps {
  mapId: MapId;
  durationSec: number;
  botCount: number;
  isOnline: boolean;
  isHost: boolean;
  teamMode?: TeamMode;
  localTeam?: TeamId;
  localPlayerId: string;
  loadout: PlayerLoadout;
  sensitivity: number;
  hudLayout: HudLayoutConfig;
  lang: AppLang;
  muted: boolean;
  onToggleMuted: () => void;
  onOpenSettings: () => void;
  initialRemotes: RemoteCombatantInit[];
  initialVehicles?: VehicleNetState[];
  chatMessages: ChatMessage[];
  onSendChat: (text: string) => void;
  onRecordMatchResult: (kills: number, deaths: number) => void;
  onExitToLobby: () => void;
}

const INITIAL_HUD: MatchHudSnapshot = {
  hp: 100,
  armor: 60,
  ammo: 30,
  maxAmmo: 30,
  grenades: 7,
  grenadeCounts: { frag: 3, smoke: 2, molotov: 2 },
  selectedGrenadeType: 'frag',
  aimingGrenade: false,
  reloading: false,
  activeSlot: 0,
  weapons: ['m416', 'awm'],
  scoped: false,
  crouch: false,
  prone: false,
  ridingCarpet: false,
  parachuting: false,
  inVehicle: null,
  vehicleSeat: null,
  localTeam: 'free',
  teamMode: 'free',
  peek: 0,
  alive: true,
  respawnSec: 0,
  timeRemainingSec: -1,
  kills: 0,
  deaths: 0,
  aliveCount: 1,
  totalCount: 1,
  nearbyInteract: null,
  hitMarker: 'none',
  damageFlash: 0,
  burning: false,
  scopeTargetDist: 0,
  playerPos: { x: 0, z: 0, yaw: 0 },
  radarDots: [],
  scoreboard: [],
  killFeed: [],
};

export function BattleView({
  mapId,
  durationSec,
  botCount,
  isOnline,
  isHost,
  teamMode = 'free',
  localTeam = 'free',
  localPlayerId,
  loadout,
  sensitivity,
  hudLayout,
  lang,
  muted,
  onToggleMuted,
  onOpenSettings,
  initialRemotes,
  initialVehicles,
  chatMessages,
  onSendChat,
  onRecordMatchResult,
  onExitToLobby,
}: BattleViewProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<MatchEngine | null>(null);
  const [hud, setHud] = useState<MatchHudSnapshot>({
    ...INITIAL_HUD,
    teamMode,
    localTeam,
  });
  const [finalRankings, setFinalRankings] = useState<CombatantStats[] | null>(null);
  const [matchKey, setMatchKey] = useState(0);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    setFinalRankings(null);

    const engine = new MatchEngine({
      container,
      mapId,
      durationSec,
      botCount,
      isOnline,
      teamMode,
      localTeam,
      localPlayerId,
      loadout,
      sensitivity,
      initialRemotes,
      initialVehicles,
      onHudUpdate: (snap) => setHud(snap),
      onMatchEnd: (rankings) => {
        setFinalRankings(rankings);
        const selfRow = rankings.find((r) => r.isSelf);
        if (selfRow) {
          onRecordMatchResult(selfRow.kills, selfRow.deaths);
        }
      },
      onSendState: isOnline ? (st) => multiplayerClient.sendPlayerState(st) : undefined,
      onSendVehicleState: isOnline
        ? (vst) => multiplayerClient.sendVehicleState(vst)
        : undefined,
      onSendFire: isOnline
        ? (origin, dir, weaponId) => multiplayerClient.sendFire(origin, dir, weaponId)
        : undefined,
      onSendGrenade: isOnline
        ? (origin, vel, grenadeType) =>
            multiplayerClient.sendGrenade(origin, vel, grenadeType)
        : undefined,
      onSendHit: isOnline
        ? (targetId, damage, isHeadshot, weaponName) =>
            multiplayerClient.sendHit(targetId, damage, isHeadshot, weaponName)
        : undefined,
    });

    engineRef.current = engine;

    const unsub = isOnline
      ? multiplayerClient.onEvent((ev) => {
          if (ev.type === 'remote_state') {
            engine.applyRemoteState(ev);
          } else if (ev.type === 'remote_vehicle') {
            engine.applyRemoteVehicle(ev);
          } else if (ev.type === 'remote_fire') {
            engine.applyRemoteFire(ev);
          } else if (ev.type === 'remote_grenade') {
            engine.applyRemoteGrenade(ev.origin, ev.vel, ev.grenadeType);
          } else if (ev.type === 'took_damage') {
            engine.applyNetworkDamage(ev.hp);
          } else if (ev.type === 'player_killed') {
            engine.applyNetworkKill(
              ev.killerId,
              ev.killerName,
              ev.victimId,
              ev.victimName,
              ev.weaponName,
              ev.isHeadshot,
              ev.scoreboard,
            );
          } else if (ev.type === 'player_respawned') {
            engine.applyNetworkRespawn(ev.id, ev.x, ev.y, ev.z, ev.hp);
          } else if (ev.type === 'room_updated') {
            if (ev.joinedPlayer) {
              engine.upsertRemoteActor(ev.joinedPlayer);
            }
            if (ev.room?.players) {
              engine.syncRemoteRosterModels(ev.room.players, ev.room.teamMode);
            }
          } else if (ev.type === 'player_left') {
            engine.removeRemoteActor(ev.playerId);
          } else if (ev.type === 'match_ended') {
            engine.finishMatchNow();
          }
        })
      : () => {};

    return () => {
      unsub();
      engine.dispose();
      engineRef.current = null;
    };
  }, [mapId, durationSec, botCount, isOnline, teamMode, localPlayerId, matchKey]);

  // Live-sync outfit/helmet/callsign/GLB & sensitivity edits from SettingsModal mid-match
  useEffect(() => {
    engineRef.current?.updatePlayerLoadout(
      loadout.outfitId,
      loadout.helmetId,
      loadout.callsign,
      loadout.customGlbId ?? null,
      Boolean(loadout.customGlbFlip),
    );
  }, [
    loadout.outfitId,
    loadout.helmetId,
    loadout.callsign,
    loadout.customGlbId,
    loadout.customGlbFlip,
  ]);

  useEffect(() => {
    engineRef.current?.setSensitivity(sensitivity);
  }, [sensitivity]);

  const handleFinishMatch = () => {
    if (isOnline) {
      multiplayerClient.endMatch();
    } else {
      engineRef.current?.finishMatchNow();
    }
  };

  const handlePlayAgain = () => {
    if (isOnline) {
      if (isHost) {
        multiplayerClient.startMatch();
      }
    } else {
      setMatchKey((k) => k + 1);
    }
  };

  const handleBackToLobby = () => {
    if (isOnline && isHost) {
      multiplayerClient.backToLobby();
    }
    onExitToLobby();
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#0b0d10]">
      {/* Isolated WebGL Container */}
      <div ref={mountRef} className="absolute inset-0 z-0" />

      {/* Tactical HUD */}
      {!finalRankings && (
        <GameHUD
          engineRef={engineRef}
          hud={hud}
          hudLayout={hudLayout}
          isOnline={isOnline}
          isHost={isHost}
          lang={lang}
          muted={muted}
          chatMessages={chatMessages}
          onSendChat={onSendChat}
          onToggleMuted={onToggleMuted}
          onOpenSettings={onOpenSettings}
          onExitMatch={onExitToLobby}
          onFinishMatch={handleFinishMatch}
        />
      )}

      {/* Ranked Leaderboard Modal */}
      {finalRankings && (
        <ScoreboardModal
          rankings={finalRankings}
          isHost={isHost}
          isOnline={isOnline}
          lang={lang}
          onPlayAgain={handlePlayAgain}
          onBackToLobby={handleBackToLobby}
        />
      )}
    </div>
  );
}
