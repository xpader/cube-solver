import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Face } from './notation';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

export type StepDir = 'up' | 'down' | 'left' | 'right';

// 每个面的局部法向与该面内的"上方"方向（用于把该面转到正对相机）
const FACE_FRAME: Record<Face, { normal: THREE.Vector3; up: THREE.Vector3 }> = {
  U: { normal: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, -1) },
  D: { normal: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, 1) },
  L: { normal: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
  R: { normal: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
  F: { normal: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) },
  B: { normal: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0) },
};

export class CubeScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private raycaster = new THREE.Raycaster();
  private pickables: THREE.Object3D[] = [];
  private raf = 0;

  /** 视角旋转的对象（魔方根节点）。 */
  private viewTarget: THREE.Object3D | null = null;
  private viewAnim = 0;
  /** 意图目标朝向：每次点击只累加到此，动画始终追向它，避免连点漂移。 */
  private targetQuat = new THREE.Quaternion();

  /** 单击（非拖拽）时触发，命中贴纸则回传贴纸对象。 */
  onPick: ((sticker: THREE.Object3D | null) => void) | null = null;
  /** 右键单击时触发，命中贴纸则回传贴纸对象。 */
  onRightPick: ((sticker: THREE.Object3D | null) => void) | null = null;

  private pointerDown = { x: 0, y: 0, t: 0, moved: false };

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor(0x000000, 0);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      42,
      container.clientWidth / container.clientHeight,
      0.1,
      100,
    );
    this.camera.position.set(0, 0, 7.5);
    this.camera.lookAt(0, 0, 0);

    this.setupLights();
    this.setupEnvironment();
    this.setupGround();

    window.addEventListener('resize', this.handleResize);
    this.bindPointer();
    this.start();
  }

  private setupLights(): void {
    const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x4a4f5a, 1.0);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(5, 8, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 30;
    key.shadow.camera.left = -5;
    key.shadow.camera.right = 5;
    key.shadow.camera.top = 5;
    key.shadow.camera.bottom = -5;
    key.shadow.bias = -0.0002;
    key.shadow.normalBias = 0.02;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x88aaff, 0.5);
    fill.position.set(-6, 2, -4);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffd9b3, 0.5);
    rim.position.set(-3, 5, 6);
    this.scene.add(rim);

    // 下方补光：照亮底面（-Y 面）
    const bottom = new THREE.DirectionalLight(0xffffff, 0.8);
    bottom.position.set(1, -7, 2);
    this.scene.add(bottom);

    const ambient = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(ambient);
  }

  private setupEnvironment(): void {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = env.texture;
  }

  private setupGround(): void {
    const geo = new THREE.CircleGeometry(8, 64);
    const mat = new THREE.ShadowMaterial({ opacity: 0.28 });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2.1;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  setPickables(objs: THREE.Object3D[]): void {
    this.pickables = objs;
  }

  /** 设置视角旋转的对象（魔方根节点）。 */
  setViewTarget(obj: THREE.Object3D): void {
    this.viewTarget = obj;
    this.targetQuat.copy(obj.quaternion);
  }

  add(obj: THREE.Object3D): void {
    this.scene.add(obj);
  }

  /** 向指定方向旋转一面（90°）：上下绕屏幕水平轴，左右绕世界竖轴。 */
  rotateStep(dir: StepDir): void {
    if (!this.viewTarget) return;
    this.targetQuat.premultiply(this.stepQuaternion(dir));
    void this.animateToTarget();
  }

  private stepQuaternion(dir: StepDir): THREE.Quaternion {
    const camRight = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).normalize();
    switch (dir) {
      case 'up':
        return new THREE.Quaternion().setFromAxisAngle(camRight, Math.PI / 2);
      case 'down':
        return new THREE.Quaternion().setFromAxisAngle(camRight, -Math.PI / 2);
      case 'left':
        return new THREE.Quaternion().setFromAxisAngle(WORLD_UP, Math.PI / 2);
      case 'right':
        return new THREE.Quaternion().setFromAxisAngle(WORLD_UP, -Math.PI / 2);
    }
  }

  /** 回到正面视角。 */
  viewHome(): void {
    this.targetQuat.identity();
    void this.animateToTarget();
  }

  /** 当前该面是否大致朝向相机（无需旋转）。 */
  faceFacingCamera(face: Face): boolean {
    if (!this.viewTarget) return true;
    const worldNormal = FACE_FRAME[face].normal.clone().applyQuaternion(this.viewTarget.quaternion);
    const camDir = this.camera.position.clone().normalize();
    return worldNormal.dot(camDir) > 0.6;
  }

  /**
   * 把指定面转到正对相机：按 90° 分步、每步到位后短暂停留，
   * 相邻面为 1 步，对面（180°）会在中间面停一下，呈现"一面一面"切换。
   */
  async viewFaceTo(face: Face): Promise<void> {
    if (!this.viewTarget) return;
    const camDir = new THREE.Vector3(0, 0, 1);
    const worldNormal = FACE_FRAME[face].normal.clone().applyQuaternion(this.viewTarget.quaternion);
    const dot = Math.min(1, Math.max(-1, worldNormal.dot(camDir)));
    if (dot > 0.999) return; // 已正对

    let axis = new THREE.Vector3().crossVectors(worldNormal, camDir);
    if (axis.lengthSq() < 1e-6) axis.set(0, 1, 0); // 180° 情况：任取垂直轴
    axis.normalize();
    const total = Math.acos(dot);
    const steps = Math.max(1, Math.round(total / (Math.PI / 2))); // 相邻面=1，对面=2
    const per = total / steps;

    for (let i = 0; i < steps; i++) {
      const q = new THREE.Quaternion().setFromAxisAngle(axis, per);
      this.targetQuat.copy(q.clone().multiply(this.viewTarget.quaternion));
      await this.animateToTarget(520);
      if (i < steps - 1) {
        await new Promise((r) => setTimeout(r, 220)); // 中间面停留
      }
    }
  }

  /** 从当前朝向平滑追向意图目标；中途被打断会基于最新目标重启。 */
  private animateToTarget(dur = 700): Promise<void> {
    return new Promise((resolve) => {
      if (!this.viewTarget) {
        resolve();
        return;
      }
      if (this.viewAnim) cancelAnimationFrame(this.viewAnim);
      const obj = this.viewTarget;
      const start = obj.quaternion.clone();
      const target = this.targetQuat.clone();
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / dur);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        obj.quaternion.slerpQuaternions(start, target, e);
        if (t < 1) this.viewAnim = requestAnimationFrame(step);
        else {
          this.viewAnim = 0;
          resolve();
        }
      };
      this.viewAnim = requestAnimationFrame(step);
    });
  }

  private bindPointer(): void {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';

    el.addEventListener('pointerdown', (e) => {
      this.pointerDown = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
    });

    el.addEventListener('pointermove', (e) => {
      if (this.pointerDown.t === 0) return;
      const dx = e.clientX - this.pointerDown.x;
      const dy = e.clientY - this.pointerDown.y;
      if (dx * dx + dy * dy > 36) this.pointerDown.moved = true;
    });

    const endDrag = (e: PointerEvent) => {
      const moved = this.pointerDown.moved;
      const dt = performance.now() - this.pointerDown.t;
      this.pointerDown.t = 0;
      if (moved || dt > 400) return;
      if (this.onPick) this.onPick(this.pickObject(e.clientX, e.clientY));
    };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', () => {
      this.pointerDown.t = 0;
    });

    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.onRightPick) this.onRightPick(this.pickObject(e.clientX, e.clientY));
    });

    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const factor = Math.exp(e.deltaY * 0.0012);
        const dist = this.camera.position.length() * factor;
        const clamped = Math.max(3.5, Math.min(16, dist));
        this.camera.position.setLength(clamped);
      },
      { passive: false },
    );
  }

  private pickObject(clientX: number, clientY: number): THREE.Object3D | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickables, false);
    return hits.length ? hits[0].object : null;
  }

  private handleResize = (): void => {
    const parent = this.renderer.domElement.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private start(): void {
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.handleResize);
    this.renderer.dispose();
  }
}
