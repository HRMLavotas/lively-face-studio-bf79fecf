import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';

export type CameraPreset =
  | 'extreme-closeup'
  | 'closeup'
  | 'medium-closeup'
  | 'medium-shot'
  | 'medium-wide-shot'
  | 'wide-shot'
  | 'extreme-wide-shot';

export interface CameraPresetData {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

// Fallback static presets (used before VRM loads)
export const CAMERA_PRESETS_STATIC: Record<CameraPreset, CameraPresetData> = {
  'extreme-closeup':   { position: [0, 1.62, 0.33], target: [0, 1.58, 0], fov: 50 },
  'closeup':           { position: [0, 1.57, 0.53], target: [0, 1.52, 0], fov: 45 },
  'medium-closeup':    { position: [0, 1.50, 0.78], target: [0, 1.44, 0], fov: 40 },
  'medium-shot':       { position: [0, 1.35, 1.08], target: [0, 1.20, 0], fov: 36 },
  'medium-wide-shot':  { position: [0, 1.25, 1.38], target: [0, 1.10, 0], fov: 34 },
  'wide-shot':         { position: [0, 1.10, 1.68], target: [0, 0.95, 0], fov: 32 },
  'extreme-wide-shot': { position: [0, 0.90, 2.10], target: [0, 0.75, 0], fov: 30 },
};

/**
 * Compute adaptive camera presets based on actual VRM model dimensions.
 * For WS and EWS, calculates exact distance needed to fit full body in frame
 * using trigonometry: distance = (halfHeight / tan(halfFOV)) * padding
 */
export function computeAdaptivePresets(vrm: VRM): Record<CameraPreset, CameraPresetData> {
  const box = new THREE.Box3().setFromObject(vrm.scene);
  const modelHeight = box.max.y - box.min.y;
  const modelBase = box.min.y;
  const modelMid = modelBase + modelHeight * 0.5;

  const result = {} as Record<CameraPreset, CameraPresetData>;

  const fullBodyDistance = (fovDeg: number, visibleHeight: number, padding = 1.18) => {
    const halfFov = (fovDeg * Math.PI) / 180 / 2;
    return (visibleHeight * padding) / (2 * Math.tan(halfFov));
  };

  const ratioPresets: Partial<Record<CameraPreset, {
    targetYRatio: number; positionYRatio: number; distanceRatio: number; fov: number;
  }>> = {
    'extreme-closeup':   { targetYRatio: 0.93, positionYRatio: 0.95, distanceRatio: 0.22, fov: 50 },
    'closeup':           { targetYRatio: 0.90, positionYRatio: 0.92, distanceRatio: 0.35, fov: 45 },
    'medium-closeup':    { targetYRatio: 0.87, positionYRatio: 0.89, distanceRatio: 0.52, fov: 40 },
    'medium-shot':       { targetYRatio: 0.78, positionYRatio: 0.82, distanceRatio: 0.72, fov: 36 },
    'medium-wide-shot':  { targetYRatio: 0.68, positionYRatio: 0.72, distanceRatio: 0.95, fov: 34 },
  };

  for (const [key, ratio] of Object.entries(ratioPresets)) {
    const targetY   = modelBase + modelHeight * ratio.targetYRatio;
    const positionY = modelBase + modelHeight * ratio.positionYRatio;
    const distance  = modelHeight * ratio.distanceRatio;
    result[key as CameraPreset] = {
      position: [0, positionY, distance],
      target:   [0, targetY, 0],
      fov: ratio.fov,
    };
  }

  const wsFov = 30;
  result['wide-shot'] = {
    position: [0, modelMid, fullBodyDistance(wsFov, modelHeight, 1.20)],
    target:   [0, modelMid, 0],
    fov: wsFov,
  };

  const ewsFov = 24;
  result['extreme-wide-shot'] = {
    position: [0, modelMid, fullBodyDistance(ewsFov, modelHeight, 1.25)],
    target:   [0, modelMid, 0],
    fov: ewsFov,
  };

  return result;
}
