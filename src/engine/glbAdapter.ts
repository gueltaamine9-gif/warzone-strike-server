import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import type { EmoteId } from '../game/types';
import type { LoadedGlbTemplate } from '../services/customCharacterStore';

interface MappedBones {
  hips?: THREE.Object3D;
  spine?: THREE.Object3D;
  neck?: THREE.Object3D;
  head?: THREE.Object3D;
  leftUpLeg?: THREE.Object3D;
  leftLeg?: THREE.Object3D;
  rightUpLeg?: THREE.Object3D;
  rightLeg?: THREE.Object3D;
  leftShoulder?: THREE.Object3D;
  leftArm?: THREE.Object3D;
  leftForeArm?: THREE.Object3D;
  leftHand?: THREE.Object3D;
  rightShoulder?: THREE.Object3D;
  rightArm?: THREE.Object3D;
  rightForeArm?: THREE.Object3D;
  rightHand?: THREE.Object3D;
}

interface FingerJointSpec {
  bone: THREE.Object3D;
  restQuat: THREE.Quaternion;
  curlAxisLocal: THREE.Vector3;
  fingerGroup: 'thumb' | 'index' | 'grip';
  phalanx: 1 | 2 | 3;
}

interface HandBasis {
  fingerDirLocal: THREE.Vector3;
  thumbSideLocal: THREE.Vector3;
  palmNormalLocal: THREE.Vector3;
  // Local orthonormal basis matrix (inverse = transpose) for world wrist orientation
  basisInv: THREE.Matrix4;
  isRight: boolean;
}

interface BoneRestPose {
  rot: THREE.Euler;
  quat: THREE.Quaternion;
  pos: THREE.Vector3;
}

export interface GlbRigInstance {
  wrapper: THREE.Group;
  rightHandSocket: THREE.Group | null;
  setFlip: (flip: boolean) => void;
  update: (params: {
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
    isPistol?: boolean;
    firing?: boolean;
  }) => void;
  alignLeftHandToWorldTarget: (
    targetWorldPos: THREE.Vector3,
    isPistol?: boolean,
    aimPitch?: number,
    recoil?: number,
    sprintCant?: number,
  ) => void;
  dispose: () => void;
}

// Pre-allocated scratch math objects (zero per-frame allocations)
const _pUpper = new THREE.Vector3();
const _pMid = new THREE.Vector3();
const _pEnd = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
const _dirTarget = new THREE.Vector3();
const _poleDir = new THREE.Vector3();
const _bendPerp = new THREE.Vector3();
const _desiredMid = new THREE.Vector3();
const _vCur = new THREE.Vector3();
const _vDes = new THREE.Vector3();
const _qDelta = new THREE.Quaternion();
const _qWorld = new THREE.Quaternion();
const _qParentWorld = new THREE.Quaternion();
const _targetWorld = new THREE.Vector3();
const _poleWorld = new THREE.Vector3();
const _wRight = new THREE.Vector3();
const _wUp = new THREE.Vector3();
const _wFwd = new THREE.Vector3();
const _qWrapWorld = new THREE.Quaternion();
const _qAimLocal = new THREE.Quaternion();
const _qAimWorld = new THREE.Quaternion();
const _eAim = new THREE.Euler();
const _desThumb = new THREE.Vector3();
const _desFinger = new THREE.Vector3();
const _desPalm = new THREE.Vector3();
const _mDesWorld = new THREE.Matrix4();
const _mResultWorld = new THREE.Matrix4();
const _qHandTargetWorld = new THREE.Quaternion();
const _qFingerCurl = new THREE.Quaternion();

function solveTwoBoneWorldIK(
  upperBone: THREE.Object3D,
  midBone: THREE.Object3D,
  endMarker: THREE.Object3D,
  targetWorldPos: THREE.Vector3,
  poleWorldPos: THREE.Vector3,
): void {
  upperBone.updateMatrixWorld(true);
  upperBone.getWorldPosition(_pUpper);
  midBone.getWorldPosition(_pMid);
  endMarker.getWorldPosition(_pEnd);

  const l1 = _pUpper.distanceTo(_pMid);
  const l2 = _pMid.distanceTo(_pEnd);
  if (l1 < 0.02 || l2 < 0.02) return;

  _toTarget.copy(targetWorldPos).sub(_pUpper);
  const rawDist = _toTarget.length();
  if (rawDist < 1e-4) return;
  _dirTarget.copy(_toTarget).divideScalar(rawDist);

  const d = THREE.MathUtils.clamp(rawDist, Math.abs(l1 - l2) + 0.015, (l1 + l2) * 0.992);
  const cosA = THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));

  _poleDir.copy(poleWorldPos).sub(_pUpper);
  _bendPerp.copy(_poleDir).addScaledVector(_dirTarget, -_poleDir.dot(_dirTarget));
  if (_bendPerp.lengthSq() < 1e-6) {
    _bendPerp.set(0, -1, 0).addScaledVector(_dirTarget, _dirTarget.y);
  }
  if (_bendPerp.lengthSq() < 1e-6) {
    _bendPerp.set(1, 0, 0);
  }
  _bendPerp.normalize();

  _desiredMid
    .copy(_pUpper)
    .addScaledVector(_dirTarget, l1 * cosA)
    .addScaledVector(_bendPerp, l1 * sinA);

  _vCur.copy(_pMid).sub(_pUpper).normalize();
  _vDes.copy(_desiredMid).sub(_pUpper).normalize();
  _qDelta.setFromUnitVectors(_vCur, _vDes);

  upperBone.getWorldQuaternion(_qWorld);
  _qWorld.premultiply(_qDelta);
  if (upperBone.parent) {
    upperBone.parent.getWorldQuaternion(_qParentWorld);
    upperBone.quaternion.copy(_qParentWorld).invert().multiply(_qWorld);
  } else {
    upperBone.quaternion.copy(_qWorld);
  }
  upperBone.updateMatrixWorld(true);

  midBone.getWorldPosition(_pMid);
  endMarker.getWorldPosition(_pEnd);
  _vCur.copy(_pEnd).sub(_pMid).normalize();
  _vDes.copy(targetWorldPos).sub(_pMid).normalize();
  _qDelta.setFromUnitVectors(_vCur, _vDes);

  midBone.getWorldQuaternion(_qWorld);
  _qWorld.premultiply(_qDelta);
  if (midBone.parent) {
    midBone.parent.getWorldQuaternion(_qParentWorld);
    midBone.quaternion.copy(_qParentWorld).invert().multiply(_qWorld);
  } else {
    midBone.quaternion.copy(_qWorld);
  }
  midBone.updateMatrixWorld(true);
}

function findBoneByPatterns(root: THREE.Object3D, patterns: RegExp[]): THREE.Object3D | undefined {
  let found: THREE.Object3D | undefined;
  root.traverse((obj) => {
    if (found) return;
    const name = obj.name || '';
    if (!name) return;
    for (const pat of patterns) {
      if (pat.test(name)) {
        found = obj;
        return;
      }
    }
  });
  return found;
}

function worldDirToLocal(bone: THREE.Object3D, worldDir: THREE.Vector3): THREE.Vector3 {
  const q = new THREE.Quaternion();
  bone.getWorldQuaternion(q);
  return worldDir.clone().applyQuaternion(q.invert()).normalize();
}

function calibrateHandBasis(handBone: THREE.Object3D | undefined, isRight: boolean): HandBasis | null {
  if (!handBone) return null;
  handBone.updateMatrixWorld(true);

  const pHand = new THREE.Vector3();
  handBone.getWorldPosition(pHand);

  const findChild = (re: RegExp): THREE.Object3D | undefined => {
    let f: THREE.Object3D | undefined;
    handBone.traverse((c) => {
      if (!f && c !== handBone && re.test(c.name || '')) f = c;
    });
    return f;
  };

  const middle1 = findChild(/middle1|middle_01/i) || findChild(/index1|index_01/i) || handBone.children[0];
  const index1 = findChild(/index1|index_01/i);
  const pinky1 = findChild(/pinky1|pinky_01|little1/i);

  const fingerWorld = new THREE.Vector3();
  if (middle1) {
    const pMid = new THREE.Vector3();
    middle1.getWorldPosition(pMid);
    fingerWorld.copy(pMid).sub(pHand);
  }
  if (fingerWorld.lengthSq() < 1e-6) {
    fingerWorld.set(isRight ? -1 : 1, -0.5, 0);
  }
  fingerWorld.normalize();

  const thumbWorld = new THREE.Vector3();
  if (index1 && pinky1) {
    const pIdx = new THREE.Vector3();
    const pPink = new THREE.Vector3();
    index1.getWorldPosition(pIdx);
    pinky1.getWorldPosition(pPink);
    thumbWorld.copy(pIdx).sub(pPink);
  } else {
    thumbWorld.set(0, 0, 1);
  }
  // Orthogonalize thumb-side vector against finger direction
  thumbWorld.addScaledVector(fingerWorld, -thumbWorld.dot(fingerWorld));
  if (thumbWorld.lengthSq() < 1e-6) {
    thumbWorld.set(0, 0, 1).addScaledVector(fingerWorld, -fingerWorld.z);
  }
  thumbWorld.normalize();

  // Anatomical right-hand rule:
  // Right hand: thumbSide x fingerDir = Palm Normal
  // Left hand:  fingerDir x thumbSide = Palm Normal
  const palmWorld = new THREE.Vector3();
  if (isRight) {
    palmWorld.crossVectors(thumbWorld, fingerWorld).normalize();
  } else {
    palmWorld.crossVectors(fingerWorld, thumbWorld).normalize();
  }

  const fingerDirLocal = worldDirToLocal(handBone, fingerWorld);
  const thumbSideLocal = worldDirToLocal(handBone, thumbWorld);
  const palmNormalLocal = worldDirToLocal(handBone, palmWorld);

  // Build right-handed local basis matrix and its inverse (= transpose):
  // Right hand columns: [thumbSide, fingerDir, palmNormal] -> det = +1
  // Left hand columns:  [fingerDir, thumbSide, palmNormal] -> det = +1
  const basisMat = new THREE.Matrix4();
  if (isRight) {
    basisMat.makeBasis(thumbSideLocal, fingerDirLocal, palmNormalLocal);
  } else {
    basisMat.makeBasis(fingerDirLocal, thumbSideLocal, palmNormalLocal);
  }
  const basisInv = basisMat.clone().invert();

  return {
    fingerDirLocal,
    thumbSideLocal,
    palmNormalLocal,
    basisInv,
    isRight,
  };
}

function collectFingerSpecs(
  handBone: THREE.Object3D | undefined,
  basis: HandBasis | null,
  sidePrefix: 'Right' | 'Left',
): FingerJointSpec[] {
  if (!handBone || !basis) return [];
  handBone.updateMatrixWorld(true);

  const qHand = new THREE.Quaternion();
  handBone.getWorldQuaternion(qHand);
  const palmWorld = basis.palmNormalLocal.clone().applyQuaternion(qHand).normalize();
  const thumbWorld = basis.thumbSideLocal.clone().applyQuaternion(qHand).normalize();

  const specs: FingerJointSpec[] = [];
  const defs: Array<{ re: RegExp; group: 'thumb' | 'index' | 'grip'; phalanx: 1 | 2 | 3 }> = [
    { re: new RegExp(`${sidePrefix}.*Thumb1$`, 'i'), group: 'thumb', phalanx: 1 },
    { re: new RegExp(`${sidePrefix}.*Thumb2$`, 'i'), group: 'thumb', phalanx: 2 },
    { re: new RegExp(`${sidePrefix}.*Thumb3$`, 'i'), group: 'thumb', phalanx: 3 },
    { re: new RegExp(`${sidePrefix}.*Index1$`, 'i'), group: 'index', phalanx: 1 },
    { re: new RegExp(`${sidePrefix}.*Index2$`, 'i'), group: 'index', phalanx: 2 },
    { re: new RegExp(`${sidePrefix}.*Index3$`, 'i'), group: 'index', phalanx: 3 },
    { re: new RegExp(`${sidePrefix}.*Middle1$`, 'i'), group: 'grip', phalanx: 1 },
    { re: new RegExp(`${sidePrefix}.*Middle2$`, 'i'), group: 'grip', phalanx: 2 },
    { re: new RegExp(`${sidePrefix}.*Middle3$`, 'i'), group: 'grip', phalanx: 3 },
    { re: new RegExp(`${sidePrefix}.*Ring1$`, 'i'), group: 'grip', phalanx: 1 },
    { re: new RegExp(`${sidePrefix}.*Ring2$`, 'i'), group: 'grip', phalanx: 2 },
    { re: new RegExp(`${sidePrefix}.*Ring3$`, 'i'), group: 'grip', phalanx: 3 },
    { re: new RegExp(`${sidePrefix}.*Pinky1$`, 'i'), group: 'grip', phalanx: 1 },
    { re: new RegExp(`${sidePrefix}.*Pinky2$`, 'i'), group: 'grip', phalanx: 2 },
    { re: new RegExp(`${sidePrefix}.*Pinky3$`, 'i'), group: 'grip', phalanx: 3 },
  ];

  const pBone = new THREE.Vector3();
  const pChild = new THREE.Vector3();
  const qBone = new THREE.Quaternion();
  const dirWorld = new THREE.Vector3();

  handBone.traverse((obj) => {
    const name = obj.name || '';
    for (const d of defs) {
      if (d.re.test(name)) {
        obj.getWorldPosition(pBone);
        obj.getWorldQuaternion(qBone);
        if (obj.children[0]) {
          obj.children[0].getWorldPosition(pChild);
          dirWorld.copy(pChild).sub(pBone);
        } else {
          dirWorld.copy(basis.fingerDirLocal).applyQuaternion(qHand);
        }
        if (dirWorld.lengthSq() < 1e-8) {
          dirWorld.copy(basis.fingerDirLocal).applyQuaternion(qHand);
        }
        dirWorld.normalize();

        // Thumb opposes across the palm toward pinky side + palm normal; fingers curl straight toward palmNormal
        const targetCurlDirWorld =
          d.group === 'thumb'
            ? palmWorld.clone().multiplyScalar(0.68).addScaledVector(thumbWorld, -0.73).normalize()
            : palmWorld;

        const qBoneInv = qBone.clone().invert();
        const dirLocal = dirWorld.clone().applyQuaternion(qBoneInv).normalize();
        const curlGoalLocal = targetCurlDirWorld.clone().applyQuaternion(qBoneInv).normalize();
        const curlAxisLocal = new THREE.Vector3().crossVectors(dirLocal, curlGoalLocal);
        if (curlAxisLocal.lengthSq() < 1e-6) {
          curlAxisLocal.set(0, 0, 1);
        } else {
          curlAxisLocal.normalize();
        }

        specs.push({
          bone: obj,
          restQuat: obj.quaternion.clone(),
          curlAxisLocal,
          fingerGroup: d.group,
          phalanx: d.phalanx,
        });
        break;
      }
    }
  });

  return specs;
}

function createPalmMarker(handBone: THREE.Object3D | undefined, basis: HandBasis | null): THREE.Group | null {
  if (!handBone) return null;
  handBone.updateMatrixWorld(true);
  const ws = new THREE.Vector3();
  handBone.getWorldScale(ws);

  const marker = new THREE.Group();
  marker.scale.set(
    1 / Math.max(0.0001, ws.x),
    1 / Math.max(0.0001, ws.y),
    1 / Math.max(0.0001, ws.z),
  );

  if (basis) {
    // Center grip socket right in the middle of the palm hollow (4.2cm down fingers, 2.2cm off palm surface)
    marker.position
      .copy(basis.fingerDirLocal)
      .multiplyScalar(0.042 / Math.max(0.0001, ws.y))
      .addScaledVector(basis.palmNormalLocal, 0.022 / Math.max(0.0001, ws.x));
  } else {
    marker.position.set(0, 0.035 / Math.max(0.0001, ws.y), 0.015 / Math.max(0.0001, ws.z));
  }
  handBone.add(marker);
  return marker;
}

function orientHandWorld(
  handBone: THREE.Object3D,
  basis: HandBasis,
  desThumb: THREE.Vector3,
  desFinger: THREE.Vector3,
  desPalm: THREE.Vector3,
): void {
  if (basis.isRight) {
    _mDesWorld.makeBasis(desThumb, desFinger, desPalm);
  } else {
    _mDesWorld.makeBasis(desFinger, desThumb, desPalm);
  }
  _mResultWorld.multiplyMatrices(_mDesWorld, basis.basisInv);
  _qHandTargetWorld.setFromRotationMatrix(_mResultWorld);
  if (handBone.parent) {
    handBone.parent.updateMatrixWorld(true);
    handBone.parent.getWorldQuaternion(_qParentWorld);
    handBone.quaternion.copy(_qParentWorld).invert().multiply(_qHandTargetWorld);
  } else {
    handBone.quaternion.copy(_qHandTargetWorld);
  }
  handBone.updateMatrixWorld(true);
}

function applyFingersGripCurl(
  fingers: FingerJointSpec[],
  mode: 'right_grip' | 'left_cradle',
  firing: boolean,
): void {
  for (const f of fingers) {
    f.bone.quaternion.copy(f.restQuat);
    let angle = 0;
    if (mode === 'right_grip') {
      if (f.fingerGroup === 'thumb') {
        angle = f.phalanx === 1 ? 0.45 : f.phalanx === 2 ? 0.58 : 0.42;
      } else if (f.fingerGroup === 'index') {
        const pull = firing ? 0.25 : 0;
        angle = f.phalanx === 1 ? 0.52 + pull : f.phalanx === 2 ? 0.78 + pull : 0.52;
      } else {
        angle = f.phalanx === 1 ? 1.08 : f.phalanx === 2 ? 1.28 : 0.88;
      }
    } else {
      if (f.fingerGroup === 'thumb') {
        angle = f.phalanx === 1 ? 0.34 : f.phalanx === 2 ? 0.44 : 0.28;
      } else {
        angle = f.phalanx === 1 ? 0.88 : f.phalanx === 2 ? 1.12 : 0.78;
      }
    }
    _qFingerCurl.setFromAxisAngle(f.curlAxisLocal, angle);
    f.bone.quaternion.multiply(_qFingerCurl);
  }
}

export function createGlbRigInstance(
  template: LoadedGlbTemplate,
  actorId: string,
  flipFacing: boolean,
): GlbRigInstance {
  const wrapper = new THREE.Group();
  const pivot = new THREE.Group();
  wrapper.add(pivot);

  const cloned = SkeletonUtils.clone(template.scene) as THREE.Group;

  // Measure unscaled bounds to normalize height to 1.78m soldier scale
  cloned.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(cloned);
  const size = new THREE.Vector3();
  box.getSize(size);

  const safeHeight = size.y > 0.01 ? size.y : 1.78;
  const targetHeight = 1.78;
  const scaleFactor = targetHeight / safeHeight;
  cloned.scale.multiplyScalar(scaleFactor);

  // Recompute bounds after scaling and ground feet cleanly at y = 0, centered on X/Z
  cloned.updateMatrixWorld(true);
  const scaledBox = new THREE.Box3().setFromObject(cloned);
  const scaledCenter = new THREE.Vector3();
  scaledBox.getCenter(scaledCenter);
  cloned.position.x -= scaledCenter.x;
  cloned.position.z -= scaledCenter.z;
  cloned.position.y -= scaledBox.min.y;

  pivot.add(cloned);
  pivot.rotation.y = flipFacing ? Math.PI : 0;

  // Tag hit zones & enable shadows on all meshes inside the GLB
  const worldPos = new THREE.Vector3();
  cloned.updateMatrixWorld(true);
  cloned.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.userData.actorId = actorId;
      mesh.getWorldPosition(worldPos);
      const isHead =
        /head|helmet|hat|face|hair|neck|visor|eye|teeth|glasses/i.test(mesh.name) || worldPos.y > 1.38;
      mesh.userData.hitZone = isHead ? 'head' : 'body';

      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (m && 'envMapIntensity' in m) {
          (m as THREE.MeshStandardMaterial).envMapIntensity = 0.85;
        }
      }
    }
  });

  // Map humanoid skeleton bones flexibly (handles mixamorigRightArm, mixamorig:RightArm, RightArm, Bip01, etc.)
  const bones: MappedBones = {
    hips: findBoneByPatterns(cloned, [/(?:mixamorig[:_]?)?hips$|pelvis|root_jnt|bip01_pelvis/i]),
    spine: findBoneByPatterns(cloned, [/(?:mixamorig[:_]?)?spine2$|chest|(?:mixamorig[:_]?)?spine1$|spine_01|torso|(?:mixamorig[:_]?)?spine$/i]),
    neck: findBoneByPatterns(cloned, [/(?:mixamorig[:_]?)?neck$|neck_01|bip01_neck|bip01 neck/i]),
    head: findBoneByPatterns(cloned, [/(?:mixamorig[:_]?)?head$|head_01|bip01_head/i]),
    leftUpLeg: findBoneByPatterns(cloned, [/(?:mixamorig[:_]?)?leftupleg$|thigh_l|upleg_l|upperleg.*l|l_thigh|left_thigh|leg\.l|bip01 l thigh/i]),
    leftLeg: findBoneByPatterns(cloned, [/(?:mixamorig[:_]?)?leftleg$|calf_l|shin_l|lowerleg.*l|knee_l|l_calf|left_shin|shin\.l|bip01 l calf/i]),
    rightUpLeg: findBoneByPatterns(cloned, [/(?:mixamorig[:_]?)?rightupleg$|thigh_r|upleg_r|upperleg.*r|r_thigh|right_thigh|leg\.r|bip01 r thigh/i]),
    rightLeg: findBoneByPatterns(cloned, [/(?:mixamorig[:_]?)?rightleg$|calf_r|shin_r|lowerleg.*r|knee_r|r_calf|right_shin|shin\.r|bip01 r calf/i]),
    leftShoulder: findBoneByPatterns(cloned, [/(?:mixamorig[:_]?)?leftshoulder$|shoulder_l|clavicle_l|l_clavicle|bip01 l clavicle/i]),
    leftArm: findBoneByPatterns(cloned, [/(?:mixamorig[:_]?)?(?:leftarm|leftupperarm)$|upperarm_l|l_upperarm|upper_arm\.l|\barm_l\b|bip01 l upperarm/i]),
    leftForeArm: findBoneByPatterns(cloned, [/(?:mixamorig[:_]?)?leftforearm$|forearm_l|lowerarm_l|elbow_l|l_forearm|forearm\.l|bip01 l forearm/i]),
    leftHand: findBoneByPatterns(cloned, [/(?:mixamorig[:_]?)?lefthand$|hand_l$|l_hand$|wrist_l$|hand\.l$|bip01 l hand$/i]),
    rightShoulder: findBoneByPatterns(cloned, [/(?:mixamorig[:_]?)?rightshoulder$|shoulder_r|clavicle_r|r_clavicle|bip01 r clavicle/i]),
    rightArm: findBoneByPatterns(cloned, [/(?:mixamorig[:_]?)?(?:rightarm|rightupperarm)$|upperarm_r|r_upperarm|upper_arm\.r|\barm_r\b|bip01 r upperarm/i]),
    rightForeArm: findBoneByPatterns(cloned, [/(?:mixamorig[:_]?)?rightforearm$|forearm_r|lowerarm_r|elbow_r|r_forearm|forearm\.r|bip01 r forearm/i]),
    rightHand: findBoneByPatterns(cloned, [/(?:mixamorig[:_]?)?righthand$|hand_r$|r_hand$|wrist_r$|hand\.r$|bip01 r hand$/i]),
  };

  // Calibrate anatomical palm/finger frames in bind pose BEFORE animations mutate anything
  const rightHandBasis = calibrateHandBasis(bones.rightHand, true);
  const leftHandBasis = calibrateHandBasis(bones.leftHand, false);

  const rightHandSocket = createPalmMarker(bones.rightHand || bones.rightForeArm, rightHandBasis);
  const leftHandPalmMarker = createPalmMarker(bones.leftHand || bones.leftForeArm, leftHandBasis);

  const rightFingers = collectFingerSpecs(bones.rightHand, rightHandBasis, 'Right');
  const leftFingers = collectFingerSpecs(bones.leftHand, leftHandBasis, 'Left');

  const restPoses = new Map<THREE.Object3D, BoneRestPose>();
  Object.values(bones).forEach((b) => {
    if (b) {
      restPoses.set(b, { rot: b.rotation.clone(), quat: b.quaternion.clone(), pos: b.position.clone() });
    }
  });

  // Setup AnimationMixer & classify clips if the GLB includes animations
  let mixer: THREE.AnimationMixer | null = null;
  let activeAction: THREE.AnimationAction | null = null;
  const actions: {
    idle?: THREE.AnimationAction;
    walk?: THREE.AnimationAction;
    run?: THREE.AnimationAction;
    jump?: THREE.AnimationAction;
    crouch?: THREE.AnimationAction;
    dance?: THREE.AnimationAction;
  } = {};

  if (template.animations.length > 0) {
    const clips = template.animations;
    const findClip = (re: RegExp) => clips.find((c) => re.test(c.name));

    const idleClip =
      findClip(/idle|stand|breath|aim/i) ||
      clips.find((c) => !/dance|samba|emote|tpose|t-pose/i.test(c.name));
    const walkClip = findClip(/walk|jog|strafe/i);
    const runClip = findClip(/run|sprint/i) || walkClip;
    const jumpClip = findClip(/jump|air|fall/i);
    const crouchClip = findClip(/crouch|sneak|duck/i);
    const danceClip = findClip(/dance|samba|emote|wave|victory|salute/i);

    if (idleClip || walkClip || runClip || crouchClip || jumpClip) {
      mixer = new THREE.AnimationMixer(cloned);
      if (idleClip) actions.idle = mixer.clipAction(idleClip);
      if (walkClip) actions.walk = mixer.clipAction(walkClip);
      if (runClip) actions.run = mixer.clipAction(runClip);
      if (jumpClip) actions.jump = mixer.clipAction(jumpClip);
      if (crouchClip) actions.crouch = mixer.clipAction(crouchClip);
      if (danceClip) actions.dance = mixer.clipAction(danceClip);

      if (actions.idle) {
        actions.idle.play();
        activeAction = actions.idle;
      }
    }
  }

  let walkPhase = 0;
  let peekDamped = 0;
  let crouchDamped = 0;
  let proneDamped = 0;
  let legYawDamped = 0;

  const switchAction = (next?: THREE.AnimationAction, timeScale = 1) => {
    if (!next) return;
    next.timeScale = timeScale;
    if (activeAction === next) return;
    if (activeAction) {
      activeAction.fadeOut(0.16);
    }
    next.reset().fadeIn(0.16).play();
    activeAction = next;
  };

  const setFlip = (flip: boolean) => {
    pivot.rotation.y = flip ? Math.PI : 0;
  };

  // Bend ONLY the neck (and slightly head) toward the peek direction without tilting the body/torso
  const applyNeckPeekOnly = () => {
    if (Math.abs(peekDamped) < 0.002) return;
    wrapper.updateMatrixWorld(true);
    wrapper.getWorldQuaternion(_qWrapWorld);
    _wFwd.set(0, 0, 1).applyQuaternion(_qWrapWorld);

    const neckTarget = bones.neck || bones.head;
    if (neckTarget) {
      _qDelta.setFromAxisAngle(_wFwd, peekDamped * 0.46);
      neckTarget.getWorldQuaternion(_qWorld);
      _qWorld.premultiply(_qDelta);
      if (neckTarget.parent) {
        neckTarget.parent.updateMatrixWorld(true);
        neckTarget.parent.getWorldQuaternion(_qParentWorld);
        neckTarget.quaternion.copy(_qParentWorld).invert().multiply(_qWorld);
      } else {
        neckTarget.quaternion.copy(_qWorld);
      }
      neckTarget.updateMatrixWorld(true);
    }

    if (bones.neck && bones.head) {
      _qDelta.setFromAxisAngle(_wFwd, peekDamped * 0.14);
      bones.head.getWorldQuaternion(_qWorld);
      _qWorld.premultiply(_qDelta);
      if (bones.head.parent) {
        bones.head.parent.updateMatrixWorld(true);
        bones.head.parent.getWorldQuaternion(_qParentWorld);
        bones.head.quaternion.copy(_qParentWorld).invert().multiply(_qWorld);
      } else {
        bones.head.quaternion.copy(_qWorld);
      }
      bones.head.updateMatrixWorld(true);
    }
  };

  const applyRightHandWeaponIK = ({
    speedRatio,
    aimPitch,
    recoil,
    isPistol,
    firing,
  }: {
    speedRatio: number;
    aimPitch: number;
    recoil: number;
    isPistol: boolean;
    firing: boolean;
  }) => {
    if (!bones.rightArm || !bones.rightForeArm || !rightHandSocket) return;

    // Reset right shoulder + arm + wrist to bind rest pose so Run/Walk swing NEVER pulls hands down to thighs!
    const restRS = bones.rightShoulder ? restPoses.get(bones.rightShoulder) : undefined;
    const restRA = restPoses.get(bones.rightArm);
    const restRF = restPoses.get(bones.rightForeArm);
    const restRH = bones.rightHand ? restPoses.get(bones.rightHand) : undefined;
    if (bones.rightShoulder && restRS) bones.rightShoulder.quaternion.copy(restRS.quat);
    if (restRA) bones.rightArm.quaternion.copy(restRA.quat);
    if (restRF) bones.rightForeArm.quaternion.copy(restRF.quat);
    if (bones.rightHand && restRH) bones.rightHand.quaternion.copy(restRH.quat);

    wrapper.updateMatrixWorld(true);
    wrapper.getWorldQuaternion(_qWrapWorld);
    _wRight.set(-1, 0, 0).applyQuaternion(_qWrapWorld); // Player's right side (-X in local wrapper)
    _wUp.set(0, 1, 0).applyQuaternion(_qWrapWorld);
    _wFwd.set(0, 0, 1).applyQuaternion(_qWrapWorld);

    bones.rightArm.getWorldPosition(_pUpper);
    const bobY = Math.sin(walkPhase * 2) * 0.012 * speedRatio;
    const bobX = Math.cos(walkPhase) * 0.01 * speedRatio;

    const isRunning = speedRatio > 0.65 && !firing;
    const sprintCant = isRunning ? 0.18 : 0;
    const tacticalYaw = isPistol ? 0.08 : 0.34 + sprintCant * 0.2;

    // Always position right hand firmly in front of chest / right shoulder pocket — NEVER at hip/thigh!
    const inRight = isPistol ? 0.115 : 0.115;
    const forwardDist = (isPistol ? 0.25 : 0.145) - recoil * 0.045 + aimPitch * 0.025;
    const downDist = (isPistol ? 0.06 : 0.105) + sprintCant * 0.13 - aimPitch * 0.14 - bobY;

    _targetWorld
      .copy(_pUpper)
      .addScaledVector(_wRight, -inRight + bobX) // inward toward sternum (+X)
      .addScaledVector(_wFwd, forwardDist)
      .addScaledVector(_wUp, -downDist);

    // Desired world frame for RightHand holding pistol grip
    _eAim.set(-aimPitch * 0.72 - recoil * 0.75 - sprintCant * 0.12, tacticalYaw, sprintCant * 0.1, 'XYZ');
    _qAimLocal.setFromEuler(_eAim);
    _qAimWorld.multiplyQuaternions(_qWrapWorld, _qAimLocal);
    _desThumb.set(0, 0.32, 1).normalize().applyQuaternion(_qAimWorld);
    _desPalm.set(1, 0, 0).applyQuaternion(_qAimWorld).normalize();
    _desFinger.crossVectors(_desPalm, _desThumb).normalize();
    _desPalm.crossVectors(_desThumb, _desFinger).normalize();

    // Solve 2-bone IK directly to RightHand wrist center so RightPalmSocket hits _targetWorld with 0 drift after wrist orient
    if (bones.rightHand && rightHandBasis) {
      _targetWorld.addScaledVector(_desFinger, -0.042).addScaledVector(_desPalm, -0.022);
    }

    // Right elbow pole: down, slightly outward & back
    _poleWorld
      .copy(_pUpper)
      .addScaledVector(_wRight, 0.26)
      .addScaledVector(_wUp, -0.34)
      .addScaledVector(_wFwd, -0.06);

    solveTwoBoneWorldIK(
      bones.rightArm,
      bones.rightForeArm,
      bones.rightHand || rightHandSocket,
      _targetWorld,
      _poleWorld,
    );

    // Orient right wrist so palm presses firmly onto the pistol grip backstrap and thumb sits on top
    if (bones.rightHand && rightHandBasis) {
      orientHandWorld(bones.rightHand, rightHandBasis, _desThumb, _desFinger, _desPalm);
    }

    applyFingersGripCurl(rightFingers, 'right_grip', firing);
  };

  const alignLeftHandToWorldTarget = (
    targetWorldPos: THREE.Vector3,
    isPistol = false,
    aimPitch = 0,
    recoil = 0,
    sprintCant = 0,
  ) => {
    if (!bones.leftArm || !bones.leftForeArm || !leftHandPalmMarker) return;

    const restLS = bones.leftShoulder ? restPoses.get(bones.leftShoulder) : undefined;
    const restLA = restPoses.get(bones.leftArm);
    const restLF = restPoses.get(bones.leftForeArm);
    const restLH = bones.leftHand ? restPoses.get(bones.leftHand) : undefined;
    if (bones.leftShoulder && restLS) bones.leftShoulder.quaternion.copy(restLS.quat);
    if (restLA) bones.leftArm.quaternion.copy(restLA.quat);
    if (restLF) bones.leftForeArm.quaternion.copy(restLF.quat);
    if (bones.leftHand && restLH) bones.leftHand.quaternion.copy(restLH.quat);

    wrapper.updateMatrixWorld(true);
    wrapper.getWorldQuaternion(_qWrapWorld);
    _wRight.set(-1, 0, 0).applyQuaternion(_qWrapWorld);
    _wUp.set(0, 1, 0).applyQuaternion(_qWrapWorld);
    _wFwd.set(0, 0, 1).applyQuaternion(_qWrapWorld);

    // Gently reach left clavicle forward (+X rotated toward +Z around _wUp by -0.34 rad) in world space
    if (bones.leftShoulder) {
      _qDelta.setFromAxisAngle(_wUp, -0.34);
      bones.leftShoulder.getWorldQuaternion(_qWorld);
      _qWorld.premultiply(_qDelta);
      if (bones.leftShoulder.parent) {
        bones.leftShoulder.parent.getWorldQuaternion(_qParentWorld);
        bones.leftShoulder.quaternion.copy(_qParentWorld).invert().multiply(_qWorld);
      }
      bones.leftShoulder.updateMatrixWorld(true);
    }

    const tacticalYaw = isPistol ? 0.08 : 0.34 + sprintCant * 0.2;
    _eAim.set(-aimPitch * 0.72 - recoil * 0.75 - sprintCant * 0.12, tacticalYaw, sprintCant * 0.1, 'XYZ');
    _qAimLocal.setFromEuler(_eAim);
    _qAimWorld.multiplyQuaternions(_qWrapWorld, _qAimLocal);

    // Thumb points forward along barrel; palm cradles UP & inward toward character-right (-X)
    _desThumb.set(0, 0.12, 1).normalize().applyQuaternion(_qAimWorld);
    _desPalm.set(-0.55, 0.83, 0).normalize().applyQuaternion(_qAimWorld);
    _desFinger.crossVectors(_desThumb, _desPalm).normalize();
    _desPalm.crossVectors(_desFinger, _desThumb).normalize();

    _targetWorld.copy(targetWorldPos);
    if (bones.leftHand && leftHandBasis) {
      _targetWorld.addScaledVector(_desFinger, -0.042).addScaledVector(_desPalm, -0.022);
    }

    bones.leftArm.getWorldPosition(_pUpper);
    _poleWorld
      .copy(_pUpper)
      .addScaledVector(_wRight, isPistol ? -0.18 : -0.22)
      .addScaledVector(_wUp, -0.36)
      .addScaledVector(_wFwd, 0.04);

    solveTwoBoneWorldIK(
      bones.leftArm,
      bones.leftForeArm,
      bones.leftHand || leftHandPalmMarker,
      _targetWorld,
      _poleWorld,
    );

    // Orient left wrist so palm cradles the underside/left side of the weapon handguard
    if (bones.leftHand && leftHandBasis) {
      orientHandWorld(bones.leftHand, leftHandBasis, _desThumb, _desFinger, _desPalm);
    }

    applyFingersGripCurl(leftFingers, 'left_cradle', false);
  };

  const update = ({
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
    throwingGrenade = false,
    punchProgress = 0,
    isPistol = false,
    firing = false,
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
    isPistol?: boolean;
    firing?: boolean;
  }) => {
    peekDamped = THREE.MathUtils.damp(peekDamped, prone ? 0 : peek, 14, dt);
    crouchDamped = THREE.MathUtils.damp(crouchDamped, crouch && !prone ? 1 : 0, 14, dt);
    proneDamped = THREE.MathUtils.damp(proneDamped, prone ? 1 : 0, 12, dt);

    const dirSign = moveForward < -0.18 ? -1 : 1;
    if (moveSpeed > 0.2 && grounded) {
      walkPhase += dt * Math.max(6.2, moveSpeed * 2.05);
    } else {
      walkPhase = THREE.MathUtils.damp(
        walkPhase,
        Math.round(walkPhase / Math.PI) * Math.PI,
        10,
        dt,
      );
    }

    let targetLegYaw = 0;
    if (moveSpeed > 0.35 && grounded && proneDamped < 0.35) {
      if (moveForward >= -0.2) {
        targetLegYaw = THREE.MathUtils.clamp(Math.atan2(-moveStrafe, Math.max(0.3, moveForward)), -0.82, 0.82);
      } else {
        targetLegYaw = THREE.MathUtils.clamp(-Math.atan2(-moveStrafe, -moveForward), -0.65, 0.65);
      }
    }
    legYawDamped = THREE.MathUtils.damp(legYawDamped, targetLegYaw, 14, dt);

    const speedRatio = THREE.MathUtils.clamp(moveSpeed / 6.2, 0, 1);
    const punchSwing = punchProgress > 0 ? Math.sin(punchProgress * Math.PI) : 0;
    const isEmoting = emote !== 'none' && moveSpeed < 0.35;
    const holdingWeapon = !throwingGrenade && punchSwing <= 0.05 && !isEmoting;
    const isFiring = firing || recoil > 0.015;

    let usingClipLocomotion = false;
    if (mixer) {
      if (isEmoting && actions.dance) {
        switchAction(actions.dance, 1);
        usingClipLocomotion = true;
      } else if (!grounded && actions.jump) {
        switchAction(actions.jump, 1);
        usingClipLocomotion = true;
      } else if (prone) {
        const clip = actions.crouch || actions.walk || actions.idle;
        if (clip) {
          switchAction(clip, moveSpeed > 0.15 ? dirSign * 0.75 : 0.12);
          usingClipLocomotion = true;
        }
      } else if (crouch && actions.crouch) {
        switchAction(actions.crouch, moveSpeed > 0.25 ? dirSign * 0.95 : 0.25);
        usingClipLocomotion = true;
      } else if (moveSpeed > 4.4 && actions.run) {
        switchAction(actions.run, dirSign * Math.max(0.92, moveSpeed / 5.4));
        usingClipLocomotion = true;
      } else if (moveSpeed > 0.22 && (actions.walk || actions.run)) {
        const clip = actions.walk || actions.run;
        switchAction(clip, dirSign * Math.max(0.7, moveSpeed / 3.4));
        usingClipLocomotion = true;
      } else if (actions.idle) {
        switchAction(actions.idle, 1);
        usingClipLocomotion = true;
      }
      if (bones.neck) bones.neck.quaternion.copy(restPoses.get(bones.neck)!.quat);
      if (bones.head) bones.head.quaternion.copy(restPoses.get(bones.head)!.quat);
      mixer.update(dt);

      if (usingClipLocomotion) {
        const jumpLift = !grounded ? 0.08 : 0;
        const strafeBank = THREE.MathUtils.clamp(moveStrafe * 0.022, -0.12, 0.12) * (1 - proneDamped);
        const crouchDrop = actions.crouch ? 0 : crouchDamped * 0.42;
        wrapper.position.y = THREE.MathUtils.lerp(-crouchDrop + jumpLift, 0.18, proneDamped);
        wrapper.scale.y = THREE.MathUtils.lerp(actions.crouch ? 1 : 1 - crouchDamped * 0.12, 1, proneDamped);
        wrapper.rotation.x = proneDamped * 1.42;
        wrapper.rotation.z = -strafeBank;
        wrapper.rotation.y = punchSwing * 0.45 * (1 - proneDamped);
        wrapper.position.x = 0;
        wrapper.position.z = punchSwing * 0.26 * (1 - proneDamped) - proneDamped * 0.35;

        applyNeckPeekOnly();

        if (holdingWeapon) {
          applyRightHandWeaponIK({ speedRatio, aimPitch, recoil, isPistol, firing: isFiring });
        }
        return;
      }
    }

    // Procedural biomechanical leg & arm kinematics (e.g. Michelle / custom un-animated GLBs)
    const hasLegBones = Boolean(bones.leftUpLeg && bones.rightUpLeg);
    const hipAmp = speedRatio * (crouch ? 0.56 : 0.88);
    const kneeAmp = speedRatio * (crouch ? 0.5 : 0.96);
    const sinL = Math.sin(walkPhase);
    const cosL = Math.cos(walkPhase);
    const sinR = -sinL;
    const cosR = -cosL;

    if (hasLegBones) {
      const restL = restPoses.get(bones.leftUpLeg!)!;
      const restR = restPoses.get(bones.rightUpLeg!)!;
      if (!grounded) {
        bones.leftUpLeg!.rotation.x = restL.rot.x - 0.58;
        bones.rightUpLeg!.rotation.x = restR.rot.x - 0.22;
        if (bones.leftLeg && bones.rightLeg) {
          bones.leftLeg.rotation.x = restPoses.get(bones.leftLeg)!.rot.x + 0.95;
          bones.rightLeg.rotation.x = restPoses.get(bones.rightLeg)!.rot.x + 0.52;
        }
      } else if (dirSign < 0) {
        bones.leftUpLeg!.rotation.x = restL.rot.x - crouchDamped * 0.72 + sinL * hipAmp * 0.9;
        bones.rightUpLeg!.rotation.x = restR.rot.x - crouchDamped * 0.72 + sinR * hipAmp * 0.9;
        if (bones.leftLeg && bones.rightLeg) {
          const restKL = restPoses.get(bones.leftLeg)!;
          const restKR = restPoses.get(bones.rightLeg)!;
          bones.leftLeg.rotation.x = restKL.rot.x + crouchDamped * 1.25 + Math.max(0, -cosL * 0.9 + sinL * 0.3) * kneeAmp;
          bones.rightLeg.rotation.x = restKR.rot.x + crouchDamped * 1.25 + Math.max(0, -cosR * 0.9 + sinR * 0.3) * kneeAmp;
        }
      } else {
        const crouchHipAngle = -crouchDamped * 0.72;
        bones.leftUpLeg!.rotation.x = restL.rot.x + crouchHipAngle - sinL * hipAmp;
        bones.rightUpLeg!.rotation.x = restR.rot.x + crouchHipAngle - sinR * hipAmp;
        if (bones.leftLeg && bones.rightLeg) {
          const restKL = restPoses.get(bones.leftLeg)!;
          const restKR = restPoses.get(bones.rightLeg)!;
          const crouchKneeAngle = crouchDamped * 1.25;
          bones.leftLeg.rotation.x = restKL.rot.x + crouchKneeAngle + Math.max(0, cosL * 0.95 - sinL * 0.3) * kneeAmp;
          bones.rightLeg.rotation.x = restKR.rot.x + crouchKneeAngle + Math.max(0, cosR * 0.95 - sinR * 0.3) * kneeAmp;
        }
      }

      if (bones.hips) {
        const restHip = restPoses.get(bones.hips)!;
        bones.hips.rotation.y = restHip.rot.y + legYawDamped * (1 - proneDamped) + sinL * dirSign * 0.1 * speedRatio;
      }

      if (bones.spine) {
        const restS = restPoses.get(bones.spine)!;
        bones.spine.rotation.x = restS.rot.x + crouchDamped * 0.2 + speedRatio * 0.14 - aimPitch * 0.35;
        bones.spine.rotation.y =
          restS.rot.y - legYawDamped * 0.85 * (1 - proneDamped) - sinL * dirSign * 0.08 * speedRatio + punchSwing * 0.55;
        bones.spine.rotation.z = restS.rot.z;
      }

      if (bones.neck) {
        bones.neck.quaternion.copy(restPoses.get(bones.neck)!.quat);
      }
      if (bones.head) {
        const restH = restPoses.get(bones.head)!;
        bones.head.quaternion.copy(restH.quat);
        bones.head.rotation.x = restH.rot.x - aimPitch * 0.4;
      }

      const strafeBank = THREE.MathUtils.clamp(moveStrafe * 0.022, -0.12, 0.12) * (1 - proneDamped);
      const isBackflip = emote === 'backflip' && moveSpeed < 0.35;
      const flipCycle = isBackflip ? (time * 0.78) % 1 : 0;
      wrapper.position.y = isBackflip
        ? Math.sin(flipCycle * Math.PI) * 1.1
        : THREE.MathUtils.lerp(
            -crouchDamped * 0.36 + (grounded ? Math.abs(sinL) * speedRatio * 0.065 : 0.06),
            0.18,
            proneDamped,
          );
      wrapper.position.x = cosL * speedRatio * 0.025 * (1 - proneDamped);
      wrapper.position.z = punchSwing * 0.22 * (1 - proneDamped) - proneDamped * 0.35;
      wrapper.rotation.x = isBackflip ? -flipCycle * Math.PI * 2 : proneDamped * 1.42;
      wrapper.rotation.z = -strafeBank;

      applyNeckPeekOnly();

      if (bones.leftArm && bones.rightArm) {
        const restLA = restPoses.get(bones.leftArm)!;
        const restRA = restPoses.get(bones.rightArm)!;
        const armSwing = sinL * dirSign * speedRatio * 0.65;
        if (punchSwing > 0.01) {
          bones.rightArm.rotation.x = restRA.rot.x - punchSwing * 1.45;
          bones.leftArm.rotation.x = restLA.rot.x - 0.5;
        } else if (isEmoting) {
          const t = time * 4.5;
          if (emote === 'salute') {
            bones.rightArm.rotation.x = restRA.rot.x - 1.5;
            bones.leftArm.rotation.x = restLA.rot.x;
            if (bones.rightForeArm) bones.rightForeArm.rotation.x = restPoses.get(bones.rightForeArm)!.rot.x - 1.5;
          } else if (emote === 'shadow_box') {
            bones.leftArm.rotation.x = restLA.rot.x - 1.3 + Math.sin(t * 2.5) * 0.6;
            bones.rightArm.rotation.x = restRA.rot.x - 1.3 - Math.sin(t * 2.5) * 0.6;
          } else if (emote === 'clap') {
            const c = Math.abs(Math.sin(t * 2));
            bones.leftArm.rotation.x = restLA.rot.x - 1.1;
            bones.rightArm.rotation.x = restRA.rot.x - 1.1;
            bones.leftArm.rotation.y = restLA.rot.y + 0.4 * c;
            bones.rightArm.rotation.y = restRA.rot.y - 0.4 * c;
          } else if (emote === 'muscle_flex') {
            bones.leftArm.rotation.z = restLA.rot.z + 1.1;
            bones.rightArm.rotation.z = restRA.rot.z - 1.1;
            if (bones.leftForeArm && bones.rightForeArm) {
              bones.leftForeArm.rotation.x = restPoses.get(bones.leftForeArm)!.rot.x - 1.6;
              bones.rightForeArm.rotation.x = restPoses.get(bones.rightForeArm)!.rot.x - 1.6;
            }
          } else if (emote === 'taunt_wave') {
            bones.rightArm.rotation.x = restRA.rot.x - 1.45;
            if (bones.rightForeArm) bones.rightForeArm.rotation.x = restPoses.get(bones.rightForeArm)!.rot.x - 0.9 + Math.sin(t * 2.4) * 0.55;
            bones.leftArm.rotation.x = restLA.rot.x;
          } else {
            bones.leftArm.rotation.x = restLA.rot.x - 1.2 + Math.sin(t) * 0.4;
            bones.rightArm.rotation.x = restRA.rot.x - 1.2 - Math.sin(t) * 0.4;
          }
        } else if (holdingWeapon) {
          applyRightHandWeaponIK({ speedRatio, aimPitch, recoil, isPistol, firing: isFiring });
        } else {
          bones.leftArm.rotation.x = restLA.rot.x - armSwing;
          bones.rightArm.rotation.x = restRA.rot.x + armSwing;
          if (bones.leftForeArm && bones.rightForeArm) {
            bones.leftForeArm.rotation.x = restPoses.get(bones.leftForeArm)!.rot.x - 0.35 - Math.max(0, -armSwing) * 0.4;
            bones.rightForeArm.rotation.x = restPoses.get(bones.rightForeArm)!.rot.x - 0.35 - Math.max(0, armSwing) * 0.4;
          }
        }
      }
    } else {
      wrapper.position.y = THREE.MathUtils.lerp(
        -crouchDamped * 0.26 + (grounded ? Math.abs(Math.sin(walkPhase)) * speedRatio * 0.09 : 0.06),
        0.18,
        proneDamped,
      );
      wrapper.scale.y = THREE.MathUtils.lerp(1 - crouchDamped * 0.24, 1, proneDamped);
      wrapper.rotation.x =
        proneDamped * 1.42 + (1 - proneDamped) * (speedRatio * 0.1 + Math.sin(walkPhase) * speedRatio * 0.05);
      wrapper.rotation.y = punchSwing * 0.42 * (1 - proneDamped);
      wrapper.rotation.z = Math.cos(walkPhase) * speedRatio * 0.04;
      wrapper.position.x = 0;
      wrapper.position.z = punchSwing * 0.24 * (1 - proneDamped) - proneDamped * 0.35;
      if (bones.neck) bones.neck.quaternion.copy(restPoses.get(bones.neck)!.quat);
      if (bones.head) bones.head.quaternion.copy(restPoses.get(bones.head)!.quat);
      applyNeckPeekOnly();
    }
  };

  const dispose = () => {
    mixer?.stopAllAction();
    cloned.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (m.isMesh) {
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) {
          mat?.dispose();
        }
      }
    });
  };

  return {
    wrapper,
    rightHandSocket,
    setFlip,
    update,
    alignLeftHandToWorldTarget,
    dispose,
  };
}
