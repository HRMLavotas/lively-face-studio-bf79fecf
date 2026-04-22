import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';

/**
 * Lightweight spring bone simulation for secondary motion.
 *
 * VRM models often have spring bone metadata (@pixiv/three-vrm handles this
 * automatically via VRMSpringBoneManager). This module provides:
 *
 * 1. Auto-detection of whether the VRM has built-in spring bones
 * 2. A fallback procedural spring system for bones named with common
 *    spring-bone patterns (hair, accessories, etc.) when the VRM doesn't
 *    have spring bone metadata
 *
 * The built-in VRM spring bone system is preferred — this only activates
 * for models that lack it.
 */

interface SpringNode {
  bone: THREE.Object3D;
  restRotation: THREE.Quaternion;
  velocity: THREE.Vector3;
  // Spring parameters
  stiffness: number;
  damping: number;
  gravity: number;
}

// Bone name patterns that typically have spring motion
const SPRING_PATTERNS = [
  /hair/i, /hea?d_?hair/i, /ponytail/i, /braid/i, /ahoge/i,
  /ear/i, /tail/i, /ribbon/i, /bow/i, /skirt/i, /coat/i,
  /sleeve/i, /cape/i, /scarf/i, /tie/i, /accessory/i,
  // VRoid-specific naming
  /J_Sec_/i, /J_Adj_/i,
];

const _springNodes: SpringNode[] = [];
let _initialized = false;
let _hasBuiltinSpring = false;

// Reusable vectors
const _worldPos = new THREE.Vector3();
const _parentWorldPos = new THREE.Vector3();
const _gravity = new THREE.Vector3(0, -1, 0);
const _force = new THREE.Vector3();
const _targetPos = new THREE.Vector3();
const _currentPos = new THREE.Vector3();

/**
 * Initialize spring simulation for a VRM model.
 * Call once after VRM loads.
 */
export function initSpringBones(vrm: VRM): void {
  _springNodes.length = 0;
  _initialized = false;
  _hasBuiltinSpring = false;

  // Check if VRM has built-in spring bone manager
  // @ts-ignore — springBoneManager is part of @pixiv/three-vrm but not in types
  if (vrm.springBoneManager) {
    _hasBuiltinSpring = true;
    console.log('[Spring] VRM has built-in spring bones — using native system');
    return;
  }

  // Fallback: find bones matching spring patterns and set up procedural spring
  let count = 0;
  vrm.scene.traverse((obj) => {
    if (!(obj instanceof THREE.Bone) && obj.type !== 'Object3D') return;
    const name = obj.name;
    if (!SPRING_PATTERNS.some(p => p.test(name))) return;
    // Only leaf or near-leaf bones (avoid driving root bones)
    if (obj.children.length > 3) return;

    _springNodes.push({
      bone: obj,
      restRotation: obj.quaternion.clone(),
      velocity: new THREE.Vector3(),
      stiffness: 80 + Math.random() * 40,  // 80–120
      damping: 0.85 + Math.random() * 0.1, // 0.85–0.95
      gravity: 0.3 + Math.random() * 0.2,  // 0.3–0.5
    });
    count++;
  });

  _initialized = count > 0;
  if (count > 0) {
    console.log(`[Spring] Procedural spring initialized for ${count} bones`);
  }
}

/**
 * Update spring simulation. Call every frame after mixer.update().
 *
 * @param delta  Frame delta (seconds)
 * @param vrm    VRM instance
 * @param bodyVelocity  Optional velocity of the body (from animation) to drive spring
 */
export function updateSpringBones(
  delta: number,
  vrm: VRM,
  bodyVelocity?: THREE.Vector3,
): void {
  // Built-in spring bones are updated automatically by vrm.update()
  if (_hasBuiltinSpring) return;
  if (!_initialized || _springNodes.length === 0) return;

  const dt = Math.min(delta, 0.05); // cap at 50ms to avoid explosion
  const bodyVel = bodyVelocity ?? new THREE.Vector3();

  for (const node of _springNodes) {
    const { bone, restRotation, velocity, stiffness, damping, gravity } = node;

    // Get current world position of bone tip
    bone.getWorldPosition(_currentPos);

    // Spring force: pull toward rest rotation
    const restQ = restRotation.clone();
    const currentQ = bone.quaternion.clone();
    // Compute angular difference
    const diffQ = restQ.clone().multiply(currentQ.clone().invert());
    // Convert to axis-angle for force
    const axis = new THREE.Vector3(diffQ.x, diffQ.y, diffQ.z);
    const axisLen = axis.length();
    if (axisLen > 0.001) {
      axis.normalize();
      const angle = 2 * Math.atan2(axisLen, diffQ.w);
      _force.copy(axis).multiplyScalar(angle * stiffness * dt);
    } else {
      _force.set(0, 0, 0);
    }

    // Gravity
    _force.addScaledVector(_gravity, gravity * dt);

    // Body motion drives spring (inertia effect)
    _force.addScaledVector(bodyVel, -0.3);

    // Integrate velocity
    velocity.add(_force);
    velocity.multiplyScalar(damping);

    // Clamp velocity to prevent explosion
    const maxVel = 2.0;
    if (velocity.length() > maxVel) velocity.setLength(maxVel);

    // Apply velocity as rotation delta
    if (velocity.length() > 0.001) {
      const rotAxis = velocity.clone().normalize();
      const rotAngle = velocity.length() * dt * 0.5;
      const deltaQ = new THREE.Quaternion().setFromAxisAngle(rotAxis, rotAngle);
      bone.quaternion.multiply(deltaQ);
      bone.quaternion.normalize();
    }
  }
}

/**
 * Reset all spring bones to rest pose (call when animation changes).
 */
export function resetSpringBones(): void {
  for (const node of _springNodes) {
    node.bone.quaternion.copy(node.restRotation);
    node.velocity.set(0, 0, 0);
  }
}

export function hasSpringBones(): boolean {
  return _hasBuiltinSpring || _initialized;
}
