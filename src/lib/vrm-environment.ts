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
  'green-screen': {
    type: 'color',
    background: ['#00FF00'], // Solid pure green for Chroma Key
    intensity: 1.0,
  },
  'morning-sky': {
    type: 'gradient',
    background: ['#ff9a9e', '#fecfef', '#fbc2eb'], // Warm pink/soft morning
    intensity: 1.0,
  },
  'daylight-sky': {
    type: 'gradient',
    background: ['#a1c4fd', '#c2e9fb', '#e1f5fe'], // Bright blue day
    intensity: 1.2,
  },
  'sunset-sky': {
    type: 'gradient',
    background: ['#2c3e50', '#fd746c', '#ff9068'], // Deep orange/red sunset
    intensity: 1.0,
  },
  'night-sky': {
    type: 'gradient',
    background: ['#050505', '#16213e', '#1a1a2e'], // Deep dark blue
    intensity: 0.6,
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
    const geometry = new THREE.SphereGeometry(100, 32, 16);
    
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
    texture.generateMipmaps = false;
    
    // Use MeshBasicMaterial to ensure NO lighting effects
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false, // Disable fog effects
      toneMapped: false, // Disable tone mapping
    });
    
    const sphere = new THREE.Mesh(geometry, material);
    sphere.name = 'EnvironmentSphere';
    sphere.renderOrder = -999;
    sphere.frustumCulled = false;
    sphere.matrixAutoUpdate = false;
    sphere.castShadow = false; // Don't cast shadows
    sphere.receiveShadow = false; // Don't receive shadows
    sphere.updateMatrix();
    this.scene.add(sphere);
    
    // Also set scene background to first color as fallback
    this.scene.background = new THREE.Color(colors[0]);
    
    console.log('[Environment] Gradient background created - unlit material, no lighting effects');
  }

  private setImageBackground(imageUrl: string, scale: number = 1.0) {
    this.textureLoader.load(
      imageUrl,
      (texture) => {
        // Configure texture properly
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        
        // Set scene background (maintains full aspect ratio)
        this.scene.background = texture;
        this.currentBackground = texture;
        
        // Create sphere geometry for 360° background
        const geometry = new THREE.SphereGeometry(100, 64, 32);
        
        // Clone and configure texture for sphere
        const sphereTexture = texture.clone();
        sphereTexture.wrapS = THREE.RepeatWrapping;
        sphereTexture.wrapT = THREE.ClampToEdgeWrapping;
        
        // Fix orientation: flip horizontally and rotate
        sphereTexture.repeat.set(-scale, scale);
        sphereTexture.offset.set(scale, 0);
        
        const material = new THREE.MeshBasicMaterial({
          map: sphereTexture,
          side: THREE.BackSide,
          depthWrite: false,
          depthTest: false,
        });
        
        const sphere = new THREE.Mesh(geometry, material);
        sphere.name = 'EnvironmentSphere';
        sphere.renderOrder = -999;
        sphere.frustumCulled = false;
        sphere.rotation.y = Math.PI; // Fix orientation
        this.scene.add(sphere);
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
      console.log('[Environment] Removing existing background sphere');
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
    
    // Clear scene background
    this.scene.background = null;
    this.currentBackground = null;
    
    console.log('[Environment] Background cleared');
  }

  // Set background from image URL (for custom backgrounds)
  setCustomImageBackground(imageUrl: string, scale: number = 1.0) {
    this.clearBackground();
    
    console.log('[Environment] Loading custom image background:', imageUrl);
    
    this.textureLoader.load(
      imageUrl,
      (texture) => {
        console.log('[Environment] Image loaded successfully, size:', texture.image.width, 'x', texture.image.height);
        
        // Configure texture properly for background
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.generateMipmaps = false; // Disable mipmaps for better performance
        
        // Method 1: Scene background (maintains aspect ratio, full coverage)
        // This ensures background is always visible regardless of viewport changes
        this.scene.background = texture;
        this.currentBackground = texture;
        console.log('[Environment] Scene background set - will maintain full landscape aspect');
        
        // Method 2: Create background sphere for 360° immersion
        const geometry = new THREE.SphereGeometry(100, 64, 32);
        
        // Clone texture for sphere with proper UV mapping
        const sphereTexture = texture.clone();
        sphereTexture.wrapS = THREE.RepeatWrapping;
        sphereTexture.wrapT = THREE.ClampToEdgeWrapping;
        sphereTexture.generateMipmaps = false;
        
        // Fix texture orientation for sphere mapping
        sphereTexture.repeat.set(-1, 1); // Negative X flips horizontally
        sphereTexture.offset.set(1, 0);  // Offset to compensate for flip
        
        // Use MeshBasicMaterial to ensure NO lighting effects
        const material = new THREE.MeshBasicMaterial({
          map: sphereTexture,
          side: THREE.BackSide, // Render inside faces
          transparent: false,
          depthWrite: false,
          depthTest: false,
          fog: false, // Disable fog effects
          // Ensure material is completely unlit (not affected by lights)
          toneMapped: false, // Disable tone mapping
          colorSpace: THREE.SRGBColorSpace, // Ensure proper color space
        });
        
        // Ensure the sphere is not affected by any lighting
        const sphere = new THREE.Mesh(geometry, material);
        sphere.name = 'EnvironmentSphere';
        sphere.position.set(0, 0, 0);
        sphere.renderOrder = -999;
        sphere.frustumCulled = false;
        sphere.matrixAutoUpdate = false; // Static position, no need to update matrix
        sphere.castShadow = false; // Don't cast shadows
        sphere.receiveShadow = false; // Don't receive shadows
        
        // Rotate sphere to correct orientation
        sphere.rotation.y = Math.PI; // 180 degree rotation to fix orientation
        sphere.updateMatrix(); // Update matrix once after rotation
        
        this.scene.add(sphere);
        
        console.log('[Environment] Background sphere created - unlit material, no lighting effects');
        console.log('[Environment] Material properties - fog:', material.fog, 'toneMapped:', material.toneMapped);
        console.log('[Environment] Sphere rotation Y:', sphere.rotation.y);
        console.log('[Environment] Texture repeat:', sphereTexture.repeat);
        console.log('[Environment] Texture offset:', sphereTexture.offset);
      },
      (progress) => {
        if (progress.total > 0) {
          console.log('[Environment] Loading progress:', Math.round(progress.loaded / progress.total * 100) + '%');
        }
      },
      (error) => {
        console.error('[Environment] Failed to load background image:', error);
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