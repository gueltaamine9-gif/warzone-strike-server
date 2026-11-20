import React, { useRef, useState } from 'react';
import { RotateCcw, Check, X, Move } from 'lucide-react';
import {
  DEFAULT_HUD_LAYOUT,
  HUD_CONTROL_IDS,
  clampTransform,
  getHudControlLabel,
  type HudControlId,
  type HudLayoutConfig,
} from '../game/hudLayout';
import { TRANSLATIONS, type AppLang } from '../i18n/translations';
import {
  PubgBulletIcon,
  PubgCrouchIcon,
  PubgFistIcon,
  PubgGrenadeIcon,
  PubgJumpIcon,
  PubgPeekIcon,
  PubgProneIcon,
  PubgReloadIcon,
  PubgScopeIcon,
} from './PubgIcons';

interface HudLayoutEditorProps {
  open: boolean;
  layout: HudLayoutConfig;
  lang: AppLang;
  onSave: (next: HudLayoutConfig) => void;
  onCancel: () => void;
}

export function HudLayoutEditor({ open, layout, lang, onSave, onCancel }: HudLayoutEditorProps) {
  const [draft, setDraft] = useState<HudLayoutConfig>(() => ({ ...layout }));
  const [selectedId, setSelectedId] = useState<HudControlId>('fire');
  const dragRef = useRef<{
    id: HudControlId;
    pointerId: number;
    startX: number;
    startY: number;
    origXPct: number;
    origYPct: number;
  } | null>(null);

  if (!open) return null;

  const t = TRANSLATIONS[lang];

  const handleDown = (id: HudControlId, e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelectedId(id);
    dragRef.current = {
      id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origXPct: draft[id].xPct,
      origYPct: draft[id].yPct,
    };
  };

  const handleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return;
    e.stopPropagation();
    const { id, startX, startY, origXPct, origYPct } = dragRef.current;
    const dxPct = ((e.clientX - startX) / Math.max(320, window.innerWidth)) * 100;
    const dyPct = ((e.clientY - startY) / Math.max(240, window.innerHeight)) * 100;
    setDraft((prev) => ({
      ...prev,
      [id]: clampTransform({
        ...prev[id],
        xPct: origXPct + dxPct,
        yPct: origYPct + dyPct,
      }),
    }));
  };

  const handleUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null;
    }
  };

  const renderPreviewContent = (id: HudControlId) => {
    switch (id) {
      case 'radar':
        return (
          <div className="w-16 h-16 rounded-full bg-neutral-900/85 border-2 border-white/40 flex items-center justify-center">
            <div className="w-2 h-2 bg-emerald-400 rotate-45" />
          </div>
        );
      case 'topStatus':
        return (
          <div className="px-3 py-1 rounded-lg bg-neutral-900/85 border-2 border-amber-400/60 text-[10px] font-bold text-white whitespace-nowrap">
            04:20 · K: 3 · 16/16
          </div>
        );
      case 'topActions':
        return (
          <div className="px-2.5 py-1 rounded-lg bg-neutral-800/85 border-2 border-white/45 text-[10px] font-bold text-white whitespace-nowrap">
            💬 · 😀 · 🔊 · ⚙ · 🚪
          </div>
        );
      case 'joystick':
        return (
          <div className="w-28 h-28 rounded-full bg-neutral-800/70 border-2 border-white/40 flex items-center justify-center">
            <div className="w-11 h-11 rounded-full bg-neutral-300/75 border-2 border-white/70" />
          </div>
        );
      case 'fire':
        return (
          <div className="w-16 h-16 rounded-full bg-neutral-800/80 border-2 border-amber-400 text-white flex items-center justify-center">
            <PubgBulletIcon className="w-8 h-8" />
          </div>
        );
      case 'fist':
        return (
          <div className="w-12 h-12 rounded-full bg-neutral-800/80 border-2 border-white/45 text-white flex items-center justify-center">
            <PubgFistIcon className="w-6 h-6" />
          </div>
        );
      case 'scope':
        return (
          <div className="w-12 h-12 rounded-full bg-sky-600/70 border-2 border-sky-300 text-white flex items-center justify-center">
            <PubgScopeIcon className="w-5 h-5" />
          </div>
        );
      case 'peekLeft':
        return (
          <div className="w-12 h-10 rounded-xl bg-neutral-800/80 border-2 border-white/45 text-white flex items-center justify-center">
            <PubgPeekIcon dir="left" className="w-6 h-5" />
          </div>
        );
      case 'peekRight':
        return (
          <div className="w-12 h-10 rounded-xl bg-neutral-800/80 border-2 border-white/45 text-white flex items-center justify-center">
            <PubgPeekIcon dir="right" className="w-6 h-5" />
          </div>
        );
      case 'prone':
        return (
          <div className="w-12 h-12 rounded-full bg-emerald-600/85 border-2 border-emerald-300 text-white flex items-center justify-center">
            <PubgProneIcon className="w-6 h-6" />
          </div>
        );
      case 'crouch':
        return (
          <div className="w-13 h-13 rounded-full bg-neutral-800/80 border-2 border-white/45 text-white flex items-center justify-center">
            <PubgCrouchIcon className="w-6 h-6" />
          </div>
        );
      case 'jump':
        return (
          <div className="w-13 h-13 rounded-full bg-neutral-800/80 border-2 border-white/45 text-white flex items-center justify-center">
            <PubgJumpIcon className="w-6 h-6" />
          </div>
        );
      case 'grenade':
        return (
          <div className="w-11 h-11 rounded-full bg-neutral-800/80 border-2 border-white/45 text-white flex items-center justify-center">
            <PubgGrenadeIcon className="w-5 h-5" />
          </div>
        );
      case 'reload':
        return (
          <div className="w-11 h-11 rounded-full bg-neutral-800/80 border-2 border-white/45 text-white flex items-center justify-center">
            <PubgReloadIcon className="w-5 h-5" />
          </div>
        );
      case 'weapons':
        return (
          <div className="px-4 py-2 rounded-xl bg-neutral-900/85 border-2 border-amber-400/70 text-[11px] font-bold text-amber-200 whitespace-nowrap">
            HP · M416 · AWM
          </div>
        );
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-[#090c11]/95 select-none touch-none overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Tactical alignment grid */}
      <div className="absolute inset-0 opacity-20 bg-[linear-gradient(to_right,#ffffff18_1px,transparent_1px),linear-gradient(to_bottom,#ffffff18_1px,transparent_1px)] [background-size:32px_32px] pointer-events-none" />

      {/* Top Toolbar */}
      <div className="relative z-20 mx-auto mt-3 max-w-2xl px-3">
        <div className="bg-[#131822]/95 border border-white/15 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-2xl">
          <div className="flex items-center gap-2 text-xs text-gray-200">
            <Move className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{t.customizeHudHint}</span>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-2 bg-black/40 border border-white/10 px-2.5 py-1 rounded-lg">
              <span className="text-[11px] font-bold text-amber-300">
                {getHudControlLabel(selectedId, lang)}
              </span>
              <span className="text-[10px] text-gray-400">{t.buttonSizeLabel}</span>
              <input
                type="range"
                min={0.4}
                max={1.55}
                step={0.05}
                value={draft[selectedId].scale}
                onChange={(e) => {
                  const nextScale = Number(e.target.value);
                  setDraft((prev) => ({
                    ...prev,
                    [selectedId]: clampTransform({ ...prev[selectedId], scale: nextScale }),
                  }));
                }}
                className="w-24 accent-amber-500 cursor-pointer"
              />
            </div>

            <button
              onClick={() => setDraft({ ...DEFAULT_HUD_LAYOUT })}
              className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold text-gray-200 flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t.resetHudBtn}</span>
            </button>

            <button
              onClick={onCancel}
              className="px-2.5 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/35 border border-red-400/40 text-xs font-bold text-red-200 flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              <span>{t.cancelBtn}</span>
            </button>

            <button
              onClick={() => onSave(draft)}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold flex items-center gap-1"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{t.saveHudBtn}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Draggable HUD Controls Canvas */}
      {HUD_CONTROL_IDS.map((id) => {
        const cfg = draft[id];
        const active = selectedId === id;
        return (
          <div
            key={id}
            onPointerDown={(e) => handleDown(id, e)}
            onPointerMove={handleMove}
            onPointerUp={handleUp}
            onPointerCancel={handleUp}
            style={{
              left: `${cfg.xPct}%`,
              top: `${cfg.yPct}%`,
              transform: `translate(-50%, -50%) scale(${cfg.scale})`,
            }}
            className={`absolute cursor-grab active:cursor-grabbing flex flex-col items-center gap-1 p-1 rounded-2xl transition-shadow ${
              active ? 'ring-2 ring-amber-400 bg-amber-500/10 z-10' : 'opacity-90 hover:opacity-100'
            }`}
          >
            {renderPreviewContent(id)}
            <span className="text-[10px] font-bold bg-black/80 text-white px-1.5 py-0.5 rounded pointer-events-none whitespace-nowrap">
              {getHudControlLabel(id, lang)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
