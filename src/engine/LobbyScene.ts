import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { EmoteId, HelmetId, OutfitId, WeaponId } from '../game/types';
import { loadGlbTemplate } from '../services/customCharacterStore';
import { createSoldierRig, type SoldierRig } from './soldierModel';

export function detectSoftwareWebGL(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

export class LobbySceneController {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private soldier: SoldierRig;
  private isSoftwareGl: boolean;
  private clock = new THREE.Clock();
  private frameId = 0;
  private disposed = false;
  private targetRotY = 0.35;
  private currentRotY = 0.35;
  private dragging = false;
  private lastX = 0;
  private emote: EmoteId = 'none';
  private emoteUntil = 0;

  constructor(
    container: HTMLElement,
    initialOutfit: OutfitId,
    initialHelmet: HelmetId,
    initialWeapon: WeaponId,
    initialGlbId?: string | null,
    initialGlbFlip?: boolean,
  ) {
    this.container = container;
    this.isSoftwareGl = detectSoftwareWebGL();

    const renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !this.isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(container.clientWidth || 800, container.clientHeight || 600);
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0e14);
    scene.fog = new THREE.FogExp2(0x0b0e14, 0.045);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene = scene;

    const aspect = (container.clientWidth || 800) / (container.clientHeight || 600);
    const camera = new THREE.PerspectiveCamera(36, aspect, 0.1, 100);
    camera.position.set(0, 1.32, 3.65);
    camera.lookAt(0, 0.98, 0);
    this.camera = camera;

    // 3-Point Warm/Cool Studio Lighting
    const hemi = new THREE.HemisphereLight(0x94a3b8, 0x1e1b18, 0.85);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffedd5, 2.2);
    keyLight.position.set(3.2, 4.8, 3.6);
    keyLight.castShadow = !this.isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.35);
    rimLight.position.set(-3.5, 3.2, -3.4);
    scene.add(rimLight);

    // Tactical Turntable Pedestal
    const pedGroup = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.18, 1.34, 0.16, 40),
      new THREE.MeshStandardMaterial({ color: 0x171b22, roughness: 0.45, metalness: 0.65 }),
    );
    base.position.y = -0.08;
    base.receiveShadow = true;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.12, 1.18, 48),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.004;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: 0x0d1016, roughness: 0.9, metalness: 0.1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.16;
    floor.receiveShadow = true;
    pedGroup.add(base, ring, floor);
    scene.add(pedGroup);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    this.soldier = createSoldierRig('lobby_hero', initialOutfit, initialHelmet, initialWeapon, maxAniso);
    this.soldier.root.rotation.y = this.currentRotY;
    scene.add(this.soldier.root);

    if (initialGlbId) {
      this.updateCustomGlb(initialGlbId, Boolean(initialGlbFlip));
    }

    if (!this.isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    this.bindEvents();
    this.tick();
  }

  private onPointerDown = (e: PointerEvent) => {
    this.dragging = true;
    this.lastX = e.clientX;
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastX;
    this.lastX = e.clientX;
    this.targetRotY += dx * 0.012;
  };

  private onPointerUp = () => {
    this.dragging = false;
  };

  private onResize = () => {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private bindEvents() {
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('resize', this.onResize);
  }

  public updateLoadout(outfitId: OutfitId, helmetId: HelmetId, weaponId: WeaponId) {
    this.soldier.setLoadout(outfitId, helmetId, weaponId);
  }

  public updateCustomGlb(glbId: string | null | undefined, flip: boolean) {
    if (!glbId) {
      this.soldier.setCustomGlb(null, false);
      return;
    }
    loadGlbTemplate(glbId).then((tpl) => {
      if (this.disposed) return;
      this.soldier.setCustomGlb(tpl, flip);
    });
  }

  public triggerEmote(emote: EmoteId, durationMs = 3400) {
    this.emote = emote;
    this.emoteUntil = performance.now() + durationMs;
  }

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = () => {
    if (this.disposed) return;
    const dt = Math.min(0.05, this.clock.getDelta());
    const elapsed = this.clock.elapsedTime;

    if (this.emote !== 'none' && performance.now() > this.emoteUntil) {
      this.emote = 'none';
    }

    if (!this.dragging && this.emote === 'none') {
      this.targetRotY += dt * 0.16;
    }
    this.currentRotY = THREE.MathUtils.damp(this.currentRotY, this.targetRotY, 10, dt);

    this.soldier.updateAnimation({
      dt,
      time: elapsed,
      moveSpeed: 0,
      crouch: false,
      grounded: true,
      peek: 0,
      aimPitch: 0,
      emote: this.emote,
      recoil: 0,
    });
    // Set root yaw after updateAnimation resets root.rotation.y
    this.soldier.root.rotation.y = this.currentRotY;

    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('resize', this.onResize);
    this.soldier.dispose();
    this.renderer.dispose();
    if (dom.parentElement === this.container) {
      this.container.removeChild(dom);
    }
  }
}
