import * as THREE from 'three';
import { getMapSpec, type GrenadeType, type MapId, type VehicleKind, type WeaponId } from '../game/types';
import {
  getAsphaltTexture,
  getCarpetTexture,
  getConcreteBuildingTexture,
  getContainerTexture,
  getCrateTexture,
  getSandstoneRuinsTexture,
} from './textures';
import { buildVehicleMesh, type BuiltVehicleRig } from './vehiclesAndGrenades';
import { buildWeaponMesh } from './weaponsModel';

export interface BoxCollider {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface RampSurface {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  startY: number;
  endY: number;
  axis: 'x' | 'z';
}

export interface ElevatorUnit {
  id: string;
  x: number;
  z: number;
  halfW: number;
  halfD: number;
  minY: number;
  maxY: number;
  currentY: number;
  targetY: number;
  speed: number;
  platform: THREE.Group;
  indicatorMat: THREE.MeshBasicMaterial;
}

export interface SupplyCrate {
  id: string;
  x: number;
  y: number;
  z: number;
  weaponId?: WeaponId;
  grenadeType?: GrenadeType;
  isMedkit?: boolean;
  isGroundWeapon?: boolean;
  isGrenadeDrop?: boolean;
  isDynamicDrop?: boolean;
  available: boolean;
  respawnAt: number;
  mesh: THREE.Group;
}

export interface JumpPad {
  id: string;
  x: number;
  y: number;
  z: number;
  targetX: number;
  targetY?: number;
  targetZ: number;
  isRooftop?: boolean;
  radius: number;
  cooldownUntil: number;
  mesh: THREE.Group;
  ringMat: THREE.MeshBasicMaterial;
  chevrons: THREE.Group;
}

export interface FlyingCarpetSpawn {
  id: string;
  x: number;
  y: number;
  z: number;
  available: boolean;
  respawnAt: number;
  mesh: THREE.Group;
}

export interface VehicleSpawn {
  id: string;
  kind: VehicleKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  velX: number;
  velZ: number;
  wheelSpin: number;
  steerAngle: number;
  driverId: string | null;
  passengerId: string | null;
  rig: BuiltVehicleRig;
}

export interface BuiltMap {
  group: THREE.Group;
  colliders: BoxCollider[];
  raycastTargets: THREE.Object3D[];
  walkableFloors: BoxCollider[];
  ramps: RampSurface[];
  elevators: ElevatorUnit[];
  crates: SupplyCrate[];
  jumpPads: JumpPad[];
  carpetSpawns: FlyingCarpetSpawn[];
  vehicles: VehicleSpawn[];
  spawnPoints: THREE.Vector3[];
  coverSpots: THREE.Vector3[];
  arenaRadius: number;
  getTerrainHeight: (x: number, z: number) => number;
  dispose: () => void;
}

export function buildGameMap(mapId: MapId, maxAnisotropy = 4): BuiltMap {
  const spec = getMapSpec(mapId);
  const group = new THREE.Group();
  const colliders: BoxCollider[] = [];
  const raycastTargets: THREE.Object3D[] = [];
  const walkableFloors: BoxCollider[] = [];
  const ramps: RampSurface[] = [];
  const elevators: ElevatorUnit[] = [];
  const crates: SupplyCrate[] = [];
  const jumpPads: JumpPad[] = [];
  const carpetSpawns: FlyingCarpetSpawn[] = [];
  const vehicles: VehicleSpawn[] = [];
  const spawnPoints: THREE.Vector3[] = [];
  const coverSpots: THREE.Vector3[] = [];
  const disposables: { dispose: () => void }[] = [];

  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const getTerrainHeight = (x: number, z: number): number => {
    const dist = Math.hypot(x, z);
    if (mapId === 'iraq_ruins') {
      const dunes = Math.sin(x * 0.05) * Math.cos(z * 0.06) * 0.75;
      const outerRise = Math.max(0, (dist - 132) * 0.22);
      return dunes + outerRise;
    }
    return 0;
  };

  // Ground Mesh (48x48 terrain grid for fast, lag-free mobile & desktop rendering!)
  const groundSize = 480;
  const segments = mapId === 'iraq_ruins' ? 48 : 16;
  const groundGeo = track(new THREE.PlaneGeometry(groundSize, groundSize, segments, segments));
  groundGeo.rotateX(-Math.PI / 2);

  if (segments > 16) {
    const pos = groundGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const gx = pos.getX(i);
      const gz = pos.getZ(i);
      pos.setY(i, getTerrainHeight(gx, gz));
    }
    groundGeo.computeVertexNormals();
  }

  let groundTex: THREE.CanvasTexture;
  if (mapId === 'iraq_ruins') {
    groundTex = getSandstoneRuinsTexture(28, 28, maxAnisotropy);
  } else {
    groundTex = getAsphaltTexture(32, maxAnisotropy);
  }

  const groundMat = track(
    new THREE.MeshStandardMaterial({
      color: mapId === 'iraq_ruins' ? 0x6b5842 : 0xffffff,
      map: groundTex,
      roughness: 0.92,
      metalness: 0.05,
    }),
  );
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.receiveShadow = true;
  group.add(groundMesh);
  raycastTargets.push(groundMesh);

  const concreteMat = track(
    new THREE.MeshStandardMaterial({
      map: getConcreteBuildingTexture(2, 2, maxAnisotropy),
      roughness: 0.82,
      metalness: 0.1,
    }),
  );
  const darkWallMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x222730,
      roughness: 0.85,
      metalness: 0.12,
    }),
  );
  const floorSlabMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x2b313b,
      roughness: 0.78,
      metalness: 0.18,
    }),
  );
  const steelMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x353c47,
      roughness: 0.38,
      metalness: 0.75,
    }),
  );
  const crateMat = track(
    new THREE.MeshStandardMaterial({
      map: getCrateTexture(maxAnisotropy),
      roughness: 0.75,
      metalness: 0.15,
    }),
  );
  const sandstoneMat = track(
    new THREE.MeshStandardMaterial({
      map: getSandstoneRuinsTexture(2, 2, maxAnisotropy),
      roughness: 0.9,
      metalness: 0.05,
    }),
  );
  const rockMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x2a2f33,
      roughness: 0.94,
      metalness: 0.04,
    }),
  );

  const boxGeoCache = new Map<string, THREE.BoxGeometry>();
  const getBoxGeo = (w: number, h: number, d: number): THREE.BoxGeometry => {
    const key = `${w.toFixed(2)}_${h.toFixed(2)}_${d.toFixed(2)}`;
    let g = boxGeoCache.get(key);
    if (!g) {
      g = track(new THREE.BoxGeometry(w, h, d));
      boxGeoCache.set(key, g);
    }
    return g;
  };

  const addSolidBox = (
    x: number,
    yCenter: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    walkableTop = false,
    castShadow = true,
  ) => {
    const geo = getBoxGeo(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, yCenter, z);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    group.add(mesh);
    raycastTargets.push(mesh);

    const box: BoxCollider = {
      minX: x - w / 2,
      maxX: x + w / 2,
      minY: yCenter - h / 2,
      maxY: yCenter + h / 2,
      minZ: z - d / 2,
      maxZ: z + d / 2,
    };
    colliders.push(box);
    if (walkableTop) {
      walkableFloors.push(box);
    }
    return mesh;
  };

  // Helper to place tactical crate cluster + register AI cover spots around it
  const addCrateCluster = (x: number, z: number, yBase?: number) => {
    const y = yBase ?? getTerrainHeight(x, z);
    addSolidBox(x, y + 0.65, z, 1.3, 1.3, 1.3, crateMat, true, false);
    addSolidBox(x + 1.35, y + 0.55, z + 0.35, 1.1, 1.1, 1.1, crateMat, true, false);
    addSolidBox(x + 0.35, y + 1.7, z, 0.95, 0.9, 0.95, crateMat, true, false);
    coverSpots.push(
      new THREE.Vector3(x - 1.5, y, z),
      new THREE.Vector3(x + 2.6, y, z + 0.4),
      new THREE.Vector3(x, y, z - 1.6),
      new THREE.Vector3(x, y, z + 1.6),
    );
  };

  const addStairs = (
    x: number,
    z: number,
    w: number,
    len: number,
    startY: number,
    endY: number,
    axis: 'x' | 'z',
    mat: THREE.Material,
  ) => {
    const steps = 8;
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);
    const stepH = Math.abs(endY - startY) / steps + 0.16;
    const sw = axis === 'x' ? len / steps + 0.08 : w;
    const sd = axis === 'z' ? len / steps + 0.08 : w;
    const stepGeo = getBoxGeo(sw, stepH, sd);
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      const sy = THREE.MathUtils.lerp(startY, endY, t);
      const sx = axis === 'x' ? x - len / 2 + t * len : x;
      const sz = axis === 'z' ? z - len / 2 + t * len : z;
      const step = new THREE.Mesh(stepGeo, mat);
      step.position.set(sx, sy - stepH / 2, sz);
      step.castShadow = false;
      step.receiveShadow = true;
      group.add(step);
      raycastTargets.push(step);
    }
    ramps.push({
      minX: x - (axis === 'x' ? len / 2 : w / 2),
      maxX: x + (axis === 'x' ? len / 2 : w / 2),
      minZ: z - (axis === 'z' ? len / 2 : w / 2),
      maxZ: z + (axis === 'z' ? len / 2 : w / 2),
      startY,
      endY,
      axis,
    });
    const railH = 0.85;
    const midY = (minY + maxY) / 2 + railH / 2;
    const dx = axis === 'x' ? len : w;
    const rise = endY - startY;
    const angle = Math.atan2(rise, len);
    const railGeo = track(
      new THREE.BoxGeometry(
        axis === 'x' ? Math.hypot(len, rise) : 0.1,
        0.1,
        axis === 'z' ? Math.hypot(len, rise) : 0.1,
      ),
    );
    [-1, 1].forEach((side) => {
      const rail = new THREE.Mesh(railGeo, steelMat);
      rail.position.set(
        axis === 'x' ? x : x + side * (dx / 2 - 0.08),
        midY,
        axis === 'z' ? z : z + side * (dx / 2 - 0.08),
      );
      if (axis === 'z') rail.rotation.x = -angle;
      else rail.rotation.z = angle;
      group.add(rail);
    });
  };

  const addElevator = (id: string, x: number, z: number, minY: number, maxY: number) => {
    const shaftGroup = new THREE.Group();
    const halfW = 1.75;
    const halfD = 1.75;

    // 4 heavy steel shaft columns + overhead pulley motor room + cables
    [
      [-halfW, -halfD],
      [halfW, -halfD],
      [-halfW, halfD],
      [halfW, halfD],
    ].forEach(([ox, oz]) => {
      const col = new THREE.Mesh(
        track(new THREE.BoxGeometry(0.22, maxY + 3.4, 0.22)),
        steelMat,
      );
      col.position.set(x + ox, (maxY + 3.4) / 2, z + oz);
      col.castShadow = true;
      shaftGroup.add(col);
    });

    // Overhead hoist motor crown & steel guide cables
    const motorHead = new THREE.Mesh(
      track(new THREE.BoxGeometry(halfW * 2 + 0.35, 0.55, halfD * 2 + 0.35)),
      darkWallMat,
    );
    motorHead.position.set(x, maxY + 3.35, z);
    motorHead.castShadow = true;
    shaftGroup.add(motorHead);

    [-1, 1].forEach((side) => {
      const cable = new THREE.Mesh(
        track(new THREE.CylinderGeometry(0.025, 0.025, maxY + 3.1, 6)),
        steelMat,
      );
      cable.position.set(x, (maxY + 3.1) / 2, z + side * (halfD - 0.16));
      shaftGroup.add(cable);
    });

    // Ground & Roof External Call Button Pillars (glowing green call button)
    const callGlowMat = track(new THREE.MeshBasicMaterial({ color: 0x10b981 }));
    [minY, maxY].forEach((lvlY) => {
      const post = new THREE.Mesh(track(new THREE.BoxGeometry(0.22, 1.15, 0.22)), darkWallMat);
      post.position.set(x + halfW + 0.35, lvlY + 0.58, z + halfD - 0.3);
      const btn = new THREE.Mesh(track(new THREE.BoxGeometry(0.14, 0.22, 0.08)), callGlowMat);
      btn.position.set(x + halfW + 0.35, lvlY + 0.92, z + halfD - 0.18);
      shaftGroup.add(post, btn);
    });

    // Moving Elevator Cabin ("لاصونصيار حقيقي") - Pass-through on -X (building roof) and +X (ground entrance)
    const platform = new THREE.Group();
    platform.position.set(x, minY, z);

    const floorMesh = new THREE.Mesh(
      track(new THREE.BoxGeometry(halfW * 2 - 0.1, 0.24, halfD * 2 - 0.1)),
      steelMat,
    );
    floorMesh.position.y = -0.12;
    floorMesh.receiveShadow = true;
    platform.add(floorMesh);

    const indicatorMat = track(new THREE.MeshBasicMaterial({ color: 0x10b981 }));
    const trim = new THREE.Mesh(
      track(new THREE.BoxGeometry(halfW * 2 - 0.24, 0.06, halfD * 2 - 0.24)),
      indicatorMat,
    );
    trim.position.y = 0.02;
    platform.add(trim);

    const glassMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.3,
        roughness: 0.1,
        metalness: 0.35,
      }),
    );

    // Side glass cabin walls (-Z and +Z) + handrails + cabin roof canopy & interior LED strip
    [-1, 1].forEach((sideZ) => {
      const glassSide = new THREE.Mesh(
        track(new THREE.BoxGeometry(halfW * 2 - 0.22, 2.35, 0.07)),
        glassMat,
      );
      glassSide.position.set(0, 1.18, sideZ * (halfD - 0.12));
      const rail = new THREE.Mesh(
        track(new THREE.BoxGeometry(halfW * 2 - 0.26, 0.07, 0.1)),
        steelMat,
      );
      rail.position.set(0, 1.0, sideZ * (halfD - 0.2));
      platform.add(glassSide, rail);
    });

    // Cabin Roof Frame + Illuminated Interior Button Panel
    const cabinRoof = new THREE.Mesh(
      track(new THREE.BoxGeometry(halfW * 2 - 0.12, 0.14, halfD * 2 - 0.12)),
      darkWallMat,
    );
    cabinRoof.position.y = 2.45;
    cabinRoof.castShadow = true;
    const cabinLed = new THREE.Mesh(
      track(new THREE.BoxGeometry(halfW * 1.4, 0.05, 0.25)),
      indicatorMat,
    );
    cabinLed.position.y = 2.36;
    const insidePanel = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.45, 0.55, 0.08)),
      darkWallMat,
    );
    insidePanel.position.set(0.55, 1.2, halfD - 0.22);
    const panelBtn = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.18, 0.28, 0.04)),
      indicatorMat,
    );
    panelBtn.position.set(0.55, 1.24, halfD - 0.27);
    platform.add(cabinRoof, cabinLed, insidePanel, panelBtn);

    group.add(shaftGroup, platform);

    elevators.push({
      id,
      x,
      z,
      halfW,
      halfD,
      minY,
      maxY,
      currentY: minY,
      targetY: minY,
      speed: 4.2,
      platform,
      indicatorMat,
    });
  };

  const addEnterableBuilding = (
    cx: number,
    cz: number,
    w: number,
    d: number,
    floors: number,
    withElevator: boolean,
    wallMat: THREE.Material,
  ) => {
    const floorH = 4.2;
    const wallThick = 0.45;
    const doorW = 3.2;

    for (let f = 0; f < floors; f++) {
      const baseY = f * floorH;
      const topY = baseY + floorH;

      if (f > 0) {
        // Main upper floor slab + solid stair landing at top of stairs so player never falls through stairwell
        addSolidBox(cx + 1.65, baseY - 0.12, cz, w - 3.3, 0.25, d, floorSlabMat, true);
        addSolidBox(cx - w / 2 + 1.85, baseY - 0.12, cz + d / 2 - 0.85, 3.7, 0.25, 1.7, floorSlabMat, true);
      }

      const segW = (w - doorW) / 2;
      addSolidBox(cx - (doorW / 2 + segW / 2), baseY + floorH / 2, cz + d / 2, segW, floorH, wallThick, wallMat);
      addSolidBox(cx + (doorW / 2 + segW / 2), baseY + floorH / 2, cz + d / 2, segW, floorH, wallThick, wallMat);
      if (f === 0) {
        addSolidBox(cx, topY - 0.55, cz + d / 2, doorW, 1.1, wallThick, wallMat);
      } else {
        addSolidBox(cx, baseY + 0.6, cz + d / 2, doorW, 1.2, wallThick, wallMat);
      }

      addSolidBox(cx - (doorW / 2 + segW / 2), baseY + floorH / 2, cz - d / 2, segW, floorH, wallThick, wallMat);
      addSolidBox(cx + (doorW / 2 + segW / 2), baseY + floorH / 2, cz - d / 2, segW, floorH, wallThick, wallMat);
      if (f === 0) {
        addSolidBox(cx, topY - 0.55, cz - d / 2, doorW, 1.1, wallThick, wallMat);
      } else {
        addSolidBox(cx, baseY + 0.6, cz - d / 2, doorW, 1.2, wallThick, wallMat);
      }

      const sideSegD = (d - 3.2) / 2;
      [-1, 1].forEach((side) => {
        const wx = cx + side * (w / 2);
        addSolidBox(wx, baseY + floorH / 2, cz - (1.6 + sideSegD / 2), wallThick, floorH, sideSegD, wallMat);
        addSolidBox(wx, baseY + floorH / 2, cz + (1.6 + sideSegD / 2), wallThick, floorH, sideSegD, wallMat);
        addSolidBox(wx, baseY + 0.55, cz, wallThick, 1.1, 3.2, wallMat);
        addSolidBox(wx, topY - 0.45, cz, wallThick, 0.9, 3.2, wallMat);
      });

      // Interior rooms, tactical barriers & crate cover inside every floor
      addSolidBox(cx + 1.5, baseY + floorH / 2, cz - 1.5, 0.3, floorH, d * 0.4, darkWallMat, false, false);
      addSolidBox(cx + w * 0.25, baseY + 0.65, cz + d * 0.22, 1.3, 1.3, 1.3, crateMat, true, false);
      addSolidBox(cx + w * 0.25, baseY + 0.55, cz - d * 0.22, 1.1, 1.1, 1.1, crateMat, true, false);
      addSolidBox(cx - 0.5, baseY + 0.6, cz + d * 0.25, 1.2, 1.2, 1.2, crateMat, true, false);

      if (f < floors - 1) {
        addStairs(cx - w / 2 + 2.0, cz, 2.6, d - 3.2, baseY, baseY + floorH, 'z', steelMat);
      }

      // Architectural floor slab overhang belt
      const beltTrim = new THREE.Mesh(
        track(new THREE.BoxGeometry(w + 0.36, 0.22, d + 0.36)),
        darkWallMat,
      );
      beltTrim.position.set(cx, topY - 0.05, cz);
      beltTrim.castShadow = false;
      beltTrim.receiveShadow = true;
      group.add(beltTrim);
    }

    const roofY = floors * floorH;
    // Roof floor slab + seamless stairwell landing at top of stairs
    addSolidBox(cx + 1.65, roofY - 0.12, cz, w - 3.3, 0.25, d, floorSlabMat, true);
    addSolidBox(cx - w / 2 + 1.85, roofY - 0.12, cz + d / 2 - 0.85, 3.7, 0.25, 1.7, floorSlabMat, true);
    addStairs(cx - w / 2 + 2.0, cz, 2.6, d - 3.2, (floors - 1) * floorH, roofY, 'z', steelMat);

    // Rooftop tactical perimeter parapet battlements (with doorway opening on +X for the elevator!)
    addSolidBox(cx, roofY + 0.55, cz + d / 2, w, 1.1, 0.35, wallMat);
    addSolidBox(cx, roofY + 0.55, cz - d / 2, w, 1.1, 0.35, wallMat);
    addSolidBox(cx - w / 2, roofY + 0.55, cz, 0.35, 1.1, d - 0.4, wallMat);
    // +X roof wall leaves a wide 3.6m passage in the center for the elevator landing!
    const eastSeg = (d - 3.6) / 2;
    if (eastSeg > 0.6) {
      addSolidBox(cx + w / 2, roofY + 0.55, cz - (1.8 + eastSeg / 2), 0.35, 1.1, eastSeg, wallMat);
      addSolidBox(cx + w / 2, roofY + 0.55, cz + (1.8 + eastSeg / 2), 0.35, 1.1, eastSeg, wallMat);
    }

    // Corner concrete structural pilasters
    [
      [-w / 2 - 0.08, -d / 2 - 0.08],
      [w / 2 + 0.08, -d / 2 - 0.08],
      [-w / 2 - 0.08, d / 2 + 0.08],
      [w / 2 + 0.08, d / 2 + 0.08],
    ].forEach(([px, pz]) => {
      const col = new THREE.Mesh(
        track(new THREE.BoxGeometry(0.55, roofY + 1.15, 0.55)),
        darkWallMat,
      );
      col.position.set(cx + px, (roofY + 1.15) / 2, cz + pz);
      col.castShadow = true;
      col.receiveShadow = true;
      group.add(col);
    });

    // MIDDLE OF THE ROOF TACTICAL COVER ("وسط السطح توجد أشياء تستطيع الاختباء فيها"):
    // Positioned cleanly on the solid roof slab (east of stairwell)
    // 1. Armored center concrete crouch/peek L-shield
    addSolidBox(cx + 0.5, roofY + 0.72, cz + 0.4, 2.6, 1.44, 0.45, concreteMat, true);
    addSolidBox(cx - 0.6, roofY + 0.65, cz - 0.6, 0.45, 1.3, 2.0, concreteMat, true);
    // 2. Industrial HVAC Chiller & Power Generator
    addSolidBox(cx + 0.4, roofY + 0.72, cz - 2.3, 1.8, 1.44, 1.4, steelMat, true);
    // 3. Rooftop Military Crate Cover Cluster (center-south & center-east)
    addCrateCluster(cx - 1.2, cz + 2.2, roofY);
    addSolidBox(cx + 2.4, roofY + 0.58, cz - 0.2, 1.2, 1.16, 1.2, crateMat, true, false);
    // 4. Rooftop Stairwell Bulkhead Shield + Comms Mast (at stairwell landing)
    addSolidBox(cx - w / 2 + 1.2, roofY + 0.85, cz + d / 2 - 1.1, 1.3, 1.7, 1.1, darkWallMat, true);
    const roofMast = new THREE.Mesh(track(new THREE.CylinderGeometry(0.05, 0.08, 2.8, 8)), steelMat);
    roofMast.position.set(cx - w / 2 + 1.2, roofY + 2.5, cz + d / 2 - 1.1);
    group.add(roofMast);

    // Register exterior & rooftop cover spots for AI bots
    coverSpots.push(
      new THREE.Vector3(cx + w / 2 + 2.0, 0, cz + 2.5),
      new THREE.Vector3(cx - w / 2 - 2.0, 0, cz - 2.5),
      new THREE.Vector3(cx + 2.5, 0, cz + d / 2 + 2.0),
      new THREE.Vector3(cx - 2.5, 0, cz - d / 2 - 2.0),
      new THREE.Vector3(cx + 0.6, roofY, cz + 1.4),
      new THREE.Vector3(cx - 0.2, roofY, cz - 1.4),
    );

    if (withElevator) {
      addElevator(`elev_${cx}_${cz}`, cx + w / 2 + 2.25, cz, 0.02, roofY);
      // Seamless roof-to-elevator bridge
      addSolidBox(cx + w / 2 + 0.55, roofY - 0.12, cz, 1.2, 0.25, 3.6, steelMat, true);
    }
  };

  // Shared pickup, jump-pad & carpet geometries across all spawns for zero duplicate buffer allocation
  const groundWeaponRingGeo = track(new THREE.RingGeometry(0.24, 0.34, 16));
  const groundWeaponRingMat = track(
    new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide, transparent: true, opacity: 0.7 }),
  );
  const groundWeaponMarkerGeo = track(new THREE.OctahedronGeometry(0.065, 0));
  const groundWeaponMarkerMat = track(new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));

  // Visible 3D Weapon Pickup lying on the ground / inside rooms!
  const addGroundWeapon = (
    id: string,
    x: number,
    z: number,
    weaponId: WeaponId,
    yOverride?: number,
  ) => {
    const y = yOverride ?? getTerrainHeight(x, z);
    const dropGroup = new THREE.Group();
    dropGroup.position.set(x, y, z);

    // Subtle tactical ground ring under the weapon
    const ring = new THREE.Mesh(groundWeaponRingGeo, groundWeaponRingMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    dropGroup.add(ring);

    const wModel = buildWeaponMesh(weaponId);
    wModel.group.scale.set(0.92, 0.92, 0.92);
    wModel.group.position.set(0, 0.2, 0);
    wModel.group.rotation.z = 0.2;
    dropGroup.add(wModel.group);

    // Subtle floating arrow/marker
    const marker = new THREE.Mesh(groundWeaponMarkerGeo, groundWeaponMarkerMat);
    marker.position.y = 0.56;
    dropGroup.add(marker);

    group.add(dropGroup);
    crates.push({
      id,
      x,
      y,
      z,
      weaponId,
      isGroundWeapon: true,
      available: true,
      respawnAt: 0,
      mesh: dropGroup,
    });
  };

  const supplyCrateBoxGeo = track(new THREE.BoxGeometry(1.1, 0.72, 0.85));
  const supplyCrateStripGeo = track(new THREE.BoxGeometry(1.14, 0.08, 0.88));
  const supplyCrateBeaconGeo = track(new THREE.OctahedronGeometry(0.18, 0));
  const supplyMedkitMat = track(new THREE.MeshStandardMaterial({ color: 0x1e3a2f, roughness: 0.6, metalness: 0.2 }));

  const addSupplyCrate = (
    id: string,
    x: number,
    z: number,
    weaponId?: WeaponId,
    isMedkit = false,
    yOverride?: number,
  ) => {
    const y = yOverride ?? getTerrainHeight(x, z);
    const crateGroup = new THREE.Group();
    crateGroup.position.set(x, y, z);

    const box = new THREE.Mesh(supplyCrateBoxGeo, isMedkit ? supplyMedkitMat : crateMat);
    box.position.y = 0.36;
    box.castShadow = false;
    crateGroup.add(box);

    const glowMat = track(
      new THREE.MeshBasicMaterial({
        color: isMedkit ? 0x10b981 : 0xf59e0b,
      }),
    );
    const strip = new THREE.Mesh(supplyCrateStripGeo, glowMat);
    strip.position.y = 0.62;
    crateGroup.add(strip);

    const beacon = new THREE.Mesh(supplyCrateBeaconGeo, glowMat);
    beacon.position.y = 1.18;
    crateGroup.add(beacon);

    group.add(crateGroup);
    crates.push({
      id,
      x,
      y,
      z,
      weaponId,
      isMedkit,
      available: true,
      respawnAt: 0,
      mesh: crateGroup,
    });
  };

  const padDiscGeo = track(new THREE.CylinderGeometry(1.75, 1.9, 0.12, 20));
  const padOuterRingGeo = track(new THREE.RingGeometry(1.42, 1.72, 24));
  const padInnerRingGeo = track(new THREE.RingGeometry(0.65, 0.92, 20));
  const padInnerRingMat = track(
    new THREE.MeshBasicMaterial({ color: 0xfbbf24, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
  );
  const padArrowGeo = track(new THREE.ConeGeometry(0.38, 0.95, 3));
  const padArrowMat = track(new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
  const padFloatRingGeos = [0, 1, 2].map((idx) =>
    track(new THREE.RingGeometry(1.05 - idx * 0.18, 1.18 - idx * 0.18, 20)),
  );
  const padFloatRingMats = [0, 1, 2].map((idx) =>
    track(
      new THREE.MeshBasicMaterial({
        color: idx === 1 ? 0xfbbf24 : 0x22d3ee,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.55 - idx * 0.12,
      }),
    ),
  );

  // PUBG-style Sky & Rooftop-to-Rooftop Jump Circles!
  const addJumpPad = (
    id: string,
    x: number,
    z: number,
    targetX: number,
    targetZ: number,
    yOverride?: number,
    targetYOverride?: number,
    isRooftop = false,
  ) => {
    const y = yOverride ?? getTerrainHeight(x, z);
    const padGroup = new THREE.Group();
    padGroup.position.set(x, y + 0.04, z);

    const baseDisc = new THREE.Mesh(padDiscGeo, steelMat);
    baseDisc.receiveShadow = true;
    padGroup.add(baseDisc);

    const ringMat = track(
      new THREE.MeshBasicMaterial({ color: 0x22d3ee, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }),
    );
    const outerRing = new THREE.Mesh(padOuterRingGeo, ringMat);
    outerRing.rotation.x = -Math.PI / 2;
    outerRing.position.y = 0.08;
    padGroup.add(outerRing);

    const innerRing = new THREE.Mesh(padInnerRingGeo, padInnerRingMat);
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.09;
    padGroup.add(innerRing);

    // Directional sky arrow showing where this circle launches you
    const launchYaw = Math.atan2(targetX - x, targetZ - z);
    const arrow = new THREE.Mesh(padArrowGeo, padArrowMat);
    arrow.rotation.x = Math.PI / 2;
    arrow.rotation.z = -launchYaw;
    arrow.position.set(Math.sin(launchYaw) * 0.45, 0.14, Math.cos(launchYaw) * 0.45);
    padGroup.add(arrow);

    // Floating upward neon energy rings
    const chevrons = new THREE.Group();
    [0.55, 1.15, 1.75].forEach((cy, idx) => {
      const floatRing = new THREE.Mesh(padFloatRingGeos[idx], padFloatRingMats[idx]);
      floatRing.rotation.x = -Math.PI / 2;
      floatRing.position.y = cy;
      chevrons.add(floatRing);
    });
    padGroup.add(chevrons);

    group.add(padGroup);
    jumpPads.push({
      id,
      x,
      y,
      z,
      targetX,
      targetY: targetYOverride,
      targetZ,
      isRooftop,
      radius: 1.75,
      cooldownUntil: 0,
      mesh: padGroup,
      ringMat,
      chevrons,
    });
  };

  // PUBG-style Flying Carpet ("الحصيرة الطائرة") Spawn Helper
  const carpetSpawnMat = track(
    new THREE.MeshStandardMaterial({
      map: getCarpetTexture(maxAnisotropy),
      roughness: 0.7,
      metalness: 0.14,
      side: THREE.DoubleSide,
    }),
  );
  const carpetRugGeo = (() => {
    const g = track(new THREE.PlaneGeometry(1.55, 2.35, 6, 10));
    g.rotateX(-Math.PI / 2);
    const rPos = g.attributes.position;
    for (let i = 0; i < rPos.count; i++) {
      const cz = rPos.getZ(i);
      rPos.setY(i, Math.pow(Math.max(0, Math.abs(cz) - 0.85), 2) * 0.42);
    }
    g.computeVertexNormals();
    return g;
  })();
  const carpetGlowRingGeo = track(new THREE.RingGeometry(0.95, 1.25, 22));
  const carpetGlowRingMat = track(
    new THREE.MeshBasicMaterial({
      color: 0xa855f7,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    }),
  );
  const carpetBeaconGeo = track(new THREE.OctahedronGeometry(0.16, 0));
  const carpetBeaconMat = track(new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));

  const addFlyingCarpet = (id: string, x: number, z: number, yOverride?: number) => {
    const y = yOverride ?? getTerrainHeight(x, z);
    const cGroup = new THREE.Group();
    cGroup.position.set(x, y, z);

    const rugMesh = new THREE.Mesh(carpetRugGeo, carpetSpawnMat);
    rugMesh.position.y = 0.72;
    rugMesh.raycast = () => {};
    cGroup.add(rugMesh);

    const glowRing = new THREE.Mesh(carpetGlowRingGeo, carpetGlowRingMat);
    glowRing.rotation.x = -Math.PI / 2;
    glowRing.position.y = 0.05;
    glowRing.raycast = () => {};
    cGroup.add(glowRing);

    const beacon = new THREE.Mesh(carpetBeaconGeo, carpetBeaconMat);
    beacon.position.y = 1.45;
    beacon.raycast = () => {};
    cGroup.add(beacon);

    group.add(cGroup);
    carpetSpawns.push({
      id,
      x,
      y,
      z,
      available: true,
      respawnAt: 0,
      mesh: cGroup,
    });
  };

  // Driveable Tactical Vehicle Helper (Cars & 2-Seat Motorcycles)
  let vehicleIdx = 0;
  const addVehicle = (id: string, kind: VehicleKind, x: number, z: number, yaw = 0) => {
    const rig = buildVehicleMesh(kind, vehicleIdx++);
    disposables.push(rig);
    const y = getTerrainHeight(x, z);
    rig.group.position.set(x, y, z);
    rig.group.rotation.y = yaw;
    group.add(rig.group);
    vehicles.push({
      id,
      kind,
      x,
      y,
      z,
      yaw,
      velX: 0,
      velZ: 0,
      wheelSpin: 0,
      steerAngle: 0,
      driverId: null,
      passengerId: null,
      rig,
    });
  };

  // ======================== MAP-SPECIFIC ARCHITECTURE ========================
  if (mapId === 'metropolis') {
    // Central Hub Buildings + Outer Wing Towers (wide navigable lanes + elevators + rooftop jump circles!)
    addEnterableBuilding(0, 0, 14, 13, 2, true, concreteMat);
    addEnterableBuilding(-30, -28, 16, 15, 2, true, concreteMat);
    addEnterableBuilding(30, 26, 16, 15, 2, true, concreteMat);
    addEnterableBuilding(-30, 28, 14, 13, 2, true, concreteMat);
    addEnterableBuilding(30, -28, 14, 13, 2, true, concreteMat);
    addEnterableBuilding(-58, 0, 14, 13, 2, true, concreteMat);
    addEnterableBuilding(58, 0, 14, 13, 2, true, concreteMat);

    // Rooftop-to-Rooftop Jump Circles (each placed cleanly on solid roof pads & lands squarely on target roof!)
    addJumpPad('roof_c_to_nw', 4.3, -4.0, -25.5, -24.0, 8.4, 8.45, true);
    addJumpPad('roof_c_to_se', 4.3, 4.0, 33.0, 29.0, 8.4, 8.45, true);
    addJumpPad('roof_nw_to_ne', -25.5, -32.0, 33.5, -28.0, 8.4, 8.45, true);
    addJumpPad('roof_ne_to_se', 34.0, -24.0, 34.0, 22.0, 8.4, 8.45, true);
    addJumpPad('roof_se_to_sw', 34.0, 30.0, -26.0, 28.0, 8.4, 8.45, true);
    addJumpPad('roof_sw_to_c', -26.0, 24.0, 2.0, 2.2, 8.4, 8.45, true);
    addJumpPad('roof_w_to_c', -53.8, -3.5, 2.0, 1.5, 8.4, 8.45, true);
    addJumpPad('roof_e_to_c', 62.2, 3.5, 2.0, -1.5, 8.4, 8.45, true);

    const streetCovers: [number, number, number, number, number, string][] = [
      [-15, 8, 6.2, 2.7, 2.6, '#2e3b47'],
      [15, -8, 2.6, 2.7, 6.2, '#3d2c28'],
      [0, -22, 6.2, 2.7, 2.6, '#27382e'],
      [0, 22, 6.2, 2.7, 2.6, '#242933'],
      [-45, 16, 2.6, 2.7, 7.0, '#2e3b47'],
      [45, -16, 2.6, 2.7, 7.0, '#3a342a'],
    ];
    streetCovers.forEach(([x, z, w, h, d, hex]) => {
      const mat = track(
        new THREE.MeshStandardMaterial({
          map: getContainerTexture(hex, maxAnisotropy),
          roughness: 0.65,
          metalness: 0.35,
        }),
      );
      addSolidBox(x, h / 2, z, w, h, d, mat, true);
      coverSpots.push(new THREE.Vector3(x + w / 2 + 1.5, 0, z), new THREE.Vector3(x - w / 2 - 1.5, 0, z));
    });

    // Generous central & street tactical crate cover clusters
    [
      [14, -14],
      [-14, 14],
      [0, -36],
      [0, 36],
      [11, 12],
      [-11, -12],
      [-18, -15],
      [18, 15],
      [22, 0],
      [-22, 0],
      [0, -56],
      [0, 56],
      [-42, -40],
      [42, 40],
    ].forEach(([cx, cz]) => addCrateCluster(cx, cz));

    const lampMat = track(new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));
    [
      [-12, -12], [12, -12], [-12, 12], [12, 12], [-44, -4], [44, 4],
    ].forEach(([lx, lz]) => {
      addSolidBox(lx, 3.0, lz, 0.25, 6.0, 0.25, steelMat, false, false);
      const bulb = new THREE.Mesh(track(new THREE.BoxGeometry(0.9, 0.16, 0.4)), lampMat);
      bulb.position.set(lx, 5.95, lz);
      group.add(bulb);
    });

    for (let i = 0; i < 28; i++) {
      const ang = (i / 28) * Math.PI * 2;
      const dist = 166 + (i % 3) * 16;
      const bx = Math.cos(ang) * dist;
      const bz = Math.sin(ang) * dist;
      const bh = 20 + (i % 5) * 9;
      addSolidBox(bx, bh / 2, bz, 18, bh, 18, concreteMat, false, false);
    }

    // Ground Weapon Drops + Supply Crates + 6 Cars & 6 Motorcycles
    addGroundWeapon('gw1', 3, 2, 'awm', 4.2);
    addGroundWeapon('gw2', -8, 12, 'akm');
    addGroundWeapon('gw3', 11, -11, 'kar98');
    addGroundWeapon('gw4', -30, -28, 's12k');
    addGroundWeapon('gw5', 30, 26, 'ump45');
    addGroundWeapon('gw6', 0, 16, 'm416');
    addGroundWeapon('gw7', -18, 4, 'scarl');
    addGroundWeapon('gw8', 18, 6, 'vector');
    addGroundWeapon('gw9', -30, 28, 'm24', 8.4);
    addGroundWeapon('gw10', -14, -8, 'mk14');
    addGroundWeapon('gw11', 14, 10, 'deagle');
    addGroundWeapon('gw12', -2, -16, 'p18c');
    addGroundWeapon('gw13', 0, 0, 'amr', 8.4);
    addGroundWeapon('gw14', -10, 20, 'groza');
    addGroundWeapon('gw15', 22, -18, 'm249');
    addSupplyCrate('c1', 0, 0, 'awm', false, 8.4);
    addSupplyCrate('c2', -14, -32, undefined, true);
    addSupplyCrate('c3', 38, -6, undefined, true);
    addFlyingCarpet('fc1', 0, -14);
    addFlyingCarpet('fc2', 20, -14);
    addFlyingCarpet('fc3', -20, 14);
    addVehicle('veh_m_car1', 'car', -12, 28, 0.4);
    addVehicle('veh_m_car2', 'car', 24, -10, -1.2);
    addVehicle('veh_m_car3', 'car', -40, -12, 1.5);
    addVehicle('veh_m_car4', 'car', 42, 14, -0.8);
    addVehicle('veh_m_car5', 'car', 0, -48, 0.2);
    addVehicle('veh_m_car6', 'car', 0, 50, 3.0);
    addVehicle('veh_m_bike1', 'motorcycle', 10, 24, 2.2);
    addVehicle('veh_m_bike2', 'motorcycle', -22, -8, 0.9);
    addVehicle('veh_m_bike3', 'motorcycle', 40, 10, -2.4);
    addVehicle('veh_m_bike4', 'motorcycle', -46, 22, -0.5);
    addVehicle('veh_m_bike5', 'motorcycle', 18, -42, 1.7);
    addVehicle('veh_m_bike6', 'motorcycle', -18, 44, -1.4);
  } else if (mapId === 'iraq_ruins') {
    // Broken Overpass Bridge + Central Ruined Compound + Many Crates & Ruins
    addSolidBox(-18, 4.4, -4, 20, 0.5, 6.5, sandstoneMat, true);
    addSolidBox(18, 4.4, -4, 20, 0.5, 6.5, sandstoneMat, true);
    addSolidBox(-26, 2.2, -4, 1.4, 4.4, 5.5, sandstoneMat);
    addSolidBox(-10, 2.2, -4, 1.4, 4.4, 5.5, sandstoneMat);
    addSolidBox(10, 2.2, -4, 1.4, 4.4, 5.5, sandstoneMat);
    addSolidBox(26, 2.2, -4, 1.4, 4.4, 5.5, sandstoneMat);
    addStairs(-32, -4, 4.5, 9.5, 0, 4.65, 'x', sandstoneMat);
    addStairs(32, -4, 4.5, 9.5, 4.65, 0, 'x', sandstoneMat);

    // Central Iraq Courtyard Buildings with Elevators & Rooftop-to-Rooftop Jump Circles
    addEnterableBuilding(0, 14, 13, 12, 2, true, sandstoneMat);
    addEnterableBuilding(-30, 26, 13, 12, 1, true, sandstoneMat);
    addEnterableBuilding(30, 26, 13, 12, 1, true, sandstoneMat);
    addEnterableBuilding(0, -32, 15, 12, 2, true, sandstoneMat);
    addEnterableBuilding(-50, -8, 13, 12, 2, true, sandstoneMat);
    addEnterableBuilding(50, -8, 13, 12, 2, true, sandstoneMat);

    addJumpPad('roof_iq_c_n', 3.8, -3.6 + 14, 3.5, -30, 8.4, 8.45, true);
    addJumpPad('roof_iq_n_c', 4.2, -28.5, 2.0, 14, 8.4, 8.45, true);
    addJumpPad('roof_iq_c_w', 3.8, 17.6, -28, 26, 8.4, 4.25, true);
    addJumpPad('roof_iq_w_e', -26.2, 26.0, 32, 26, 4.2, 4.25, true);
    addJumpPad('roof_iq_e_c', 33.6, 22.5, 2.0, 14, 4.2, 8.45, true);

    [
      [-10, 4], [10, 4], [-14, -14], [14, -14], [0, -14], [-26, -16], [26, -16], [-6, -2], [6, -2], [0, 44], [-42, 42], [42, 42],
    ].forEach(([cx, cz]) => addCrateCluster(cx, cz));

    [
      [-8, 30, 8, 2.2, 0.8],
      [9, 12, 0.8, 2.5, 7],
      [-16, -20, 7, 2.8, 0.9],
      [18, -22, 7, 2.4, 0.9],
      [0, 36, 12, 2.2, 0.9],
      [-40, 8, 0.9, 2.6, 10],
      [40, 8, 0.9, 2.6, 10],
    ].forEach(([x, z, w, h, d]) => {
      const y = getTerrainHeight(x, z);
      addSolidBox(x, y + h / 2, z, w, h, d, sandstoneMat, true);
      coverSpots.push(new THREE.Vector3(x + 2, y, z + 2));
    });

    for (let i = 0; i < 24; i++) {
      const ang = (i / 24) * Math.PI * 2;
      const dx = Math.cos(ang) * 168;
      const dz = Math.sin(ang) * 168;
      addSolidBox(dx, 6, dz, 24, 14, 12, sandstoneMat, false, false);
    }

    addGroundWeapon('gw1', -14, -4, 'awm', 4.65);
    addGroundWeapon('gw2', 14, -4, 'kar98', 4.65);
    addGroundWeapon('gw3', 0, 14, 'akm', 0);
    addGroundWeapon('gw4', -30, 26, 's12k');
    addGroundWeapon('gw5', 10, -10, 'ump45');
    addGroundWeapon('gw6', -14, 14, 'scarl');
    addGroundWeapon('gw7', 30, 26, 'm24');
    addGroundWeapon('gw8', 0, -20, 'vector');
    addGroundWeapon('gw9', -10, 2, 'mk14');
    addGroundWeapon('gw10', 12, 0, 'deagle');
    addGroundWeapon('gw11', -6, -12, 'p18c');
    addGroundWeapon('gw12', 0, -32, 'amr', 8.4);
    addGroundWeapon('gw13', -20, -8, 'groza');
    addGroundWeapon('gw14', 20, 6, 'm249');
    addSupplyCrate('c1', 0, -32, 'm416', false, 4.2);
    addSupplyCrate('c2', 10, 4, undefined, true);
    addFlyingCarpet('fc1', 0, -10);
    addFlyingCarpet('fc2', 20, 12);
    addVehicle('veh_i_car1', 'car', -18, 16, 0.5);
    addVehicle('veh_i_car2', 'car', 24, -20, -1.1);
    addVehicle('veh_i_car3', 'car', -34, -18, 1.8);
    addVehicle('veh_i_car4', 'car', 38, 12, -0.4);
    addVehicle('veh_i_car5', 'car', 0, 52, 2.9);
    addVehicle('veh_i_car6', 'car', -14, -52, 0.1);
    addVehicle('veh_i_bike1', 'motorcycle', 18, -14, 2.2);
    addVehicle('veh_i_bike2', 'motorcycle', -14, -24, 1.1);
    addVehicle('veh_i_bike3', 'motorcycle', 12, 28, -0.7);
    addVehicle('veh_i_bike4', 'motorcycle', -42, 34, 0.6);
    addVehicle('veh_i_bike5', 'motorcycle', 44, -28, -1.8);
    addVehicle('veh_i_bike6', 'motorcycle', 2, -46, 3.1);
  } else if (mapId === 'military_base') {
    addEnterableBuilding(0, 0, 14, 13, 2, true, concreteMat);
    addEnterableBuilding(0, -32, 16, 14, 2, true, concreteMat);
    addEnterableBuilding(-34, 16, 15, 14, 1, true, concreteMat);
    addEnterableBuilding(34, 16, 15, 14, 1, true, concreteMat);
    addEnterableBuilding(-48, -26, 14, 13, 2, true, concreteMat);
    addEnterableBuilding(48, -26, 14, 13, 2, true, concreteMat);

    addJumpPad('roof_mb_c_n', 4.2, -3.8, 3.5, -30, 8.4, 8.45, true);
    addJumpPad('roof_mb_n_e', 4.6, -28.0, 36, 16, 8.4, 4.25, true);
    addJumpPad('roof_mb_e_w', 38.0, 20.0, -32, 16, 4.2, 4.25, true);
    addJumpPad('roof_mb_w_c', -30.0, 12.0, 2.5, 1.5, 4.2, 8.45, true);

    // Helipad
    addSolidBox(0, 0.2, 26, 14, 0.4, 14, steelMat, true);
    const ringGeo = track(new THREE.RingGeometry(4.2, 4.8, 32));
    ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, track(new THREE.MeshBasicMaterial({ color: 0xf59e0b })));
    ring.position.set(0, 0.42, 26);
    group.add(ring);

    [
      [-14, -12], [14, -12], [-15, 12], [15, 12], [0, -15], [0, 42], [18, 0], [-18, 0], [-28, 38], [28, 38],
    ].forEach(([cx, cz]) => addCrateCluster(cx, cz));

    [
      [-12, 0], [12, 0], [-14, 28], [14, 28], [-44, -10], [44, -10],
    ].forEach(([x, z]) => {
      addSolidBox(x, 0.85, z, 5.2, 1.7, 1.1, darkWallMat, true);
      coverSpots.push(new THREE.Vector3(x, 0, z + 2));
    });

    for (let i = 0; i < 28; i++) {
      const ang = (i / 28) * Math.PI * 2;
      const wx = Math.cos(ang) * 164;
      const wz = Math.sin(ang) * 164;
      addSolidBox(wx, 3.5, wz, 34, 7, 2.5, darkWallMat, false, false);
    }

    addGroundWeapon('gw1', 0, 26, 'awm', 0.4);
    addGroundWeapon('gw2', 0, -32, 'm416', 8.4);
    addGroundWeapon('gw3', -34, 16, 'ump45');
    addGroundWeapon('gw4', 34, 16, 'akm');
    addGroundWeapon('gw5', 10, -10, 's12k');
    addGroundWeapon('gw6', -12, -12, 'scarl');
    addGroundWeapon('gw7', 12, 12, 'vector');
    addGroundWeapon('gw8', -30, -12, 'm24');
    addGroundWeapon('gw9', -10, 12, 'mk14');
    addGroundWeapon('gw10', 10, 4, 'deagle');
    addGroundWeapon('gw11', -6, -14, 'p18c');
    addGroundWeapon('gw12', 0, 0, 'amr', 8.4);
    addGroundWeapon('gw13', -20, 26, 'groza');
    addGroundWeapon('gw14', 22, -6, 'm249');
    addSupplyCrate('c1', 0, 0, 'kar98', false, 8.4);
    addSupplyCrate('c2', 0, 38, undefined, true);
    addFlyingCarpet('fc1', 0, 13);
    addFlyingCarpet('fc2', -18, -18);
    addVehicle('veh_mb_car1', 'car', -16, 28, 0.2);
    addVehicle('veh_mb_car2', 'car', 20, -16, -1.4);
    addVehicle('veh_mb_car3', 'car', -36, -24, 0.9);
    addVehicle('veh_mb_car4', 'car', 42, -6, 1.8);
    addVehicle('veh_mb_car5', 'car', -48, 36, -0.6);
    addVehicle('veh_mb_car6', 'car', 26, 44, 2.7);
    addVehicle('veh_mb_bike1', 'motorcycle', 14, 24, 2.6);
    addVehicle('veh_mb_bike2', 'motorcycle', -22, 0, 1.4);
    addVehicle('veh_mb_bike3', 'motorcycle', 28, -4, -2.0);
    addVehicle('veh_mb_bike4', 'motorcycle', -16, -48, 0.4);
    addVehicle('veh_mb_bike5', 'motorcycle', 16, -50, -0.8);
    addVehicle('veh_mb_bike6', 'motorcycle', -54, 12, 1.5);
  } else {
    // Industrial Port: Central Warehouse + Elevators + Rooftop Jump Circles
    addEnterableBuilding(0, 0, 14, 13, 2, true, concreteMat);
    addEnterableBuilding(-38, 34, 14, 12, 1, true, concreteMat);
    addEnterableBuilding(38, -34, 14, 12, 1, true, concreteMat);
    addEnterableBuilding(-38, -34, 14, 12, 1, true, concreteMat);
    addEnterableBuilding(38, 34, 14, 12, 1, true, concreteMat);

    addJumpPad('roof_ip_c_sw', 4.2, 3.8, -36, 34, 8.4, 4.25, true);
    addJumpPad('roof_ip_sw_ne', -34.0, 30.5, 40, -34, 4.2, 4.25, true);
    addJumpPad('roof_ip_ne_c', 42.0, -30.5, 2.0, 1.0, 4.2, 8.45, true);

    const palette = ['#7f1d1d', '#1e3a5f', '#14532d', '#78350f', '#334155'];
    const stacks: [number, number, boolean, number][] = [
      [-18, -16, false, 2],
      [18, -16, false, 2],
      [-20, 14, true, 1],
      [20, 14, true, 2],
      [-42, -2, true, 2],
      [42, -2, true, 1],
      [0, -36, false, 2],
      [0, 36, false, 1],
    ];
    stacks.forEach(([x, z, rot, levels], idx) => {
      const mat = track(
        new THREE.MeshStandardMaterial({
          map: getContainerTexture(palette[idx % palette.length], maxAnisotropy),
          roughness: 0.6,
          metalness: 0.42,
        }),
      );
      const w = rot ? 2.8 : 7.2;
      const d = rot ? 7.2 : 2.8;
      for (let l = 0; l < levels; l++) {
        addSolidBox(x, 1.4 + l * 2.8, z, w, 2.8, d, mat, true);
      }
      if (levels === 2) {
        addStairs(x + (rot ? 2.4 : 0), z + (rot ? 0 : 2.5), 2.0, 5.5, 0, 5.6, rot ? 'z' : 'x', steelMat);
      }
      coverSpots.push(new THREE.Vector3(x + w / 2 + 1.5, 0, z));
    });

    [
      [12, 10], [-12, -10], [14, -22], [-14, 22], [0, 18], [0, -18], [-12, 14], [12, -14], [0, 52], [0, -52],
    ].forEach(([cx, cz]) => addCrateCluster(cx, cz));

    for (let i = 0; i < 24; i++) {
      const ang = (i / 24) * Math.PI * 2;
      addSolidBox(Math.cos(ang) * 166, 2.5, Math.sin(ang) * 166, 38, 5, 3, concreteMat, false, false);
    }

    addGroundWeapon('gw1', 0, 0, 's12k');
    addGroundWeapon('gw2', -18, -16, 'awm', 5.6);
    addGroundWeapon('gw3', 18, -16, 'kar98', 5.6);
    addGroundWeapon('gw4', -20, 14, 'ump45', 2.8);
    addGroundWeapon('gw5', 12, 10, 'akm');
    addGroundWeapon('gw6', -12, -10, 'scarl');
    addGroundWeapon('gw7', 20, 14, 'm24', 5.6);
    addGroundWeapon('gw8', 0, 24, 'vector');
    addGroundWeapon('gw9', -10, 12, 'mk14');
    addGroundWeapon('gw10', 10, -12, 'deagle');
    addGroundWeapon('gw11', -8, -14, 'p18c');
    addGroundWeapon('gw12', 0, 0, 'amr', 8.4);
    addGroundWeapon('gw13', -26, 22, 'groza');
    addGroundWeapon('gw14', 24, -10, 'm249');
    addSupplyCrate('c1', 8, 12, undefined, true);
    addFlyingCarpet('fc1', 0, -13);
    addFlyingCarpet('fc2', 20, -4);
    addVehicle('veh_ip_car1', 'car', -12, 26, 0.7);
    addVehicle('veh_ip_car2', 'car', 24, 20, -1.2);
    addVehicle('veh_ip_car3', 'car', -28, -22, 0.4);
    addVehicle('veh_ip_car4', 'car', 48, 8, -1.5);
    addVehicle('veh_ip_car5', 'car', -50, 10, 1.3);
    addVehicle('veh_ip_car6', 'car', 14, -52, 2.8);
    addVehicle('veh_ip_bike1', 'motorcycle', 16, -24, -1.0);
    addVehicle('veh_ip_bike2', 'motorcycle', -22, -6, 1.4);
    addVehicle('veh_ip_bike3', 'motorcycle', 28, 4, 2.3);
    addVehicle('veh_ip_bike4', 'motorcycle', -14, 50, -0.5);
    addVehicle('veh_ip_bike5', 'motorcycle', 50, -14, 1.9);
    addVehicle('veh_ip_bike6', 'motorcycle', -54, -18, 0.8);
  }

  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2;
    const rad = 46 + (i % 4) * 16;
    const sx = Math.cos(ang) * rad;
    const sz = Math.sin(ang) * rad;
    const sy = getTerrainHeight(sx, sz);
    spawnPoints.push(new THREE.Vector3(sx, sy + 0.1, sz));
  }

  // Paired Ground-to-Sky Jump Circles around every arena (E↔W, N↔S, Diagonal — clear sky arc over buildings!)
  addJumpPad('jp_ne_sw', 52, -48, -42, 42);
  addJumpPad('jp_sw_ne', -52, 48, 42, -42);
  addJumpPad('jp_nw_se', -52, -48, 42, 42);
  addJumpPad('jp_se_nw', 52, 48, -42, -42);
  addJumpPad('jp_s_n', 0, 62, 0, -44);
  addJumpPad('jp_n_s', 0, -62, 0, 44);
  addJumpPad('jp_e_w', 64, 0, -48, 0);
  addJumpPad('jp_w_e', -64, 0, 48, 0);

  return {
    group,
    colliders,
    raycastTargets,
    walkableFloors,
    ramps,
    elevators,
    crates,
    jumpPads,
    carpetSpawns,
    vehicles,
    spawnPoints,
    coverSpots,
    arenaRadius: spec.arenaRadius,
    getTerrainHeight,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
