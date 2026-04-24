import { supabase } from '@/integrations/supabase/client';
import { generatePlaceholderBackground } from './generate-placeholder-backgrounds';

export interface BackgroundItem {
  id: string;
  name: string;
  url: string;
  type: 'default' | 'uploaded';
  isPro: boolean;
  thumbnail?: string;
}

// Default backgrounds untuk free users (dengan fallback ke generated placeholders)
export const DEFAULT_BACKGROUNDS: BackgroundItem[] = [
  {
    id: 'cyberpunk-city',
    name: 'Cyberpunk City',
    url: '/backgrounds/cyberpunk-city.jpg',
    type: 'default',
    isPro: false,
    thumbnail: '/backgrounds/thumbs/cyberpunk-city-thumb.jpg',
  },
  {
    id: 'neon-grid',
    name: 'Neon Grid',
    url: '/backgrounds/neon-grid.jpg',
    type: 'default',
    isPro: false,
    thumbnail: '/backgrounds/thumbs/neon-grid-thumb.jpg',
  },
  {
    id: 'space-station',
    name: 'Space Station',
    url: '/backgrounds/space-station.jpg',
    type: 'default',
    isPro: false,
    thumbnail: '/backgrounds/thumbs/space-station-thumb.jpg',
  },
  {
    id: 'digital-void',
    name: 'Digital Void',
    url: '/backgrounds/digital-void.jpg',
    type: 'default',
    isPro: false,
    thumbnail: '/backgrounds/thumbs/digital-void-thumb.jpg',
  },
  // Pro-only defaults
  {
    id: 'hologram-lab',
    name: 'Hologram Lab',
    url: '/backgrounds/hologram-lab.jpg',
    type: 'default',
    isPro: true,
    thumbnail: '/backgrounds/thumbs/hologram-lab-thumb.jpg',
  },
  {
    id: 'matrix-code',
    name: 'Matrix Code',
    url: '/backgrounds/matrix-code.jpg',
    type: 'default',
    isPro: true,
    thumbnail: '/backgrounds/thumbs/matrix-code-thumb.jpg',
  },
];

export class BackgroundManager {
  private static STORAGE_KEY = 'vrm-custom-backgrounds';
  private static BUCKET_NAME = 'backgrounds';

  // Get all available backgrounds for user
  static async getBackgrounds(isPro: boolean = false): Promise<BackgroundItem[]> {
    const backgrounds: BackgroundItem[] = [];
    
    // Add default backgrounds based on user tier with fallback generation
    const defaultBackgrounds = DEFAULT_BACKGROUNDS.filter(bg => !bg.isPro || isPro);
    
    // Generate fallback images for missing files
    for (const bg of defaultBackgrounds) {
      const backgroundWithFallback = await this.ensureBackgroundExists(bg);
      backgrounds.push(backgroundWithFallback);
    }
    
    // Add custom uploaded backgrounds (Pro only)
    if (isPro) {
      const customBackgrounds = await this.getCustomBackgrounds();
      backgrounds.push(...customBackgrounds);
    }
    
    return backgrounds;
  }

  // Ensure background image exists, generate fallback if needed
  private static async ensureBackgroundExists(background: BackgroundItem): Promise<BackgroundItem> {
    try {
      // Try to load the image
      await this.checkImageExists(background.url);
      return background;
    } catch {
      // Generate fallback image
      console.log(`Generating fallback for ${background.id}`);
      const fallbackUrl = this.generateFallbackImage(background.id);
      const fallbackThumbnail = this.generateFallbackThumbnail(background.id);
      
      return {
        ...background,
        url: fallbackUrl,
        thumbnail: fallbackThumbnail,
      };
    }
  }

  // Check if image exists
  private static checkImageExists(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Skip check for data URLs (generated placeholders)
      if (url.startsWith('data:')) {
        resolve();
        return;
      }
      
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => reject();
      img.src = url;
      
      // Timeout after 5 seconds
      setTimeout(() => reject(new Error('Image load timeout')), 5000);
    });
  }

  // Generate fallback image based on background ID
  private static generateFallbackImage(backgroundId: string): string {
    const colorMap: Record<string, string[]> = {
      'cyberpunk-city': ['#0a0a1f', '#1a0a2e', '#16213e', '#0f3460'],
      'neon-grid': ['#0f0f23', '#1a1a3a', '#2d1b69', '#1e3a8a'],
      'space-station': ['#000000', '#1a1a2e', '#16213e', '#0f172a'],
      'digital-void': ['#0c0c0c', '#1a0a2e', '#2d1b69', '#1e1b4b'],
      'hologram-lab': ['#0a1a2e', '#1a2e4b', '#2e4b69', '#4b6987'],
      'matrix-code': ['#000000', '#0a1a0a', '#1a2e1a', '#2e4b2e'],
    };

    const colors = colorMap[backgroundId] || ['#0a0a1f', '#1a0a2e', '#16213e'];
    return generatePlaceholderBackground(backgroundId, colors, 1920, 1080);
  }

  // Generate fallback thumbnail
  private static generateFallbackThumbnail(backgroundId: string): string {
    const colorMap: Record<string, string[]> = {
      'cyberpunk-city': ['#0a0a1f', '#1a0a2e', '#16213e', '#0f3460'],
      'neon-grid': ['#0f0f23', '#1a1a3a', '#2d1b69', '#1e3a8a'],
      'space-station': ['#000000', '#1a1a2e', '#16213e', '#0f172a'],
      'digital-void': ['#0c0c0c', '#1a0a2e', '#2d1b69', '#1e1b4b'],
      'hologram-lab': ['#0a1a2e', '#1a2e4b', '#2e4b69', '#4b6987'],
      'matrix-code': ['#000000', '#0a1a0a', '#1a2e1a', '#2e4b2e'],
    };

    const colors = colorMap[backgroundId] || ['#0a0a1f', '#1a0a2e', '#16213e'];
    return generatePlaceholderBackground(backgroundId, colors, 200, 112);
  }

  // Get custom uploaded backgrounds
  static async getCustomBackgrounds(): Promise<BackgroundItem[]> {
    try {
      // Try Supabase first
      const { data: user } = await supabase.auth.getUser();
      if (user?.user?.id) {
        // Check if bucket exists
        const { data: buckets } = await supabase.storage.listBuckets();
        const bucketExists = buckets?.some(bucket => bucket.name === this.BUCKET_NAME);
        
        if (bucketExists) {
          const { data: files } = await supabase.storage
            .from(this.BUCKET_NAME)
            .list(user.user.id);
          
          if (files) {
            return files
              .filter(file => file.name.match(/\.(jpg|jpeg|png|webp)$/i))
              .map(file => ({
                id: `custom-${file.name}`,
                name: file.name.replace(/\.[^/.]+$/, ''), // Remove extension
                url: this.getSupabaseUrl(user.user.id, file.name),
                type: 'uploaded' as const,
                isPro: true,
              }));
          }
        } else {
          console.warn('Backgrounds bucket not found, using localStorage fallback');
        }
      }
    } catch (error) {
      console.warn('Supabase storage not available, using localStorage:', error);
    }
    
    // Fallback to localStorage
    return this.getLocalStorageBackgrounds();
  }

  // Upload background (Pro only)
  static async uploadBackground(file: File, userId?: string): Promise<BackgroundItem> {
    // Validate file
    if (!file.type.startsWith('image/')) {
      throw new Error('File harus berupa gambar');
    }
    
    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      throw new Error('Ukuran file maksimal 10MB');
    }

    try {
      // Try Supabase first
      if (userId) {
        // Check if bucket exists first
        const { data: buckets } = await supabase.storage.listBuckets();
        const bucketExists = buckets?.some(bucket => bucket.name === this.BUCKET_NAME);
        
        if (!bucketExists) {
          console.warn('Backgrounds bucket not found, using localStorage fallback');
          throw new Error('Bucket not available');
        }

        const ext = file.name.split('.').pop();
        const fileName = `${Date.now()}.${ext}`;
        const filePath = `${userId}/${fileName}`;
        
        const { error } = await supabase.storage
          .from(this.BUCKET_NAME)
          .upload(filePath, file, { upsert: true });
        
        if (error) throw error;
        
        return {
          id: `custom-${fileName}`,
          name: file.name.replace(/\.[^/.]+$/, ''),
          url: this.getSupabaseUrl(userId, fileName),
          type: 'uploaded',
          isPro: true,
        };
      }
    } catch (error) {
      console.warn('Supabase upload failed, using localStorage:', error);
    }
    
    // Fallback to localStorage
    return this.uploadToLocalStorage(file);
  }

  // Delete custom background
  static async deleteBackground(backgroundId: string, userId?: string): Promise<void> {
    if (!backgroundId.startsWith('custom-')) {
      throw new Error('Tidak dapat menghapus background default');
    }
    
    try {
      // Try Supabase first
      if (userId) {
        const fileName = backgroundId.replace('custom-', '');
        const filePath = `${userId}/${fileName}`;
        
        await supabase.storage
          .from(this.BUCKET_NAME)
          .remove([filePath]);
        
        return;
      }
    } catch (error) {
      console.warn('Supabase delete failed, using localStorage:', error);
    }
    
    // Fallback to localStorage
    this.deleteFromLocalStorage(backgroundId);
  }

  // Get current background setting
  static getCurrentBackground(): string {
    return localStorage.getItem('vrm-current-background') || 'cyberpunk-city';
  }

  // Set current background
  static setCurrentBackground(backgroundId: string): void {
    localStorage.setItem('vrm-current-background', backgroundId);
  }

  // Private methods for localStorage fallback
  private static getLocalStorageBackgrounds(): BackgroundItem[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  private static async uploadToLocalStorage(file: File): Promise<BackgroundItem> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const backgrounds = this.getLocalStorageBackgrounds();
          const newBackground: BackgroundItem = {
            id: `custom-${Date.now()}`,
            name: file.name.replace(/\.[^/.]+$/, ''),
            url: reader.result as string, // Base64 data URL
            type: 'uploaded',
            isPro: true,
          };
          
          backgrounds.push(newBackground);
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(backgrounds));
          resolve(newBackground);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Gagal membaca file'));
      reader.readAsDataURL(file);
    });
  }

  private static deleteFromLocalStorage(backgroundId: string): void {
    const backgrounds = this.getLocalStorageBackgrounds();
    const filtered = backgrounds.filter(bg => bg.id !== backgroundId);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
  }

  private static getSupabaseUrl(userId: string, fileName: string): string {
    const { data } = supabase.storage
      .from(this.BUCKET_NAME)
      .getPublicUrl(`${userId}/${fileName}`);
    return data.publicUrl;
  }

  // Create thumbnail from image (for better performance)
  static async createThumbnail(file: File, maxWidth: number = 200): Promise<string> {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      const img = new Image();
      
      img.onload = () => {
        const ratio = Math.min(maxWidth / img.width, maxWidth / img.height);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      
      const reader = new FileReader();
      reader.onload = () => img.src = reader.result as string;
      reader.readAsDataURL(file);
    });
  }
}