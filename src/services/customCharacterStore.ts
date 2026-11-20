import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { getPublicAppOrigin } from './multiplayerClient';

export interface CustomCharacterMeta {
  id: string;
  name: string;
  sizeBytes: number;
  boneCount: number;
  animCount: number;
  createdAt: number;
}

export interface StoredCustomCharacter extends CustomCharacterMeta {
  buffer: ArrayBuffer;
}

export interface LoadedGlbTemplate {
  id: string;
  name: string;
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  boneCount: number;
  animCount: number;
}

export interface BuiltinGlbSpec {
  id: string;
  url: string;
  nameAr: string;
  nameFr: string;
  nameEn: string;
  roleAr: string;
  roleFr: string;
  roleEn: string;
  defaultFlip: boolean;
  rpmAnimSet?: 'male' | 'female';
}

export const BUILTIN_GLB_CHARACTERS: BuiltinGlbSpec[] = [
  {
    id: 'builtin_vanguard_glb',
    url: '/models/soldier_ops.glb',
    nameAr: 'الجندي المدرع 3D (حقيقي)',
    nameFr: 'Soldat Vanguard 3D (Animé)',
    nameEn: 'Vanguard Armored Soldier 3D (.GLB)',
    roleAr: 'نموذج Mixamo عسكري مدرع مع حركات الجري والمشي والقتال',
    roleFr: 'Soldat blindé Mixamo .GLB animé',
    roleEn: 'Armored Mixamo Soldier (Idle/Walk/Run)',
    defaultFlip: true,
  },
  {
    id: 'builtin_tactical_male_glb',
    url: '/models/rpm_tactical_male.glb',
    nameAr: 'القناص التكتيكي 3D (حقيقي)',
    nameFr: 'Opérateur Tactique Barbu 3D (.GLB)',
    nameEn: 'Tactical Bearded Operator 3D (.GLB)',
    roleAr: 'شخصية بشرية حقيقية بوجه ولحية وسترة قتالية وحركات موشن كابتشر',
    roleFr: 'Personnage humain réaliste avec animations mocap .GLB',
    roleEn: 'Realistic Human Operator + Mocap Idle/Walk/Run',
    defaultFlip: false,
    rpmAnimSet: 'male',
  },
  {
    id: 'builtin_brunette_agent_glb',
    url: '/models/rpm_brunette_agent.glb',
    nameAr: 'العميلة الخاصة 3D (حقيقية)',
    nameFr: 'Agent Spéciale 3D (.GLB)',
    nameEn: 'Special Ops Female Agent 3D (.GLB)',
    roleAr: 'شخصية بشرية حقيقية بشعر ونظارات ووجه مفصل وحركات قتال',
    roleFr: 'Agent féminin réaliste avec cheveux & lunettes .GLB',
    roleEn: 'Realistic Female Agent + Mocap Idle/Walk/Run',
    defaultFlip: false,
    rpmAnimSet: 'female',
  },
  {
    id: 'builtin_striker_male_glb',
    url: '/models/rpm_striker_male.glb',
    nameAr: 'مقاتل الاستطلاع سترايكر 3D (حقيقي)',
    nameFr: 'Combattant Striker 3D (.GLB)',
    nameEn: 'Striker Recon Fighter 3D (.GLB)',
    roleAr: 'شخصية بشرية حقيقية بهيكل أصابع كامل وحركات جري ومراوغة',
    roleFr: 'Combattant humain complet avec doigts articulés .GLB',
    roleEn: 'Realistic Male Striker + Mocap Locomotion',
    defaultFlip: false,
    rpmAnimSet: 'male',
  },
  {
    id: 'builtin_valkyrie_female_glb',
    url: '/models/rpm_valkyrie_female.glb',
    nameAr: 'كوماندوز فالكيري 3D (حقيقية)',
    nameFr: 'Commando Valkyrie 3D (.GLB)',
    nameEn: 'Valkyrie Commando 3D (.GLB)',
    roleAr: 'مقاتلة بشرية حقيقية بتفاصيل وجه وشعر وحركات قتالية',
    roleFr: 'Commando féminin réaliste avec animations .GLB',
    roleEn: 'Realistic Female Commando + Mocap Locomotion',
    defaultFlip: false,
    rpmAnimSet: 'female',
  },
  {
    id: 'builtin_michelle_ops_glb',
    url: '/models/michelle_ops.glb',
    nameAr: 'مقاتلة العمليات ميشيل 3D (حقيقية)',
    nameFr: 'Opératrice Michelle 3D (.GLB)',
    nameEn: 'Urban Operative Michelle 3D (.GLB)',
    roleAr: 'نموذج Mixamo بشري حقيقي بشعر ووجه وهيكل أصابع كامل',
    roleFr: 'Personnage Mixamo humain réaliste .GLB',
    roleEn: 'Mixamo Human Operative (Full Finger Rig)',
    defaultFlip: false,
  },
];

// Graceful compatibility mapping if an earlier placeholder builtin ID was saved locally
const REMOVED_BUILTIN_ALIAS: Record<string, string> = {
  builtin_juggernaut_glb: 'builtin_tactical_male_glb',
  builtin_ghillie_sniper_glb: 'builtin_striker_male_glb',
  builtin_night_commando_glb: 'builtin_brunette_agent_glb',
  builtin_desert_captain_glb: 'builtin_valkyrie_female_glb',
  builtin_riot_breacher_glb: 'builtin_michelle_ops_glb',
};

const DB_NAME = 'warzone_custom_characters_v1';
const STORE_NAME = 'models';

const templateCache = new Map<string, Promise<LoadedGlbTemplate | null>>();
const rpmClipCache = new Map<'male' | 'female', Promise<THREE.AnimationClip[]>>();

function createLoader(): GLTFLoader {
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  loader.setDRACOLoader(draco);
  return loader;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function parseGlbArrayBuffer(
  id: string,
  name: string,
  buffer: ArrayBuffer,
): Promise<LoadedGlbTemplate> {
  return new Promise((resolve, reject) => {
    const loader = createLoader();
    // Copy buffer because GLTFLoader may detach/transfer slices
    const copy = buffer.slice(0);
    loader.parse(
      copy,
      '',
      (gltf) => {
        let boneCount = 0;
        const seenBones = new Set<THREE.Object3D>();
        gltf.scene.traverse((obj) => {
          if ((obj as THREE.Bone).isBone && !seenBones.has(obj)) {
            seenBones.add(obj);
            boneCount++;
          }
          const skinned = obj as THREE.SkinnedMesh;
          if (skinned.isSkinnedMesh && skinned.skeleton) {
            for (const b of skinned.skeleton.bones) {
              if (!seenBones.has(b)) {
                seenBones.add(b);
                boneCount++;
              }
            }
          }
        });
        resolve({
          id,
          name,
          scene: gltf.scene,
          animations: gltf.animations || [],
          boneCount,
          animCount: gltf.animations?.length || 0,
        });
      },
      (err) => {
        reject(err instanceof Error ? err : new Error('Failed to parse GLB file'));
      },
    );
  });
}

function stripRootMotionXZ(clip: THREE.AnimationClip, renameTo: string): THREE.AnimationClip {
  const cloned = clip.clone();
  cloned.name = renameTo;
  for (const track of cloned.tracks) {
    if (/^hips\.position$/i.test(track.name)) {
      // Preserve vertical stride bounce (Y), zero horizontal root displacement (X/Z)
      const vals = track.values;
      for (let i = 0; i < vals.length; i += 3) {
        vals[i] = 0;
        vals[i + 2] = 0;
      }
    }
  }
  return cloned;
}

async function fetchGlbBuffer(url: string): Promise<ArrayBuffer | null> {
  try {
    let res = await fetch(url).catch(() => null);
    if (!res || !res.ok) {
      res = await fetch(`${getPublicAppOrigin()}${url}`);
    }
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

function loadRpmAnimationPack(gender: 'male' | 'female'): Promise<THREE.AnimationClip[]> {
  const cached = rpmClipCache.get(gender);
  if (cached) return cached;

  const prefix = gender === 'female' ? 'f' : 'm';
  const specs: Array<{ key: string; url: string }> = [
    { key: 'Idle', url: `/models/anims/${prefix}_idle.glb` },
    { key: 'Walk', url: `/models/anims/${prefix}_walk.glb` },
    { key: 'Run', url: `/models/anims/${prefix}_run.glb` },
    { key: 'Crouch', url: `/models/anims/${prefix}_crouch.glb` },
    { key: 'Jump', url: `/models/anims/${prefix}_jump.glb` },
  ];

  const promise = (async () => {
    const loader = createLoader();
    const out: THREE.AnimationClip[] = [];
    await Promise.all(
      specs.map(async ({ key, url }) => {
        const buf = await fetchGlbBuffer(url);
        if (!buf) return;
        await new Promise<void>((resolve) => {
          loader.parse(
            buf.slice(0),
            '',
            (gltf) => {
              if (gltf.animations && gltf.animations[0]) {
                out.push(stripRootMotionXZ(gltf.animations[0], key));
              }
              resolve();
            },
            () => resolve(),
          );
        });
      }),
    );
    return out;
  })();

  rpmClipCache.set(gender, promise);
  return promise;
}

function isReadyPlayerMeSkeleton(scene: THREE.Group): boolean {
  let hasRpmHead = false;
  let hasRpmHips = false;
  let hasMixamo = false;
  scene.traverse((obj) => {
    const n = obj.name || '';
    if (/Wolf3D_|EyeLeft|EyeRight/i.test(n)) hasRpmHead = true;
    if (n === 'Hips') hasRpmHips = true;
    if (/^mixamorig/i.test(n)) hasMixamo = true;
  });
  return (hasRpmHead || hasRpmHips) && !hasMixamo;
}

async function attachMocapIfNeeded(
  tpl: LoadedGlbTemplate,
  preferredGender?: 'male' | 'female',
): Promise<LoadedGlbTemplate> {
  if (tpl.animations.length > 0) return tpl;
  if (!preferredGender && !isReadyPlayerMeSkeleton(tpl.scene)) return tpl;
  const clips = await loadRpmAnimationPack(preferredGender || 'male');
  if (clips.length === 0) return tpl;
  return {
    ...tpl,
    animations: clips,
    animCount: clips.length,
  };
}

export async function listCustomCharacters(): Promise<CustomCharacterMeta[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = (req.result as StoredCustomCharacter[]) || [];
        resolve(
          rows
            .map(({ id, name, sizeBytes, boneCount, animCount, createdAt }) => ({
              id,
              name,
              sizeBytes,
              boneCount,
              animCount,
              createdAt,
            }))
            .sort((a, b) => b.createdAt - a.createdAt),
        );
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function importGlbFile(file: File): Promise<CustomCharacterMeta> {
  const buffer = await file.arrayBuffer();
  const id = `glb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const cleanName = file.name.replace(/\.(glb|gltf)$/i, '').slice(0, 32) || 'Custom Soldier';

  const parsed = await attachMocapIfNeeded(await parseGlbArrayBuffer(id, cleanName, buffer));
  const record: StoredCustomCharacter = {
    id,
    name: cleanName,
    sizeBytes: buffer.byteLength,
    boneCount: parsed.boneCount,
    animCount: parsed.animCount,
    createdAt: Date.now(),
    buffer,
  };

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  templateCache.set(id, Promise.resolve(parsed));

  return {
    id: record.id,
    name: record.name,
    sizeBytes: record.sizeBytes,
    boneCount: record.boneCount,
    animCount: record.animCount,
    createdAt: record.createdAt,
  };
}

export async function deleteCustomCharacter(id: string): Promise<void> {
  templateCache.delete(id);
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

function resolveApiOrigin(): string {
  if (typeof window === 'undefined') return '';
  const { protocol, hostname, port } = window.location;
  const isPackagedApk =
    protocol === 'file:' ||
    protocol === 'capacitor:' ||
    protocol === 'ionic:' ||
    ((hostname === 'localhost' || hostname === '127.0.0.1') && port !== '3000');
  return isPackagedApk ? getPublicAppOrigin() : '';
}

export async function ensureGlbUploadedToServer(id: string | null | undefined): Promise<void> {
  if (!id) return;
  if (BUILTIN_GLB_CHARACTERS.some((b) => b.id === id) || REMOVED_BUILTIN_ALIAS[id]) return;
  const apiBase = resolveApiOrigin();
  try {
    const head = await fetch(`${apiBase}/api/custom-characters/${encodeURIComponent(id)}`, {
      method: 'HEAD',
    });
    if (head.ok) return;

    const db = await openDb();
    const record = await new Promise<StoredCustomCharacter | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => resolve(req.result as StoredCustomCharacter | undefined);
      req.onerror = () => reject(req.error);
    });
    if (!record || !record.buffer) return;

    await fetch(`${apiBase}/api/custom-characters/${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: record.buffer,
    });
  } catch {
    // ignore upload failure if offline
  }
}

export function loadGlbTemplate(id: string | null | undefined): Promise<LoadedGlbTemplate | null> {
  if (!id) return Promise.resolve(null);
  const resolvedId = REMOVED_BUILTIN_ALIAS[id] || id;
  const cached = templateCache.get(resolvedId);
  if (cached) return cached;

  const apiBase = resolveApiOrigin();

  const promise = (async (): Promise<LoadedGlbTemplate | null> => {
    try {
      const builtin = BUILTIN_GLB_CHARACTERS.find((b) => b.id === resolvedId);
      if (builtin) {
        const buf = await fetchGlbBuffer(builtin.url);
        if (!buf) {
          templateCache.delete(resolvedId);
          return null;
        }
        const parsed = await parseGlbArrayBuffer(builtin.id, builtin.nameEn, buf);
        return await attachMocapIfNeeded(parsed, builtin.rpmAnimSet);
      }

      const db = await openDb();
      const record = await new Promise<StoredCustomCharacter | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(resolvedId);
        req.onsuccess = () => resolve(req.result as StoredCustomCharacter | undefined);
        req.onerror = () => reject(req.error);
      });
      if (record && record.buffer) {
        return await attachMocapIfNeeded(await parseGlbArrayBuffer(record.id, record.name, record.buffer));
      }

      // Fallback: fetch shared custom GLB from the game server (for online friends!)
      const res = await fetch(`${apiBase}/api/custom-characters/${encodeURIComponent(resolvedId)}`);
      if (!res.ok) {
        templateCache.delete(resolvedId);
        return null;
      }
      const remoteBuffer = await res.arrayBuffer();
      return await attachMocapIfNeeded(await parseGlbArrayBuffer(resolvedId, resolvedId, remoteBuffer));
    } catch {
      templateCache.delete(resolvedId);
      return null;
    }
  })();

  templateCache.set(resolvedId, promise);
  return promise;
}
