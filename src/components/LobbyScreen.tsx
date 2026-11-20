import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Copy,
  Check,
  Crosshair,
  LogIn,
  LogOut,
  Play,
  Shield,
  Smile,
  UserPlus,
  Users,
  Wifi,
  WifiOff,
  Send,
  Swords,
  Settings,
  Share2,
  Upload,
  Trash2,
  RotateCcw,
  MessageSquare,
} from 'lucide-react';
import { LobbySceneController } from '../engine/LobbyScene';
import { soundEngine } from '../engine/audioEngine';
import {
  CHARACTER_PRESETS,
  EMOTES,
  getMapSpec,
  HELMETS,
  MAPS,
  MATCH_DURATIONS,
  OUTFITS,
  WEAPONS,
  type ChatMessage,
  type MapId,
  type PlayerLoadout,
  type RoomStateInfo,
  type TeamId,
  type TeamMode,
} from '../game/types';
import { TRANSLATIONS, type AppLang } from '../i18n/translations';
import {
  BUILTIN_GLB_CHARACTERS,
  deleteCustomCharacter,
  importGlbFile,
  listCustomCharacters,
  type CustomCharacterMeta,
} from '../services/customCharacterStore';
import { getPublicAppOrigin } from '../services/multiplayerClient';
import type { FriendRecord, RoomInviteRecord } from '../services/profileService';

interface LobbyScreenProps {
  lang: AppLang;
  onOpenSettings: () => void;
  loadout: PlayerLoadout;
  onUpdateLoadout: (next: PlayerLoadout) => void;
  mapId: MapId;
  onChangeMap: (id: MapId) => void;
  durationSec: number;
  onChangeDuration: (sec: number) => void;
  botCount: number;
  onChangeBotCount: (count: number) => void;
  teamMode: TeamMode;
  onChangeTeamMode: (mode: TeamMode) => void;
  onStartOfflineMatch: () => void;
  // Google Auth & Friends
  user: User | null;
  authLoading: boolean;
  authError?: string | null;
  onClearAuthError?: () => void;
  onGoogleLogin: () => void;
  onGoogleLogout: () => void;
  friends: FriendRecord[];
  onAddFriendByEmail: (email: string) => Promise<{ ok: boolean; message?: string }>;
  onSendInviteToFriend: (friendUid: string) => Promise<void>;
  incomingInvites: RoomInviteRecord[];
  onAcceptInvite: (invite: RoomInviteRecord) => void;
  onDeclineInvite: (inviteId: string) => void;
  // Real WebSocket Online Room
  wsConnected: boolean;
  onlineRoom: RoomStateInfo | null;
  localPlayerId: string;
  roomError: string | null;
  chatMessages: ChatMessage[];
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onLeaveRoom: () => void;
  onSwitchTeam: (team: TeamId) => void;
  onSendChat: (text: string) => void;
  onStartOnlineMatch: () => void;
  onSyncOnlineSettings: (
    mapId: MapId,
    durationSec: number,
    botCount: number,
    teamMode?: TeamMode,
  ) => void;
}

export function LobbyScreen({
  lang,
  onOpenSettings,
  loadout,
  onUpdateLoadout,
  mapId,
  onChangeMap,
  durationSec,
  onChangeDuration,
  botCount,
  onChangeBotCount,
  teamMode,
  onChangeTeamMode,
  onStartOfflineMatch,
  user,
  authLoading,
  authError,
  onClearAuthError,
  onGoogleLogin,
  onGoogleLogout,
  friends,
  onAddFriendByEmail,
  onSendInviteToFriend,
  incomingInvites,
  onAcceptInvite,
  onDeclineInvite,
  wsConnected,
  onlineRoom,
  localPlayerId,
  roomError,
  chatMessages,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onSwitchTeam,
  onSendChat,
  onStartOnlineMatch,
  onSyncOnlineSettings,
}: LobbyScreenProps) {
  const t = TRANSLATIONS[lang];
  const showcaseRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<LobbySceneController | null>(null);

  const [leftTab, setLeftTab] = useState<'character' | 'weapons' | 'emotes'>('character');
  const [playMode, setPlayMode] = useState<'offline' | 'online'>(onlineRoom ? 'online' : 'offline');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [friendEmailInput, setFriendEmailInput] = useState('');
  const [friendStatus, setFriendStatus] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [invitedFriendUid, setInvitedFriendUid] = useState<string | null>(null);
  const [roomChatInput, setRoomChatInput] = useState('');
  const [customChars, setCustomChars] = useState<CustomCharacterMeta[]>([]);
  const [importingGlb, setImportingGlb] = useState(false);
  const [glbError, setGlbError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lobbyChatRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listCustomCharacters().then(setCustomChars);
  }, []);

  useEffect(() => {
    if (onlineRoom) {
      setPlayMode('online');
    }
  }, [onlineRoom]);

  useEffect(() => {
    if (lobbyChatRef.current) {
      lobbyChatRef.current.scrollTop = lobbyChatRef.current.scrollHeight;
    }
  }, [chatMessages.length]);

  // Initialize 3D Character Showcase once
  useEffect(() => {
    const el = showcaseRef.current;
    if (!el) return;
    const ctrl = new LobbySceneController(
      el,
      loadout.outfitId,
      loadout.helmetId,
      loadout.primaryWeapon,
      loadout.customGlbId,
      loadout.customGlbFlip,
    );
    controllerRef.current = ctrl;
    return () => {
      ctrl.dispose();
      controllerRef.current = null;
    };
  }, []);

  // Sync Loadout & Custom GLB changes to 3D Soldier in real time
  useEffect(() => {
    controllerRef.current?.updateLoadout(
      loadout.outfitId,
      loadout.helmetId,
      loadout.primaryWeapon,
    );
    controllerRef.current?.updateCustomGlb(
      loadout.customGlbId ?? null,
      Boolean(loadout.customGlbFlip),
    );
  }, [
    loadout.outfitId,
    loadout.helmetId,
    loadout.primaryWeapon,
    loadout.customGlbId,
    loadout.customGlbFlip,
  ]);

  const handleImportGlb = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setGlbError(null);
    setImportingGlb(true);
    try {
      const meta = await importGlbFile(file);
      const updated = await listCustomCharacters();
      setCustomChars(updated);
      onUpdateLoadout({
        ...loadout,
        customGlbId: meta.id,
        customGlbFlip: false,
      });
      soundEngine.playPickup();
    } catch {
      setGlbError(t.glbInvalidError);
    } finally {
      setImportingGlb(false);
    }
  };

  const handleDeleteGlb = async (id: string) => {
    await deleteCustomCharacter(id);
    const updated = await listCustomCharacters();
    setCustomChars(updated);
    if (loadout.customGlbId === id) {
      onUpdateLoadout({ ...loadout, customGlbId: null });
    }
  };

  const activeMap = getMapSpec(onlineRoom ? onlineRoom.mapId : mapId);
  const isHost = !onlineRoom || onlineRoom.hostId === localPlayerId;

  const getRoomUrl = () => {
    const base = getPublicAppOrigin();
    return onlineRoom ? `${base}/?room=${onlineRoom.code}` : base;
  };

  const handleCopyInviteLink = () => {
    if (!onlineRoom) return;
    navigator.clipboard?.writeText(getRoomUrl()).catch(() => {});
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2200);
  };

  const handleShareAndroid = async () => {
    if (!onlineRoom) return;
    const url = getRoomUrl();
    if (navigator.share) {
      try {
        await navigator.share({
          title: t.gameTitle,
          text: `${t.roomCodeLabel}: ${onlineRoom.code}`,
          url,
        });
        return;
      } catch {
        // user cancelled share sheet or unsupported; fallback to copy
      }
    }
    handleCopyInviteLink();
  };

  const handleAddFriend = async () => {
    setFriendStatus(null);
    try {
      const res = await onAddFriendByEmail(friendEmailInput);
      if (res.ok) {
        setFriendEmailInput('');
        setFriendStatus(t.sentBtn);
      } else {
        setFriendStatus(res.message || 'تعذر إضافة الصديق');
      }
    } catch {
      setFriendStatus('تعذر الاتصال بخادم الأصدقاء، تأكد من الاتصال وتسجيل الدخول.');
    }
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#0b0d10]">
      {/* Dedicated Isolated 3D Soldier Showcase Canvas */}
      <div
        ref={showcaseRef}
        className="absolute inset-0 z-0 cursor-grab active:cursor-grabbing"
      />

      {/* Top Navigation Bar */}
      <header className="relative z-10 h-16 px-4 sm:px-6 border-b border-white/10 bg-[#0b0d10]/85 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 shrink-0">
          <Swords className="w-6 h-6 text-amber-400" />
          <h1 className="text-base sm:text-xl font-bold tracking-tight text-white whitespace-nowrap">
            {t.gameTitle}
          </h1>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <div className="hidden md:flex items-center gap-2 text-xs text-gray-400">
            <span>{wsConnected ? t.serverReady : t.connectingServer}</span>
          </div>

          <button
            onClick={onOpenSettings}
            className="px-3 py-2 rounded-lg bg-white/8 hover:bg-white/15 border border-white/15 text-xs font-bold text-gray-100 flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Settings className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">{t.settings}</span>
          </button>

          {user ? (
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
              {user.photoURL && (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'User'}
                  referrerPolicy="no-referrer"
                  className="w-6 h-6 rounded-full object-cover"
                />
              )}
              <span className="text-xs font-semibold text-gray-100 max-w-[120px] truncate">
                {user.displayName || user.email}
              </span>
              <button
                onClick={onGoogleLogout}
                className="text-gray-400 hover:text-red-400 transition-colors"
                title={t.logout}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onGoogleLogin}
              disabled={authLoading}
              className="px-3 py-2 rounded-lg bg-white text-gray-900 hover:bg-gray-200 text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <LogIn className="w-4 h-4" />
              <span>{authLoading ? t.loggingIn : t.googleLogin}</span>
            </button>
          )}
        </div>
      </header>

      {/* Firebase Auth Diagnostic Banner (e.g. Android WebView / Unauthorized Domain) */}
      {authError && (
        <div className="relative z-40 mx-auto mt-2 w-[94vw] max-w-2xl bg-red-950/95 border border-red-500/60 text-red-100 rounded-xl px-4 py-2.5 text-xs flex items-center justify-between gap-3 shadow-xl">
          <span className="leading-relaxed">{authError}</span>
          {onClearAuthError && (
            <button
              onClick={onClearAuthError}
              className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white shrink-0 font-bold"
            >
              {t.close}
            </button>
          )}
        </div>
      )}

      {/* Incoming Friend Invites Banner */}
      {incomingInvites.length > 0 && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 w-[92vw] max-w-md space-y-2">
          {incomingInvites.map((inv) => (
            <div
              key={inv.id}
              className="bg-[#141922] border border-amber-500/50 rounded-xl p-3.5 flex items-center justify-between gap-3"
            >
              <div>
                <div className="text-sm font-bold text-white">
                  {inv.fromCallsign}
                </div>
                <div className="text-xs text-gray-400">
                  {getMapSpec(inv.mapId).nameAr} · {inv.roomCode}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => onAcceptInvite(inv)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold"
                >
                  {t.joinBtn}
                </button>
                <button
                  onClick={() => onDeclineInvite(inv.id)}
                  className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-gray-300 text-xs"
                >
                  {t.close}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Main Responsive Lobby Grid (Unobstructed Center 3D Soldier!) */}
      <div className="relative z-10 h-[calc(100vh-4rem)] flex flex-col lg:flex-row justify-between p-3 sm:p-5 gap-4 pointer-events-none">
        {/* START PANEL: Soldier Name, Outfits, Weapons, Dances */}
        <aside className="w-full lg:w-[340px] bg-[#10141b]/92 border border-white/10 rounded-xl p-4 flex flex-col gap-3 pointer-events-auto max-h-[44vh] lg:max-h-full overflow-y-auto">
          {/* Editable Callsign */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">{t.callsignLabel}</label>
            <input
              type="text"
              maxLength={24}
              value={loadout.callsign}
              onChange={(e) =>
                onUpdateLoadout({ ...loadout, callsign: e.target.value })
              }
              placeholder={t.callsignPlaceholder}
              className="w-full bg-[#0b0d10] border border-white/15 focus:border-amber-500 rounded-lg px-3 py-2 text-sm text-white outline-none"
            />
          </div>

          {/* Customization Tabs */}
          <div className="grid grid-cols-3 gap-1 p-1 bg-[#0b0d10] rounded-lg border border-white/10">
            <button
              onClick={() => setLeftTab('character')}
              className={`py-1.5 rounded-md text-xs font-bold flex items-center justify-center gap-1 transition-colors ${
                leftTab === 'character'
                  ? 'bg-amber-500 text-black'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>{t.tabClothing}</span>
            </button>
            <button
              onClick={() => setLeftTab('weapons')}
              className={`py-1.5 rounded-md text-xs font-bold flex items-center justify-center gap-1 transition-colors ${
                leftTab === 'weapons'
                  ? 'bg-amber-500 text-black'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>{t.tabWeapons}</span>
            </button>
            <button
              onClick={() => setLeftTab('emotes')}
              className={`py-1.5 rounded-md text-xs font-bold flex items-center justify-center gap-1 transition-colors ${
                leftTab === 'emotes'
                  ? 'bg-amber-500 text-black'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              <Smile className="w-3.5 h-3.5" />
              <span>{t.tabEmotes}</span>
            </button>
          </div>

          {leftTab === 'character' && (
            <div className="space-y-4">
              {/* Import Real .GLB Character from Phone or PC */}
              <div className="bg-[#0b0d10] border border-amber-500/35 rounded-lg p-3 space-y-2.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".glb,.gltf,model/gltf-binary,model/gltf+json,application/octet-stream"
                  onChange={handleImportGlb}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importingGlb}
                  className="w-full py-2.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  <Upload className="w-4 h-4 shrink-0" />
                  <span>{importingGlb ? t.importingGlb : t.importGlbBtn}</span>
                </button>
                <div className="text-[11px] text-gray-400">{t.glbHint}</div>
                {glbError && (
                  <div className="text-[11px] text-red-400 font-semibold">{glbError}</div>
                )}

                {customChars.length > 0 && (
                  <div className="space-y-1.5 pt-1 border-t border-white/10">
                    {customChars.map((ch) => {
                      const active = loadout.customGlbId === ch.id;
                      return (
                        <div
                          key={ch.id}
                          className={`flex items-center justify-between gap-2 p-2 rounded-lg border transition-colors ${
                            active
                              ? 'bg-emerald-500/15 border-emerald-400 text-white'
                              : 'bg-white/[0.03] border-white/10 text-gray-300'
                          }`}
                        >
                          <button
                            onClick={() => {
                              soundEngine.playUiClick();
                              onUpdateLoadout({ ...loadout, customGlbId: ch.id });
                            }}
                            className="flex-1 text-start truncate"
                          >
                            <div className="text-xs font-bold truncate">{ch.name}</div>
                            <div className="text-[10px] text-gray-400 font-mono-num">
                              {(ch.sizeBytes / (1024 * 1024)).toFixed(1)} MB · {ch.boneCount} bones · {ch.animCount} anims
                            </div>
                          </button>
                          <button
                            onClick={() => handleDeleteGlb(ch.id)}
                            className="p-1.5 rounded bg-red-500/15 hover:bg-red-500/30 text-red-300"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {loadout.customGlbId && (
                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/10">
                    <button
                      onClick={() =>
                        onUpdateLoadout({
                          ...loadout,
                          customGlbFlip: !loadout.customGlbFlip,
                        })
                      }
                      className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold flex items-center gap-1 ${
                        loadout.customGlbFlip
                          ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                          : 'bg-white/5 border-white/10 text-gray-300'
                      }`}
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>{t.flipModelBtn}</span>
                    </button>

                    <button
                      onClick={() =>
                        onUpdateLoadout({
                          ...loadout,
                          applyGlbToBots: !loadout.applyGlbToBots,
                        })
                      }
                      className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold ${
                        loadout.applyGlbToBots
                          ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                          : 'bg-white/5 border-white/10 text-gray-300'
                      }`}
                    >
                      {t.applyToBotsLabel}
                    </button>
                  </div>
                )}
              </div>

              {/* Built-in Real Military Operators (including built-in .GLB models) */}
              <div>
                <div className="text-xs font-semibold text-gray-300 mb-2">
                  {t.charactersTitle}
                </div>
                <div className="space-y-1.5 mb-2">
                  {BUILTIN_GLB_CHARACTERS.map((bg) => {
                    const selected = loadout.customGlbId === bg.id;
                    const bgName = lang === 'fr' ? bg.nameFr : lang === 'en' ? bg.nameEn : bg.nameAr;
                    const bgRole = lang === 'fr' ? bg.roleFr : lang === 'en' ? bg.roleEn : bg.roleAr;
                    return (
                      <button
                        key={bg.id}
                        onClick={() => {
                          soundEngine.playUiClick();
                          onUpdateLoadout({
                            ...loadout,
                            customGlbId: bg.id,
                            customGlbFlip: bg.defaultFlip,
                          });
                        }}
                        className={`w-full text-start p-2.5 rounded-lg border transition-colors ${
                          selected
                            ? 'bg-emerald-500/20 border-emerald-400 text-white'
                            : 'bg-white/[0.04] border-emerald-500/30 text-gray-200 hover:border-emerald-400/60'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold truncate">{bgName}</span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/25 text-emerald-300 shrink-0">
                            GLB 3D
                          </span>
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{bgRole}</div>
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {CHARACTER_PRESETS.map((cp) => {
                    const selected =
                      !loadout.customGlbId &&
                      loadout.outfitId === cp.outfitId &&
                      loadout.helmetId === cp.helmetId;
                    const cpName = lang === 'fr' ? cp.nameFr : lang === 'en' ? cp.nameEn : cp.nameAr;
                    const cpRole = lang === 'fr' ? cp.roleFr : lang === 'en' ? cp.roleEn : cp.roleAr;
                    return (
                      <button
                        key={cp.id}
                        onClick={() => {
                          soundEngine.playUiClick();
                          onUpdateLoadout({
                            ...loadout,
                            outfitId: cp.outfitId,
                            helmetId: cp.helmetId,
                            customGlbId: null,
                          });
                        }}
                        className={`text-start p-2.5 rounded-lg border transition-colors ${
                          selected
                            ? 'bg-amber-500/20 border-amber-500 text-white'
                            : 'bg-white/[0.03] border-white/10 text-gray-300 hover:border-white/25'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: cp.accentHex }}
                          />
                          <span className="text-xs font-bold truncate">{cpName}</span>
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5 line-clamp-1">{cpRole}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-300 mb-2">
                  {t.outfitTitle}
                </div>
                <div className="space-y-1.5">
                  {OUTFITS.map((outfit) => {
                    const selected = !loadout.customGlbId && loadout.outfitId === outfit.id;
                    return (
                      <button
                        key={outfit.id}
                        onClick={() => {
                          soundEngine.playUiClick();
                          onUpdateLoadout({ ...loadout, outfitId: outfit.id, customGlbId: null });
                        }}
                        className={`w-full text-start p-2.5 rounded-lg border transition-colors ${
                          selected
                            ? 'bg-amber-500/15 border-amber-500 text-white'
                            : 'bg-white/[0.03] border-white/10 text-gray-300 hover:border-white/25'
                        }`}
                      >
                        <div className="text-xs font-bold">{outfit.nameAr}</div>
                        <div className="text-[11px] text-gray-400">{outfit.descAr}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-300 mb-2">
                  {t.helmetTitle}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {HELMETS.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => {
                        soundEngine.playUiClick();
                        onUpdateLoadout({ ...loadout, helmetId: h.id, customGlbId: null });
                      }}
                      className={`p-2 rounded-lg border text-xs font-semibold transition-colors ${
                        !loadout.customGlbId && loadout.helmetId === h.id
                          ? 'bg-amber-500/15 border-amber-500 text-amber-200'
                          : 'bg-white/[0.03] border-white/10 text-gray-300 hover:border-white/25'
                      }`}
                    >
                      {h.nameAr}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {leftTab === 'weapons' && (
            <div className="space-y-4">
              <div>
                <div className="text-xs font-semibold text-amber-400 mb-1.5">
                  {t.primaryWeapon}
                </div>
                <div className="space-y-1.5">
                  {WEAPONS.map((w) => (
                    <button
                      key={`p_${w.id}`}
                      onClick={() => {
                        soundEngine.playUiClick();
                        onUpdateLoadout({ ...loadout, primaryWeapon: w.id });
                      }}
                      className={`w-full text-start p-2.5 rounded-lg border flex items-center justify-between transition-colors ${
                        loadout.primaryWeapon === w.id
                          ? 'bg-amber-500/15 border-amber-500 text-white'
                          : 'bg-white/[0.03] border-white/10 text-gray-300 hover:border-white/25'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-bold">{w.nameAr}</div>
                        <div className="text-[11px] text-gray-400">
                          {w.categoryAr} · DMG {w.damage} · MAG {w.magSize}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-sky-400 mb-1.5">
                  {t.secondaryWeapon}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {WEAPONS.map((w) => (
                    <button
                      key={`s_${w.id}`}
                      onClick={() => {
                        soundEngine.playUiClick();
                        onUpdateLoadout({ ...loadout, secondaryWeapon: w.id });
                      }}
                      className={`p-2 rounded-lg border text-xs font-semibold transition-colors ${
                        loadout.secondaryWeapon === w.id
                          ? 'bg-sky-500/15 border-sky-400 text-sky-200'
                          : 'bg-white/[0.03] border-white/10 text-gray-300 hover:border-white/25'
                      }`}
                    >
                      {w.nameAr}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {leftTab === 'emotes' && (
            <div className="space-y-2">
              <div className="text-xs text-gray-400">{t.emotesHint}</div>
              <div className="grid grid-cols-2 gap-2">
                {EMOTES.map((em) => (
                  <button
                    key={em.id}
                    onClick={() => {
                      soundEngine.playUiClick();
                      controllerRef.current?.triggerEmote(em.id, em.durationMs);
                    }}
                    className="p-3 rounded-lg bg-white/[0.04] hover:bg-amber-500/20 border border-white/10 hover:border-amber-400/50 text-xs font-bold text-gray-100 transition-colors"
                  >
                    {em.nameAr}
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* CENTER FOOTER HINT (Leaves 3D Soldier 100% Unobstructed!) */}
        <div className="hidden lg:flex flex-col items-center justify-end pb-4 pointer-events-none">
          <div className="bg-[#10141b]/80 border border-white/10 px-4 py-2 rounded-xl text-xs text-gray-300 text-center">
            {t.dragHint}{' '}
            <strong className="text-amber-400">{activeMap.nameAr}</strong>
          </div>
        </div>

        {/* END PANEL: Maps, Time, Offline 4-48 Bots & Online Multiplayer Friends */}
        <aside className="w-full lg:w-[370px] bg-[#10141b]/92 border border-white/10 rounded-xl p-4 flex flex-col gap-3 pointer-events-auto max-h-[45vh] lg:max-h-full overflow-y-auto">
          {/* Mode Switch: Offline vs Online */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-[#0b0d10] rounded-lg border border-white/10">
            <button
              onClick={() => {
                if (onlineRoom) onLeaveRoom();
                setPlayMode('offline');
              }}
              className={`py-2 rounded-md text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                playMode === 'offline'
                  ? 'bg-amber-500 text-black'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              <WifiOff className="w-3.5 h-3.5" />
              <span>{t.offlineMode}</span>
            </button>
            <button
              onClick={() => setPlayMode('online')}
              className={`py-2 rounded-md text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                playMode === 'online'
                  ? 'bg-emerald-500 text-black'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              <Wifi className="w-3.5 h-3.5" />
              <span>{t.onlineMode}</span>
            </button>
          </div>

          {/* 5 Realistic Maps Selector */}
          <div>
            <div className="text-xs font-semibold text-gray-300 mb-1.5">
              {t.chooseMap}
            </div>
            <div className="space-y-1.5">
              {MAPS.map((m) => {
                const currentMap = onlineRoom ? onlineRoom.mapId : mapId;
                const active = currentMap === m.id;
                return (
                  <button
                    key={m.id}
                    disabled={Boolean(onlineRoom && !isHost)}
                    onClick={() => {
                      soundEngine.playUiClick();
                      if (onlineRoom) {
                        onSyncOnlineSettings(
                          m.id,
                          onlineRoom.durationSec,
                          onlineRoom.botCount,
                          onlineRoom.teamMode,
                        );
                      } else {
                        onChangeMap(m.id);
                      }
                    }}
                    className={`w-full text-start p-2.5 rounded-lg border transition-colors ${
                      active
                        ? 'bg-amber-500/15 border-amber-500 text-white'
                        : 'bg-white/[0.03] border-white/10 text-gray-300 hover:border-white/25'
                    } disabled:opacity-60`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">{m.nameAr}</span>
                      <span className="text-[10px] text-gray-400">{m.featuresAr.slice(0, 2).join(' · ')}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">{m.descAr}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Match Time Selector (including Open Time) */}
          <div>
            <div className="text-xs font-semibold text-gray-300 mb-1.5">{t.matchDuration}</div>
            <div className="grid grid-cols-3 gap-1.5">
              {MATCH_DURATIONS.map((d) => {
                const currentDur = onlineRoom ? onlineRoom.durationSec : durationSec;
                const active = currentDur === d.seconds;
                return (
                  <button
                    key={d.seconds}
                    disabled={Boolean(onlineRoom && !isHost)}
                    onClick={() => {
                      soundEngine.playUiClick();
                      if (onlineRoom) {
                        onSyncOnlineSettings(
                          onlineRoom.mapId,
                          d.seconds,
                          onlineRoom.botCount,
                          onlineRoom.teamMode,
                        );
                      } else {
                        onChangeDuration(d.seconds);
                      }
                    }}
                    className={`py-1.5 px-2 rounded-lg border text-xs font-bold transition-colors ${
                      active
                        ? 'bg-amber-500 text-black border-amber-300'
                        : 'bg-white/[0.03] border-white/10 text-gray-300 hover:border-white/25'
                    } disabled:opacity-60`}
                  >
                    {d.seconds === 0 ? t.openTime : d.labelAr}
                  </button>
                );
              })}
            </div>
          </div>

          {playMode === 'offline' ? (
            <>
              {/* Offline Bot Count (4 to 48) */}
              <div className="bg-[#0b0d10] border border-white/10 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-300 font-semibold">{t.botCountLabel}</span>
                  <span className="font-mono-num font-bold text-amber-400">
                    {botCount} {t.fightersUnit}
                  </span>
                </div>
                <input
                  type="range"
                  min={4}
                  max={48}
                  step={1}
                  value={botCount}
                  onChange={(e) => onChangeBotCount(Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-gray-400 font-mono-num">
                  {[4, 12, 24, 32, 48].map((preset) => (
                    <button
                      key={preset}
                      onClick={() => onChangeBotCount(preset)}
                      className={`px-2 py-0.5 rounded ${
                        botCount === preset ? 'bg-amber-500/25 text-amber-300' : 'hover:text-white'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={onStartOfflineMatch}
                className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-base flex items-center justify-center gap-2 transition-colors mt-auto"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>{t.startBattleNow}</span>
              </button>
            </>
          ) : (
            /* ONLINE MULTIPLAYER ROOM & GOOGLE FRIENDS */
            <div className="space-y-3 flex-1 flex flex-col">
              {roomError && (
                <div className="p-2.5 rounded-lg bg-red-500/15 border border-red-500/40 text-xs text-red-300">
                  {roomError}
                </div>
              )}

              {!onlineRoom ? (
                <div className="space-y-2.5">
                  {/* Team Mode Toggle before Creating Room */}
                  <div className="grid grid-cols-2 gap-1 p-1 bg-[#0b0d10] rounded-lg border border-white/10">
                    <button
                      onClick={() => onChangeTeamMode('free')}
                      className={`py-1.5 rounded text-[11px] font-bold transition-colors ${
                        teamMode === 'free'
                          ? 'bg-amber-500 text-black'
                          : 'text-gray-300 hover:text-white'
                      }`}
                    >
                      {t.freeForAllMode}
                    </button>
                    <button
                      onClick={() => onChangeTeamMode('teams')}
                      className={`py-1.5 rounded text-[11px] font-bold transition-colors ${
                        teamMode === 'teams'
                          ? 'bg-emerald-500 text-black'
                          : 'text-gray-300 hover:text-white'
                      }`}
                    >
                      {t.teamsMode}
                    </button>
                  </div>

                  <button
                    onClick={onCreateRoom}
                    disabled={!wsConnected}
                    className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-bold text-sm transition-colors"
                  >
                    {t.createOnlineRoom}
                  </button>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      enterKeyHint="go"
                      value={joinCodeInput}
                      onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && wsConnected && joinCodeInput.trim()) {
                          e.preventDefault();
                          onJoinRoom(joinCodeInput);
                        }
                      }}
                      placeholder={t.enterRoomCode}
                      maxLength={8}
                      className="flex-1 bg-[#0b0d10] border border-white/15 rounded-lg px-3 py-2 text-xs text-white font-mono-num uppercase outline-none focus:border-emerald-500"
                    />
                    <button
                      onClick={() => joinCodeInput.trim() && onJoinRoom(joinCodeInput)}
                      disabled={!wsConnected || !joinCodeInput.trim()}
                      className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40 text-white text-xs font-bold whitespace-nowrap"
                    >
                      {t.joinBtn}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-[#0b0d10] border border-emerald-500/35 rounded-lg p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <div className="text-[11px] text-gray-400">{t.roomCodeLabel}</div>
                      <div className="text-lg font-mono-num font-bold text-emerald-400 tracking-wider">
                        {onlineRoom.code}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={handleCopyInviteLink}
                        className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-bold flex items-center gap-1"
                      >
                        {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedLink ? t.copied : t.copyLink}</span>
                      </button>
                      <button
                        onClick={handleShareAndroid}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-1"
                        title={t.shareAndroid}
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        <span>{t.shareAndroid}</span>
                      </button>
                      <button
                        onClick={onLeaveRoom}
                        className="px-2.5 py-1.5 rounded-lg bg-red-500/15 text-red-300 text-xs"
                      >
                        {t.leaveRoom}
                      </button>
                    </div>
                  </div>

                  {/* Team Mode Toggle inside Room */}
                  <div className="grid grid-cols-2 gap-1 p-1 bg-white/[0.04] rounded-lg border border-white/10">
                    <button
                      disabled={!isHost}
                      onClick={() =>
                        onSyncOnlineSettings(
                          onlineRoom.mapId,
                          onlineRoom.durationSec,
                          onlineRoom.botCount,
                          'free',
                        )
                      }
                      className={`py-1 rounded text-[11px] font-bold transition-colors disabled:opacity-75 ${
                        onlineRoom.teamMode !== 'teams'
                          ? 'bg-amber-500 text-black'
                          : 'text-gray-300 hover:text-white'
                      }`}
                    >
                      {t.freeForAllMode}
                    </button>
                    <button
                      disabled={!isHost}
                      onClick={() =>
                        onSyncOnlineSettings(
                          onlineRoom.mapId,
                          onlineRoom.durationSec,
                          onlineRoom.botCount,
                          'teams',
                        )
                      }
                      className={`py-1 rounded text-[11px] font-bold transition-colors disabled:opacity-75 ${
                        onlineRoom.teamMode === 'teams'
                          ? 'bg-emerald-500 text-black'
                          : 'text-gray-300 hover:text-white'
                      }`}
                    >
                      {t.teamsMode}
                    </button>
                  </div>

                  {/* Players inside Room + Team Switch */}
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    <div className="flex items-center justify-between text-[11px] text-gray-400">
                      <span>
                        {t.connectedPlayers} ({onlineRoom.players.length}):
                      </span>
                      {onlineRoom.teamMode === 'teams' && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => onSwitchTeam('green')}
                            className="px-1.5 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-300 text-[10px] font-bold"
                          >
                            {t.greenTeam}
                          </button>
                          <button
                            onClick={() => onSwitchTeam('red')}
                            className="px-1.5 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/35 text-rose-300 text-[10px] font-bold"
                          >
                            {t.redTeam}
                          </button>
                        </div>
                      )}
                    </div>
                    {onlineRoom.players.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between px-2 py-1 rounded bg-white/5 text-xs gap-2"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          {onlineRoom.teamMode === 'teams' && (
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                p.team === 'red' ? 'bg-rose-500' : 'bg-emerald-400'
                              }`}
                            />
                          )}
                          <span className="font-semibold text-white truncate">
                            {p.name} {p.id === localPlayerId ? `(${t.you})` : ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {onlineRoom.teamMode === 'teams' && (
                            <span
                              className={`text-[10px] font-bold ${
                                p.team === 'red' ? 'text-rose-300' : 'text-emerald-300'
                              }`}
                            >
                              {p.team === 'red' ? t.redTeam : t.greenTeam}
                            </span>
                          )}
                          <span className="text-[10px] text-amber-400">
                            {p.isHost ? t.leader : t.ready}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Optional AI Bots in Online Room */}
                  {isHost && (
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-white/10">
                      <span className="text-gray-400">{t.extraBots}</span>
                      <div className="flex items-center gap-1.5">
                        {[0, 6, 12, 20].map((b) => (
                          <button
                            key={b}
                            onClick={() =>
                              onSyncOnlineSettings(
                                onlineRoom.mapId,
                                onlineRoom.durationSec,
                                b,
                                onlineRoom.teamMode,
                              )
                            }
                            className={`px-2 py-0.5 rounded font-mono-num ${
                              onlineRoom.botCount === b
                                ? 'bg-amber-500 text-black font-bold'
                                : 'bg-white/5 text-gray-300'
                            }`}
                          >
                            {b}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Live Room Chat inside Lobby */}
                  <div className="pt-1.5 border-t border-white/10 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-300">
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>{t.chatBtn}</span>
                    </div>
                    <div ref={lobbyChatRef} className="max-h-24 overflow-y-auto space-y-1 bg-black/35 rounded p-1.5 border border-white/5">
                      {chatMessages.length === 0 ? (
                        <div className="text-[10px] text-gray-500 text-center py-1">
                          {t.chatPlaceholder}
                        </div>
                      ) : (
                        chatMessages.map((msg) => (
                          <div key={msg.id} className="text-[11px] leading-snug break-words">
                            <span
                              className={`font-bold ${
                                msg.team === 'red'
                                  ? 'text-rose-300'
                                  : msg.team === 'green'
                                    ? 'text-emerald-300'
                                    : 'text-amber-300'
                              }`}
                            >
                              {msg.senderName}:{' '}
                            </span>
                            <span className="text-gray-200">{msg.text}</span>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {[t.quickChat1, t.quickChat2, t.quickChat3].map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => onSendChat(q)}
                          className="px-1.5 py-0.5 rounded bg-white/8 hover:bg-emerald-500/20 border border-white/10 text-[10px] text-gray-200"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const clean = roomChatInput.trim();
                        if (!clean) return;
                        onSendChat(clean);
                        setRoomChatInput('');
                      }}
                      className="flex items-center gap-1.5"
                    >
                      <input
                        type="text"
                        maxLength={180}
                        value={roomChatInput}
                        onChange={(e) => setRoomChatInput(e.target.value)}
                        placeholder={t.chatPlaceholder}
                        className="flex-1 bg-[#141922] border border-white/15 rounded-lg px-2.5 py-1 text-xs text-white outline-none focus:border-emerald-500"
                      />
                      <button
                        type="submit"
                        className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold flex items-center gap-1"
                      >
                        <Send className="w-3 h-3" />
                        <span>{t.sendChatBtn}</span>
                      </button>
                    </form>
                  </div>

                  {isHost ? (
                    <button
                      onClick={onStartOnlineMatch}
                      className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm flex items-center justify-center gap-2"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>{t.startGroupMatch}</span>
                    </button>
                  ) : (
                    <div className="text-center text-xs text-amber-300 py-1.5">
                      {t.waitingHost}
                    </div>
                  )}
                </div>
              )}

              {/* Google Friends Invite System */}
              <div className="bg-[#0b0d10] border border-white/10 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-gray-200">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-amber-400" />
                    {t.inviteGoogleFriends}
                  </span>
                </div>

                {!user ? (
                  <button
                    onClick={onGoogleLogin}
                    className="w-full py-2 rounded-lg bg-white text-black hover:bg-gray-200 text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>{t.loginToInvite}</span>
                  </button>
                ) : (
                  <>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleAddFriend();
                      }}
                      className="flex items-center gap-1.5"
                    >
                      <input
                        type="email"
                        enterKeyHint="done"
                        value={friendEmailInput}
                        onChange={(e) => setFriendEmailInput(e.target.value)}
                        placeholder={t.friendEmailPlaceholder}
                        className="flex-1 bg-[#141922] border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-500"
                      />
                      <button
                        type="submit"
                        className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold flex items-center gap-1"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>{t.addBtn}</span>
                      </button>
                    </form>
                    {friendStatus && (
                      <div className="text-[11px] text-amber-300">{friendStatus}</div>
                    )}
                    <div className="space-y-1 max-h-24 overflow-y-auto">
                      {friends.length === 0 ? (
                        <div className="text-[11px] text-gray-500">{t.noFriendsHint}</div>
                      ) : (
                        friends.map((f) => (
                          <div
                            key={f.friendUid}
                            className="flex items-center justify-between px-2 py-1 rounded bg-white/5 text-xs"
                          >
                            <span className="text-gray-200 font-semibold">{f.callsign}</span>
                            <button
                              disabled={!onlineRoom}
                              onClick={async () => {
                                try {
                                  await onSendInviteToFriend(f.friendUid);
                                  setInvitedFriendUid(f.friendUid);
                                  setTimeout(() => setInvitedFriendUid(null), 2000);
                                } catch {
                                  setFriendStatus('تعذر إرسال الدعوة حالياً، تأكد من الاتصال بالإنترنت.');
                                }
                              }}
                              className="px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/35 disabled:opacity-40 text-emerald-300 text-[11px] font-bold flex items-center gap-1"
                            >
                              <Send className="w-3 h-3" />
                              <span>
                                {invitedFriendUid === f.friendUid
                                  ? t.sentBtn
                                  : onlineRoom
                                    ? t.inviteBtn
                                    : t.createRoomFirst}
                              </span>
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
