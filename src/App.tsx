import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from './firebase';
import { BattleView } from './components/BattleView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LobbyScreen } from './components/LobbyScreen';
import { SettingsModal } from './components/SettingsModal';
import { soundEngine } from './engine/audioEngine';
import {
  loadHudLayout,
  saveHudLayout,
  type HudLayoutConfig,
} from './game/hudLayout';
import type {
  ChatMessage,
  HelmetId,
  MapId,
  OutfitId,
  PlayerLoadout,
  RoomStateInfo,
  TeamId,
  TeamMode,
  WeaponId,
} from './game/types';
import type { AppLang } from './i18n/translations';
import {
  multiplayerClient,
  type RemoteCombatantInit,
  type VehicleNetState,
} from './services/multiplayerClient';
import { ensureGlbUploadedToServer } from './services/customCharacterStore';
import {
  addFriendByEmail,
  checkGoogleRedirectResult,
  ensureUserProfile,
  formatFirebaseAuthError,
  recordMatchStatsToCloud,
  respondToInvite,
  saveLoadoutToCloud,
  sendRoomInvite,
  signInWithGoogle,
  signOutUser,
  subscribeFriends,
  subscribeIncomingInvites,
  type FriendRecord,
  type RoomInviteRecord,
} from './services/profileService';

const STORAGE_KEY = 'warzone_strike_loadout_v1';
const LANG_STORAGE_KEY = 'warzone_lang_v1';
const SENS_STORAGE_KEY = 'warzone_sens_v1';

const DEFAULT_LOADOUT: PlayerLoadout = {
  callsign: 'صقر_1',
  outfitId: 'woodland_specops',
  helmetId: 'ballistic',
  primaryWeapon: 'm416',
  secondaryWeapon: 'awm',
};

function loadInitialLoadout(): PlayerLoadout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LOADOUT;
    const parsed = JSON.parse(raw);
    return {
      callsign: String(parsed.callsign || DEFAULT_LOADOUT.callsign).slice(0, 24),
      outfitId: (parsed.outfitId as OutfitId) || DEFAULT_LOADOUT.outfitId,
      helmetId: (parsed.helmetId as HelmetId) || DEFAULT_LOADOUT.helmetId,
      primaryWeapon: (parsed.primaryWeapon as WeaponId) || DEFAULT_LOADOUT.primaryWeapon,
      secondaryWeapon: (parsed.secondaryWeapon as WeaponId) || DEFAULT_LOADOUT.secondaryWeapon,
      customGlbId: typeof parsed.customGlbId === 'string' ? parsed.customGlbId : null,
      customGlbFlip: Boolean(parsed.customGlbFlip),
      applyGlbToBots: Boolean(parsed.applyGlbToBots),
    };
  } catch {
    return DEFAULT_LOADOUT;
  }
}

function loadInitialLang(): AppLang {
  try {
    const val = localStorage.getItem(LANG_STORAGE_KEY);
    if (val === 'ar' || val === 'fr' || val === 'en') return val;
    return 'ar';
  } catch {
    return 'ar';
  }
}

function loadInitialSensitivity(): number {
  try {
    const val = Number(localStorage.getItem(SENS_STORAGE_KEY));
    if (Number.isFinite(val) && val >= 0.4 && val <= 2.2) return val;
    return 1.0;
  } catch {
    return 1.0;
  }
}

function WarzoneApp() {
  const [loadout, setLoadout] = useState<PlayerLoadout>(loadInitialLoadout);
  const [lang, setLang] = useState<AppLang>(loadInitialLang);
  const [sensitivity, setSensitivity] = useState<number>(loadInitialSensitivity);
  const [muted, setMuted] = useState<boolean>(soundEngine.muted);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [hudLayout, setHudLayout] = useState<HudLayoutConfig>(loadHudLayout);

  const [mapId, setMapId] = useState<MapId>('metropolis');
  const [durationSec, setDurationSec] = useState<number>(300);
  const [botCount, setBotCount] = useState<number>(16);
  const [teamMode, setTeamMode] = useState<TeamMode>('free');

  // Firebase Google Auth & Friends
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendRecord[]>([]);
  const [incomingInvites, setIncomingInvites] = useState<RoomInviteRecord[]>([]);

  // Multiplayer WebSocket Room & Live Chat
  const [wsConnected, setWsConnected] = useState(false);
  const [onlineRoom, setOnlineRoom] = useState<RoomStateInfo | null>(null);
  const [localPlayerId, setLocalPlayerId] = useState<string>('local_player');
  const [roomError, setRoomError] = useState<string | null>(null);
  const [screen, setScreen] = useState<'lobby' | 'battle'>('lobby');
  const [isOnlineBattle, setIsOnlineBattle] = useState(false);
  const [initialRemotes, setInitialRemotes] = useState<RemoteCombatantInit[]>([]);
  const [initialVehicles, setInitialVehicles] = useState<VehicleNetState[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const loadoutRef = useRef(loadout);
  loadoutRef.current = loadout;
  const userRef = useRef(user);
  userRef.current = user;
  const pendingUrlRoomRef = useRef<string | null>(
    new URLSearchParams(window.location.search).get('room')?.toUpperCase() || null,
  );

  // Apply RTL/LTR and lang attribute dynamically when language switches
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      // ignore storage errors
    }
  }, [lang]);

  const handleChangeSensitivity = useCallback((val: number) => {
    setSensitivity(val);
    try {
      localStorage.setItem(SENS_STORAGE_KEY, String(val));
    } catch {
      // ignore
    }
  }, []);

  const handleToggleMuted = useCallback(() => {
    soundEngine.muted = !soundEngine.muted;
    setMuted(soundEngine.muted);
  }, []);

  const handleChangeHudLayout = useCallback((next: HudLayoutConfig) => {
    setHudLayout(next);
    saveHudLayout(next);
  }, []);

  // Auth listener & Firestore subscriptions
  useEffect(() => {
    let unsubFriends: (() => void) | undefined;
    let unsubInvites: (() => void) | undefined;

    checkGoogleRedirectResult().catch((err) => {
      setAuthError(formatFirebaseAuthError(err));
    });

    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) setAuthError(null);
      unsubFriends?.();
      unsubInvites?.();

      if (u) {
        try {
          const cloud = await ensureUserProfile(u, loadoutRef.current);
          const merged: PlayerLoadout = {
            callsign: cloud.callsign,
            outfitId: cloud.outfitId as OutfitId,
            helmetId: cloud.helmetId as HelmetId,
            primaryWeapon: cloud.primaryWeapon as WeaponId,
            secondaryWeapon: cloud.secondaryWeapon as WeaponId,
            customGlbId: loadoutRef.current.customGlbId ?? null,
            customGlbFlip: Boolean(loadoutRef.current.customGlbFlip),
            applyGlbToBots: Boolean(loadoutRef.current.applyGlbToBots),
          };
          setLoadout(merged);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        } catch {
          // keep local loadout if offline
        }
        unsubFriends = subscribeFriends(u, setFriends);
        unsubInvites = subscribeIncomingInvites(u, setIncomingInvites);
      } else {
        setFriends([]);
        setIncomingInvites([]);
      }
    });

    return () => {
      unsubAuth();
      unsubFriends?.();
      unsubInvites?.();
    };
  }, []);

  // WebSocket Multiplayer Client lifecycle
  useEffect(() => {
    multiplayerClient.connect();
    const unsub = multiplayerClient.onEvent((ev) => {
      if (ev.type === 'connected') {
        setWsConnected(true);
        if (pendingUrlRoomRef.current) {
          const code = pendingUrlRoomRef.current;
          pendingUrlRoomRef.current = null;
          const activeLoadout = loadoutRef.current;
          const uid = userRef.current?.uid;
          Promise.resolve(
            activeLoadout.customGlbId
              ? ensureGlbUploadedToServer(activeLoadout.customGlbId).catch(() => false)
              : false,
          ).then(() => {
            multiplayerClient.joinRoom(code, {
              ...loadoutRef.current,
              uid,
            });
          });
        }
      } else if (ev.type === 'disconnected') {
        setWsConnected(false);
      } else if (ev.type === 'error') {
        setRoomError(ev.message);
      } else if (ev.type === 'room_joined') {
        setRoomError(null);
        setLocalPlayerId(ev.playerId);
        setOnlineRoom(ev.room);
        setTeamMode(ev.room.teamMode || 'free');
        setChatMessages(ev.chatHistory || []);
        setInitialVehicles(ev.vehicles || []);
        if (ev.room.status === 'playing' && ev.combatants) {
          setInitialRemotes(ev.combatants);
          setIsOnlineBattle(true);
          setScreen('battle');
        }
      } else if (ev.type === 'room_updated') {
        setOnlineRoom(ev.room);
        setTeamMode(ev.room.teamMode || 'free');
        if (ev.room.status === 'lobby') {
          setScreen('lobby');
        }
      } else if (ev.type === 'chat_message') {
        setChatMessages((prev) => [...prev.slice(-49), ev.message]);
      } else if (ev.type === 'player_left') {
        setOnlineRoom(ev.room);
      } else if (ev.type === 'match_started') {
        setOnlineRoom(ev.room);
        setTeamMode(ev.room.teamMode || 'free');
        setInitialRemotes(ev.combatants);
        setInitialVehicles([]);
        setIsOnlineBattle(true);
        setScreen('battle');
      }
    });

    return () => {
      unsub();
      multiplayerClient.disconnect();
    };
  }, []);

  // Debounced cloud sync when loadout changes
  const saveTimerRef = useRef<number | null>(null);
  const handleUpdateLoadout = useCallback(
    (next: PlayerLoadout) => {
      setLoadout(next);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      if (onlineRoom) {
        if (next.customGlbId) {
          ensureGlbUploadedToServer(next.customGlbId)
            .catch(() => false)
            .then(() => {
              multiplayerClient.updateProfile({ ...next, uid: user?.uid });
            });
        } else {
          multiplayerClient.updateProfile({ ...next, uid: user?.uid });
        }
      }
      if (user) {
        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = window.setTimeout(() => {
          saveLoadoutToCloud(user, next).catch(() => {});
        }, 650);
      }
    },
    [onlineRoom, user],
  );

  const handleGoogleLogin = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setAuthError(formatFirebaseAuthError(err));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleLogout = async () => {
    setAuthError(null);
    await signOutUser();
  };

  const handleCreateRoom = async () => {
    setRoomError(null);
    if (loadout.customGlbId) {
      await ensureGlbUploadedToServer(loadout.customGlbId).catch(() => false);
    }
    multiplayerClient.createRoom(
      { ...loadoutRef.current, uid: user?.uid },
      mapId,
      durationSec,
      Math.min(20, botCount),
      teamMode,
    );
  };

  const handleJoinRoom = async (code: string) => {
    setRoomError(null);
    if (loadout.customGlbId) {
      await ensureGlbUploadedToServer(loadout.customGlbId).catch(() => false);
    }
    multiplayerClient.joinRoom(code, { ...loadoutRef.current, uid: user?.uid });
  };

  const handleLeaveRoom = () => {
    multiplayerClient.leaveRoom();
    setOnlineRoom(null);
    setChatMessages([]);
    setInitialVehicles([]);
  };

  const handleSendChat = useCallback((text: string) => {
    const clean = text.trim().slice(0, 180);
    if (!clean) return;
    if (onlineRoom) {
      multiplayerClient.sendChat(clean);
    } else {
      setChatMessages((prev) => [
        ...prev.slice(-49),
        {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          senderId: localPlayerId,
          senderName: loadoutRef.current.callsign,
          team: 'free',
          text: clean,
          timestamp: Date.now(),
        },
      ]);
    }
  }, [onlineRoom, localPlayerId]);

  const handleSwitchTeam = useCallback((team: TeamId) => {
    multiplayerClient.switchTeam(team);
  }, []);

  const handleAcceptInvite = async (invite: RoomInviteRecord) => {
    try {
      await respondToInvite(invite.id, 'accepted');
    } catch {
      // continue trying to join room even if status update lags
    }
    await handleJoinRoom(invite.roomCode);
  };

  const handleDeclineInvite = async (inviteId: string) => {
    try {
      await respondToInvite(inviteId, 'declined');
    } catch {
      // ignore network decline error
    }
  };

  const handleSendInvite = async (friendUid: string) => {
    if (!user || !onlineRoom) return;
    await sendRoomInvite(
      user,
      loadout.callsign,
      friendUid,
      onlineRoom.code,
      onlineRoom.mapId,
    );
  };

  const handleStartOfflineMatch = () => {
    setIsOnlineBattle(false);
    setInitialRemotes([]);
    setInitialVehicles([]);
    setChatMessages([]);
    setLocalPlayerId('local_player');
    setScreen('battle');
  };

  const handleExitToLobby = () => {
    setScreen('lobby');
    if (isOnlineBattle && onlineRoom && onlineRoom.hostId !== localPlayerId) {
      multiplayerClient.leaveRoom();
      setOnlineRoom(null);
      setChatMessages([]);
      setInitialVehicles([]);
    }
  };

  const activeBattleMap = isOnlineBattle && onlineRoom ? onlineRoom.mapId : mapId;
  const activeBattleDuration =
    isOnlineBattle && onlineRoom ? onlineRoom.durationSec : durationSec;
  const activeBattleBots =
    isOnlineBattle && onlineRoom ? onlineRoom.botCount : botCount;
  const activeTeamMode: TeamMode =
    isOnlineBattle && onlineRoom ? onlineRoom.teamMode || 'free' : 'free';
  const localPlayerTeam: TeamId =
    isOnlineBattle && onlineRoom
      ? onlineRoom.players.find((p) => p.id === localPlayerId)?.team ?? 'free'
      : 'free';
  const isHost = !onlineRoom || onlineRoom.hostId === localPlayerId;

  return (
    <>
      {screen === 'battle' ? (
        <BattleView
          mapId={activeBattleMap}
          durationSec={activeBattleDuration}
          botCount={activeBattleBots}
          isOnline={isOnlineBattle}
          isHost={isHost}
          teamMode={activeTeamMode}
          localTeam={localPlayerTeam}
          localPlayerId={localPlayerId}
          loadout={loadout}
          sensitivity={sensitivity}
          hudLayout={hudLayout}
          lang={lang}
          muted={muted}
          onToggleMuted={handleToggleMuted}
          onOpenSettings={() => setShowSettings(true)}
          initialRemotes={initialRemotes}
          initialVehicles={initialVehicles}
          chatMessages={chatMessages}
          onSendChat={handleSendChat}
          onRecordMatchResult={(kills, deaths) => {
            if (user) {
              recordMatchStatsToCloud(user, kills, deaths).catch(() => {});
            }
          }}
          onExitToLobby={handleExitToLobby}
        />
      ) : (
        <LobbyScreen
          lang={lang}
          onOpenSettings={() => setShowSettings(true)}
          loadout={loadout}
          onUpdateLoadout={handleUpdateLoadout}
          mapId={mapId}
          onChangeMap={setMapId}
          durationSec={durationSec}
          onChangeDuration={setDurationSec}
          botCount={botCount}
          onChangeBotCount={setBotCount}
          teamMode={teamMode}
          onChangeTeamMode={setTeamMode}
          onStartOfflineMatch={handleStartOfflineMatch}
          user={user}
          authLoading={authLoading}
          authError={authError}
          onClearAuthError={() => setAuthError(null)}
          onGoogleLogin={handleGoogleLogin}
          onGoogleLogout={handleGoogleLogout}
          friends={friends}
          onAddFriendByEmail={(email) =>
            user
              ? addFriendByEmail(user, email)
              : Promise.resolve({ ok: false, message: 'Sign in with Google first' })
          }
          onSendInviteToFriend={handleSendInvite}
          incomingInvites={incomingInvites}
          onAcceptInvite={handleAcceptInvite}
          onDeclineInvite={handleDeclineInvite}
          wsConnected={wsConnected}
          onlineRoom={onlineRoom}
          localPlayerId={localPlayerId}
          roomError={roomError}
          chatMessages={chatMessages}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onLeaveRoom={handleLeaveRoom}
          onSwitchTeam={handleSwitchTeam}
          onSendChat={handleSendChat}
          onStartOnlineMatch={() => multiplayerClient.startMatch()}
          onSyncOnlineSettings={(m, d, b, tm) =>
            multiplayerClient.updateRoom(m, d, b, tm)
          }
        />
      )}

      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        lang={lang}
        onChangeLang={setLang}
        sensitivity={sensitivity}
        onChangeSensitivity={handleChangeSensitivity}
        muted={muted}
        onToggleMuted={handleToggleMuted}
        loadout={loadout}
        onUpdateLoadout={handleUpdateLoadout}
        hudLayout={hudLayout}
        onChangeHudLayout={handleChangeHudLayout}
      />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <WarzoneApp />
    </ErrorBoundary>
  );
}
