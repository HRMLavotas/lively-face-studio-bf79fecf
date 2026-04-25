import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export async function attachPropToBone(
  vrm: VRM,
  boneName: string,
  modelUrl: string,
  position: [number, number, number] = [0, 0, 0],
  rotation: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
  name: string = 'VRMProp'
): Promise<THREE.Group> {
  const boneNode = vrm.humanoid.getNormalizedBoneNode(boneName as any);
  if (!boneNode) {
    throw new Error(`Bone ${boneName} not found on VRM humanoid`);
  }

  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(modelUrl);
  const propGroup = gltf.scene;
  
  propGroup.name = name;
  propGroup.position.set(...position);
  propGroup.rotation.set(...rotation);
  propGroup.scale.set(...scale);
  
  boneNode.add(propGroup);
  console.log(`[VRM Props] Attached ${name} to ${boneName}`);
  
  return propGroup;
}

export function removeProp(vrm: VRM, propName: string): void {
  vrm.scene.traverse((obj) => {
    if (obj.name === propName) {
      if (obj.parent) {
        obj.parent.remove(obj);
        console.log(`[VRM Props] Removed ${propName}`);
      }
    }
  });
}
