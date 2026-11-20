import * as THREE from 'three';
import {
  getOutfitSpec,
  HELMETS,
  type EmoteId,
  type HelmetId,
  type OutfitId,
  type TeamId,
  type VehicleKind,
  type WeaponId,
} from '../game/types';
import { getCamoTexture, getCarpetTexture, getSkinDetailTexture } from './textures';
import { buildWeaponMesh, preloadAllGlbWeapons } from './weaponsModel';
import type { LoadedGlbTemplate } from '../services/customCharacterStore';
import { createGlbRigInstance, type GlbRigInstance } from './glbAdapter';

export interface SoldierRig {
  root: THREE.Group;
  hips: THREE.Group;
  spine: THREE.Group;
  chest: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  leftShoulder: THREE.Group;
  leftElbow: THREE.Group;
  rightShoulder: THREE.Group;
  rightElbow: THREE.Group;
  leftHip: THREE.Group;
  leftKnee: THREE.Group;
  leftAnkle: THREE.Group;
  rightHip: THREE.Group;
  rightKnee: THREE.Group;
  rightAnkle: THREE.Group;
  weaponMount: THREE.Group;
  muzzlePoint: THREE.Object3D;
  headAnchor: THREE.Object3D;
  contactShadow: THREE.Mesh;
  hpSprite: THREE.Sprite | null;
  setHealthBar: (hp: number, name: string, isAlly?: boolean, team?: TeamId, maxHp?: number) => void;
  setTeamMarker: (team: TeamId) => void;
  setLoadout: (outfitId: OutfitId, helmetId: HelmetId, weaponId: WeaponId) => void;
  setCustomGlb: (template: LoadedGlbTemplate | null, flip?: boolean) => void;
  updateAnimation: (params: {
    dt: number;
    time: number;
    moveSpeed: number;
    moveForward?: number;
    moveStrafe?: number;
    crouch: boolean;
    prone?: boolean;
    grounded: boolean;
    peek: number;
    aimPitch: number;
    emote: EmoteId;
    recoil: number;
    throwingGrenade?: boolean;
    punchProgress?: number;
    ridingCarpet?: boolean;
    parachuting?: boolean;
    inVehicle?: VehicleKind | null;
  }) => void;
  dispose: () => void;
}

const _qShoulder = new THREE.Quaternion();
const _qElbow = new THREE.Quaternion();
const _qHandChest = new THREE.Quaternion();
const _qDesiredWeapon = new THREE.Quaternion();
const _qSocketWorld = new THREE.Quaternion();
const _qWrapWorld = new THREE.Quaternion();
const _qDesiredWorld = new THREE.Quaternion();
const _vForegripWorld = new THREE.Vector3();
const _vElbowPoleWorld = new THREE.Vector3();
const _ikP1 = new THREE.Vector3();
const _ikP2 = new THREE.Vector3();
const _ikP3 = new THREE.Vector3();
const _ikToT = new THREE.Vector3();
const _ikDirT = new THREE.Vector3();
const _ikPoleD = new THREE.Vector3();
const _ikPerp = new THREE.Vector3();
const _ikDesMid = new THREE.Vector3();
const _ikCur = new THREE.Vector3();
const _ikDes = new THREE.Vector3();
const _ikQDelta = new THREE.Quaternion();
const _ikQWorld = new THREE.Quaternion();
const _ikQParent = new THREE.Quaternion();
const _eTmp = new THREE.Euler();

function solveProceduralArmIK(
  upper: THREE.Object3D,
  mid: THREE.Object3D,
  endPalm: THREE.Object3D,
  targetWorld: THREE.Vector3,
  poleWorld: THREE.Vector3,
): void {
  upper.updateMatrixWorld(true);
  upper.getWorldPosition(_ikP1);
  mid.getWorldPosition(_ikP2);
  endPalm.getWorldPosition(_ikP3);

  const l1 = _ikP1.distanceTo(_ikP2);
  const l2 = _ikP2.distanceTo(_ikP3);
  if (l1 < 0.02 || l2 < 0.02) return;

  _ikToT.copy(targetWorld).sub(_ikP1);
  const rawDist = _ikToT.length();
  if (rawDist < 1e-4) return;
  _ikDirT.copy(_ikToT).divideScalar(rawDist);

  const d = THREE.MathUtils.clamp(rawDist, Math.abs(l1 - l2) + 0.015, (l1 + l2) * 0.992);
  const cosA = THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));

  _ikPoleD.copy(poleWorld).sub(_ikP1);
  _ikPerp.copy(_ikPoleD).addScaledVector(_ikDirT, -_ikPoleD.dot(_ikDirT));
  if (_ikPerp.lengthSq() < 1e-6) _ikPerp.set(0, -1, 0);
  _ikPerp.normalize();

  _ikDesMid.copy(_ikP1).addScaledVector(_ikDirT, l1 * cosA).addScaledVector(_ikPerp, l1 * sinA);

  _ikCur.copy(_ikP2).sub(_ikP1).normalize();
  _ikDes.copy(_ikDesMid).sub(_ikP1).normalize();
  _ikQDelta.setFromUnitVectors(_ikCur, _ikDes);

  upper.getWorldQuaternion(_ikQWorld);
  _ikQWorld.premultiply(_ikQDelta);
  upper.parent!.getWorldQuaternion(_ikQParent);
  upper.quaternion.copy(_ikQParent).invert().multiply(_ikQWorld);
  upper.updateMatrixWorld(true);

  mid.getWorldPosition(_ikP2);
  endPalm.getWorldPosition(_ikP3);
  _ikCur.copy(_ikP3).sub(_ikP2).normalize();
  _ikDes.copy(targetWorld).sub(_ikP2).normalize();
  _ikQDelta.setFromUnitVectors(_ikCur, _ikDes);

  mid.getWorldQuaternion(_ikQWorld);
  _ikQWorld.premultiply(_ikQDelta);
  mid.parent!.getWorldQuaternion(_ikQParent);
  mid.quaternion.copy(_ikQParent).invert().multiply(_ikQWorld);
  mid.updateMatrixWorld(true);
}

function makeLatheProfile(points: [number, number][], segments = 20): THREE.LatheGeometry {
  const vecs = points.map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(vecs, segments);
  geo.computeVertexNormals();
  return geo;
}

// Athletic Muscular Military Proportions (~1.80m human soldier)
const TORSO_GEO = (() => {
  const geo = makeLatheProfile(
    [
      [0.01, 0.0],
      [0.148, 0.03],
      [0.14, 0.13],  // athletic waist
      [0.175, 0.29], // lats / ribcage
      [0.198, 0.43], // broad pectorals/shoulders
      [0.15, 0.51],  // trapezius
      [0.066, 0.55], // collar base
    ],
    16,
  );
  geo.scale(1.18, 1.0, 0.76);
  return geo;
})();

const PELVIS_GEO = (() => {
  const geo = makeLatheProfile(
    [
      [0.02, -0.09],
      [0.145, -0.04],
      [0.165, 0.05],
      [0.15, 0.12],
      [0.04, 0.14],
    ],
    14,
  );
  geo.scale(1.16, 1.0, 0.82);
  return geo;
})();

// Sculpted Realistic Human Head (brow ridge, orbital eye sockets, nose bridge, cheekbones, jawline & chin)
const HEAD_GEO = (() => {
  const geo = new THREE.SphereGeometry(0.105, 22, 16);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    // Human cranium + vertical face proportion
    x *= 0.86;
    y *= 1.15;
    z *= 0.98;

    // Taper lower face into sculpted jawline & defined chin
    if (y < 0.0) {
      const t = Math.min(1, -y / 0.115);
      const jawFactor = 1.0 - t * 0.26;
      x *= jawFactor;
      if (z > 0) {
        // Project chin subtly forward, taper sides
        const chinPush = Math.exp(-Math.pow(x / 0.036, 2)) * Math.exp(-Math.pow((y + 0.088) / 0.032, 2)) * 0.022;
        z += chinPush;
        // Subtle defined jaw corners
        const jawCorner = Math.exp(-Math.pow((Math.abs(x) - 0.052) / 0.022, 2)) * Math.exp(-Math.pow((y + 0.05) / 0.028, 2)) * 0.012;
        x += Math.sign(x) * jawCorner;
      }
    }

    // Back of skull slight rounding
    if (z < -0.02 && y > 0.01) {
      z -= 0.012;
    }

    // Sculpted Front Facial Plane (+Z)
    if (z > 0.03) {
      // 1. Brow ridge protrusion
      const brow =
        Math.exp(-Math.pow((y - 0.046) / 0.018, 2)) *
        Math.exp(-Math.pow(x / 0.068, 2)) *
        0.012;
      // 2. Orbital eye socket recess (left & right)
      const eyeSocketL = Math.exp(-Math.pow((x - 0.032) / 0.018, 2) - Math.pow((y - 0.024) / 0.014, 2));
      const eyeSocketR = Math.exp(-Math.pow((x + 0.032) / 0.018, 2) - Math.pow((y - 0.024) / 0.014, 2));
      const socketDip = (eyeSocketL + eyeSocketR) * 0.013;
      // 3. Human nose bridge & nasal tip
      const noseProfile =
        Math.exp(-Math.pow(x / 0.015, 2)) *
        Math.exp(-Math.pow((y - 0.008) / 0.03, 2)) *
        (0.025 + Math.max(0, 0.012 - Math.abs(y + 0.008)) * 0.65);
      // 4. Cheekbone fullness
      const cheekL = Math.exp(-Math.pow((x - 0.048) / 0.022, 2) - Math.pow((y + 0.002) / 0.02, 2));
      const cheekR = Math.exp(-Math.pow((x + 0.048) / 0.022, 2) - Math.pow((y + 0.002) / 0.02, 2));
      const cheekBump = (cheekL + cheekR) * 0.011;
      // 5. Mouth / upper & lower lip ridge + philtrum indent
      const lipShelf =
        Math.exp(-Math.pow(x / 0.028, 2)) *
        Math.exp(-Math.pow((y + 0.046) / 0.013, 2)) *
        0.011;

      z += brow - socketDip + noseProfile + cheekBump + lipShelf;
    }

    pos.setXYZ(i, x, y + 0.035, z);
  }
  geo.computeVertexNormals();
  return geo;
})();

const UPPER_ARM_GEO = (() => {
  const geo = makeLatheProfile(
    [
      [0.052, -0.26],
      [0.06, -0.18],
      [0.069, -0.08], // muscular deltoid/bicep
      [0.065, -0.01],
      [0.025, 0.02],
    ],
    16,
  );
  geo.scale(1.04, 1.0, 1.06);
  return geo;
})();

const FOREARM_GEO = (() => {
  const geo = makeLatheProfile(
    [
      [0.038, -0.24],
      [0.049, -0.14],
      [0.058, -0.04],
      [0.048, 0.01],
    ],
    16,
  );
  geo.scale(1.02, 1.0, 1.04);
  return geo;
})();

// Strong Muscular Military Thighs & Calves (fixes skinny/thin legs!)
const THIGH_GEO = (() => {
  const geo = makeLatheProfile(
    [
      [0.072, -0.38],
      [0.098, -0.24],
      [0.118, -0.1],
      [0.112, 0.0],
      [0.04, 0.03],
    ],
    20,
  );
  geo.scale(1.02, 1.0, 1.14);
  return geo;
})();

const CALF_GEO = (() => {
  const geo = makeLatheProfile(
    [
      [0.054, -0.37],
      [0.072, -0.25],
      [0.084, -0.12], // sculpted gastrocnemius calf muscle
      [0.072, -0.02],
      [0.05, 0.01],
    ],
    18,
  );
  geo.scale(0.96, 1.0, 1.08);
  return geo;
})();

const HELMET_DOME_GEO = (() => {
  const geo = makeLatheProfile(
    [
      [0.116, 0.058],
      [0.12, 0.1],
      [0.111, 0.152],
      [0.082, 0.192],
      [0.01, 0.21],
    ],
    22,
  );
  geo.scale(0.95, 1.0, 1.08);
  return geo;
})();

const CONTACT_SHADOW_TEX = (() => {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(0,0,0,0.65)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.22)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
})();

export function createSoldierRig(
  actorId: string,
  initialOutfit: OutfitId,
  initialHelmet: HelmetId,
  initialWeapon: WeaponId,
  maxAnisotropy = 4,
  options?: { showHealthBar?: boolean; skinTone?: number; labelName?: string; isAlly?: boolean },
): SoldierRig {
  const root = new THREE.Group();
  root.userData.actorId = actorId;
  preloadAllGlbWeapons();

  let currentOutfit = initialOutfit;
  let currentHelmet = initialHelmet;
  let currentWeapon = initialWeapon;
  let peekDamped = 0;
  let crouchDamped = 0;
  let proneDamped = 0;
  let legYawDamped = 0;
  let walkPhase = 0;
  let wasGrounded = true;
  let landingDip = 0;

  const outfitSpec = getOutfitSpec(initialOutfit);

  const uniformMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: getCamoTexture(outfitSpec.camoStyle, maxAnisotropy),
    roughness: 0.78,
    metalness: 0.06,
  });

  const vestMat = new THREE.MeshStandardMaterial({
    color: outfitSpec.vestColor,
    roughness: 0.6,
    metalness: 0.2,
  });

  const darkGearMat = new THREE.MeshStandardMaterial({
    color: 0x15181d,
    roughness: 0.44,
    metalness: 0.38,
  });

  const skinMat = new THREE.MeshStandardMaterial({
    color: options?.skinTone ?? 0xd19f7e,
    map: getSkinDetailTexture(maxAnisotropy),
    roughness: 0.56,
    metalness: 0.02,
  });

  const lipMat = new THREE.MeshStandardMaterial({
    color: 0x9e6357,
    roughness: 0.55,
  });

  const beardMat = new THREE.MeshStandardMaterial({
    color: 0x261d17,
    roughness: 0.92,
    transparent: true,
    opacity: 0.42,
  });

  const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xebeef2 });
  const irisMat = new THREE.MeshBasicMaterial({ color: 0x3b2a1e });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x0c0e12 });
  const browMat = new THREE.MeshStandardMaterial({ color: 0x1d1510, roughness: 0.9 });

  const helmetMat = new THREE.MeshStandardMaterial({
    color: HELMETS.find((h) => h.id === initialHelmet)?.color ?? 0x1e2328,
    roughness: 0.4,
    metalness: 0.36,
  });

  const tagHitZone = (obj: THREE.Object3D, zone: 'head' | 'body') => {
    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.userData.actorId = actorId;
        child.userData.hitZone = zone;
      }
    });
  };

  // Ground contact shadow
  const contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.05, 1.05),
    new THREE.MeshBasicMaterial({
      map: CONTACT_SHADOW_TEX,
      transparent: true,
      depthWrite: false,
      opacity: 0.72,
    }),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.025;
  contactShadow.raycast = () => {};
  root.add(contactShadow);

  // ================= FLYING CARPET RIG ("الحصيرة الطائرة") =================
  const flyingCarpetGroup = new THREE.Group();
  flyingCarpetGroup.visible = false;
  const carpetGeo = new THREE.PlaneGeometry(1.55, 2.35, 10, 14);
  carpetGeo.rotateX(-Math.PI / 2);
  // Subtle curled Persian carpet ends
  const cPos = carpetGeo.attributes.position;
  for (let i = 0; i < cPos.count; i++) {
    const cz = cPos.getZ(i);
    const curl = Math.pow(Math.max(0, Math.abs(cz) - 0.85), 2) * 0.42;
    cPos.setY(i, curl);
  }
  carpetGeo.computeVertexNormals();
  const carpetMat = new THREE.MeshStandardMaterial({
    map: getCarpetTexture(maxAnisotropy),
    roughness: 0.72,
    metalness: 0.14,
    side: THREE.DoubleSide,
  });
  const carpetMesh = new THREE.Mesh(carpetGeo, carpetMat);
  carpetMesh.position.y = 0.05;
  carpetMesh.raycast = () => {};
  flyingCarpetGroup.add(carpetMesh);

  const tasselMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.5, metalness: 0.4 });
  [-1, 1].forEach((sz) => {
    for (let tx = -0.62; tx <= 0.62; tx += 0.31) {
      const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.12, 6), tasselMat);
      tassel.rotation.x = sz * (Math.PI * 0.45);
      tassel.position.set(tx, 0.11, sz * 1.24);
      tassel.raycast = () => {};
      flyingCarpetGroup.add(tassel);
    }
  });
  const carpetAura = new THREE.Mesh(
    new THREE.RingGeometry(0.85, 1.15, 28),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
  );
  carpetAura.rotation.x = -Math.PI / 2;
  carpetAura.position.y = 0.01;
  carpetAura.raycast = () => {};
  flyingCarpetGroup.add(carpetAura);
  root.add(flyingCarpetGroup);

  // ================= PARACHUTE RIG ("الباراشوت") =================
  const parachuteGroup = new THREE.Group();
  parachuteGroup.visible = false;
  const chuteGeo = new THREE.SphereGeometry(1.75, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.42);
  const chuteMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.65,
    metalness: 0.08,
    side: THREE.DoubleSide,
  });
  const chuteCanopy = new THREE.Mesh(chuteGeo, chuteMat);
  chuteCanopy.scale.set(1.25, 0.85, 0.92);
  chuteCanopy.position.set(0, 2.35, -0.1);
  chuteCanopy.raycast = () => {};
  parachuteGroup.add(chuteCanopy);

  const chuteTrim = new THREE.Mesh(
    new THREE.TorusGeometry(1.62, 0.055, 6, 24),
    new THREE.MeshBasicMaterial({ color: 0xfef3c7 }),
  );
  chuteTrim.rotation.x = Math.PI / 2;
  chuteTrim.scale.set(1.25, 0.92, 1);
  chuteTrim.position.set(0, 2.66, -0.1);
  chuteTrim.raycast = () => {};
  parachuteGroup.add(chuteTrim);

  const cordMat = new THREE.LineBasicMaterial({ color: 0xcbd5e1, transparent: true, opacity: 0.85 });
  const cordPts: [number, number, number][] = [
    [-1.4, 2.68, 0.65],
    [1.4, 2.68, 0.65],
    [-1.4, 2.68, -0.85],
    [1.4, 2.68, -0.85],
  ];
  cordPts.forEach(([cx, cy, cz]) => {
    const cg = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(cx < 0 ? -0.18 : 0.18, 1.38, -0.05),
      new THREE.Vector3(cx, cy, cz),
    ]);
    const cord = new THREE.Line(cg, cordMat);
    cord.raycast = () => {};
    parachuteGroup.add(cord);
  });
  root.add(parachuteGroup);

  // Hips
  const hips = new THREE.Group();
  hips.position.set(0, 0.89, 0);
  root.add(hips);

  const pelvisMesh = new THREE.Mesh(PELVIS_GEO, uniformMat);
  hips.add(pelvisMesh);

  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.172, 0.172, 0.072, 18), darkGearMat);
  belt.scale.set(1.15, 1, 0.82);
  belt.position.y = 0.07;
  hips.add(belt);
  tagHitZone(hips, 'body');

  // Spine & Chest
  const spine = new THREE.Group();
  spine.position.set(0, 0.09, 0);
  hips.add(spine);

  const chest = new THREE.Group();
  spine.add(chest);

  const torsoMesh = new THREE.Mesh(TORSO_GEO, uniformMat);
  chest.add(torsoMesh);

  // Sculpted Plate Carrier + Tactical Harness + Pouches
  const frontPlate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.174, 0.16, 0.34, 16, 1, false, -0.8, 1.6),
    vestMat,
  );
  frontPlate.position.set(0, 0.29, 0.028);
  frontPlate.scale.set(1.06, 1, 0.8);
  chest.add(frontPlate);

  const backPlate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.174, 0.16, 0.34, 16, 1, false, Math.PI - 0.8, 1.6),
    vestMat,
  );
  backPlate.position.set(0, 0.29, -0.028);
  backPlate.scale.set(1.06, 1, 0.8);
  chest.add(backPlate);

  for (let i = -1; i <= 1; i++) {
    const pouch = new THREE.Mesh(new THREE.CapsuleGeometry(0.026, 0.06, 4, 8), darkGearMat);
    pouch.position.set(i * 0.064, 0.19, 0.148);
    chest.add(pouch);
  }

  // Tactical Backpack + Radio Antenna
  const pack = new THREE.Mesh(new THREE.CapsuleGeometry(0.102, 0.18, 6, 12), vestMat);
  pack.scale.set(1.15, 1.0, 0.62);
  pack.position.set(0, 0.28, -0.172);
  chest.add(pack);

  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.007, 0.26, 6), darkGearMat);
  antenna.position.set(0.09, 0.48, -0.14);
  chest.add(antenna);
  tagHitZone(chest, 'body');

  // Neck & Detailed Sculpted Human Face/Head
  const neck = new THREE.Group();
  neck.position.set(0, 0.52, 0);
  chest.add(neck);

  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.064, 0.115, 16), skinMat);
  neckMesh.position.y = 0.048;
  neck.add(neckMesh);

  // Tactical Collar / Neck Gaiter (sits on neck so the human jawline, lips, nose & eyes show naturally!)
  const neckGaiter = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.078, 0.052, 16), vestMat);
  neckGaiter.position.y = 0.024;
  neck.add(neckGaiter);

  const head = new THREE.Group();
  head.position.set(0, 0.128, 0.01);
  neck.add(head);

  const headMesh = new THREE.Mesh(HEAD_GEO, skinMat);
  head.add(headMesh);

  // Expressive Human Facial Features (Almond Eyes w/ Eyelids & Iris, Lips, Trimmed Military Stubble, Ears)
  [-1, 1].forEach((side) => {
    // Detailed outer ear helix
    const earOuter = new THREE.Mesh(new THREE.TorusGeometry(0.017, 0.006, 6, 12), skinMat);
    earOuter.rotation.y = Math.PI / 2;
    earOuter.scale.set(0.7, 1.25, 0.9);
    earOuter.position.set(side * 0.088, 0.036, -0.004);
    head.add(earOuter);

    // Seated human eye inside orbital socket
    const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.013, 12, 10), eyeWhiteMat);
    sclera.scale.set(1.18, 0.64, 0.52);
    sclera.position.set(side * 0.031, 0.056, 0.086);

    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.0072, 10, 10), irisMat);
    iris.scale.set(1, 1, 0.45);
    iris.position.set(side * 0.031, 0.056, 0.092);

    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 8), pupilMat);
    pupil.position.set(side * 0.031, 0.056, 0.0945);

    // Upper eyelid arch for natural focused human gaze
    const eyelid = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.014, 0.028, 10, 1, false, 0, Math.PI),
      skinMat,
    );
    eyelid.rotation.z = Math.PI / 2;
    eyelid.rotation.y = Math.PI / 2;
    eyelid.position.set(side * 0.031, 0.06, 0.086);

    // Sculpted eyebrow
    const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.0042, 0.024, 4, 6), browMat);
    brow.rotation.z = Math.PI / 2 + side * -0.08;
    brow.position.set(side * 0.032, 0.075, 0.094);

    head.add(sclera, iris, pupil, eyelid, brow);
  });

  // Sculpted Upper & Lower Human Lips
  const upperLip = new THREE.Mesh(new THREE.CapsuleGeometry(0.005, 0.024, 4, 8), lipMat);
  upperLip.rotation.z = Math.PI / 2;
  upperLip.position.set(0, -0.008, 0.094);
  const lowerLip = new THREE.Mesh(new THREE.CapsuleGeometry(0.0055, 0.02, 4, 8), lipMat);
  lowerLip.rotation.z = Math.PI / 2;
  lowerLip.position.set(0, -0.018, 0.092);
  head.add(upperLip, lowerLip);

  // Subtle Military Stubble / Jaw Shading
  const stubble = new THREE.Mesh(
    new THREE.CylinderGeometry(0.076, 0.064, 0.042, 16, 1, false, -0.95, 1.9),
    beardMat,
  );
  stubble.position.set(0, -0.032, 0.022);
  head.add(stubble);

  // Tactical Comms Headset + Boom Mic
  const earCupL = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.022, 12), darkGearMat);
  earCupL.rotation.z = Math.PI / 2;
  earCupL.position.set(0.096, 0.038, -0.006);
  const earCupR = earCupL.clone();
  earCupR.position.x = -0.096;
  const micBoom = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.076, 6), darkGearMat);
  micBoom.rotation.x = Math.PI / 2;
  micBoom.rotation.z = 0.25;
  micBoom.position.set(0.07, -0.008, 0.048);
  head.add(earCupL, earCupR, micBoom);

  const headgearGroup = new THREE.Group();
  head.add(headgearGroup);

  const rebuildHeadgear = (hid: HelmetId) => {
    while (headgearGroup.children.length > 0) {
      headgearGroup.remove(headgearGroup.children[0]);
    }
    const spec = HELMETS.find((h) => h.id === hid) || HELMETS[0];
    helmetMat.color.setHex(spec.color);

    if (hid === 'beret') {
      const beret = new THREE.Mesh(new THREE.SphereGeometry(0.112, 18, 14), helmetMat);
      beret.scale.set(1.06, 0.5, 1.08);
      beret.position.set(0.02, 0.135, -0.01);
      beret.rotation.z = -0.18;
      headgearGroup.add(beret);
      const badge = new THREE.Mesh(
        new THREE.CircleGeometry(0.018, 10),
        new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.8, roughness: 0.2 }),
      );
      badge.position.set(-0.04, 0.13, 0.104);
      headgearGroup.add(badge);
    } else if (hid === 'ghillie_hood') {
      const hood = new THREE.Mesh(HELMET_DOME_GEO, uniformMat);
      hood.scale.set(1.06, 1.06, 1.1);
      headgearGroup.add(hood);
    } else {
      const dome = new THREE.Mesh(HELMET_DOME_GEO, helmetMat);
      headgearGroup.add(dome);
      const railL = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.02, 0.09), darkGearMat);
      railL.position.set(0.114, 0.098, 0.01);
      const railR = railL.clone();
      railR.position.x = -0.114;
      headgearGroup.add(railL, railR);

      if (hid === 'nvg_tactical') {
        const mount = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.032, 0.03), darkGearMat);
        mount.position.set(0, 0.135, 0.114);
        headgearGroup.add(mount);
        const tubeL = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.058, 10), darkGearMat);
        tubeL.rotation.x = Math.PI / 2;
        tubeL.position.set(0.026, 0.125, 0.14);
        const tubeR = tubeL.clone();
        tubeR.position.x = -0.026;
        const glowMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
        const glowL = new THREE.Mesh(new THREE.CircleGeometry(0.011, 10), glowMat);
        glowL.position.set(0.026, 0.125, 0.17);
        const glowR = glowL.clone();
        glowR.position.x = -0.026;
        headgearGroup.add(tubeL, tubeR, glowL, glowR);
      }
    }
    tagHitZone(head, 'head');
  };

  rebuildHeadgear(initialHelmet);

  const headAnchor = new THREE.Object3D();
  headAnchor.position.set(0, 0.25, 0);
  head.add(headAnchor);

  // Arms (Athletic Muscular Biceps & Forearms + Tactical Gloves)
  const buildArm = (side: 1 | -1) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.235, 0.45, 0);
    chest.add(shoulder);

    const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.074, 12, 10), vestMat);
    pauldron.scale.set(0.95, 1.05, 0.98);
    shoulder.add(pauldron);

    const upper = new THREE.Mesh(UPPER_ARM_GEO, uniformMat);
    shoulder.add(upper);

    const elbow = new THREE.Group();
    elbow.position.set(0, -0.26, 0);
    shoulder.add(elbow);

    const elbowPad = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), darkGearMat);
    elbow.add(elbowPad);

    const forearm = new THREE.Mesh(FOREARM_GEO, uniformMat);
    elbow.add(forearm);

    const glove = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.088, 0.074), darkGearMat);
    glove.position.set(0, -0.255, 0.012);
    elbow.add(glove);

    tagHitZone(shoulder, 'body');
    return { shoulder, elbow };
  };

  const leftArm = buildArm(1);
  const rightArm = buildArm(-1);

  // Right-Hand Weapon Grip Mount attached directly inside the right glove (NOT on chest!)
  const rightHandGrip = new THREE.Group();
  rightHandGrip.position.set(0, -0.255, 0.014);
  rightArm.elbow.add(rightHandGrip);

  // Left-Hand Palm Marker inside the left glove for exact 2-bone Foregrip IK
  const leftHandPalmMarker = new THREE.Object3D();
  leftHandPalmMarker.position.set(0, -0.255, 0.014);
  leftArm.elbow.add(leftHandPalmMarker);

  const weaponMount = new THREE.Group();
  rightHandGrip.add(weaponMount);

  const glbHolder = new THREE.Group();
  root.add(glbHolder);
  const glbWeaponAnchor = new THREE.Group();
  glbWeaponAnchor.position.set(-0.14, 1.28, 0.24);
  glbHolder.add(glbWeaponAnchor);

  const alignWeaponInHand = (_wid: WeaponId, wGroup: THREE.Group, wMuzzle: THREE.Object3D, mPt: THREE.Object3D) => {
    // Weapon GLB & fallback both place Pistol GripSocket at exact (0,0,0)!
    wGroup.position.set(0, 0, 0);
    mPt.position.copy(wMuzzle.position);
  };

  let weaponObj = buildWeaponMesh(initialWeapon);
  weaponMount.add(weaponObj.group);
  const muzzlePoint = new THREE.Object3D();
  alignWeaponInHand(initialWeapon, weaponObj.group, weaponObj.muzzlePoint, muzzlePoint);
  weaponMount.add(muzzlePoint);

  let glbInstance: GlbRigInstance | null = null;
  let activeGlbId: string | null = null;

  // Athletic Muscular Legs + Cargo Pockets + Tactical Combat Boots
  const buildLeg = (side: 1 | -1) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.115, -0.02, 0);
    hips.add(hip);

    const thigh = new THREE.Mesh(THIGH_GEO, uniformMat);
    hip.add(thigh);

    // Tactical cargo thigh pocket + thigh strap
    const cargoPocket = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.14, 0.11), uniformMat);
    cargoPocket.position.set(side * 0.105, -0.19, 0.01);
    hip.add(cargoPocket);

    const legStrap = new THREE.Mesh(new THREE.CylinderGeometry(0.108, 0.105, 0.028, 14), darkGearMat);
    legStrap.scale.set(1.04, 1, 1.15);
    legStrap.position.y = -0.17;
    hip.add(legStrap);

    if (side === -1) {
      const holster = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.13, 0.086), darkGearMat);
      holster.position.set(-0.118, -0.18, 0);
      hip.add(holster);
    }

    const knee = new THREE.Group();
    knee.position.set(0, -0.39, 0);
    hip.add(knee);

    const kneePad = new THREE.Mesh(new THREE.SphereGeometry(0.072, 12, 10), darkGearMat);
    kneePad.scale.set(0.95, 1.05, 0.72);
    kneePad.position.set(0, 0, 0.048);
    knee.add(kneePad);

    const calf = new THREE.Mesh(CALF_GEO, uniformMat);
    knee.add(calf);

    const ankle = new THREE.Group();
    ankle.position.set(0, -0.38, 0);
    knee.add(ankle);

    const bootShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.064, 0.13, 12), darkGearMat);
    bootShaft.position.y = -0.02;
    ankle.add(bootShaft);

    const bootFoot = new THREE.Mesh(new THREE.CapsuleGeometry(0.056, 0.125, 6, 10), darkGearMat);
    bootFoot.rotation.x = Math.PI / 2;
    bootFoot.scale.set(1.0, 1, 0.72);
    bootFoot.position.set(0, -0.075, 0.058);
    ankle.add(bootFoot);

    tagHitZone(hip, 'body');
    return { hip, knee, ankle };
  };

  const leftLeg = buildLeg(1);
  const rightLeg = buildLeg(-1);

  // Floating Health Bar Sprite Above Head ("علامة الدم فوق رأس كل شخص")
  let hpSprite: THREE.Sprite | null = null;
  let hpCanvas: HTMLCanvasElement | null = null;
  let hpCtx: CanvasRenderingContext2D | null = null;
  let hpTex: THREE.CanvasTexture | null = null;
  let lastHpVal = -1;
  let lastLabel = '';

  if (options?.showHealthBar) {
    hpCanvas = document.createElement('canvas');
    hpCanvas.width = 256;
    hpCanvas.height = 64;
    hpCtx = hpCanvas.getContext('2d')!;
    hpTex = new THREE.CanvasTexture(hpCanvas);
    hpTex.colorSpace = THREE.SRGBColorSpace;
    const spMat = new THREE.SpriteMaterial({
      map: hpTex,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    });
    hpSprite = new THREE.Sprite(spMat);
    hpSprite.position.set(0, 2.24, 0);
    hpSprite.scale.set(1.55, 0.39, 1);
    hpSprite.raycast = () => {};
    root.add(hpSprite);
  }

  // Team Overhead Indicator (Small Red/Green Downward Arrow above head in Team Mode)
  const teamArrowMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  const teamArrow = new THREE.Mesh(new THREE.ConeGeometry(0.105, 0.19, 4), teamArrowMat);
  teamArrow.rotation.x = Math.PI;
  teamArrow.position.set(0, 2.22, 0);
  teamArrow.visible = false;
  teamArrow.raycast = () => {};
  root.add(teamArrow);

  const setTeamMarker = (team: TeamId) => {
    if (team === 'green') {
      teamArrow.visible = true;
      teamArrowMat.color.setHex(0x22c55e);
    } else if (team === 'red') {
      teamArrow.visible = true;
      teamArrowMat.color.setHex(0xef4444);
    } else {
      teamArrow.visible = false;
    }
  };

  let lastTeamKey = '';
  let lastMaxHp = -1;
  const setHealthBar = (hp: number, name: string, isAlly = false, team?: TeamId, maxHp = 100) => {
    if (!hpCtx || !hpTex || !hpCanvas) return;
    const safeMax = Math.max(1, maxHp);
    const clamped = Math.max(0, Math.min(safeMax, Math.round(hp)));
    const ratio = Math.max(0, Math.min(1, clamped / safeMax));
    const teamKey = `${isAlly ? '1' : '0'}_${team || 'free'}`;
    if (clamped === lastHpVal && safeMax === lastMaxHp && name === lastLabel && teamKey === lastTeamKey) return;
    lastHpVal = clamped;
    lastMaxHp = safeMax;
    lastLabel = name;
    lastTeamKey = teamKey;

    hpCtx.clearRect(0, 0, 256, 64);
    hpCtx.fillStyle = 'rgba(10, 14, 20, 0.78)';
    hpCtx.beginPath();
    hpCtx.roundRect(18, 4, 220, 52, 10);
    hpCtx.fill();

    hpCtx.font = 'bold 20px Cairo, sans-serif';
    hpCtx.textAlign = 'center';
    hpCtx.fillStyle = team === 'green' ? '#6ee7b7' : team === 'red' ? '#fca5a5' : '#f3f4f6';
    hpCtx.fillText(name.slice(0, 16), 128, 28);

    hpCtx.fillStyle = 'rgba(255,255,255,0.18)';
    hpCtx.fillRect(34, 38, 188, 11);

    hpCtx.fillStyle =
      team === 'green'
        ? '#10b981'
        : team === 'red'
          ? '#ef4444'
          : isAlly
            ? '#10b981'
            : ratio > 0.4
              ? '#ef4444'
              : '#f97316';
    hpCtx.fillRect(34, 38, 188 * ratio, 11);

    hpTex.needsUpdate = true;
  };

  if (options?.showHealthBar) {
    setHealthBar(100, options.labelName || 'مقاتل', options.isAlly);
  }

  const setLoadout = (outfitId: OutfitId, helmetId: HelmetId, weaponId: WeaponId) => {
    if (outfitId !== currentOutfit) {
      currentOutfit = outfitId;
      const spec = getOutfitSpec(outfitId);
      uniformMat.map = getCamoTexture(spec.camoStyle, maxAnisotropy);
      uniformMat.needsUpdate = true;
      vestMat.color.setHex(spec.vestColor);
    }
    if (helmetId !== currentHelmet) {
      currentHelmet = helmetId;
      rebuildHeadgear(helmetId);
    }
    if (weaponId !== currentWeapon) {
      currentWeapon = weaponId;
      weaponObj.group.userData.markDisposed?.();
      weaponMount.remove(weaponObj.group);
      weaponObj = buildWeaponMesh(weaponId);
      weaponMount.add(weaponObj.group);
      alignWeaponInHand(weaponId, weaponObj.group, weaponObj.muzzlePoint, muzzlePoint);
    }
  };

  const setCustomGlb = (template: LoadedGlbTemplate | null, flip = false) => {
    if (!template) {
      if (glbInstance) {
        glbHolder.remove(glbInstance.wrapper);
        glbInstance.dispose();
        glbInstance = null;
      }
      activeGlbId = null;
      hips.visible = true;
      if (weaponMount.parent !== rightHandGrip) {
        rightHandGrip.add(weaponMount);
        weaponMount.position.set(0, 0, 0);
        weaponMount.quaternion.identity();
      }
      return;
    }

    if (activeGlbId === template.id && glbInstance) {
      glbInstance.setFlip(flip);
      return;
    }

    if (glbInstance) {
      glbHolder.remove(glbInstance.wrapper);
      glbInstance.dispose();
      glbInstance = null;
    }

    activeGlbId = template.id;
    glbInstance = createGlbRigInstance(template, actorId, flip);
    glbHolder.add(glbInstance.wrapper);
    hips.visible = false;
    const targetMountParent = glbInstance.rightHandSocket || glbWeaponAnchor;
    targetMountParent.add(weaponMount);
    weaponMount.position.set(0, 0, 0);
    weaponMount.quaternion.identity();
  };

  const updateAnimation = ({
    dt,
    time,
    moveSpeed,
    moveForward = moveSpeed,
    moveStrafe = 0,
    crouch,
    prone = false,
    grounded,
    peek,
    aimPitch,
    emote,
    recoil,
    throwingGrenade,
    punchProgress = 0,
    ridingCarpet = false,
    parachuting = false,
    inVehicle = null,
  }: {
    dt: number;
    time: number;
    moveSpeed: number;
    moveForward?: number;
    moveStrafe?: number;
    crouch: boolean;
    prone?: boolean;
    grounded: boolean;
    peek: number;
    aimPitch: number;
    emote: EmoteId;
    recoil: number;
    throwingGrenade?: boolean;
    punchProgress?: number;
    ridingCarpet?: boolean;
    parachuting?: boolean;
    inVehicle?: VehicleKind | null;
  }) => {
    const isVeh = Boolean(inVehicle);
    peekDamped = THREE.MathUtils.damp(peekDamped, prone || ridingCarpet || isVeh ? 0 : peek, 14, dt);
    crouchDamped = THREE.MathUtils.damp(crouchDamped, crouch && !prone && !parachuting && !isVeh ? 1 : 0, 14, dt);
    proneDamped = THREE.MathUtils.damp(proneDamped, prone && !ridingCarpet && !parachuting && !isVeh ? 1 : 0, 12, dt);

    if (!wasGrounded && grounded && !ridingCarpet && !parachuting && !isVeh) {
      landingDip = 1.0;
    }
    wasGrounded = grounded;
    landingDip = THREE.MathUtils.damp(landingDip, 0, 12, dt);

    // Animate Flying Carpet & Parachute rigs
    flyingCarpetGroup.visible = Boolean(ridingCarpet && !isVeh);
    parachuteGroup.visible = Boolean(parachuting && !ridingCarpet && !isVeh);
    contactShadow.visible = !ridingCarpet && !isVeh && grounded;

    if (flyingCarpetGroup.visible) {
      flyingCarpetGroup.position.y = Math.sin(time * 4.4) * 0.05;
      flyingCarpetGroup.rotation.x = THREE.MathUtils.clamp(moveForward * 0.018, -0.2, 0.2);
      flyingCarpetGroup.rotation.z = THREE.MathUtils.clamp(-moveStrafe * 0.022, -0.24, 0.24);
      carpetAura.rotation.z = time * 1.6;
      carpetAura.scale.setScalar(1 + Math.sin(time * 5.2) * 0.06);
    }
    if (parachuteGroup.visible) {
      parachuteGroup.rotation.z =
        THREE.MathUtils.clamp(-moveStrafe * 0.026, -0.2, 0.2) + Math.sin(time * 2.1) * 0.04;
      parachuteGroup.rotation.x = THREE.MathUtils.clamp(moveForward * 0.018, -0.16, 0.16);
    }

    const punchSwing = punchProgress > 0 ? Math.sin(punchProgress * Math.PI) : 0;

    // Keep muzzlePoint synced with async loaded GLB weapon coordinates
    muzzlePoint.position.copy(weaponObj.muzzlePoint.position);

    const isPistol = currentWeapon === 'p18c' || currentWeapon === 'deagle';
    const isFiring = recoil > 0.015;

    if (glbInstance) {
      glbInstance.update({
        dt,
        time,
        moveSpeed: ridingCarpet || isVeh ? 0 : moveSpeed,
        moveForward: ridingCarpet || isVeh ? 0 : moveForward,
        moveStrafe: ridingCarpet || isVeh ? 0 : moveStrafe,
        crouch: Boolean((crouch || isVeh) && !parachuting),
        prone: Boolean(prone && !ridingCarpet && !parachuting && !isVeh),
        grounded: grounded || ridingCarpet || isVeh,
        peek,
        aimPitch,
        emote,
        recoil,
        throwingGrenade,
        punchProgress,
        isPistol,
        firing: isFiring,
      });
      if (ridingCarpet) {
        glbInstance.wrapper.position.y += 0.08 + flyingCarpetGroup.position.y;
      }
      const holdingWeapon =
        !throwingGrenade && punchSwing <= 0.05 && !(emote !== 'none' && moveSpeed < 0.35);
      weaponMount.visible = holdingWeapon;

      if (holdingWeapon) {
        const isGlbSprinting =
          !isFiring &&
          !ridingCarpet &&
          !parachuting &&
          !isVeh &&
          moveSpeed > 4.6 &&
          moveForward > 0.35 &&
          !crouch &&
          !prone;
        const sprintCant = isGlbSprinting ? 0.18 : 0;
        const tacticalYaw = isPistol ? 0.08 : 0.34 + sprintCant * 0.2;

        if (glbInstance.rightHandSocket && weaponMount.parent === glbInstance.rightHandSocket) {
          glbInstance.wrapper.updateMatrixWorld(true);
          glbInstance.wrapper.getWorldQuaternion(_qWrapWorld);
          _eTmp.set(
            -aimPitch * 0.72 - recoil * 0.75 - sprintCant * 0.12,
            tacticalYaw,
            sprintCant * 0.1,
            'XYZ',
          );
          _qDesiredWeapon.setFromEuler(_eTmp);
          _qDesiredWorld.multiplyQuaternions(_qWrapWorld, _qDesiredWeapon);
          glbInstance.rightHandSocket.getWorldQuaternion(_qSocketWorld);
          weaponMount.position.set(0, 0, 0);
          weaponMount.quaternion.copy(_qSocketWorld).invert().multiply(_qDesiredWorld);
        } else {
          glbWeaponAnchor.position.set(
            -0.16,
            THREE.MathUtils.lerp(1.26 - crouchDamped * 0.38, 0.24, proneDamped) +
              (ridingCarpet ? 0.08 + flyingCarpetGroup.position.y : isVeh ? -0.15 : 0),
            THREE.MathUtils.lerp(0.24 - recoil * 0.06, 0.46 - recoil * 0.06, proneDamped),
          );
          weaponMount.rotation.set(-aimPitch * 0.72 - recoil * 0.75, tacticalYaw, 0);
        }

        // Lock GLB left hand cleanly onto weapon ForegripSocket with palm & fingers wrapped around handguard
        weaponMount.updateMatrixWorld(true);
        weaponObj.foregripPoint.getWorldPosition(_vForegripWorld);
        glbInstance.alignLeftHandToWorldTarget(_vForegripWorld, isPistol, aimPitch, recoil, sprintCant);
      }

      if (hpSprite) {
        hpSprite.position.y =
          THREE.MathUtils.lerp(2.22 - crouchDamped * 0.38, 0.92, proneDamped) +
          (parachuting ? 1.05 : ridingCarpet ? 0.12 : 0);
      }
      if (teamArrow.visible) {
        const baseY = hpSprite
          ? hpSprite.position.y + 0.31
          : THREE.MathUtils.lerp(2.04 - crouchDamped * 0.38, 0.78, proneDamped) +
            (parachuting ? 1.05 : ridingCarpet ? 0.12 : inVehicle === 'car' ? -0.45 : inVehicle === 'motorcycle' ? -0.35 : 0) +
            0.16;
        teamArrow.position.y = baseY + Math.sin(time * 4.2) * 0.025;
        teamArrow.rotation.y = time * 1.8;
      }
      return;
    }

    if (emote !== 'none' && moveSpeed < 0.35 && !ridingCarpet && !parachuting) {
      weaponMount.visible = false;
      const t = time * 4.8;
      hips.position.set(0, 0.87 + Math.abs(Math.sin(t * 2)) * 0.05, 0);
      hips.rotation.set(0, 0, 0);
      spine.rotation.set(0, 0, 0);
      spine.position.x = 0;
      chest.rotation.set(0, 0, 0);
      head.rotation.set(0, 0, 0);

      if (emote === 'victory_dance') {
        hips.rotation.y = Math.sin(t) * 0.52;
        chest.rotation.y = Math.sin(t * 1.5) * 0.35;
        rightArm.shoulder.rotation.set(-2.45 + Math.sin(t * 2) * 0.45, 0, -0.35);
        leftArm.shoulder.rotation.set(-2.45 - Math.sin(t * 2) * 0.45, 0, 0.35);
        rightArm.elbow.rotation.x = -0.65;
        leftArm.elbow.rotation.x = -0.65;
        leftLeg.hip.rotation.x = Math.sin(t * 2) * 0.42;
        rightLeg.hip.rotation.x = -Math.sin(t * 2) * 0.42;
        leftLeg.knee.rotation.x = Math.max(0, -leftLeg.hip.rotation.x) * 0.9;
        rightLeg.knee.rotation.x = Math.max(0, -rightLeg.hip.rotation.x) * 0.9;
      } else if (emote === 'salute') {
        hips.position.y = 0.89;
        rightArm.shoulder.rotation.set(-1.35, 0.2, -0.75);
        rightArm.elbow.rotation.set(-1.75, 0, 0);
        leftArm.shoulder.rotation.set(0.05, 0, 0.12);
        leftArm.elbow.rotation.set(-0.2, 0, 0);
        leftLeg.hip.rotation.set(0, 0, 0);
        rightLeg.hip.rotation.set(0, 0, 0);
        leftLeg.knee.rotation.set(0, 0, 0);
        rightLeg.knee.rotation.set(0, 0, 0);
      } else if (emote === 'shadow_box') {
        hips.rotation.y = Math.sin(t * 0.8) * 0.38;
        chest.rotation.x = 0.15;
        leftArm.shoulder.rotation.set(-1.35 + Math.sin(t * 3) * 0.68, 0, 0.25);
        rightArm.shoulder.rotation.set(-1.35 - Math.sin(t * 3) * 0.68, 0, -0.25);
        leftArm.elbow.rotation.x = -1.2 + Math.sin(t * 3) * 0.7;
        rightArm.elbow.rotation.x = -1.2 - Math.sin(t * 3) * 0.7;
        leftLeg.hip.rotation.x = -0.28;
        rightLeg.hip.rotation.x = 0.28;
        leftLeg.knee.rotation.x = 0.4;
        rightLeg.knee.rotation.x = 0.4;
      } else if (emote === 'backflip') {
        const cycle = (time * 0.78) % 1;
        const air = Math.sin(cycle * Math.PI);
        hips.position.y = 0.88 + Math.max(0, air) * 1.15;
        hips.rotation.x = -cycle * Math.PI * 2;
        leftArm.shoulder.rotation.set(-1.85, 0, 0.75);
        rightArm.shoulder.rotation.set(-1.85, 0, -0.75);
        leftArm.elbow.rotation.x = -0.45;
        rightArm.elbow.rotation.x = -0.45;
        leftLeg.hip.rotation.x = -0.95 * air;
        rightLeg.hip.rotation.x = -0.95 * air;
        leftLeg.knee.rotation.x = 1.65 * air;
        rightLeg.knee.rotation.x = 1.65 * air;
      } else if (emote === 'clap') {
        const clapOsc = Math.abs(Math.sin(t * 2.2));
        hips.position.y = 0.88 + clapOsc * 0.03;
        head.rotation.x = Math.sin(t * 2.2) * 0.12;
        leftArm.shoulder.rotation.set(-1.05, 0.45 + clapOsc * 0.28, 0.22);
        rightArm.shoulder.rotation.set(-1.05, -0.45 - clapOsc * 0.28, -0.22);
        leftArm.elbow.rotation.set(-1.35, 0.35, 0);
        rightArm.elbow.rotation.set(-1.35, -0.35, 0);
        leftLeg.hip.rotation.set(0, 0, 0.05);
        rightLeg.hip.rotation.set(0, 0, -0.05);
        leftLeg.knee.rotation.set(0, 0, 0);
        rightLeg.knee.rotation.set(0, 0, 0);
      } else if (emote === 'muscle_flex') {
        const pump = Math.sin(t * 1.4);
        hips.position.y = 0.88;
        chest.rotation.x = -0.14 + pump * 0.08;
        leftArm.shoulder.rotation.set(-0.25, 0.2, 1.38 + pump * 0.14);
        rightArm.shoulder.rotation.set(-0.25, -0.2, -1.38 - pump * 0.14);
        leftArm.elbow.rotation.set(-1.85, 0, 0);
        rightArm.elbow.rotation.set(-1.85, 0, 0);
        leftLeg.hip.rotation.set(-0.1, 0, 0.16);
        rightLeg.hip.rotation.set(-0.1, 0, -0.16);
        leftLeg.knee.rotation.x = 0.22;
        rightLeg.knee.rotation.x = 0.22;
      } else if (emote === 'taunt_wave') {
        hips.position.y = 0.88 + Math.sin(t * 1.6) * 0.03;
        hips.rotation.y = 0.25;
        spine.rotation.z = -0.1;
        rightArm.shoulder.rotation.set(-1.45, -0.2, -0.45);
        rightArm.elbow.rotation.set(-1.2 + Math.sin(t * 2.8) * 0.65, 0, 0);
        leftArm.shoulder.rotation.set(0.15, 0, 0.32);
        leftArm.elbow.rotation.set(-0.75, 0, 0);
        leftLeg.hip.rotation.set(-0.18, 0, 0.12);
        rightLeg.hip.rotation.set(0.14, 0, -0.12);
        leftLeg.knee.rotation.x = 0.32;
        rightLeg.knee.rotation.x = 0.15;
      } else {
        // 'groove'
        hips.position.y = 0.82 + Math.sin(t * 2) * 0.06;
        spine.rotation.z = Math.sin(t) * 0.24;
        leftArm.shoulder.rotation.set(-0.8 + Math.sin(t) * 0.45, 0, 0.65);
        rightArm.shoulder.rotation.set(-0.8 - Math.sin(t) * 0.45, 0, -0.65);
        leftArm.elbow.rotation.x = -0.9;
        rightArm.elbow.rotation.x = -0.9;
        leftLeg.hip.rotation.x = Math.sin(t) * 0.28;
        rightLeg.hip.rotation.x = -Math.sin(t) * 0.28;
        leftLeg.knee.rotation.x = 0.3;
        rightLeg.knee.rotation.x = 0.3;
      }
      if (hpSprite) {
        hpSprite.position.y = 2.22;
      }
      if (teamArrow.visible) {
        teamArrow.position.y = (hpSprite ? hpSprite.position.y + 0.31 : 2.2) + Math.sin(time * 4.2) * 0.025;
        teamArrow.rotation.y = time * 1.8;
      }
      return;
    }

    weaponMount.visible = !throwingGrenade && punchSwing <= 0.05;

    // Realistic Fast Athletic Human Walk / Sprint / Backpedal / Crawl
    const dirSign = moveForward < -0.18 ? -1 : 1;
    if (moveSpeed > 0.16 && grounded && !ridingCarpet && !parachuting && !isVeh) {
      walkPhase += dt * Math.max(6.8, moveSpeed * (proneDamped > 0.5 ? 2.6 : 2.18));
    } else {
      walkPhase = THREE.MathUtils.damp(
        walkPhase,
        Math.round(walkPhase / Math.PI) * Math.PI,
        14,
        dt,
      );
    }

    // Smoothly turn hips/legs toward travel direction while upper torso stays aligned to aim
    let targetLegYaw = 0;
    if (moveSpeed > 0.3 && grounded && proneDamped < 0.35 && !ridingCarpet && !isVeh) {
      if (moveForward >= -0.2) {
        targetLegYaw = THREE.MathUtils.clamp(
          Math.atan2(-moveStrafe, Math.max(0.3, moveForward)),
          -0.92,
          0.92,
        );
      } else {
        targetLegYaw = THREE.MathUtils.clamp(
          -Math.atan2(-moveStrafe, -moveForward),
          -0.75,
          0.75,
        );
      }
    }
    legYawDamped = THREE.MathUtils.damp(legYawDamped, targetLegYaw, 16, dt);

    const speedRatio = ridingCarpet || parachuting || isVeh ? 0 : THREE.MathUtils.clamp(moveSpeed / 7.4, 0, 1);
    const isSprinting = !ridingCarpet && !parachuting && !isVeh && moveSpeed > 5.4 && moveForward > 0.42 && !crouch && !prone;
    const isMovingGround = !ridingCarpet && !parachuting && !isVeh && moveSpeed > 0.18 && grounded;

    const sinL = Math.sin(walkPhase);
    const cosL = Math.cos(walkPhase);
    const sinR = -sinL;
    const cosR = -cosL;

    const strideAmp = speedRatio * (crouch ? 0.64 : isSprinting ? 1.1 : 0.88);
    const kneeAmp = speedRatio * (crouch ? 0.56 : isSprinting ? 1.32 : 1.02);
    const bounce = isMovingGround ? Math.abs(sinL) * speedRatio * (isSprinting ? 0.075 : 0.04) : 0;

    // Natural human hip sway & pelvic twist
    const pelvisTwist = isMovingGround ? sinL * dirSign * 0.13 * speedRatio : 0;
    const pelvisWeightShiftX = isMovingGround ? cosL * 0.025 * speedRatio : 0;
    const pelvisRollZ = isMovingGround ? cosL * 0.042 * speedRatio : 0;

    const inCar = inVehicle === 'car';
    const carWindowLean = inCar ? (recoil > 0.015 || Math.abs(aimPitch) > 0.06 ? -0.14 : -0.02) : 0;
    const standCrouchHipY = inCar
      ? 0.42
      : isVeh
        ? 0.50
        : ridingCarpet
          ? 0.91 + flyingCarpetGroup.position.y - crouchDamped * 0.28
          : parachuting
            ? 0.86
            : 0.89 - crouchDamped * 0.34 - landingDip * 0.15 + (grounded ? bounce : 0.06);

    hips.position.y = THREE.MathUtils.damp(
      hips.position.y,
      THREE.MathUtils.lerp(standCrouchHipY, 0.17, proneDamped),
      16,
      dt,
    );
    hips.position.x = THREE.MathUtils.damp(
      hips.position.x,
      isVeh ? carWindowLean : pelvisWeightShiftX * (1 - proneDamped),
      14,
      dt,
    );
    hips.position.z = THREE.MathUtils.damp(hips.position.z, -proneDamped * 0.25, 14, dt);
    hips.rotation.x = proneDamped * 1.42;
    hips.rotation.y = isVeh
      ? 0
      : ridingCarpet
        ? 0.14
        : (legYawDamped + pelvisTwist) * (1 - proneDamped) + punchSwing * 0.35;

    if (isVeh) {
      // Realistic seated Car / straddled Motorcycle posture while upper torso & weapon remain 100% free to aim/shoot!
      const splay = inVehicle === 'motorcycle' ? 0.26 : 0.1;
      leftLeg.hip.rotation.set(-1.32, 0, splay);
      rightLeg.hip.rotation.set(-1.32, 0, -splay);
      leftLeg.knee.rotation.x = 1.42;
      rightLeg.knee.rotation.x = 1.42;
      leftLeg.ankle.rotation.x = -0.15;
      rightLeg.ankle.rotation.x = -0.15;
    } else if (ridingCarpet) {
      // Surfer / Aladdin tactical stance on Flying Carpet while keeping upper body & weapon free!
      leftLeg.hip.rotation.set(-0.28 - crouchDamped * 0.4, 0.15, 0.09);
      rightLeg.hip.rotation.set(-0.18 - crouchDamped * 0.4, -0.15, -0.09);
      leftLeg.knee.rotation.x = 0.42 + crouchDamped * 0.72;
      rightLeg.knee.rotation.x = 0.34 + crouchDamped * 0.72;
      leftLeg.ankle.rotation.x = -0.14 - crouchDamped * 0.32;
      rightLeg.ankle.rotation.x = -0.14 - crouchDamped * 0.32;
    } else if (parachuting) {
      // Parachute suspension descent posture with gentle wind leg sway
      const sway = Math.sin(time * 2.6) * 0.09;
      leftLeg.hip.rotation.set(-0.34 + sway, 0, 0.08);
      rightLeg.hip.rotation.set(-0.22 - sway, 0, -0.08);
      leftLeg.knee.rotation.x = 0.58;
      rightLeg.knee.rotation.x = 0.46;
      leftLeg.ankle.rotation.x = 0.25;
      rightLeg.ankle.rotation.x = 0.22;
    } else if (!grounded) {
      // Tactical combat air/jump-pad pose: front knee tucked, rear leg extended
      leftLeg.hip.rotation.set(-0.82, 0, 0.05);
      rightLeg.hip.rotation.set(-0.28, 0, -0.05);
      leftLeg.knee.rotation.x = 1.32;
      rightLeg.knee.rotation.x = 0.74;
      leftLeg.ankle.rotation.x = 0.28;
      rightLeg.ankle.rotation.x = 0.25;
    } else if (proneDamped > 0.5) {
      // Realistic belly-flat crawl legs splayed slightly behind
      const crawlAmp = Math.min(1, moveSpeed / 1.8) * 0.3;
      const crawlL = sinL * crawlAmp;
      const crawlR = sinR * crawlAmp;
      leftLeg.hip.rotation.set(0.06 + Math.min(0, crawlL) * 0.5, 0, 0.14 + Math.max(0, crawlL) * 0.45);
      rightLeg.hip.rotation.set(0.06 + Math.min(0, crawlR) * 0.5, 0, -0.14 - Math.max(0, crawlR) * 0.45);
      leftLeg.knee.rotation.x = 0.14 + Math.max(0, crawlL) * 1.45;
      rightLeg.knee.rotation.x = 0.14 + Math.max(0, crawlR) * 1.45;
      leftLeg.ankle.rotation.x = 0.65;
      rightLeg.ankle.rotation.x = 0.65;
    } else if (dirSign < 0) {
      // EXPLICIT STEP-BY-STEP BACKPEDAL GAIT
      const crouchHipAngle = -crouchDamped * 0.74 - landingDip * 0.24;
      const crouchKneeAngle = crouchDamped * 1.34 + landingDip * 0.44;
      const crouchAnkleAngle = -crouchDamped * 0.54 - landingDip * 0.18;

      const backHipAmp = strideAmp * 0.92;
      const liftL = Math.max(0, -cosL * 0.95 + sinL * 0.28);
      const liftR = Math.max(0, -cosR * 0.95 + sinR * 0.28);

      leftLeg.hip.rotation.set(crouchHipAngle + sinL * backHipAmp + 0.08 * speedRatio, 0, 0.025);
      rightLeg.hip.rotation.set(crouchHipAngle + sinR * backHipAmp + 0.08 * speedRatio, 0, -0.025);
      leftLeg.knee.rotation.x = crouchKneeAngle + 0.12 * speedRatio + liftL * kneeAmp * 0.95;
      rightLeg.knee.rotation.x = crouchKneeAngle + 0.12 * speedRatio + liftR * kneeAmp * 0.95;
      leftLeg.ankle.rotation.x = crouchAnkleAngle - sinL * 0.26 * speedRatio + liftL * 0.25 * speedRatio;
      rightLeg.ankle.rotation.x = crouchAnkleAngle - sinR * 0.26 * speedRatio + liftR * 0.25 * speedRatio;
    } else {
      // FORWARD SPRINT / TACTICAL WALK / ZIG-ZAG GAIT
      const crouchHipAngle = -crouchDamped * 0.76 - landingDip * 0.24;
      const crouchKneeAngle = crouchDamped * 1.36 + landingDip * 0.44;
      const crouchAnkleAngle = -crouchDamped * 0.56 - landingDip * 0.18;

      const liftL = Math.max(0, cosL * 0.98 - sinL * 0.34);
      const liftR = Math.max(0, cosR * 0.98 - sinR * 0.34);

      leftLeg.hip.rotation.set(crouchHipAngle - sinL * strideAmp, 0, 0.022);
      rightLeg.hip.rotation.set(crouchHipAngle - sinR * strideAmp, 0, -0.022);
      leftLeg.knee.rotation.x = crouchKneeAngle + 0.08 * speedRatio + liftL * kneeAmp;
      rightLeg.knee.rotation.x = crouchKneeAngle + 0.08 * speedRatio + liftR * kneeAmp;
      leftLeg.ankle.rotation.x = crouchAnkleAngle + sinL * 0.28 * speedRatio - liftL * 0.24 * speedRatio;
      rightLeg.ankle.rotation.x = crouchAnkleAngle + sinR * 0.28 * speedRatio - liftR * 0.24 * speedRatio;
    }

    // Athletic Zig-Zag Banking + Tactical Peek + Spine Counter-Rotation
    const strafeBank = THREE.MathUtils.clamp(moveStrafe * 0.024, -0.13, 0.13) * (1 - proneDamped);
    const carSpineLean = inCar && (recoil > 0.015 || Math.abs(aimPitch) > 0.06) ? -0.16 : 0;
    hips.rotation.z = (strafeBank + pelvisRollZ) * (1 - proneDamped);
    spine.rotation.z = carSpineLean - strafeBank * 0.35 - pelvisRollZ * 0.45;
    spine.position.x = 0;
    spine.rotation.x = THREE.MathUtils.lerp(
      crouchDamped * 0.22 + landingDip * 0.1 + (isSprinting ? 0.22 : dirSign < 0 ? -0.06 * speedRatio : speedRatio * 0.1),
      -0.24,
      proneDamped,
    );
    spine.rotation.y = (ridingCarpet ? -0.14 : (-legYawDamped * 0.88 - pelvisTwist * 0.82)) * (1 - proneDamped) + punchSwing * 0.42;

    const breathe = Math.sin(time * 2.4) * 0.015;
    chest.rotation.x = -aimPitch * 0.42 * (1 - proneDamped) + breathe;
    chest.rotation.y = -sinL * dirSign * speedRatio * 0.08 * (1 - proneDamped);

    neck.rotation.z = peekDamped * 0.48;
    neck.position.x = -peekDamped * 0.015;

    head.rotation.x = THREE.MathUtils.lerp(-aimPitch * 0.45, -1.06 - aimPitch * 0.42, proneDamped);
    head.rotation.y = legYawDamped * 0.14 * (1 - proneDamped);
    head.rotation.z = peekDamped * 0.14;

    if (punchSwing > 0.01 && proneDamped < 0.4) {
      rightArm.shoulder.rotation.set(-1.55 - punchSwing * 0.65, -0.25, -0.18);
      rightArm.elbow.rotation.set(-1.1 + punchSwing * 0.95, 0, 0);
      leftArm.shoulder.rotation.set(-0.85, 0.35, 0.25);
      leftArm.elbow.rotation.set(-1.25, 0, 0);
    } else if (throwingGrenade) {
      rightArm.shoulder.rotation.set(-2.35, -0.2, -0.35);
      rightArm.elbow.rotation.set(-1.1, 0, 0);
      leftArm.shoulder.rotation.set(-0.9, 0.35, 0.35);
      leftArm.elbow.rotation.set(-0.5, 0, 0);
    } else if (proneDamped > 0.5) {
      const crawlArm = moveSpeed > 0.15 ? sinL * 0.32 : 0;
      rightArm.shoulder.rotation.set(-2.05 + crawlArm, 0.18, -0.18);
      rightArm.elbow.rotation.set(-1.25 - Math.max(0, crawlArm) * 0.32, 0, 0);
      leftArm.shoulder.rotation.set(-1.95 - crawlArm, -0.45, 0.18);
      leftArm.elbow.rotation.set(-0.95 - Math.max(0, -crawlArm) * 0.32, 0.25, 0);

      _eTmp.set(rightArm.shoulder.rotation.x, rightArm.shoulder.rotation.y, rightArm.shoulder.rotation.z, 'XYZ');
      _qShoulder.setFromEuler(_eTmp);
      _eTmp.set(rightArm.elbow.rotation.x, rightArm.elbow.rotation.y, rightArm.elbow.rotation.z, 'XYZ');
      _qElbow.setFromEuler(_eTmp);
      _qHandChest.multiplyQuaternions(_qShoulder, _qElbow);
      _eTmp.set(-aimPitch * 0.72 - recoil * 0.75 - proneDamped * 1.18, 0.2, 0, 'XYZ');
      _qDesiredWeapon.setFromEuler(_eTmp);
      weaponMount.position.set(0, 0, 0);
      weaponMount.quaternion.copy(_qHandChest).invert().multiply(_qDesiredWeapon);
    } else {
      // Weapon held cleanly in right hand (GripSocket at 0,0,0 inside rightHandGrip)
      // AND left hand locked via 2-bone analytical IK directly onto weapon's ForegripSocket!
      const armCounter = sinL * dirSign * speedRatio * (isSprinting ? 0.32 : 0.14);
      const sprintCant = isSprinting && !isFiring ? 0.24 : 0;

      rightArm.shoulder.rotation.set(
        -0.44 - aimPitch * 0.48 - recoil * 0.9 + armCounter * 0.45 + sprintCant * 0.18,
        (isPistol ? 0.12 : 0.26) - sprintCant * 0.22,
        -0.14,
      );
      rightArm.elbow.rotation.set(
        (isPistol ? -1.24 : -1.32) - speedRatio * 0.1 - Math.max(0, -armCounter) * 0.2,
        0,
        0,
      );

      _eTmp.set(rightArm.shoulder.rotation.x, rightArm.shoulder.rotation.y, rightArm.shoulder.rotation.z, 'XYZ');
      _qShoulder.setFromEuler(_eTmp);
      _eTmp.set(rightArm.elbow.rotation.x, rightArm.elbow.rotation.y, rightArm.elbow.rotation.z, 'XYZ');
      _qElbow.setFromEuler(_eTmp);
      _qHandChest.multiplyQuaternions(_qShoulder, _qElbow);

      const weaponYawInChest = isPistol ? 0.08 + sprintCant * 0.22 : 0.32 + sprintCant * 0.3;
      _eTmp.set(
        -aimPitch * 0.72 - recoil * 0.75 - sprintCant * 0.14,
        weaponYawInChest,
        sprintCant * 0.12,
        'XYZ',
      );
      _qDesiredWeapon.setFromEuler(_eTmp);
      weaponMount.position.set(0, 0, 0);
      weaponMount.quaternion.copy(_qHandChest).invert().multiply(_qDesiredWeapon);

      // Reset left arm before solving analytical IK onto exact weapon ForegripSocket world coords
      leftArm.shoulder.rotation.set(-0.7, -0.4, 0.1);
      leftArm.elbow.rotation.set(-0.6, 0, 0);
      root.updateMatrixWorld(true);
      weaponObj.foregripPoint.getWorldPosition(_vForegripWorld);
      _vElbowPoleWorld.set(0.36, -0.15, 0.08);
      chest.localToWorld(_vElbowPoleWorld);
      solveProceduralArmIK(
        leftArm.shoulder,
        leftArm.elbow,
        leftHandPalmMarker,
        _vForegripWorld,
        _vElbowPoleWorld,
      );
    }

    if (hpSprite) {
      hpSprite.position.y =
        THREE.MathUtils.lerp(2.22 - crouchDamped * 0.38, 0.92, proneDamped) +
        (parachuting ? 1.05 : ridingCarpet ? 0.12 : 0);
    }
    if (teamArrow.visible) {
      const baseY = hpSprite
        ? hpSprite.position.y + 0.31
        : THREE.MathUtils.lerp(2.04 - crouchDamped * 0.38, 0.78, proneDamped) +
          (parachuting ? 1.05 : ridingCarpet ? 0.12 : inVehicle === 'car' ? -0.45 : inVehicle === 'motorcycle' ? -0.35 : 0) +
          0.16;
      teamArrow.position.y = baseY + Math.sin(time * 4.2) * 0.025;
      teamArrow.rotation.y = time * 1.8;
    }
  };

  const dispose = () => {
    weaponObj.group.userData.markDisposed?.();
    if (glbInstance) {
      glbInstance.dispose();
      glbInstance = null;
    }
    uniformMat.dispose();
    vestMat.dispose();
    darkGearMat.dispose();
    skinMat.dispose();
    lipMat.dispose();
    beardMat.dispose();
    eyeWhiteMat.dispose();
    irisMat.dispose();
    pupilMat.dispose();
    browMat.dispose();
    helmetMat.dispose();
    carpetMat.dispose();
    tasselMat.dispose();
    chuteMat.dispose();
    cordMat.dispose();
    flyingCarpetGroup.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
    parachuteGroup.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
    hpTex?.dispose();
    hpSprite?.material.dispose();
    teamArrow.geometry.dispose();
    teamArrowMat.dispose();
  };

  return {
    root,
    hips,
    spine,
    chest,
    neck,
    head,
    leftShoulder: leftArm.shoulder,
    leftElbow: leftArm.elbow,
    rightShoulder: rightArm.shoulder,
    rightElbow: rightArm.elbow,
    leftHip: leftLeg.hip,
    leftKnee: leftLeg.knee,
    leftAnkle: leftLeg.ankle,
    rightHip: rightLeg.hip,
    rightKnee: rightLeg.knee,
    rightAnkle: rightLeg.ankle,
    weaponMount,
    muzzlePoint,
    headAnchor,
    contactShadow,
    hpSprite,
    setHealthBar,
    setTeamMarker,
    setLoadout,
    setCustomGlb,
    updateAnimation,
    dispose,
  };
}
