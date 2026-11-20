import { useState } from 'react';
import { Settings, Volume2, VolumeX, X, Globe, Sliders, Shield, Move } from 'lucide-react';
import {
  GAMEPLAY_HUD_CONTROL_IDS,
  TOP_HUD_CONTROL_IDS,
  clampTransform,
  type HudLayoutConfig,
} from '../game/hudLayout';
import { HELMETS, OUTFITS, type PlayerLoadout } from '../game/types';
import { TRANSLATIONS, type AppLang } from '../i18n/translations';
import { HudLayoutEditor } from './HudLayoutEditor';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  lang: AppLang;
  onChangeLang: (lang: AppLang) => void;
  sensitivity: number;
  onChangeSensitivity: (val: number) => void;
  muted: boolean;
  onToggleMuted: () => void;
  loadout: PlayerLoadout;
  onUpdateLoadout: (next: PlayerLoadout) => void;
  hudLayout: HudLayoutConfig;
  onChangeHudLayout: (next: HudLayoutConfig) => void;
}

const LANG_OPTIONS: { id: AppLang; label: string }[] = [
  { id: 'ar', label: 'العربية' },
  { id: 'fr', label: 'Français' },
  { id: 'en', label: 'English' },
];

export function SettingsModal({
  open,
  onClose,
  lang,
  onChangeLang,
  sensitivity,
  onChangeSensitivity,
  muted,
  onToggleMuted,
  loadout,
  onUpdateLoadout,
  hudLayout,
  onChangeHudLayout,
}: SettingsModalProps) {
  const [showHudEditor, setShowHudEditor] = useState(false);

  if (!open) return null;

  const t = TRANSLATIONS[lang];

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          className="w-full max-w-lg bg-[#11151c] border border-white/15 rounded-xl overflow-hidden flex flex-col max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-white/10 bg-[#161b24] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Settings className="w-5 h-5 text-amber-400" />
              <h2 className="text-base font-bold text-white">{t.settings}</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white transition-colors"
              aria-label={t.close}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-5 overflow-y-auto">
            {/* Language Switcher */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-200">
                <Globe className="w-4 h-4 text-amber-400" />
                <span>{t.language}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {LANG_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => onChangeLang(opt.id)}
                    className={`py-2.5 px-3 rounded-lg border text-xs font-bold transition-colors ${
                      lang === opt.id
                        ? 'bg-amber-500 text-black border-amber-300'
                        : 'bg-white/5 border-white/10 text-gray-300 hover:border-white/25'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Camera Sensitivity */}
            <div className="space-y-2 bg-[#0b0d10] border border-white/10 rounded-lg p-3.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-bold text-gray-200">
                  <Sliders className="w-4 h-4 text-sky-400" />
                  {t.sensitivity}
                </span>
                <span className="font-mono-num font-bold text-amber-400">
                  {sensitivity.toFixed(1)}x
                </span>
              </div>
              <input
                type="range"
                min={0.4}
                max={2.2}
                step={0.1}
                value={sensitivity}
                onChange={(e) => onChangeSensitivity(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            {/* Sound Toggle */}
            <div className="flex items-center justify-between bg-[#0b0d10] border border-white/10 rounded-lg p-3.5">
              <span className="flex items-center gap-2 text-xs font-bold text-gray-200">
                {muted ? (
                  <VolumeX className="w-4 h-4 text-red-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                )}
                {t.soundEffects}
              </span>
              <button
                onClick={onToggleMuted}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  muted
                    ? 'bg-red-500/20 border border-red-500/40 text-red-300'
                    : 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                }`}
              >
                {muted ? t.muted : t.enabled}
              </button>
            </div>

            {/* Top HUD Size & Gameplay Buttons Size Sliders */}
            <div className="space-y-3 bg-[#0b0d10] border border-white/10 rounded-lg p-3.5">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-gray-200">{t.topHudSizeLabel}</span>
                  <span className="font-mono-num font-bold text-amber-400">
                    {(hudLayout.topStatus?.scale ?? 0.62).toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  min={0.4}
                  max={1.35}
                  step={0.05}
                  value={hudLayout.topStatus?.scale ?? 0.62}
                  onChange={(e) => {
                    const nextScale = Number(e.target.value);
                    const nextLayout = { ...hudLayout };
                    for (const id of TOP_HUD_CONTROL_IDS) {
                      nextLayout[id] = clampTransform({ ...nextLayout[id], scale: nextScale });
                    }
                    onChangeHudLayout(nextLayout);
                  }}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              <div className="space-y-1.5 pt-2 border-t border-white/10">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-gray-200">{t.buttonsSizeLabel}</span>
                  <span className="font-mono-num font-bold text-sky-400">
                    {(hudLayout.fire?.scale ?? 1).toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  min={0.65}
                  max={1.45}
                  step={0.05}
                  value={hudLayout.fire?.scale ?? 1}
                  onChange={(e) => {
                    const nextScale = Number(e.target.value);
                    const nextLayout = { ...hudLayout };
                    for (const id of GAMEPLAY_HUD_CONTROL_IDS) {
                      nextLayout[id] = clampTransform({ ...nextLayout[id], scale: nextScale });
                    }
                    onChangeHudLayout(nextLayout);
                  }}
                  className="w-full accent-sky-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Customize HUD Buttons Layout */}
            <button
              onClick={() => setShowHudEditor(true)}
              className="w-full flex items-center justify-between bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 rounded-lg p-3.5 text-xs font-bold text-amber-200 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Move className="w-4 h-4 text-amber-400" />
                <span>{t.customizeHudBtn}</span>
              </span>
              <span className="text-[11px] bg-amber-500 text-black px-2.5 py-0.5 rounded font-extrabold">
                HUD
              </span>
            </button>

            {/* Soldier Callsign, Outfit & Helmet (Works both in Lobby & Mid-Match) */}
            <div className="space-y-3 pt-1 border-t border-white/10">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                <Shield className="w-4 h-4" />
                <span>
                  {t.outfitTitle} & {t.helmetTitle}
                </span>
              </div>

              <div>
                <label className="block text-[11px] text-gray-400 mb-1">{t.callsignLabel}</label>
                <input
                  type="text"
                  maxLength={24}
                  value={loadout.callsign}
                  onChange={(e) => onUpdateLoadout({ ...loadout, callsign: e.target.value })}
                  placeholder={t.callsignPlaceholder}
                  className="w-full bg-[#0b0d10] border border-white/15 focus:border-amber-500 rounded-lg px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <div>
                <div className="text-[11px] text-gray-400 mb-1.5">{t.outfitTitle}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {OUTFITS.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => onUpdateLoadout({ ...loadout, outfitId: o.id, customGlbId: null })}
                      className={`p-2 rounded-lg border text-xs font-semibold transition-colors ${
                        !loadout.customGlbId && loadout.outfitId === o.id
                          ? 'bg-amber-500/20 border-amber-500 text-white'
                          : 'bg-white/[0.03] border-white/10 text-gray-300 hover:border-white/25'
                      }`}
                    >
                      {o.nameAr}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[11px] text-gray-400 mb-1.5">{t.helmetTitle}</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {HELMETS.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => onUpdateLoadout({ ...loadout, helmetId: h.id, customGlbId: null })}
                      className={`p-2 rounded-lg border text-xs font-semibold transition-colors ${
                        !loadout.customGlbId && loadout.helmetId === h.id
                          ? 'bg-amber-500/20 border-amber-500 text-amber-200'
                          : 'bg-white/[0.03] border-white/10 text-gray-300 hover:border-white/25'
                      }`}
                    >
                      {h.nameAr}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3.5 border-t border-white/10 bg-[#161b24] flex justify-end">
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-colors"
            >
              {t.close}
            </button>
          </div>
        </div>
      </div>

      {showHudEditor && (
        <HudLayoutEditor
          open={showHudEditor}
          layout={hudLayout}
          lang={lang}
          onSave={(next) => {
            onChangeHudLayout(next);
            setShowHudEditor(false);
          }}
          onCancel={() => setShowHudEditor(false)}
        />
      )}
    </>
  );
}
