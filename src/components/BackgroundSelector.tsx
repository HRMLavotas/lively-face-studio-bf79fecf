import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { Layers, Upload, Trash2, Crown, Check } from 'lucide-react';
import { BackgroundManager, type BackgroundItem } from '@/lib/background-manager';
import { ENVIRONMENT_PRESETS } from '@/lib/vrm-environment';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';

interface BackgroundSelectorProps {
  onBackgroundChange: (imageUrl: string) => void;
  onEnvironmentChange: (preset: string) => void;
  currentEnvironment?: string;
  currentBackground?: string;
  className?: string;
}

const PRESET_LABELS: Record<string, string> = {
  'cyberpunk-void': 'Cyberpunk',
  'neon-city': 'Neon City',
  'studio-dark': 'Studio Dark',
  'studio-light': 'Studio Light',
  'sunset-gradient': 'Sunset',
  'space-void': 'Space',
  'transparent': 'Transparan',
};

// Generate a CSS background string for each preset (for preview swatches)
function presetToCss(preset: string): string {
  const config = ENVIRONMENT_PRESETS[preset];
  if (!config) return '#000';
  if (config.type === 'color') {
    return config.background![0] === 'transparent' ? 'repeating-conic-gradient(#555 0% 25%, #333 0% 50%) 0 0 / 12px 12px' : config.background![0];
  }
  if (config.type === 'gradient') {
    const colors = config.background as string[];
    return `linear-gradient(160deg, ${colors.join(', ')})`;
  }
  return '#000';
}

export default function BackgroundSelector({
  onBackgroundChange,
  onEnvironmentChange,
  currentEnvironment = 'cyberpunk-void',
  currentBackground,
  className = '',
}: BackgroundSelectorProps) {
  const { user } = useAuth();
  const { isPro } = useUserRole();
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<'preset' | 'image'>('preset');
  const [backgrounds, setBackgrounds] = useState<BackgroundItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeType, setActiveType] = useState<'preset' | 'image'>('preset');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadBackgrounds(); }, [isPro]);

  const loadBackgrounds = async () => {
    setLoading(true);
    try {
      const bgs = await BackgroundManager.getBackgrounds(isPro);
      setBackgrounds(bgs);
    } catch {
      toast.error('Gagal memuat background');
    } finally {
      setLoading(false);
    }
  };

  const handlePresetSelect = (preset: string) => {
    onEnvironmentChange(preset);
    setActiveType('preset');
    setIsOpen(false);
    toast.success(`Environment "${PRESET_LABELS[preset] ?? preset}" dipilih`);
  };

  const handleImageSelect = (background: BackgroundItem) => {
    onBackgroundChange(background.url);
    BackgroundManager.setCurrentBackground(background.id);
    setActiveType('image');
    setIsOpen(false);
    toast.success(`Background "${background.name}" dipilih`);
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!isPro) { toast.error('Upload background hanya untuk user Pro'); return; }
    setUploading(true);
    try {
      const newBg = await BackgroundManager.uploadBackground(file, user?.id);
      setBackgrounds(prev => [...prev, newBg]);
      toast.success('Background berhasil diupload');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload gagal');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (background: BackgroundItem) => {
    if (background.type === 'default') { toast.error('Tidak dapat menghapus background default'); return; }
    if (!confirm(`Hapus background "${background.name}"?`)) return;
    try {
      await BackgroundManager.deleteBackground(background.id, user?.id);
      setBackgrounds(prev => prev.filter(bg => bg.id !== background.id));
      toast.success('Background berhasil dihapus');
    } catch {
      toast.error('Gagal menghapus background');
    }
  };

  return (
    <div className="relative">
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className={`h-9 w-9 btn-overlay shadow-md ${isOpen ? 'active' : ''}`}
            title="Background & Environment"
          >
            <Layers className="w-4 h-4" />
          </Button>
        </DialogTrigger>

        <DialogContent className="max-w-2xl panel-overlay flex flex-col" style={{ maxHeight: '80vh' }} aria-describedby="bg-desc">
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-neon-purple flex items-center gap-2">
              <Layers className="w-4 h-4" />
              Background
            </DialogTitle>
            <p id="bg-desc" className="text-xs" style={{ color: 'rgba(192,168,255,0.5)' }}>
              Pilih preset warna atau gambar sebagai background karakter
            </p>
          </DialogHeader>

          {/* Tabs */}
          <div className="shrink-0 flex gap-1 p-1 rounded-lg" style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}>
            {(['preset', 'image'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex-1 py-1.5 text-xs font-semibold rounded-md transition-all"
                style={tab === t
                  ? { background: 'rgba(168,85,247,0.3)', color: '#e9d5ff', boxShadow: '0 0 8px rgba(168,85,247,0.3)' }
                  : { color: 'rgba(192,168,255,0.5)' }
                }
              >
                {t === 'preset' ? 'Preset Warna' : 'Gambar'}
              </button>
            ))}
          </div>

          {/* Scrollable content area */}
          <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin">

          {/* Preset tab */}
          {tab === 'preset' && (
            <div className="grid grid-cols-4 gap-2 p-0.5">
              {Object.keys(ENVIRONMENT_PRESETS).map((preset) => {
                const isActive = activeType === 'preset' && currentEnvironment === preset;
                return (
                  <button
                    key={preset}
                    onClick={() => handlePresetSelect(preset)}
                    className="bg-item relative rounded-lg overflow-hidden active:scale-95"
                    style={{
                      aspectRatio: '16/9',
                      background: presetToCss(preset),
                      outline: isActive ? '2px solid #a855f7' : '1px solid rgba(168,85,247,0.2)',
                      boxShadow: isActive ? '0 0 10px rgba(168,85,247,0.5)' : undefined,
                    }}
                    title={PRESET_LABELS[preset] ?? preset}
                  >
                    {isActive && (
                      <div className="absolute inset-0 flex items-center justify-center"
                        style={{ background: 'rgba(168,85,247,0.2)' }}>
                        <Check className="w-4 h-4 text-white drop-shadow" />
                      </div>
                    )}
                    <span className="absolute bottom-0 left-0 right-0 text-[10px] font-medium text-white text-center py-0.5"
                      style={{ background: 'rgba(0,0,0,0.5)' }}>
                      {PRESET_LABELS[preset] ?? preset}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Image tab */}
          {tab === 'image' && (
            <div className="space-y-3">
              {/* Upload (Pro) */}
              {isPro ? (
                <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}>
                  <Button
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="btn-overlay text-xs h-8"
                  >
                    <Upload className="w-3.5 h-3.5 mr-1.5" />
                    {uploading ? 'Uploading…' : 'Upload Gambar'}
                  </Button>
                  <span className="text-xs" style={{ color: 'rgba(192,168,255,0.5)' }}>JPG, PNG, WebP · maks 10MB</span>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)' }}>
                  <Crown className="w-4 h-4 text-yellow-400 shrink-0" />
                  <span className="text-xs text-yellow-400">Upload gambar custom hanya untuk user Pro</span>
                </div>
              )}

              {/* Image grid */}
              <div className="grid grid-cols-3 gap-2 p-0.5">
                {loading ? (
                  <div className="col-span-full flex items-center justify-center py-8">
                    <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  </div>
                ) : backgrounds.map((bg) => {
                  const canAccess = !bg.isPro || isPro;
                  const isActive = activeType === 'image' && BackgroundManager.getCurrentBackground() === bg.id;
                  return (
                    <div key={bg.id} className="bg-item relative group rounded-lg overflow-hidden cursor-pointer"
                      style={{
                        aspectRatio: '16/9',
                        outline: isActive ? '2px solid #a855f7' : '1px solid rgba(168,85,247,0.2)',
                        boxShadow: isActive ? '0 0 10px rgba(168,85,247,0.5)' : undefined,
                        opacity: canAccess ? 1 : 0.5,
                      }}
                      onClick={() => canAccess && handleImageSelect(bg)}
                    >
                      <img src={bg.thumbnail || bg.url} alt={bg.name}
                        className="w-full h-full object-cover" />
                      {isActive && (
                        <div className="absolute inset-0 flex items-center justify-center"
                          style={{ background: 'rgba(168,85,247,0.2)' }}>
                          <Check className="w-4 h-4 text-white drop-shadow" />
                        </div>
                      )}
                      {!canAccess && (
                        <div className="absolute inset-0 flex items-center justify-center"
                          style={{ background: 'rgba(0,0,0,0.5)' }}>
                          <Crown className="w-4 h-4 text-yellow-400" />
                        </div>
                      )}
                      {bg.type === 'uploaded' && canAccess && (
                        <button
                          className="absolute top-1 right-1 h-5 w-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ background: 'rgba(220,38,38,0.8)' }}
                          onClick={(e) => { e.stopPropagation(); handleDelete(bg); }}
                        >
                          <Trash2 className="w-3 h-3 text-white" />
                        </button>
                      )}
                      <span className="absolute bottom-0 left-0 right-0 text-[10px] text-white text-center py-0.5 truncate px-1"
                        style={{ background: 'rgba(0,0,0,0.5)' }}>
                        {bg.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
