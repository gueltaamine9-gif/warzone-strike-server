import type { AppLang } from '../i18n/translations';

export type HudControlId =
  | 'radar'
  | 'topStatus'
  | 'topActions'
  | 'joystick'
  | 'fire'
  | 'fist'
  | 'scope'
  | 'peekLeft'
  | 'peekRight'
  | 'prone'
  | 'crouch'
  | 'jump'
  | 'grenade'
  | 'reload'
  | 'weapons';

export interface HudControlTransform {
  xPct: number;
  yPct: number;
  scale: number;
}

export type HudLayoutConfig = Record<HudControlId, HudControlTransform>;

const HUD_LAYOUT_STORAGE_KEY = 'warzone_hud_layout_v2';
const LEGACY_HUD_LAYOUT_STORAGE_KEY = 'warzone_hud_layout_v1';

// Non-gameplay screen overlays (top & bottom UI strips + radar) controllable independently in Settings
export const TOP_HUD_CONTROL_IDS: HudControlId[] = ['radar', 'topStatus', 'topActions', 'weapons'];

// Core gameplay touch controls (untouched at 1.0x default)
export const GAMEPLAY_HUD_CONTROL_IDS: HudControlId[] = [
  'joystick',
  'fire',
  'fist',
  'scope',
  'peekLeft',
  'peekRight',
  'prone',
  'crouch',
  'jump',
  'grenade',
  'reload',
];

export const DEFAULT_HUD_LAYOUT: HudLayoutConfig = {
  radar: { xPct: 6, yPct: 7.5, scale: 0.6 },
  topStatus: { xPct: 47, yPct: 3.5, scale: 0.62 },
  topActions: { xPct: 89, yPct: 3.5, scale: 0.62 },
  joystick: { xPct: 13, yPct: 78, scale: 1 },
  fire: { xPct: 64, yPct: 76, scale: 1 },
  fist: { xPct: 55, yPct: 77, scale: 1 },
  scope: { xPct: 73, yPct: 77, scale: 1 },
  peekLeft: { xPct: 83, yPct: 71, scale: 1 },
  peekRight: { xPct: 91, yPct: 71, scale: 1 },
  prone: { xPct: 76, yPct: 87, scale: 1 },
  crouch: { xPct: 84, yPct: 87, scale: 1 },
  jump: { xPct: 92, yPct: 87, scale: 1 },
  grenade: { xPct: 95, yPct: 60, scale: 1 },
  reload: { xPct: 95, yPct: 93, scale: 1 },
  weapons: { xPct: 50, yPct: 92.5, scale: 0.66 },
};

export const HUD_CONTROL_IDS: HudControlId[] = [
  ...TOP_HUD_CONTROL_IDS,
  ...GAMEPLAY_HUD_CONTROL_IDS,
];

export function getHudControlLabel(id: HudControlId, lang: AppLang): string {
  const labels: Record<HudControlId, { ar: string; fr: string; en: string }> = {
    radar: { ar: 'الرادار', fr: 'Radar', en: 'Radar' },
    topStatus: { ar: 'شريط الحالة العلوي', fr: 'Barre statut', en: 'Top Status' },
    topActions: { ar: 'أزرار القائمة العلوية', fr: 'Menu haut', en: 'Top Actions' },
    joystick: { ar: 'عصا الحركة', fr: 'Joystick', en: 'Joystick' },
    fire: { ar: 'إطلاق النار', fr: 'Tirer', en: 'Fire' },
    fist: { ar: 'الضرب باليد', fr: 'Poing', en: 'Punch' },
    scope: { ar: 'التصويب / الزوم', fr: 'Viseur', en: 'Scope' },
    peekLeft: { ar: 'انحناء يسار', fr: 'Pencher G', en: 'Peek L' },
    peekRight: { ar: 'انحناء يمين', fr: 'Pencher D', en: 'Peek R' },
    prone: { ar: 'الاستلقاء', fr: 'Allongé', en: 'Prone' },
    crouch: { ar: 'الانحناء', fr: 'Accroupi', en: 'Crouch' },
    jump: { ar: 'القفز', fr: 'Sauter', en: 'Jump' },
    grenade: { ar: 'القنبلة', fr: 'Grenade', en: 'Grenade' },
    reload: { ar: 'تبديل المخزن', fr: 'Recharger', en: 'Reload' },
    weapons: { ar: 'الأسلحة والصحة', fr: 'Armes & PV', en: 'Weapons & HP' },
  };
  return labels[id][lang];
}

export function clampTransform(t: HudControlTransform): HudControlTransform {
  return {
    xPct: Math.max(4, Math.min(96, Number(t.xPct) || 50)),
    yPct: Math.max(2.5, Math.min(96, Number(t.yPct) || 50)),
    scale: Math.max(0.4, Math.min(1.55, Number(t.scale) || 1)),
  };
}

export function loadHudLayout(): HudLayoutConfig {
  try {
    const raw = localStorage.getItem(HUD_LAYOUT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<HudLayoutConfig>;
      const merged = { ...DEFAULT_HUD_LAYOUT };
      for (const id of HUD_CONTROL_IDS) {
        if (parsed[id]) {
          merged[id] = clampTransform(parsed[id]!);
        }
      }
      return merged;
    }

    // Migrate user's customized gameplay button positions from v1 while applying new compact overlay defaults
    const legacyRaw = localStorage.getItem(LEGACY_HUD_LAYOUT_STORAGE_KEY);
    if (legacyRaw) {
      const legacyParsed = JSON.parse(legacyRaw) as Partial<HudLayoutConfig>;
      const merged = { ...DEFAULT_HUD_LAYOUT };
      for (const id of GAMEPLAY_HUD_CONTROL_IDS) {
        if (legacyParsed[id]) {
          merged[id] = clampTransform(legacyParsed[id]!);
        }
      }
      return merged;
    }

    return { ...DEFAULT_HUD_LAYOUT };
  } catch {
    return { ...DEFAULT_HUD_LAYOUT };
  }
}

export function saveHudLayout(layout: HudLayoutConfig): void {
  try {
    localStorage.setItem(HUD_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // ignore storage errors
  }
}

export function resetHudLayout(): HudLayoutConfig {
  const fresh = { ...DEFAULT_HUD_LAYOUT };
  saveHudLayout(fresh);
  return fresh;
}
