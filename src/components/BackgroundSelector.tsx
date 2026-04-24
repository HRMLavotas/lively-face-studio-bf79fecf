import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Image, Upload, Trash2, Crown, X } from 'lucide-react';
import { BackgroundManager, type BackgroundItem } from '@/lib/background-manager';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';

interface BackgroundSelectorProps {
  onBackgroundChange: (imageUrl: string) => void;
  currentBackground?: string;
  className?: string;
}

export default function BackgroundSelector({
  onBackgroundChange,
  currentBackground,
  className = '',
}: BackgroundSelectorProps) {
  const { user } = useAuth();
  const { isPro } = useUserRole();
  const [isOpen, setIsOpen] = useState(false);
  const [backgrounds, setBackgrounds] = useState<BackgroundItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load backgrounds on mount and when user role changes
  useEffect(() => {
    loadBackgrounds();
  }, [isPro]);

  const loadBackgrounds = async () => {
    setLoading(true);
    try {
      const bgs = await BackgroundManager.getBackgrounds(isPro);
      setBackgrounds(bgs);
    } catch (error) {
      console.error('Failed to load backgrounds:', error);
      toast.error('Gagal memuat background');
    } finally {
      setLoading(false);
    }
  };

  const handleBackgroundSelect = (background: BackgroundItem) => {
    console.log('[BackgroundSelector] Selecting background:', background);
    onBackgroundChange(background.url);
    BackgroundManager.setCurrentBackground(background.id);
    setIsOpen(false);
    toast.success(`Background "${background.name}" dipilih`);
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!isPro) {
      toast.error('Upload background hanya untuk user Pro');
      return;
    }

    setUploading(true);
    try {
      const newBackground = await BackgroundManager.uploadBackground(file, user?.id);
      setBackgrounds(prev => [...prev, newBackground]);
      toast.success('Background berhasil diupload');
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error(error instanceof Error ? error.message : 'Upload gagal');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async (background: BackgroundItem) => {
    if (background.type === 'default') {
      toast.error('Tidak dapat menghapus background default');
      return;
    }

    if (!confirm(`Hapus background "${background.name}"?`)) return;

    try {
      await BackgroundManager.deleteBackground(background.id, user?.id);
      setBackgrounds(prev => prev.filter(bg => bg.id !== background.id));
      toast.success('Background berhasil dihapus');
    } catch (error) {
      console.error('Delete failed:', error);
      toast.error('Gagal menghapus background');
    }
  };

  const getCurrentBackgroundName = () => {
    const currentId = BackgroundManager.getCurrentBackground();
    const current = backgrounds.find(bg => bg.id === currentId);
    return current?.name || 'Default';
  };

  return (
    <div className={`absolute bottom-4 left-16 z-20 ${className}`}>
      {/* Toggle Button */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 cyber-glass border-neon-purple-bright hover-neon-glow"
            title={`Background: ${getCurrentBackgroundName()}`}
          >
            <Image className="w-4 h-4" />
          </Button>
        </DialogTrigger>

        <DialogContent className="max-w-4xl max-h-[80vh] cyber-glass-strong border-neon-purple" aria-describedby="background-gallery-description">
          <DialogHeader>
            <DialogTitle className="text-neon-purple flex items-center gap-2">
              <Image className="w-5 h-5" />
              Background Gallery
              {isPro && (
                <Badge className="bg-gradient-to-r from-yellow-400 to-orange-500 text-black">
                  <Crown className="w-3 h-3 mr-1" />
                  Pro
                </Badge>
              )}
            </DialogTitle>
            <p id="background-gallery-description" className="text-sm text-muted-foreground">
              Choose from our collection of cyberpunk backgrounds or upload your own custom images.
            </p>
          </DialogHeader>

          <div className="space-y-4">
            {/* Upload Section (Pro Only) */}
            {isPro && (
              <div className="border border-neon-purple/30 rounded-lg p-4 cyber-glass">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-neon-purple">Upload Custom Background</h3>
                  <Badge variant="outline" className="border-yellow-400 text-yellow-400">
                    Pro Feature
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="cyber-glass hover-neon-glow"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {uploading ? 'Uploading...' : 'Upload Image'}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleUpload}
                    className="hidden"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Supported: JPG, PNG, WebP. Max size: 10MB
                </p>
              </div>
            )}

            {/* Background Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-96 overflow-y-auto">
              {loading ? (
                <div className="col-span-full flex items-center justify-center py-8">
                  <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin neon-glow-purple" />
                </div>
              ) : (
                backgrounds.map((background) => (
                  <BackgroundCard
                    key={background.id}
                    background={background}
                    isSelected={BackgroundManager.getCurrentBackground() === background.id}
                    onSelect={() => handleBackgroundSelect(background)}
                    onDelete={background.type === 'uploaded' ? () => handleDelete(background) : undefined}
                    isPro={isPro}
                  />
                ))
              )}
            </div>

            {/* Pro Upgrade Prompt */}
            {!isPro && (
              <div className="border border-yellow-400/30 rounded-lg p-4 bg-gradient-to-r from-yellow-400/10 to-orange-500/10">
                <div className="flex items-center gap-2 mb-2">
                  <Crown className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm font-semibold text-yellow-400">Upgrade to Pro</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Unlock premium backgrounds and upload your own custom backgrounds
                </p>
                <Button size="sm" className="bg-gradient-to-r from-yellow-400 to-orange-500 text-black hover:from-yellow-500 hover:to-orange-600">
                  Upgrade Now
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface BackgroundCardProps {
  background: BackgroundItem;
  isSelected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
  isPro: boolean;
}

function BackgroundCard({ background, isSelected, onSelect, onDelete, isPro }: BackgroundCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const canAccess = !background.isPro || isPro;

  return (
    <Card className={`relative overflow-hidden cursor-pointer transition-all ${
      isSelected 
        ? 'ring-2 ring-neon-purple-bright neon-glow-purple' 
        : 'hover:ring-1 hover:ring-neon-purple hover-neon-glow'
    } ${!canAccess ? 'opacity-50' : ''}`}>
      <div className="aspect-video relative">
        {/* Background Image */}
        <img
          src={background.thumbnail || background.url}
          alt={background.name}
          className={`w-full h-full object-cover transition-opacity ${
            imageLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
        />
        
        {/* Loading/Error State */}
        {!imageLoaded && !imageError && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        )}
        
        {imageError && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <Image className="w-6 h-6 text-muted-foreground" />
          </div>
        )}

        {/* Pro Badge */}
        {background.isPro && (
          <Badge className="absolute top-2 left-2 bg-gradient-to-r from-yellow-400 to-orange-500 text-black text-xs">
            <Crown className="w-2 h-2 mr-1" />
            Pro
          </Badge>
        )}

        {/* Selected Indicator */}
        {isSelected && (
          <div className="absolute inset-0 bg-neon-purple/20 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full bg-neon-purple flex items-center justify-center neon-glow-purple">
              <span className="text-white text-sm">✓</span>
            </div>
          </div>
        )}

        {/* Delete Button */}
        {onDelete && (
          <Button
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        )}

        {/* Click Overlay */}
        <div 
          className="absolute inset-0"
          onClick={canAccess ? onSelect : undefined}
        />
      </div>

      {/* Background Info */}
      <div className="p-3">
        <h4 className="text-sm font-medium truncate">{background.name}</h4>
        <p className="text-xs text-muted-foreground">
          {background.type === 'default' ? 'Default' : 'Custom'}
        </p>
      </div>

      {/* Pro Lock Overlay */}
      {!canAccess && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <div className="text-center">
            <Crown className="w-6 h-6 text-yellow-400 mx-auto mb-1" />
            <span className="text-xs text-yellow-400 font-medium">Pro Only</span>
          </div>
        </div>
      )}
    </Card>
  );
}