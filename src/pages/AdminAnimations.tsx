import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import VrmViewer, { type VrmViewerHandle } from '@/components/VrmViewer';
import VrmaUploader from '@/components/VrmaUploader';
import VrmaLibrary, { type VrmaItem } from '@/components/VrmaLibrary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Save, StopCircle, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORIES = ['greeting', 'idle', 'emote', 'gesture', 'reaction'] as const;

export default function AdminAnimations() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const viewerRef = useRef<VrmViewerHandle>(null);
  const prevBlobUrlRef = useRef<string | null>(null);

  const [modelUrl, setModelUrl] = useState('');
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<typeof CATEGORIES[number]>('gesture');
  const [keywords, setKeywords] = useState('');
  const [loop, setLoop] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Load admin's active VRM model for preview
  useEffect(() => {
    if (!user) return;
    supabase
      .from('vrm_models')
      .select('file_path')
      .eq('is_active', true)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.file_path) {
          const { data: url } = supabase.storage.from('vrm-models').getPublicUrl(data.file_path);
          if (url?.publicUrl) setModelUrl(url.publicUrl);
        }
      });
  }, [user]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      if (prevBlobUrlRef.current) {
        URL.revokeObjectURL(prevBlobUrlRef.current);
      }
    };
  }, []);

  if (authLoading || roleLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/app" replace />;

  const waitForVrmReady = async (timeoutMs = 10000): Promise<boolean> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (viewerRef.current?.isVrmLoaded()) return true;
      await new Promise((r) => setTimeout(r, 200));
    }
    return false;
  };

  const handleFileSelected = async (file: File, blobUrl: string) => {
    // Revoke previous blob URL to prevent memory leaks
    if (prevBlobUrlRef.current && prevBlobUrlRef.current !== blobUrl) {
      URL.revokeObjectURL(prevBlobUrlRef.current);
    }
    prevBlobUrlRef.current = blobUrl;

    setPreviewFile(file);
    setPreviewUrl(blobUrl);
    if (!name) setName(file.name.replace(/\.vrma$/i, ''));

    const loadingToast = toast.loading(`Memuat ${file.name}…`);

    // Wait for VRM to finish loading if needed
    if (!viewerRef.current?.isVrmLoaded()) {
      toast.loading('Menunggu model VRM siap…', { id: loadingToast });
      const ready = await waitForVrmReady();
      if (!ready) {
        toast.error('Model VRM belum siap. Pastikan model aktif sudah di-set.', {
          id: loadingToast,
          duration: 6000,
        });
        return;
      }
    }

    try {
      await viewerRef.current!.playVrmaUrl(blobUrl, { loop, fadeIn: 0.3 });
      toast.success('Preview animasi berjalan', { id: loadingToast });
    } catch (e) {
      const msg = (e as Error).message;
      toast.error(`Gagal load VRMA: ${msg}`, {
        id: loadingToast,
        description: 'Pastikan file format VRMA standar (Pixiv VRM Animation 1.0+)',
        duration: 6000,
      });
    }
  };

  const handleReplay = async () => {
    if (!previewUrl) return;
    try {
      await viewerRef.current?.playVrmaUrl(previewUrl, { loop, fadeIn: 0.3 });
    } catch (e) {
      toast.error(`Gagal replay: ${(e as Error).message}`);
    }
  };

  const handleStop = () => {
    viewerRef.current?.stopVrma(0.3);
  };

  const handlePlayFromLibrary = async (url: string, item: VrmaItem) => {
    try {
      await viewerRef.current?.playVrmaUrl(url, { loop: false, fadeIn: 0.3 });
      toast.success(`Memutar: ${item.name}`);
    } catch (e) {
      toast.error(`Gagal: ${(e as Error).message}`);
    }
  };

  const handleSave = async () => {
    if (!previewFile || !user) {
      toast.error('Pilih file dulu');
      return;
    }
    if (!name.trim()) {
      toast.error('Beri nama dulu');
      return;
    }
    setSaving(true);
    try {
      const safeName = previewFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${user.id}/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage
        .from('vrma-animations')
        .upload(filePath, previewFile, { contentType: 'application/octet-stream' });
      if (upErr) throw upErr;

      const trigger_keywords = keywords
        .split(',')
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean);

      const { error: insErr } = await supabase.from('vrma_animations').insert({
        user_id: user.id,
        name: name.trim(),
        file_path: filePath,
        file_name: previewFile.name,
        category,
        trigger_keywords,
        is_active: true,
      });
      if (insErr) throw insErr;

      toast.success(`"${name}" tersimpan ke library`);
      setPreviewFile(null);
      setPreviewUrl(null);
      setName('');
      setKeywords('');
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast.error(`Gagal simpan: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/app')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-lg font-semibold tracking-tight">Animation Studio</h1>
          <span className="text-xs text-muted-foreground font-mono">Admin</span>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Viewer */}
        <div className="flex-1 relative bg-background min-h-[300px]">
          <VrmViewer ref={viewerRef} modelUrl={modelUrl} />
          {/* Playback controls */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 p-2 rounded-md bg-secondary/80 backdrop-blur-md border border-border">
            <Button size="sm" variant="ghost" onClick={handleReplay} disabled={!previewUrl}>
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Replay
            </Button>
            <Button size="sm" variant="ghost" onClick={handleStop}>
              <StopCircle className="w-3.5 h-3.5 mr-1" /> Stop
            </Button>
            <div className="flex items-center gap-2 pl-2 border-l border-border">
              <Label htmlFor="loop" className="text-xs font-mono">Loop</Label>
              <Switch id="loop" checked={loop} onCheckedChange={setLoop} />
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="w-full md:w-[400px] border-l border-border flex flex-col overflow-y-auto p-4 gap-6">
          {/* Upload */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold tracking-tight">Preview Upload</h2>
            <VrmaUploader onFileSelected={handleFileSelected} />
            {previewFile && (
              <p className="text-xs text-muted-foreground font-mono truncate">
                {previewFile.name}
              </p>
            )}
          </section>

          {/* Save form */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold tracking-tight">Simpan ke Library</h2>
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs">Nama Adegan</Label>
              <Input
                id="name"
                placeholder="e.g. Wave Hello"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat" className="text-xs">Kategori</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as typeof CATEGORIES[number])}>
                <SelectTrigger id="cat"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="kw" className="text-xs">Trigger Keywords (comma-separated)</Label>
              <Input
                id="kw"
                placeholder="hai, halo, hello"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
              />
            </div>
            <Button
              onClick={handleSave}
              disabled={!previewFile || saving}
              className="w-full gap-2"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </section>

          {/* Library */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold tracking-tight">Library</h2>
            <VrmaLibrary refreshKey={refreshKey} onPlay={handlePlayFromLibrary} />
          </section>
        </aside>
      </div>
    </div>
  );
}
