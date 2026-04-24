import * as THREE from 'three';

export interface EnvironmentConfig {
  type: 'color' | 'gradient' | 'image' | 'skybox' | 'hdri';
  background?: string | string[];
  intensity?: number;
  rotation?: number;
  scale?: number;
}

export const ENVIRONMENT_PRESETS: Record<string, EnvironmentConfig> = {
  'cyberpunk-void': {
    type: 'gradient',
    background: ['#0a0a1f', '#1a0a2e', '#16213e'],
    intensity: 0.8,
  },
  'neon-city': {
    type: 'gradient', 
    background: ['#0f0f23', '#1a1a3a', '#2d1b69'],
    intensity: 1.0,
  },
  'studio-dark': {
    type: 'color',
    background: ['#0d0d0d'],
    intensity: 0.6,
  },
  'studio-light': {
    type: 'color',
    background: ['#f5f5f5'],
    intensity: 1.2,
  },
  'sunset-gradient': {
    type: 'gradient',
    background: ['#1a1a2e', '#16213e', '#e94560'],
    intensity: 0.9,
  },
  'space-void': {
    type: 'color',
    background: ['#000000'],
    intensity: 0.4,
  },
  'transparent': {
    type: 'color',
    background: ['transparent'],
    intensity: 1.0,
  },
};

export class EnvironmentManager {
  private scene: THREE.Scene;
  private currentBackground: THREE.Color | THREE.CubeTexture | THREE.Texture | null = null;
  private textureLoader: THREE.TextureLoader;
  
  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.textureLoader = new THREE.TextureLoader();
  }

  setEnvironment(preset: string | EnvironmentConfig) {
    const config = typeof preset === 'string' ? ENVIRONMENT_PRESETS[preset] : preset;
    if (!config) return;

    this.clearBackground();

    switch (config.type) {
      case 'color':
        this.setColorBackground(config.background![0]);
        break;
      case 'gradient':
        this.setGradientBackground(config.background as string[]);
        break;
      case 'image':
        this.setImageBackground(config.background![0], config.scale);
        break;
      case 'skybox':
        // Future: Load skybox textures
        this.setColorBackground('#0a0a1f');
        break;
      case 'hdri':
        // Future: Load HDRI environment maps
        this.setColorBackground('#0a0a1f');
        break;
    }
  }

  private setColorBackground(color: string) {
    if (color === 'transparent') {
      this.scene.background = null;
      return;
    }
    
    const bgColor = new THREE.Color(color);
    this.scene.background = bgColor;
    this.currentBackground = bgColor;
  }

  private setGradientBackground(colors: string[]) {
    // Create gradient using a large sphere with gradient material
    const geometry = new THREE.SphereGeometry(50, 32, 16);
    
    // Create gradient texture
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    
    const gradient = ctx.createLinearGradient(0, 0, 0, 256);
    colors.forEach((color, i) => {
      gradient.addColorStop(i / (colors.length - 1), color);
    });
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1, 256);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.BackSide,
    });
    
    const sphere = new THREE.Mesh(geometry, material);
    sphere.name = 'EnvironmentSphere';
    this.scene.add(sphere);
    
    // Also set scene background to first color as fallback
    this.scene.background = new THREE.Color(colors[0]);
  }

  private setImageBackground(imageUrl: string, scale: number = 1.0) {
    this.textureLoader.load(
      imageUrl,
      (texture) => {
        // Create sphere geometry for 360° background
        const geometry = new THREE.SphereGeometry(50, 32, 16);
        
        // Configure texture
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(scale, scale);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          side: THREE.BackSide,
        });
        
        const sphere = new THREE.Mesh(geometry, material);
        sphere.name = 'EnvironmentSphere';
        this.scene.add(sphere);
        
        this.currentBackground = texture;
        
        // Set scene background to average color as fallback
        this.scene.background = new THREE.Color(0x1a1a2e);
      },
      undefined,
      (error) => {
        console.error('Failed to load background image:', error);
        // Fallback to gradient
        this.setGradientBackground(['#0a0a1f', '#1a0a2e', '#16213e']);
      }
    );
  }

  private clearBackground() {
    // Remove existing environment sphere
    const existing = this.scene.getObjectByName('EnvironmentSphere');
    if (existing) {
      this.scene.remove(existing);
      if (existing instanceof THREE.Mesh) {
        existing.geometry.dispose();
        if (existing.material instanceof THREE.Material) {
          existing.material.dispose();
        }
        if (existing.material instanceof THREE.MeshBasicMaterial && existing.material.map) {
          existing.material.map.dispose();
        }
      }
    }
    
    this.scene.background = null;
    this.currentBackground = null;
  }

  // Set background from image URL (for custom backgrounds)
  setCustomImageBackground(imageUrl: string, scale: number = 1.0) {
    this.clearBackground();
    
    console.log('[Environment] Loading custom image background:', imageUrl);
    
    this.textureLoader.load(
      imageUrl,
      (texture) => {
        console.log('[Environment] Image loaded successfully');
        
        // Create sphere geometry for 360° background
        const geometry = new THREE.SphereGeometry(50, 32, 16);
        
        // Configure texture
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(scale, scale);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          side: THREE.BackSide,
        });
        
        const sphere = new THREE.Mesh(geometry, material);
        sphere.name = 'EnvironmentSphere';
        this.scene.add(sphere);
        
        this.currentBackground = texture;
        
        // Set scene background to average color as fallback
        this.scene.background = new THREE.Color(0x1a1a2e);
        
        console.log('[Environment] Custom image background applied');
      },
      (progress) => {
        console.log('[Environment] Loading progress:', (progress.loaded / progress.total * 100) + '%');
      },
      (error) => {
        console.error('[Environment] Failed to load background image:', error);
        // Fallback to gradient
        console.log('[Environment] Using gradient fallback');
        this.setGradientBackground(['#0a0a1f', '#1a0a2e', '#16213e']);
      }
    );
  }

  getCurrentPreset(): string | null {
    // Find matching preset based on current background
    for (const [name, config] of Object.entries(ENVIRONMENT_PRESETS)) {
      if (config.type === 'color' && this.currentBackground instanceof THREE.Color) {
        const presetColor = new THREE.Color(config.background![0]);
        if (this.currentBackground.equals(presetColor)) {
          return name;
        }
      }
    }
    return null;
  }

  dispose() {
    this.clearBackground();
  }
}

export function createEnvironmentManager(scene: THREE.Scene): EnvironmentManager {
  return new EnvironmentManager(scene);
}