export type MapId =
  | 'metropolis'
  | 'iraq_ruins'
  | 'military_base'
  | 'industrial_port';

export type WeaponId =
  | 'm416'
  | 'akm'
  | 'scarl'
  | 'groza'
  | 'm249'
  | 'mk14'
  | 'svd'
  | 'amr'
  | 'barrett'
  | 'cheytac'
  | 'awm'
  | 'kar98'
  | 'm24'
  | 'ump45'
  | 'vector'
  | 's12k'
  | 'p18c'
  | 'deagle';

export type OutfitId =
  | 'woodland_specops'
  | 'midnight_blackops'
  | 'desert_recon'
  | 'urban_swat'
  | 'arid_iraq';

export type HelmetId = 'ballistic' | 'nvg_tactical' | 'beret' | 'ghillie_hood';

export type EmoteId =
  | 'none'
  | 'victory_dance'
  | 'salute'
  | 'shadow_box'
  | 'groove'
  | 'backflip'
  | 'clap'
  | 'muscle_flex'
  | 'taunt_wave';

export interface OutfitSpec {
  id: OutfitId;
  nameAr: string;
  descAr: string;
  primaryColor: number;
  secondaryColor: number;
  vestColor: number;
  accentColor: number;
  camoStyle: 'woodland' | 'midnight' | 'desert' | 'urban' | 'arid';
}

export interface HelmetSpec {
  id: HelmetId;
  nameAr: string;
  color: number;
}

export interface WeaponSpec {
  id: WeaponId;
  nameAr: string;
  categoryAr: string;
  type: 'ar' | 'sniper' | 'dmr' | 'smg' | 'shotgun' | 'pistol';
  damage: number;
  headshotMult: number;
  fireRateMs: number;
  magSize: number;
  reloadMs: number;
  spread: number;
  range: number;
  scopeZoom: number; // FOV when scoped
  hasOpticalScope: boolean;
  recoilKick: number;
  pellets?: number;
  bodyColor: number;
  accentColor: number;
}

export interface MapSpec {
  id: MapId;
  nameAr: string;
  subtitleAr: string;
  descAr: string;
  featuresAr: string[];
  skyColor: number;
  fogColor: number;
  fogDensity: number;
  groundColor: number;
  accentHex: string;
  arenaRadius: number;
}

export interface EmoteSpec {
  id: Exclude<EmoteId, 'none'>;
  nameAr: string;
  durationMs: number;
}

export const OUTFITS: OutfitSpec[] = [
  {
    id: 'woodland_specops',
    nameAr: 'تمويه الغابة الداكن',
    descAr: 'زي القوات الخاصة للغابات الكثيفة',
    primaryColor: 0x263526,
    secondaryColor: 0x1b241b,
    vestColor: 0x181c18,
    accentColor: 0x4b5d3a,
    camoStyle: 'woodland',
  },
  {
    id: 'midnight_blackops',
    nameAr: 'درع الظل الليلي',
    descAr: 'بدلة عمليات ليلية سوداء مدرعة',
    primaryColor: 0x171a21,
    secondaryColor: 0x101217,
    vestColor: 0x0c0e12,
    accentColor: 0x3b4252,
    camoStyle: 'midnight',
  },
  {
    id: 'desert_recon',
    nameAr: 'تمويه الصحراء التكتيكي',
    descAr: 'زي استطلاع للمناطق الصحراوية',
    primaryColor: 0x6b5c45,
    secondaryColor: 0x4f4331,
    vestColor: 0x383024,
    accentColor: 0x8c7a5b,
    camoStyle: 'desert',
  },
  {
    id: 'urban_swat',
    nameAr: 'قوات المدن الرمادية',
    descAr: 'درع قتالي للعمليات داخل الأبنية',
    primaryColor: 0x2d343e,
    secondaryColor: 0x1f242c,
    vestColor: 0x14171c,
    accentColor: 0x525d6b,
    camoStyle: 'urban',
  },
  {
    id: 'arid_iraq',
    nameAr: 'مقاتل الأطلال التكتيكي',
    descAr: 'تمويه ترابي داكن للمدن القديمة',
    primaryColor: 0x4c4134,
    secondaryColor: 0x362e24,
    vestColor: 0x231f1a,
    accentColor: 0x73634f,
    camoStyle: 'arid',
  },
];

export const HELMETS: HelmetSpec[] = [
  { id: 'ballistic', nameAr: 'خوذة قتالية ثقيلة', color: 0x1e2328 },
  { id: 'nvg_tactical', nameAr: 'خوذة رؤية ليلية NVG', color: 0x16191e },
  { id: 'beret', nameAr: 'قبعة القائد الخاصة', color: 0x5c1a1b },
  { id: 'ghillie_hood', nameAr: 'غطاء قناص مموه', color: 0x2c3b28 },
];

export interface CharacterPreset {
  id: string;
  nameAr: string;
  nameFr: string;
  nameEn: string;
  roleAr: string;
  roleFr: string;
  roleEn: string;
  outfitId: OutfitId;
  helmetId: HelmetId;
  accentHex: string;
}

export const CHARACTER_PRESETS: CharacterPreset[] = [
  {
    id: 'op_falcon',
    nameAr: 'الكابتن صقر',
    nameFr: 'Capitaine Faucon',
    nameEn: 'Captain Falcon',
    roleAr: 'قائد وحدة الغابات الخاصة',
    roleFr: 'Chef commando forêt',
    roleEn: 'Woodland Spec-Ops Leader',
    outfitId: 'woodland_specops',
    helmetId: 'ballistic',
    accentHex: '#4b5d3a',
  },
  {
    id: 'op_ghost',
    nameAr: 'شبح الظلام',
    nameFr: 'Fantôme Nocturne',
    nameEn: 'Night Ghost',
    roleAr: 'عمليات ليلية · رؤية ليلية NVG',
    roleFr: 'Opérations nocturnes NVG',
    roleEn: 'Black-Ops NVG Specialist',
    outfitId: 'midnight_blackops',
    helmetId: 'nvg_tactical',
    accentHex: '#3b4252',
  },
  {
    id: 'op_viper',
    nameAr: 'القناص الأفعى',
    nameFr: 'Sniper Vipère',
    nameEn: 'Viper Sniper',
    roleAr: 'قناص متخفٍ بغطاء الغابات',
    roleFr: 'Tireur d’élite camouflé',
    roleEn: 'Ghillie Recon Marksman',
    outfitId: 'woodland_specops',
    helmetId: 'ghillie_hood',
    accentHex: '#2c3b28',
  },
  {
    id: 'op_wolf',
    nameAr: 'ذئب الصحراء',
    nameFr: 'Loup du Désert',
    nameEn: 'Desert Wolf',
    roleAr: 'استطلاع وهجوم صحراوي',
    roleFr: 'Éclaireur du désert',
    roleEn: 'Desert Recon Striker',
    outfitId: 'desert_recon',
    helmetId: 'beret',
    accentHex: '#8c7a5b',
  },
  {
    id: 'op_swat',
    nameAr: 'المدرع الفولاذي',
    nameFr: 'Unité SWAT',
    nameEn: 'Iron Breacher',
    roleAr: 'اقتحام المباني والمدن',
    roleFr: 'Assaut urbain lourd',
    roleEn: 'Urban CQB Breacher',
    outfitId: 'urban_swat',
    helmetId: 'ballistic',
    accentHex: '#525d6b',
  },
  {
    id: 'op_tigris',
    nameAr: 'أسد الرافدين',
    nameFr: 'Lion de Mésopotamie',
    nameEn: 'Tigris Guard',
    roleAr: 'مقاتل الأطلال والحصار',
    roleFr: 'Combattant des ruines',
    roleEn: 'Arid Ruins Veteran',
    outfitId: 'arid_iraq',
    helmetId: 'nvg_tactical',
    accentHex: '#73634f',
  },
];

export const WEAPONS: WeaponSpec[] = [
  {
    id: 'm416',
    nameAr: 'M416 تكتيكي',
    categoryAr: 'بندقية هجومية',
    type: 'ar',
    damage: 21,
    headshotMult: 2.05,
    fireRateMs: 105,
    magSize: 30,
    reloadMs: 1650,
    spread: 0.015,
    range: 195,
    scopeZoom: 44,
    hasOpticalScope: false,
    recoilKick: 0.018,
    bodyColor: 0x1f2328,
    accentColor: 0x3e444c,
  },
  {
    id: 'akm',
    nameAr: 'AKM-74',
    categoryAr: 'بندقية ثقيلة',
    type: 'ar',
    damage: 26,
    headshotMult: 2.15,
    fireRateMs: 132,
    magSize: 30,
    reloadMs: 1850,
    spread: 0.021,
    range: 185,
    scopeZoom: 44,
    hasOpticalScope: false,
    recoilKick: 0.024,
    bodyColor: 0x23262b,
    accentColor: 0x5c3a21,
  },
  {
    id: 'scarl',
    nameAr: 'SCAR-L صحراوي',
    categoryAr: 'بندقية هجومية',
    type: 'ar',
    damage: 22,
    headshotMult: 2.05,
    fireRateMs: 112,
    magSize: 30,
    reloadMs: 1600,
    spread: 0.014,
    range: 200,
    scopeZoom: 44,
    hasOpticalScope: false,
    recoilKick: 0.016,
    bodyColor: 0x7a6849,
    accentColor: 0x302b22,
  },
  {
    id: 'groza',
    nameAr: 'Groza 7.62 كاتم',
    categoryAr: 'بندقية خاصة',
    type: 'ar',
    damage: 25,
    headshotMult: 2.1,
    fireRateMs: 96,
    magSize: 30,
    reloadMs: 1620,
    spread: 0.014,
    range: 195,
    scopeZoom: 44,
    hasOpticalScope: false,
    recoilKick: 0.017,
    bodyColor: 0x1a1e24,
    accentColor: 0x3f4752,
  },
  {
    id: 'm249',
    nameAr: 'M249 رشاش ثقيل',
    categoryAr: 'رشاش دعم 75 طلقة',
    type: 'ar',
    damage: 22,
    headshotMult: 1.95,
    fireRateMs: 90,
    magSize: 75,
    reloadMs: 2600,
    spread: 0.022,
    range: 205,
    scopeZoom: 46,
    hasOpticalScope: false,
    recoilKick: 0.016,
    bodyColor: 0x262c24,
    accentColor: 0x4b533b,
  },
  {
    id: 'mk14',
    nameAr: 'MK14 EBR 6x',
    categoryAr: 'بندقية قناصة آلية',
    type: 'dmr',
    damage: 48,
    headshotMult: 2.35,
    fireRateMs: 175,
    magSize: 20,
    reloadMs: 1950,
    spread: 0.0035,
    range: 320,
    scopeZoom: 13,
    hasOpticalScope: true,
    recoilKick: 0.03,
    bodyColor: 0x26292e,
    accentColor: 0x5c4f3a,
  },
  {
    id: 'svd',
    nameAr: 'Dragunov SVD (GLB 6x)',
    categoryAr: 'قناصة نصف آلية GLB',
    type: 'dmr',
    damage: 54,
    headshotMult: 2.45,
    fireRateMs: 240,
    magSize: 10,
    reloadMs: 1900,
    spread: 0.0028,
    range: 340,
    scopeZoom: 12,
    hasOpticalScope: true,
    recoilKick: 0.036,
    bodyColor: 0x202429,
    accentColor: 0x6b3e22,
  },
  {
    id: 'amr',
    nameAr: 'Lynx AMR .50 (20x)',
    categoryAr: 'قناصة مضادة للدروع',
    type: 'sniper',
    damage: 112,
    headshotMult: 2.9,
    fireRateMs: 1280,
    magSize: 5,
    reloadMs: 2500,
    spread: 0.0011,
    range: 460,
    scopeZoom: 4.5,
    hasOpticalScope: true,
    recoilKick: 0.072,
    bodyColor: 0x1b1e23,
    accentColor: 0x525a66,
  },
  {
    id: 'barrett',
    nameAr: 'Barrett M82 .50 (GLB 20x)',
    categoryAr: 'قناصة ثقيلة GLB',
    type: 'sniper',
    damage: 108,
    headshotMult: 2.85,
    fireRateMs: 920,
    magSize: 5,
    reloadMs: 2450,
    spread: 0.0012,
    range: 455,
    scopeZoom: 4.8,
    hasOpticalScope: true,
    recoilKick: 0.068,
    bodyColor: 0x23272e,
    accentColor: 0x635742,
  },
  {
    id: 'cheytac',
    nameAr: 'M200 Intervention (GLB 15x)',
    categoryAr: 'قناصة بعيدة المدى GLB',
    type: 'sniper',
    damage: 102,
    headshotMult: 2.85,
    fireRateMs: 1120,
    magSize: 7,
    reloadMs: 2350,
    spread: 0.001,
    range: 450,
    scopeZoom: 5.2,
    hasOpticalScope: true,
    recoilKick: 0.062,
    bodyColor: 0x4f4739,
    accentColor: 0x1c2026,
  },
  {
    id: 'awm',
    nameAr: 'AWM قناصة 15x',
    categoryAr: 'قناصة متطورة',
    type: 'sniper',
    damage: 98,
    headshotMult: 2.8,
    fireRateMs: 1150,
    magSize: 5,
    reloadMs: 2400,
    spread: 0.0013,
    range: 440,
    scopeZoom: 5.5,
    hasOpticalScope: true,
    recoilKick: 0.065,
    bodyColor: 0x354230,
    accentColor: 0x16181a,
  },
  {
    id: 'm24',
    nameAr: 'M24 قناصة 8x',
    categoryAr: 'قناصة تكتيكية',
    type: 'sniper',
    damage: 88,
    headshotMult: 2.75,
    fireRateMs: 980,
    magSize: 5,
    reloadMs: 2200,
    spread: 0.0015,
    range: 400,
    scopeZoom: 7.2,
    hasOpticalScope: true,
    recoilKick: 0.056,
    bodyColor: 0x20242a,
    accentColor: 0x121417,
  },
  {
    id: 'kar98',
    nameAr: 'Kar98k قناصة 8x',
    categoryAr: 'قناصة دقيقة',
    type: 'sniper',
    damage: 82,
    headshotMult: 2.7,
    fireRateMs: 920,
    magSize: 5,
    reloadMs: 2100,
    spread: 0.0018,
    range: 380,
    scopeZoom: 8.5,
    hasOpticalScope: true,
    recoilKick: 0.052,
    bodyColor: 0x4b321d,
    accentColor: 0x1c2026,
  },
  {
    id: 'ump45',
    nameAr: 'UMP45 رشاش سريع',
    categoryAr: 'رشاش خفيف',
    type: 'smg',
    damage: 17,
    headshotMult: 1.85,
    fireRateMs: 84,
    magSize: 35,
    reloadMs: 1400,
    spread: 0.023,
    range: 135,
    scopeZoom: 46,
    hasOpticalScope: false,
    recoilKick: 0.012,
    bodyColor: 0x181b20,
    accentColor: 0x2f353d,
  },
  {
    id: 'vector',
    nameAr: 'Vector رشاش خاطف',
    categoryAr: 'رشاش قتالي',
    type: 'smg',
    damage: 15,
    headshotMult: 1.85,
    fireRateMs: 65,
    magSize: 33,
    reloadMs: 1300,
    spread: 0.02,
    range: 120,
    scopeZoom: 46,
    hasOpticalScope: false,
    recoilKick: 0.009,
    bodyColor: 0x2c3038,
    accentColor: 0x5c4f3a,
  },
  {
    id: 's12k',
    nameAr: 'S12K شوزن قتالي',
    categoryAr: 'بندقية قريبة',
    type: 'shotgun',
    damage: 15,
    headshotMult: 1.6,
    fireRateMs: 420,
    magSize: 8,
    reloadMs: 1950,
    spread: 0.055,
    range: 70,
    scopeZoom: 52,
    hasOpticalScope: false,
    recoilKick: 0.048,
    pellets: 6,
    bodyColor: 0x1b1d21,
    accentColor: 0x45494e,
  },
  {
    id: 'deagle',
    nameAr: 'Desert Eagle .50',
    categoryAr: 'مسدس ثقيل',
    type: 'pistol',
    damage: 42,
    headshotMult: 2.35,
    fireRateMs: 260,
    magSize: 7,
    reloadMs: 1450,
    spread: 0.011,
    range: 150,
    scopeZoom: 46,
    hasOpticalScope: false,
    recoilKick: 0.036,
    bodyColor: 0x858f9c,
    accentColor: 0x1c2026,
  },
  {
    id: 'p18c',
    nameAr: 'P18C مسدس رشاش',
    categoryAr: 'مسدس آلي',
    type: 'pistol',
    damage: 15,
    headshotMult: 1.85,
    fireRateMs: 78,
    magSize: 17,
    reloadMs: 1200,
    spread: 0.024,
    range: 95,
    scopeZoom: 48,
    hasOpticalScope: false,
    recoilKick: 0.014,
    bodyColor: 0x1c1f24,
    accentColor: 0x2e343d,
  },
];

export const MAPS: MapSpec[] = [
  {
    id: 'metropolis',
    nameAr: 'مدينة الأبراج الداكنة',
    subtitleAr: 'المدينة الأولى · مبانٍ متعددة الطوابق',
    descAr: 'مدينة عصرية بألوان داكنة تضم أبراجاً قابلة للدخول، مصاعد كهربائية متحركة، سلالم، غرفاً للاختباء، وصناديق إمداد.',
    featuresAr: ['مصاعد عاملة', 'سلالم داخلية', 'غرف ومخابئ', 'صناديق أسلحة'],
    skyColor: 0x151a22,
    fogColor: 0x151a22,
    fogDensity: 0.0044,
    groundColor: 0x1a1e24,
    accentHex: '#f59e0b',
    arenaRadius: 160,
  },
  {
    id: 'iraq_ruins',
    nameAr: 'أطلال الرافدين (العراق)',
    subtitleAr: 'المدينة الثانية · مدينة أثرية مدمرة',
    descAr: 'أحياء قديمة مهدمة بأقواس رملية داكنة، مبانٍ محطمة يمكنك التحصن داخلها، وجسور مكسورة وممرات للمناورة.',
    featuresAr: ['مبانٍ محطمة', 'جسور مكسورة', 'ممرات وأقواس', 'أكياس رمل'],
    skyColor: 0x1f1914,
    fogColor: 0x1f1914,
    fogDensity: 0.0046,
    groundColor: 0x2e251c,
    accentHex: '#d97706',
    arenaRadius: 160,
  },
  {
    id: 'military_base',
    nameAr: 'القاعدة العسكرية المحصنة',
    subtitleAr: 'المدينة الثالثة · مجمع عمليات ليلي',
    descAr: 'قاعدة عسكرية سرية تحتوي على حظائر طائرات، أبراج رادار، خنادق رملية، ومصعد لبرج القيادة العالي.',
    featuresAr: ['برج قيادة بمصعد', 'حظائر مدرعة', 'خنادق رملية', 'مهبط مروحيات'],
    skyColor: 0x11161f,
    fogColor: 0x11161f,
    fogDensity: 0.0043,
    groundColor: 0x1c2026,
    accentHex: '#38bdf8',
    arenaRadius: 160,
  },
  {
    id: 'industrial_port',
    nameAr: 'الميناء الصناعي المهجور',
    subtitleAr: 'المدينة الرابعة · حاويات ورافعات',
    descAr: 'ميناء ليلي ضبابي مليء بحاويات الشحن المكدسة، جسور معدنية بسلالم، ومستودعات مغلقة للقتال القريب.',
    featuresAr: ['متاهة حاويات', 'ممرات علوية', 'مستودعات مغلقة', 'ضباب ساحلي'],
    skyColor: 0x121820,
    fogColor: 0x121820,
    fogDensity: 0.005,
    groundColor: 0x191d22,
    accentHex: '#94a3b8',
    arenaRadius: 160,
  },
];

export const EMOTES: EmoteSpec[] = [
  { id: 'victory_dance', nameAr: 'رقصة النصر', durationMs: 3600 },
  { id: 'salute', nameAr: 'تحية عسكرية', durationMs: 2600 },
  { id: 'shadow_box', nameAr: 'ملاكمة القتال', durationMs: 3400 },
  { id: 'groove', nameAr: 'رقصة الإيقاع', durationMs: 3800 },
  { id: 'backflip', nameAr: 'شقلبة بهلوانية', durationMs: 2800 },
  { id: 'clap', nameAr: 'تصفيق الفوز', durationMs: 3000 },
  { id: 'muscle_flex', nameAr: 'استعراض القوة', durationMs: 3200 },
  { id: 'taunt_wave', nameAr: 'تحدي الخصم', durationMs: 3200 },
];

export const MATCH_DURATIONS = [
  { seconds: 180, labelAr: '3 دقائق' },
  { seconds: 300, labelAr: '5 دقائق' },
  { seconds: 600, labelAr: '10 دقائق' },
  { seconds: 900, labelAr: '15 دقيقة' },
  { seconds: 0, labelAr: 'وقت مفتوح' },
];

export interface PlayerLoadout {
  callsign: string;
  outfitId: OutfitId;
  helmetId: HelmetId;
  primaryWeapon: WeaponId;
  secondaryWeapon: WeaponId;
  customGlbId?: string | null;
  customGlbFlip?: boolean;
  applyGlbToBots?: boolean;
}

export type GrenadeType = 'frag' | 'smoke' | 'molotov';

export type VehicleKind = 'car' | 'motorcycle';

export type TeamId = 'free' | 'green' | 'red';

export type TeamMode = 'free' | 'teams';

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  team: TeamId;
  text: string;
  timestamp: number;
}

export interface CombatantStats {
  id: string;
  name: string;
  isBot: boolean;
  isSelf: boolean;
  kills: number;
  deaths: number;
  damage: number;
  outfitId: OutfitId;
  team?: TeamId;
}

export interface KillFeedItem {
  id: string;
  killerName: string;
  victimName: string;
  weaponName: string;
  isHeadshot: boolean;
  timestamp: number;
}

export interface RoomPlayerInfo {
  id: string;
  uid?: string;
  name: string;
  outfitId: OutfitId;
  helmetId: HelmetId;
  primaryWeapon: WeaponId;
  secondaryWeapon: WeaponId;
  customGlbId?: string | null;
  customGlbFlip?: boolean;
  team: TeamId;
  isHost: boolean;
  ready: boolean;
}

export interface RoomStateInfo {
  code: string;
  mapId: MapId;
  durationSec: number; // 0 = open
  botCount: number;
  teamMode: TeamMode;
  status: 'lobby' | 'playing' | 'ended';
  hostId: string;
  players: RoomPlayerInfo[];
  startedAt?: number;
}

export function getWeaponSpec(id: WeaponId): WeaponSpec {
  return WEAPONS.find((w) => w.id === id) || WEAPONS[0];
}

export function getOutfitSpec(id: OutfitId): OutfitSpec {
  return OUTFITS.find((o) => o.id === id) || OUTFITS[0];
}

export function getMapSpec(id: MapId): MapSpec {
  return MAPS.find((m) => m.id === id) || MAPS[0];
}
