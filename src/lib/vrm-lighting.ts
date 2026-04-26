import * as THREE from 'three';

export interface LightingConfig {
  preset: string;
  ambientIntensity: number;
  keyLightIntensity: number;
  fillLightIntensity: number;
  rimLightIntensity: number;
  ambientColor: string;
  keyLightColor: string;
}

export class LightingManager {
  private scene: THREE.Scene;
  private ambientLight: THREE.AmbientLight | null = null;
  private keyLight: THREE.DirectionalLight | null = null;
  private fillLight: THREE.DirectionalLight | null = null;
  private rimLight: THREE.DirectionalLight | null = null;
  private isMobile: boolean;

  constructor(scene: THREE.Scene, isMobile: boolean = false) {
    this.scene = scene;
    this.isMobile = isMobile;
    this.initializeLights();
  }

  private initializeLights() {
    // Remove existing lights
    this.disposeLights();

    // Ambient light
    this.ambientLight = new THREE.AmbientLight(0x88cccc, 0.8);
    this.ambientLight.name = 'AmbientLight';
    this.scene.add(this.ambientLight);

    // Key light (main directional light)
    this.keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    this.keyLight.position.set(1, 2, 2);
    this.keyLight.name = 'KeyLight';
    this.scene.add(this.keyLight);

    // Fill light (softer, opposite side) - desktop only
    if (!this.isMobile) {
      this.fillLight = new THREE.DirectionalLight(0x40e0d0, 0.4);
      this.fillLight.position.set(-2, 1, 0);
      this.fillLight.name = 'FillLight';
      this.scene.add(this.fillLight);

      // Rim light (back lighting) - desktop only
      this.rimLight = new THREE.DirectionalLight(0x9966ff, 0.3);
      this.rimLight.position.set(0, 1, -2);
      this.rimLight.name = 'RimLight';
      this.scene.add(this.rimLight);
    }
  }

  updateLighting(config: LightingConfig) {
    // Update ambient light
    if (this.ambientLight) {
      this.ambientLight.color.setHex(parseInt(config.ambientColor.replace('#', '0x')));
      this.ambientLight.intensity = config.ambientIntensity;
    }

    // Update key light
    if (this.keyLight) {
      this.keyLight.color.setHex(parseInt(config.keyLightColor.replace('#', '0x')));
      this.keyLight.intensity = config.keyLightIntensity;
    }

    // Update fill light (desktop only)
    if (this.fillLight && !this.isMobile) {
      this.fillLight.intensity = config.fillLightIntensity;
    }

    // Update rim light (desktop only)
    if (this.rimLight && !this.isMobile) {
      this.rimLight.intensity = config.rimLightIntensity;
    }
  }

  setMobileMode(isMobile: boolean) {
    if (this.isMobile === isMobile) return;
    
    this.isMobile = isMobile;
    
    if (isMobile) {
      // Remove fill and rim lights for mobile
      if (this.fillLight) {
        this.scene.remove(this.fillLight);
        this.fillLight.dispose();
        this.fillLight = null;
      }
      if (this.rimLight) {
        this.scene.remove(this.rimLight);
        this.rimLight.dispose();
        this.rimLight = null;
      }
    } else {
      // Add fill and rim lights for desktop
      if (!this.fillLight) {
        this.fillLight = new THREE.DirectionalLight(0x40e0d0, 0.4);
        this.fillLight.position.set(-2, 1, 0);
        this.fillLight.name = 'FillLight';
        this.scene.add(this.fillLight);
      }
      if (!this.rimLight) {
        this.rimLight = new THREE.DirectionalLight(0x9966ff, 0.3);
        this.rimLight.position.set(0, 1, -2);
        this.rimLight.name = 'RimLight';
        this.scene.add(this.rimLight);
      }
    }
  }

  getCurrentConfig(): LightingConfig {
    return {
      preset: 'custom',
      ambientIntensity: this.ambientLight?.intensity ?? 0.8,
      keyLightIntensity: this.keyLight?.intensity ?? 1.2,
      fillLightIntensity: this.fillLight?.intensity ?? 0.4,
      rimLightIntensity: this.rimLight?.intensity ?? 0.3,
      ambientColor: `#${this.ambientLight?.color.getHexString() ?? '88cccc'}`,
      keyLightColor: `#${this.keyLight?.color.getHexString() ?? 'ffffff'}`,
    };
  }

  private disposeLights() {
    // Remove and dispose existing lights
    const lightsToRemove = ['AmbientLight', 'KeyLight', 'FillLight', 'RimLight'];
    
    lightsToRemove.forEach(name => {
      const light = this.scene.getObjectByName(name);
      if (light) {
        this.scene.remove(light);
        if (light instanceof THREE.Light) {
          light.dispose();
        }
      }
    });

    this.ambientLight = null;
    this.keyLight = null;
    this.fillLight = null;
    this.rimLight = null;
  }

  dispose() {
    this.disposeLights();
  }
}

export const LIGHTING_PRESETS: Record<string, LightingConfig> = {
  'cyberpunk': {
    preset: 'cyberpunk',
    ambientIntensity: 0.9,
    keyLightIntensity: 1.4,
    fillLightIntensity: 0.6,
    rimLightIntensity: 1.0,
    ambientColor: '#2b0054', // Deep Purple base
    keyLightColor: '#ff00ff', // Bright Magenta highlights
  },
  'studio': {
    preset: 'studio',
    ambientIntensity: 0.6,
    keyLightIntensity: 1.5,
    fillLightIntensity: 0.8,
    rimLightIntensity: 0.5,
    ambientColor: '#ffffff',
    keyLightColor: '#ffffff',
  },
  'dramatic': {
    preset: 'dramatic',
    ambientIntensity: 0.3,
    keyLightIntensity: 2.0,
    fillLightIntensity: 0.2,
    rimLightIntensity: 0.8,
    ambientColor: '#4444aa',
    keyLightColor: '#ffddaa',
  },
  'soft': {
    preset: 'soft',
    ambientIntensity: 1.0,
    keyLightIntensity: 0.8,
    fillLightIntensity: 0.6,
    rimLightIntensity: 0.2,
    ambientColor: '#ffeeee',
    keyLightColor: '#fff8f0',
  },
  'neon': {
    preset: 'neon',
    ambientIntensity: 0.6,
    keyLightIntensity: 1.2,
    fillLightIntensity: 0.8,
    rimLightIntensity: 1.5,
    ambientColor: '#00ffff', // Cyan base
    keyLightColor: '#ff00ff', // Magenta highlights
  },
  'morning': {
    preset: 'morning',
    ambientIntensity: 0.9,
    keyLightIntensity: 1.1,
    fillLightIntensity: 0.5,
    rimLightIntensity: 0.3,
    ambientColor: '#ffe4b5', // Moccasin (warm morning)
    keyLightColor: '#fff5e6',
  },
  'daylight': {
    preset: 'daylight',
    ambientIntensity: 0.8,
    keyLightIntensity: 1.3,
    fillLightIntensity: 0.6,
    rimLightIntensity: 0.2,
    ambientColor: '#ffffff',
    keyLightColor: '#fffffc',
  },
  'sunset': {
    preset: 'sunset',
    ambientIntensity: 0.7,
    keyLightIntensity: 1.5,
    fillLightIntensity: 0.8,
    rimLightIntensity: 1.2,
    ambientColor: '#ff7f50', // Coral
    keyLightColor: '#ffd700', // Gold
  },
  'night-outdoor': {
    preset: 'night-outdoor',
    ambientIntensity: 0.4,
    keyLightIntensity: 0.8,
    fillLightIntensity: 0.4,
    rimLightIntensity: 1.5,
    ambientColor: '#1a1a40', // Deep blue
    keyLightColor: '#4b0082', // Indigo
  },
};

export function createLightingManager(scene: THREE.Scene, isMobile: boolean = false): LightingManager {
  return new LightingManager(scene, isMobile);
}