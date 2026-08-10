import { matPosition, matForward, vecDistance, type Ray, type Vec3 } from "./math.js";

/**
 * Entrada XR: manos con seguimiento articular y mandos.
 *
 * Las manos se leen con `XRFrame.fillPoses`, que resuelve las 25
 * articulaciones de golpe contra el espacio de referencia (jerarquía plana,
 * que es justo lo que necesita el renderizador de esferas), y con
 * `fillJointRadii` para el grosor real de cada articulación.
 *
 * El gesto de pinza se detecta por distancia entre la yema del pulgar y la
 * del índice con histéresis, como respaldo de los eventos `select` del
 * sistema: en Meta Quest la pinza se expone además como botón emulado, y ahí
 * el evento nativo llega solo. Nunca se usa la pinza de palma, que el
 * sistema reserva para su propio menú.
 */

/** Orden canónico de XRHandJoint (WebXR Hand Input Module, 25 articulaciones). */
export const HAND_JOINTS = [
  "wrist",
  "thumb-metacarpal",
  "thumb-phalanx-proximal",
  "thumb-phalanx-distal",
  "thumb-tip",
  "index-finger-metacarpal",
  "index-finger-phalanx-proximal",
  "index-finger-phalanx-intermediate",
  "index-finger-phalanx-distal",
  "index-finger-tip",
  "middle-finger-metacarpal",
  "middle-finger-phalanx-proximal",
  "middle-finger-phalanx-intermediate",
  "middle-finger-phalanx-distal",
  "middle-finger-tip",
  "ring-finger-metacarpal",
  "ring-finger-phalanx-proximal",
  "ring-finger-phalanx-intermediate",
  "ring-finger-phalanx-distal",
  "ring-finger-tip",
  "pinky-finger-metacarpal",
  "pinky-finger-phalanx-proximal",
  "pinky-finger-phalanx-intermediate",
  "pinky-finger-phalanx-distal",
  "pinky-finger-tip",
] as const;

const PINCH_ON = 0.022;
const PINCH_OFF = 0.032;

export interface JointPose {
  position: Vec3;
  radius: number;
}

export interface XrPointer {
  /** Identificador estable dentro del fotograma (mano izquierda/derecha o mando). */
  key: string;
  handedness: string;
  /** Rayo de apuntado en el espacio de referencia. */
  ray: Ray | null;
  /** Posición del mando (gripSpace), null en manos. */
  grip: Vec3 | null;
  /** Articulaciones si es una mano con seguimiento. */
  joints: JointPose[] | null;
  /** Yema del índice: permite tocar los paneles directamente. */
  indexTip: Vec3 | null;
  /** Pinza detectada por geometría (respaldo del evento `select`). */
  pinching: boolean;
  /** La pinza acaba de cerrarse en este fotograma. */
  pinchStarted: boolean;
  isHand: boolean;
}

interface PointerMemory {
  pinching: boolean;
}

export class XrInput {
  private memory = new Map<string, PointerMemory>();
  private poseBuffer = new Float32Array(HAND_JOINTS.length * 16);
  private radiiBuffer = new Float32Array(HAND_JOINTS.length);

  /** true si al menos una mano con seguimiento estuvo presente en el último fotograma. */
  handsVisible = false;

  read(frame: any, refSpace: any, session: any): XrPointer[] {
    const pointers: XrPointer[] = [];
    this.handsVisible = false;
    const sources = session?.inputSources ?? [];
    for (const source of sources) {
      const handedness = String(source.handedness ?? "none");
      const isHand = source.hand != null;
      const key = `${handedness}:${isHand ? "hand" : "controller"}`;
      let ray: Ray | null = null;
      if (source.targetRaySpace != null) {
        const pose = frame.getPose?.(source.targetRaySpace, refSpace);
        if (pose != null) {
          ray = { origin: matPosition(pose.transform.matrix), direction: matForward(pose.transform.matrix) };
        }
      }
      let grip: Vec3 | null = null;
      if (!isHand && source.gripSpace != null) {
        const pose = frame.getPose?.(source.gripSpace, refSpace);
        if (pose != null) grip = matPosition(pose.transform.matrix);
      }

      let joints: JointPose[] | null = null;
      let indexTip: Vec3 | null = null;
      let pinching = false;
      if (isHand) {
        joints = this.readHand(frame, source.hand, refSpace);
        if (joints != null) {
          this.handsVisible = true;
          const thumb = joints[HAND_JOINTS.indexOf("thumb-tip")];
          const index = joints[HAND_JOINTS.indexOf("index-finger-tip")];
          indexTip = index?.position ?? null;
          if (thumb != null && index != null) {
            const distance = vecDistance(thumb.position, index.position);
            const previous = this.memory.get(key)?.pinching === true;
            pinching = previous ? distance < PINCH_OFF : distance < PINCH_ON;
          }
        }
      }

      const previous = this.memory.get(key)?.pinching === true;
      this.memory.set(key, { pinching });
      pointers.push({
        key,
        handedness,
        ray,
        grip,
        joints,
        indexTip,
        pinching,
        pinchStarted: pinching && !previous,
        isHand,
      });
    }
    // Limpiar memoria de punteros que ya no existen
    const live = new Set(pointers.map((p) => p.key));
    for (const key of [...this.memory.keys()]) {
      if (!live.has(key)) this.memory.delete(key);
    }
    return pointers;
  }

  private readHand(frame: any, hand: any, refSpace: any): JointPose[] | null {
    const spaces: any[] = [];
    for (const name of HAND_JOINTS) {
      const space = hand.get?.(name);
      if (space == null) return null;
      spaces.push(space);
    }
    // Ruta rápida: todas las poses de una vez (jerarquía plana).
    if (typeof frame.fillPoses === "function") {
      if (!frame.fillPoses(spaces, refSpace, this.poseBuffer)) return null;
      if (typeof frame.fillJointRadii === "function") {
        if (!frame.fillJointRadii(spaces, this.radiiBuffer)) this.radiiBuffer.fill(0.008);
      } else {
        this.radiiBuffer.fill(0.008);
      }
      const joints: JointPose[] = [];
      for (let i = 0; i < HAND_JOINTS.length; i++) {
        const o = i * 16;
        joints.push({
          position: [this.poseBuffer[o + 12]!, this.poseBuffer[o + 13]!, this.poseBuffer[o + 14]!],
          radius: this.radiiBuffer[i]! || 0.008,
        });
      }
      return joints;
    }
    // Respaldo: una articulación cada vez.
    const joints: JointPose[] = [];
    for (const space of spaces) {
      const pose = frame.getJointPose?.(space, refSpace);
      if (pose == null) return null;
      joints.push({ position: matPosition(pose.transform.matrix), radius: pose.radius ?? 0.008 });
    }
    return joints;
  }

  reset(): void {
    this.memory.clear();
    this.handsVisible = false;
  }
}
