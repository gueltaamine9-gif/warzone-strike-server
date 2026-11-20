import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { getWeaponSpec, WEAPONS, type WeaponId } from '../game/types';
import { getPublicAppOrigin } from '../services/multiplayerClient';

interface CachedGlbWeapon {
  scene: THREE.Group;
  muzzleLocal: THREE.Vector3;
  foregripLocal: THREE.Vector3;
}

const weaponGlbCache = new Map<WeaponId, Promise<CachedGlbWeapon | null>>();
const sharedWeaponLoader = new GLTFLoader();

function resolveWeaponAssetOrigin(): string {
  if (typeof window === 'undefined') return '';
  const { protocol, hostname, port } = window.location;
  const isPackagedApk =
    protocol === 'file:' ||
    protocol === 'capacitor:' ||
    protocol === 'ionic:' ||
    ((hostname === 'localhost' || hostname === '127.0.0.1') && port !== '3000');
  return isPackagedApk ? getPublicAppOrigin() : '';
}

function loadGlbWeaponTemplate(weaponId: WeaponId): Promise<CachedGlbWeapon | null> {
  const existing = weaponGlbCache.get(weaponId);
  if (existing) return existing;

  const url = `/models/weapons/${weaponId}.glb`;
  const promise = (async (): Promise<CachedGlbWeapon | null> => {
    try {
      const originPrefix = resolveWeaponAssetOrigin();
      let res = await fetch(`${originPrefix}${url}`).catch(() => null);
      if (!res || !res.ok) {
        res = await fetch(`${getPublicAppOrigin()}${url}`);
      }
      if (!res.ok) {
        weaponGlbCache.delete(weaponId);
        return null;
      }
      const buf = await res.arrayBuffer();
      const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
        sharedWeaponLoader.parse(buf, '', resolve, reject);
      });

      const scene = gltf.scene;
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });

      scene.updateMatrixWorld(true);
      const mzObj = scene.getObjectByName('MuzzlePoint');
      const fgObj = scene.getObjectByName('ForegripSocket');
      const muzzleLocal = mzObj ? mzObj.position.clone() : new THREE.Vector3(0, 0.086, 0.72);
      const foregripLocal = fgObj ? fgObj.position.clone() : new THREE.Vector3(0, 0.025, 0.25);

      return { scene, muzzleLocal, foregripLocal };
    } catch {
      weaponGlbCache.delete(weaponId);
      return null;
    }
  })();

  weaponGlbCache.set(weaponId, promise);
  return promise;
}

export function preloadAllGlbWeapons(): void {
  for (const w of WEAPONS) {
    void loadGlbWeaponTemplate(w.id);
  }
}

function buildFallbackWeaponVisual(weaponId: WeaponId): {
  visual: THREE.Group;
  muzzleLocal: THREE.Vector3;
  foregripLocal: THREE.Vector3;
} {
  const spec = getWeaponSpec(weaponId);
  const visual = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color: spec.bodyColor,
    roughness: 0.36,
    metalness: 0.78,
  });

  const accentMat = new THREE.MeshStandardMaterial({
    color: spec.accentColor,
    roughness: spec.id === 'kar98' || spec.id === 'akm' || spec.id === 'svd' ? 0.62 : 0.32,
    metalness: spec.id === 'kar98' || spec.id === 'akm' || spec.id === 'svd' ? 0.14 : 0.72,
  });

  const darkSteelMat = new THREE.MeshStandardMaterial({
    color: 0x101318,
    roughness: 0.24,
    metalness: 0.9,
  });

  const chromeSteelMat = new THREE.MeshStandardMaterial({
    color: spec.id === 'deagle' ? 0x9aa4b2 : 0x262b33,
    roughness: 0.22,
    metalness: 0.92,
  });

  const lensMat = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8,
    roughness: 0.06,
    metalness: 0.2,
    clearcoat: 1.0,
    emissive: 0x0ea5e9,
    emissiveIntensity: 0.28,
  });

  if (spec.type === 'pistol') {
    const isDeagle = spec.id === 'deagle';
    const slideLen = isDeagle ? 0.26 : 0.21;
    const slideH = isDeagle ? 0.044 : 0.036;
    const slideW = isDeagle ? 0.038 : 0.032;

    const slide = new THREE.Mesh(
      new THREE.BoxGeometry(slideW, slideH, slideLen),
      isDeagle ? chromeSteelMat : bodyMat,
    );
    slide.position.set(0, 0.088, 0.08);
    slide.castShadow = true;
    visual.add(slide);

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(slideW * 0.94, 0.026, slideLen * 0.9),
      accentMat,
    );
    frame.position.set(0, 0.06, 0.075);
    visual.add(frame);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(isDeagle ? 0.011 : 0.0085, isDeagle ? 0.011 : 0.0085, isDeagle ? 0.08 : 0.04, 12),
      darkSteelMat,
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.09, 0.08 + slideLen * 0.5 + (isDeagle ? 0.028 : 0.012));
    visual.add(barrel);

    // Pistol grip centered directly on (0,0,0)
    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(slideW * 0.88, 0.125, 0.044),
      darkSteelMat,
    );
    grip.position.set(0, -0.004, 0);
    grip.rotation.x = 0.24;
    visual.add(grip);

    if (spec.id === 'p18c') {
      const extMag = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.065, 0.032), darkSteelMat);
      extMag.position.set(0, -0.07, -0.018);
      extMag.rotation.x = 0.24;
      visual.add(extMag);
    }

    return {
      visual,
      muzzleLocal: new THREE.Vector3(0, 0.09, 0.08 + slideLen * 0.5 + (isDeagle ? 0.07 : 0.04)),
      foregripLocal: new THREE.Vector3(0.01, -0.015, 0.035),
    };
  }

  const isLongGun = spec.type === 'sniper' || spec.type === 'dmr';
  const isHeavySniper = spec.id === 'amr' || spec.id === 'barrett' || spec.id === 'cheytac';
  const recOffsetZ = spec.id === 'groza' ? -0.01 : 0.09;
  const receiverLen = spec.type === 'sniper' ? 0.44 : spec.type === 'dmr' ? 0.4 : spec.type === 'smg' ? 0.27 : 0.36;

  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.084, receiverLen), bodyMat);
  receiver.position.set(0, 0.072, recOffsetZ);
  receiver.castShadow = true;
  visual.add(receiver);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.114, 0.044), darkSteelMat);
  grip.position.set(0, -0.004, 0);
  grip.rotation.x = 0.28;
  visual.add(grip);

  const barrelLen = isHeavySniper
    ? 0.78
    : spec.type === 'sniper'
      ? 0.66
      : spec.type === 'dmr'
        ? 0.54
        : spec.id === 'm249'
          ? 0.52
          : spec.id === 'groza'
            ? 0.34
            : spec.type === 'smg'
              ? 0.24
              : 0.45;
  const barrelStartZ = recOffsetZ + receiverLen * 0.5;
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(isLongGun ? 0.013 : 0.011, isLongGun ? 0.016 : 0.014, barrelLen, 12),
    darkSteelMat,
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.086, barrelStartZ + barrelLen * 0.5);
  barrel.castShadow = true;
  visual.add(barrel);

  const handguardLen = Math.min(0.42, barrelLen * 0.58);
  const handguard = new THREE.Mesh(
    new THREE.BoxGeometry(spec.id === 'm249' ? 0.068 : 0.054, 0.058, handguardLen),
    accentMat,
  );
  handguard.position.set(0, 0.074, barrelStartZ + handguardLen * 0.5);
  visual.add(handguard);

  const foregripZ = spec.type === 'smg' ? 0.19 : 0.25;
  const foregrip = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.076, 0.036), darkSteelMat);
  foregrip.position.set(0, 0.022, foregripZ);
  foregrip.rotation.x = 0.2;
  visual.add(foregrip);

  const stockLen = spec.type === 'smg' || spec.id === 'groza' ? 0.18 : 0.28;
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.072, stockLen), accentMat);
  stock.position.set(0, 0.06, recOffsetZ - receiverLen * 0.5 - stockLen * 0.45);
  visual.add(stock);

  if (spec.hasOpticalScope) {
    const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.32, 10), darkSteelMat);
    scopeTube.rotation.x = Math.PI / 2;
    scopeTube.position.set(0, 0.155, recOffsetZ + 0.04);
    visual.add(scopeTube);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.03, 10), lensMat);
    lens.position.set(0, 0.155, recOffsetZ + 0.235);
    visual.add(lens);
  }

  const muzzleTipZ = barrelStartZ + barrelLen;
  return {
    visual,
    muzzleLocal: new THREE.Vector3(0, 0.086, muzzleTipZ + (isLongGun ? 0.16 : 0.08)),
    foregripLocal: new THREE.Vector3(0, 0.025, foregripZ),
  };
}

export function buildWeaponMesh(weaponId: WeaponId): {
  group: THREE.Group;
  muzzlePoint: THREE.Object3D;
  foregripPoint: THREE.Object3D;
} {
  const group = new THREE.Group();
  const modelHolder = new THREE.Group();
  group.add(modelHolder);

  const fallback = buildFallbackWeaponVisual(weaponId);
  modelHolder.add(fallback.visual);

  const muzzlePoint = new THREE.Object3D();
  muzzlePoint.position.copy(fallback.muzzleLocal);
  group.add(muzzlePoint);

  const foregripPoint = new THREE.Object3D();
  foregripPoint.position.copy(fallback.foregripLocal);
  group.add(foregripPoint);

  let disposed = false;
  group.userData.markDisposed = () => {
    disposed = true;
  };

  void loadGlbWeaponTemplate(weaponId).then((tpl) => {
    if (!tpl || disposed) return;
    while (modelHolder.children.length > 0) {
      const child = modelHolder.children[0];
      modelHolder.remove(child);
      child.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (m.isMesh) {
          m.geometry?.dispose();
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mat of mats) mat?.dispose();
        }
      });
    }
    const glbClone = tpl.scene.clone(true);
    glbClone.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    modelHolder.add(glbClone);
    muzzlePoint.position.copy(tpl.muzzleLocal);
    foregripPoint.position.copy(tpl.foregripLocal);
  });

  return { group, muzzlePoint, foregripPoint };
}
