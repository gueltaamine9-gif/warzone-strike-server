import * as THREE from 'three';
import type { GrenadeType, VehicleKind } from '../game/types';

export interface BuiltVehicleRig {
  group: THREE.Group;
  wheels: THREE.Object3D[];
  frontSteerGroup?: THREE.Object3D;
  seatOffsets: [THREE.Vector3, THREE.Vector3];
  halfWidth: number;
  halfLength: number;
  dispose: () => void;
}

export function buildVehicleMesh(kind: VehicleKind, variantIndex = 0): BuiltVehicleRig {
  const group = new THREE.Group();
  const wheels: THREE.Object3D[] = [];
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const tireMat = track(
    new THREE.MeshStandardMaterial({ color: 0x141619, roughness: 0.9, metalness: 0.08 }),
  );
  const rimMat = track(
    new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.32, metalness: 0.82 }),
  );
  const darkMetalMat = track(
    new THREE.MeshStandardMaterial({ color: 0x1d2229, roughness: 0.48, metalness: 0.72 }),
  );
  const glassMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x1a2c38,
      roughness: 0.12,
      metalness: 0.5,
      transparent: true,
      opacity: 0.78,
    }),
  );
  const headLightMat = track(new THREE.MeshBasicMaterial({ color: 0xfef3c7 }));
  const tailLightMat = track(new THREE.MeshBasicMaterial({ color: 0xef4444 }));
  const seatMat = track(
    new THREE.MeshStandardMaterial({ color: 0x1f1c18, roughness: 0.85, metalness: 0.05 }),
  );

  if (kind === 'car') {
    const paintColors = [0x2d3b29, 0x5a4c36, 0x262d36, 0x4d2220, 0x16191f, 0x3f422d];
    const bodyMat = track(
      new THREE.MeshStandardMaterial({
        color: paintColors[variantIndex % paintColors.length],
        roughness: 0.42,
        metalness: 0.48,
      }),
    );

    // Lower armored chassis & wheel wells
    const chassis = new THREE.Mesh(track(new THREE.BoxGeometry(2.05, 0.56, 4.35)), bodyMat);
    chassis.position.y = 0.66;
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    group.add(chassis);

    // Sculpted front hood
    const hood = new THREE.Mesh(track(new THREE.BoxGeometry(1.94, 0.24, 1.38)), bodyMat);
    hood.position.set(0, 0.98, 1.38);
    hood.rotation.x = 0.06;
    hood.castShadow = true;
    group.add(hood);

    // Cabin / Roll-cage roof & pillars (tall realistic cabin so riders sit cleanly INSIDE below roof!)
    const roof = new THREE.Mesh(track(new THREE.BoxGeometry(1.94, 0.14, 2.3)), bodyMat);
    roof.position.set(0, 1.94, -0.32);
    roof.castShadow = true;
    group.add(roof);

    // Roof tactical rack
    const rack = new THREE.Mesh(track(new THREE.BoxGeometry(1.62, 0.08, 1.75)), darkMetalMat);
    rack.position.set(0, 2.04, -0.35);
    group.add(rack);

    // 4 cabin pillars + sloped windshield + rear window
    const pillarGeo = track(new THREE.BoxGeometry(0.12, 0.98, 0.14));
    [
      [-0.88, 0.68],
      [0.88, 0.68],
      [-0.88, -1.36],
      [0.88, -1.36],
    ].forEach(([px, pz]) => {
      const p = new THREE.Mesh(pillarGeo, darkMetalMat);
      p.position.set(px, 1.42, pz);
      group.add(p);
    });

    const windshield = new THREE.Mesh(track(new THREE.BoxGeometry(1.68, 0.82, 0.06)), glassMat);
    windshield.position.set(0, 1.44, 0.74);
    windshield.rotation.x = -0.28;
    group.add(windshield);

    const rearGlass = new THREE.Mesh(track(new THREE.BoxGeometry(1.66, 0.72, 0.06)), glassMat);
    rearGlass.position.set(0, 1.44, -1.4);
    rearGlass.rotation.x = 0.18;
    group.add(rearGlass);

    // Front steel bullbar bumper & grille
    const bumper = new THREE.Mesh(track(new THREE.BoxGeometry(2.12, 0.24, 0.24)), darkMetalMat);
    bumper.position.set(0, 0.52, 2.22);
    const grille = new THREE.Mesh(track(new THREE.BoxGeometry(1.1, 0.34, 0.08)), darkMetalMat);
    grille.position.set(0, 0.78, 2.18);
    const rearBumper = new THREE.Mesh(track(new THREE.BoxGeometry(2.1, 0.22, 0.2)), darkMetalMat);
    rearBumper.position.set(0, 0.52, -2.2);
    group.add(bumper, grille, rearBumper);

    // Spare tire mounted on back tailgate
    const spareTire = new THREE.Mesh(track(new THREE.CylinderGeometry(0.38, 0.38, 0.24, 16)), tireMat);
    spareTire.rotation.x = Math.PI / 2;
    spareTire.position.set(0, 0.96, -2.24);
    group.add(spareTire);

    // Twin headlights & taillights
    [-0.74, 0.74].forEach((lx) => {
      const hl = new THREE.Mesh(track(new THREE.BoxGeometry(0.28, 0.16, 0.06)), headLightMat);
      hl.position.set(lx, 0.82, 2.18);
      const tl = new THREE.Mesh(track(new THREE.BoxGeometry(0.28, 0.16, 0.06)), tailLightMat);
      tl.position.set(lx, 0.82, -2.18);
      group.add(hl, tl);
    });

    // Driver & Passenger seats inside cabin
    [-0.44, 0.44].forEach((sx) => {
      const seat = new THREE.Mesh(track(new THREE.BoxGeometry(0.52, 0.18, 0.55)), seatMat);
      seat.position.set(sx, 0.84, 0.04);
      const back = new THREE.Mesh(track(new THREE.BoxGeometry(0.48, 0.62, 0.14)), seatMat);
      back.position.set(sx, 1.16, -0.2);
      back.rotation.x = -0.14;
      group.add(seat, back);
    });

    // 4 heavy off-road wheels
    const wheelGeo = track(new THREE.CylinderGeometry(0.42, 0.42, 0.32, 16));
    wheelGeo.rotateZ(Math.PI / 2);
    const hubGeo = track(new THREE.CylinderGeometry(0.22, 0.22, 0.34, 10));
    hubGeo.rotateZ(Math.PI / 2);

    [
      [-1.02, 1.42],
      [1.02, 1.42],
      [-1.02, -1.38],
      [1.02, -1.38],
    ].forEach(([wx, wz]) => {
      const wGroup = new THREE.Group();
      wGroup.position.set(wx, 0.42, wz);
      const tire = new THREE.Mesh(wheelGeo, tireMat);
      const hub = new THREE.Mesh(hubGeo, rimMat);
      tire.castShadow = true;
      wGroup.add(tire, hub);
      group.add(wGroup);
      wheels.push(wGroup);
    });

    return {
      group,
      wheels,
      seatOffsets: [new THREE.Vector3(-0.44, 0.24, 0.06), new THREE.Vector3(0.44, 0.24, 0.06)],
      halfWidth: 1.15,
      halfLength: 2.25,
      dispose: () => disposables.forEach((d) => d.dispose()),
    };
  }

  // MOTORCYCLE (Tactical Dual-Seat Combat Dirt Bike)
  const bikeColors = [0x991b1b, 0x1e3a5f, 0x2f3b28, 0xd97706, 0x1c1f24, 0x14532d];
  const bikeBodyMat = track(
    new THREE.MeshStandardMaterial({
      color: bikeColors[variantIndex % bikeColors.length],
      roughness: 0.36,
      metalness: 0.55,
    }),
  );

  // Main tubular chassis & engine block
  const frame = new THREE.Mesh(track(new THREE.BoxGeometry(0.28, 0.34, 1.25)), darkMetalMat);
  frame.position.set(0, 0.58, 0);
  frame.castShadow = true;
  group.add(frame);

  const engine = new THREE.Mesh(track(new THREE.BoxGeometry(0.38, 0.32, 0.48)), rimMat);
  engine.position.set(0, 0.48, 0.06);
  group.add(engine);

  // Sculpted Fuel Tank & Rear Fender
  const tank = new THREE.Mesh(track(new THREE.BoxGeometry(0.36, 0.24, 0.52)), bikeBodyMat);
  tank.position.set(0, 0.86, 0.28);
  tank.rotation.x = -0.18;
  tank.castShadow = true;
  group.add(tank);

  // Dual-Rider Saddle (Driver front, Passenger pillion back)
  const saddle = new THREE.Mesh(track(new THREE.BoxGeometry(0.34, 0.14, 0.92)), seatMat);
  saddle.position.set(0, 0.82, -0.34);
  saddle.castShadow = true;
  group.add(saddle);

  const rearFender = new THREE.Mesh(track(new THREE.BoxGeometry(0.26, 0.08, 0.52)), bikeBodyMat);
  rearFender.position.set(0, 0.72, -0.82);
  rearFender.rotation.x = 0.26;
  group.add(rearFender);

  // Exhaust Pipe
  const exhaust = new THREE.Mesh(track(new THREE.CylinderGeometry(0.055, 0.065, 0.88, 8)), rimMat);
  exhaust.rotation.x = Math.PI / 2 - 0.14;
  exhaust.position.set(0.22, 0.44, -0.45);
  group.add(exhaust);

  // Front Steering Fork + Handlebars + Headlight
  const frontSteerGroup = new THREE.Group();
  frontSteerGroup.position.set(0, 0.82, 0.66);

  [-0.12, 0.12].forEach((fx) => {
    const fork = new THREE.Mesh(track(new THREE.CylinderGeometry(0.032, 0.028, 0.72, 8)), rimMat);
    fork.position.set(fx, -0.18, 0.08);
    fork.rotation.x = -0.32;
    frontSteerGroup.add(fork);
  });

  const handlebar = new THREE.Mesh(track(new THREE.CylinderGeometry(0.024, 0.024, 0.74, 8)), darkMetalMat);
  handlebar.rotation.z = Math.PI / 2;
  handlebar.position.set(0, 0.18, -0.02);
  frontSteerGroup.add(handlebar);

  const frontCowl = new THREE.Mesh(track(new THREE.BoxGeometry(0.26, 0.24, 0.2)), bikeBodyMat);
  frontCowl.position.set(0, 0.08, 0.1);
  const headlight = new THREE.Mesh(track(new THREE.BoxGeometry(0.16, 0.11, 0.05)), headLightMat);
  headlight.position.set(0, 0.08, 0.21);
  frontSteerGroup.add(frontCowl, headlight);
  group.add(frontSteerGroup);

  const taillight = new THREE.Mesh(track(new THREE.BoxGeometry(0.14, 0.08, 0.05)), tailLightMat);
  taillight.position.set(0, 0.75, -1.06);
  group.add(taillight);

  // Front & Rear Motorcycle Wheels
  const mTireGeo = track(new THREE.TorusGeometry(0.28, 0.095, 8, 18));
  mTireGeo.rotateY(Math.PI / 2);
  const mHubGeo = track(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 10));
  mHubGeo.rotateZ(Math.PI / 2);

  [0.84, -0.78].forEach((wz) => {
    const wGroup = new THREE.Group();
    wGroup.position.set(0, 0.36, wz);
    const tire = new THREE.Mesh(mTireGeo, tireMat);
    const hub = new THREE.Mesh(mHubGeo, rimMat);
    tire.castShadow = true;
    wGroup.add(tire, hub);
    group.add(wGroup);
    wheels.push(wGroup);
  });

  return {
    group,
    wheels,
    frontSteerGroup,
    seatOffsets: [new THREE.Vector3(0, 0.44, -0.14), new THREE.Vector3(0, 0.48, -0.58)],
    halfWidth: 0.56,
    halfLength: 1.2,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

export function buildGrenadeMesh(type: GrenadeType): THREE.Group {
  const g = new THREE.Group();

  if (type === 'frag') {
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x364928,
      roughness: 0.58,
      metalness: 0.32,
    });
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x6b7280,
      roughness: 0.35,
      metalness: 0.8,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd4a338,
      roughness: 0.32,
      metalness: 0.85,
    });

    const core = new THREE.Mesh(new THREE.SphereGeometry(0.088, 12, 10), bodyMat);
    core.scale.set(0.92, 1.18, 0.92);
    core.castShadow = true;
    g.add(core);

    // Segmented fragmentation ribs
    for (let r = -1; r <= 1; r++) {
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(0.082 - Math.abs(r) * 0.012, 0.011, 6, 12),
        bodyMat,
      );
      band.rotation.x = Math.PI / 2;
      band.position.y = r * 0.036;
      g.add(band);
    }

    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.048, 10), metalMat);
    fuse.position.y = 0.115;
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.11, 0.032), metalMat);
    lever.position.set(0.065, 0.055, 0);
    lever.rotation.z = -0.25;
    const pinRing = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.005, 6, 12), brassMat);
    pinRing.position.set(-0.045, 0.125, 0);
    g.add(fuse, lever, pinRing);
    return g;
  }

  if (type === 'smoke') {
    const canMat = new THREE.MeshStandardMaterial({
      color: 0x4b5563,
      roughness: 0.48,
      metalness: 0.55,
    });
    const stripeMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.45,
      metalness: 0.2,
    });
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      roughness: 0.4,
      metalness: 0.7,
    });

    const canister = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.064, 0.21, 14), canMat);
    canister.castShadow = true;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.045, 14), stripeMat);
    band.position.y = 0.02;
    const topCap = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.064, 0.035, 12), capMat);
    topCap.position.y = 0.118;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.005, 6, 12), capMat);
    ring.position.set(-0.042, 0.125, 0);
    g.add(canister, band, topCap, ring);
    return g;
  }

  // Molotov Cocktail (amber glass bottle + glowing orange fuel + burning rag)
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x92400e,
    roughness: 0.15,
    metalness: 0.15,
    transparent: true,
    opacity: 0.85,
  });
  const fuelMat = new THREE.MeshBasicMaterial({ color: 0xf97316 });
  const ragMat = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.9 });
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });

  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.068, 0.16, 12), glassMat);
  bottle.castShadow = true;
  const fuel = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.11, 10), fuelMat);
  fuel.position.y = -0.02;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.056, 0.09, 10), glassMat);
  neck.position.y = 0.12;
  const rag = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.075, 8), ragMat);
  rag.position.set(0.012, 0.175, 0);
  rag.rotation.z = -0.35;
  const wickFlame = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 6), flameMat);
  wickFlame.position.set(0.026, 0.205, 0);
  g.add(bottle, fuel, neck, rag, wickFlame);
  return g;
}
