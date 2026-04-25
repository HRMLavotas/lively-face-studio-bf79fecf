import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import VrmViewer, { type VrmViewerHandle } from '@/components/VrmViewer';
import VrmaUploader from '@/components/VrmaUploader';
import VrmaLibrary, { type VrmaItem } from '@/components/VrmaLibrary';
import BlendshapeUploader, { type ParsedPreset } from '@/components/BlendshapeUploader';
import BlendshapeLibrary, { type BlendshapePreset, BLENDSHAPE_CATEGORIES } from '@/components/BlendshapeLibrary';
import { addPreset } from '@/lib/blendshape-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Save, StopCircle, RotateCcw, Wand2, Library, Upload, Info, Layers } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORIES = ['talking', 'greeting', 'idle', 'emote', 'gesture', 'reaction'] as const;

const CATEGORY_GUIDE: Array<{ cat: string; color: string; examples: string }> = [
  { cat: 'talking',  color: 'text-cyan-400',    examples: 'Talk Casual, Talk Expressive — auto-loop saat TTS aktif' },
  { cat: 'greeting', color: 'text-emerald-400',  examples: 'Wave Hello → halo, hai · Bow Greeting → salam' },
  { cat: 'idle',     color: 'text-sky-400',      examples: 'Idle Breathing, Idle Look Around — auto-play saat diam' },
  { cat: 'emote',    color: 'text-violet-400',   examples: 'Happy Cheer → senang · Thinking Pose → hmm' },
  { cat: 'gesture',  color: 'text-amber-400',    examples: 'Nod Yes → iya · Shake No → tidak' },
  { cat: 'reaction', color: 'text-rose-400',     examples: 'Laugh → haha · Clap Hands → bravo' },
];

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
  const [category, setCategory] = useState<typeof CATEGORIES[number]>('talking');
  const [keywords, setKeywords] = useState('');
  const [loop, setLoop] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState<'upload' | 'library' | 'blendshape'>('upload');

  // ── Blendshape state ──────────────────────────────────────────────────────
  const [bsParsed, setBsParsed] = useState<ParsedPreset | null>(null);
  const [bsName, setBsName] = useState('');
  const [bsCategory, setBsCategory] = useState<typeof BLENDSHAPE_CATEGORIES[number]>('custom');
  const [bsDescription, setBsDescription] = useState('');
  const [bsTargetMode, setBsTargetMode] = useState<'perfectsync' | 'standard' | 'both'>('both');
  const [bsSaving, setBsSaving] = useState(false);
  const [bsRefreshKey, setBsRefreshKey] = useState(0);

  useEffect(() => {
    if (!user) return;
    supabase.from('vrm_models').select('file_path').eq('is_active', true).maybeSingle()
      .then(({ data }) => {
        if (data?.file_path) {
          const { data: url } = supabase.storage.from('vrm-models').getPublicUrl(data.file_path);
          if (url?.publicUrl) setModelUrl(url.publicUrl);
        }
      });
  }, [user]);

  useEffect(() => () => { if (prevBlobUrlRef.current) URL.revokeObjectURL(prevBlobUrlRef.current); }, []);

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

  const playWithFeedback = async (url: string, label: string, opts?: { loop?: boolean }) => {
    const toastId = toast.loading(`Memuat ${label}…`);
    try {
      if (!viewerRef.current?.isVrmLoaded()) {
        toast.loading('Menunggu model VRM siap…', { id: toastId });
        const ready = await waitForVrmReady();
        if (!ready) {
          toast.error('Model VRM belum siap. Aktifkan model di Pengaturan.', { id: toastId, duration: 6000 });
          return;
        }
      }
      await viewerRef.current!.playVrmaUrl(url, { loop: opts?.loop ?? false, fadeIn: 0.3 });
      toast.success(`▶ ${label}`, { id: toastId, duration: 2000 });
    } catch (e) {
      toast.error(`Gagal: ${(e as Error).message}`, { id: toastId, duration: 6000 });
    }
  };

  const handleFileSelected = async (file: File, blobUrl: string) => {
    if (prevBlobUrlRef.current && prevBlobUrlRef.current !== blobUrl) URL.revokeObjectURL(prevBlobUrlRef.current);
    prevBlobUrlRef.current = blobUrl;
    setPreviewFile(file);
    setPreviewUrl(blobUrl);
    if (!name) setName(file.name.replace(/\.vrma$/i, ''));
    await playWithFeedback(blobUrl, file.name, { loop });
  };

  const handleReplay = async () => {
    if (!previewUrl || !previewFile) return;
    await playWithFeedback(previewUrl, previewFile.name, { loop });
  };

  const handlePlayFromLibrary = async (url: string, item: VrmaItem) => {
    await playWithFeedback(url, item.name);
  };

  const handleSave = async () => {
    if (!previewFile || !user) { toast.error('Pilih file dulu'); return; }
    if (!name.trim()) { toast.error('Beri nama dulu'); return; }
    setSaving(true);
    try {
      const safeName = previewFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${user.id}/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage.from('vrma-animations').upload(filePath, previewFile, { contentType: 'application/octet-stream' });
      if (upErr) throw upErr;
      const trigger_keywords = keywords.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
      const { error: insErr } = await supabase.from('vrma_animations').insert({
        user_id: user.id, name: name.trim(), file_path: filePath,
        file_name: previewFile.name, category, trigger_keywords, is_active: true,
      });
      if (insErr) throw insErr;
      toast.success(`"${name}" tersimpan ke library`);
      setPreviewFile(null); setPreviewUrl(null); setName(''); setKeywords('');
      setRefreshKey((k) => k + 1);
      setActiveTab('library');
    } catch (e) {
      toast.error(`Gagal simpan: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Blendshape handlers ───────────────────────────────────────────────────
  const handleBsParsed = (preset: ParsedPreset) => {
    setBsParsed(preset);
    setBsName(preset.name);
    // Preview on model immediately
    viewerRef.current?.applyBlendshape(preset.weights);
  };

  const handleBsPreview = (preset: BlendshapePreset) => {
    viewerRef.current?.applyBlendshape(preset.weights);
    toast.success(`Preview: ${preset.name}`);
  };

  const handleBsClear = () => {
    viewerRef.current?.clearBlendshape();
    viewerRef.current?.setManualBlendshapeMode(false);
  };

  const handleBsSave = async () => {
    if (!bsParsed || !user) { toast.error('Upload file JSON dulu'); return; }
    if (!bsName.trim()) { toast.error('Beri nama dulu'); return; }
    setBsSaving(true);
    try {
      addPreset({
        name: bsName.trim(),
        description: bsDescription.trim(),
        category: bsCategory,
        weights: bsParsed.weights,
        target_mode: bsTargetMode,
        is_active: true,
      });
      toast.success(`"${bsName}" tersimpan ke library`);
      setBsParsed(null); setBsName(''); setBsDescription('');
      setBsRefreshKey(k => k + 1);
    } catch (e) {
      toast.error(`Gagal simpan: ${(e as Error).message}`);
    } finally {
      setBsSaving(false);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-background/90 backdrop-blur-xl shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/app')} className="h-8 w-8 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center">
              <Wand2 className="w-3.5 h-3.5 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-foreground leading-none">Animation Studio</h1>
              <p className="text-[10px] text-muted-foreground mt-0.5">Admin</p>
            </div>
          </div>
        </div>

        {/* Playback controls in header */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground border border-border/50 rounded-lg px-2.5 py-1.5 bg-secondary/40">
            <span className="text-[10px]">Loop</span>
            <Switch id="loop" checked={loop} onCheckedChange={setLoop} className="scale-75" />
          </div>
          <Button size="sm" variant="outline" onClick={handleReplay} disabled={!previewUrl} className="h-8 text-xs gap-1.5 border-border/60">
            <RotateCcw className="w-3.5 h-3.5" /> Replay
          </Button>
          <Button size="sm" variant="outline" onClick={() => viewerRef.current?.stopVrma(0.3)} className="h-8 text-xs gap-1.5 border-border/60">
            <StopCircle className="w-3.5 h-3.5" /> Stop
          </Button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Viewer */}
        <div className="flex-1 relative bg-background min-h-[280px] md:min-h-0">
          <VrmViewer ref={viewerRef} modelUrl={modelUrl} />
          {!modelUrl && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">Aktifkan model VRM di Pengaturan</p>
                <p className="text-xs text-muted-foreground/60">untuk preview animasi</p>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="w-full md:w-[380px] border-t md:border-t-0 md:border-l border-border/50 flex flex-col overflow-hidden bg-card/30">
          {/* Tab switcher */}
          <div className="flex border-b border-border/50 shrink-0">
            {[
              { id: 'upload',     label: 'Upload',     icon: Upload },
              { id: 'library',    label: 'Library',    icon: Library },
              { id: 'blendshape', label: 'Blendshape', icon: Layers },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => {
                  // Leaving blendshape tab → resume auto mood
                  if (activeTab === 'blendshape' && id !== 'blendshape') {
                    viewerRef.current?.clearBlendshape();
                    viewerRef.current?.setManualBlendshapeMode(false);
                  }
                  setActiveTab(id as 'upload' | 'library' | 'blendshape');
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors border-b-2 ${
                  activeTab === id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          <ScrollArea className="flex-1 scrollbar-thin">
            <div className="p-4 space-y-5">
              {activeTab === 'upload' ? (
                <>
                  {/* Naming guide */}
                  <details className="group">
                    <summary className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors list-none">
                      <Info className="w-3.5 h-3.5" />
                      Panduan Penamaan
                      <span className="ml-auto text-[10px] group-open:rotate-180 transition-transform">▼</span>
                    </summary>
                    <div className="mt-2.5 rounded-xl border border-border/50 bg-secondary/30 p-3 space-y-2">
                      {CATEGORY_GUIDE.map(({ cat, color, examples }) => (
                        <div key={cat} className="text-[10px] leading-relaxed">
                          <span className={`font-bold font-mono ${color}`}>{cat.toUpperCase()}</span>
                          <span className="text-muted-foreground ml-1.5">{examples}</span>
                        </div>
                      ))}
                    </div>
                  </details>

                  {/* File upload */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-foreground">File Animasi</h3>
                    <VrmaUploader onFileSelected={handleFileSelected} />
                    {previewFile && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/8 border border-primary/20">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                        <p className="text-xs text-primary/80 font-mono truncate flex-1">{previewFile.name}</p>
                      </div>
                    )}
                  </div>

                  {/* Metadata form */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-foreground">Metadata</h3>

                    <div className="space-y-1.5">
                      <Label htmlFor="anim-name" className="text-[11px] text-muted-foreground">Nama Animasi</Label>
                      <Input
                        id="anim-name"
                        placeholder="e.g. Wave Hello, Nod Yes"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="h-9 bg-secondary/40 border-border/50 text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="anim-cat" className="text-[11px] text-muted-foreground">Kategori</Label>
                      <Select value={category} onValueChange={(v) => setCategory(v as typeof CATEGORIES[number])}>
                        <SelectTrigger id="anim-cat" className="h-9 bg-secondary/40 border-border/50 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((c) => <SelectItem key={c} value={c} className="text-sm">{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="anim-kw" className="text-[11px] text-muted-foreground">Trigger Keywords</Label>
                      <Input
                        id="anim-kw"
                        placeholder="halo, hai, hello, selamat pagi"
                        value={keywords}
                        onChange={(e) => setKeywords(e.target.value)}
                        className="h-9 bg-secondary/40 border-border/50 text-sm"
                      />
                      <p className="text-[10px] text-muted-foreground/60">Pisahkan dengan koma. Kosongkan untuk talking/idle.</p>
                    </div>
                  </div>

                  <Button onClick={handleSave} disabled={!previewFile || saving} className="w-full gap-2 h-10">
                    <Save className="w-4 h-4" />
                    {saving ? 'Menyimpan…' : 'Simpan ke Library'}
                  </Button>
                </>
              ) : activeTab === 'library' ? (
                <VrmaLibrary refreshKey={refreshKey} onPlay={handlePlayFromLibrary} />
              ) : (
                /* ── Blendshape tab ── */
                <>
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-foreground">Import Preset</h3>
                    <BlendshapeUploader onParsed={handleBsParsed} />
                    {bsParsed && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/8 border border-primary/20">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                        <p className="text-xs text-primary/80 font-mono truncate flex-1">
                          {Object.keys(bsParsed.weights).length} blendshape dimuat
                        </p>
                        <button onClick={handleBsClear} className="text-[10px] text-muted-foreground hover:text-foreground">reset</button>
                      </div>
                    )}
                  </div>

                  {bsParsed && (
                    <div className="space-y-3">
                      <h3 className="text-xs font-semibold text-foreground">Metadata</h3>

                      <div className="space-y-1.5">
                        <Label className="text-[11px] text-muted-foreground">Nama Preset</Label>
                        <Input
                          placeholder="e.g. Happy Smile, Surprised"
                          value={bsName}
                          onChange={e => setBsName(e.target.value)}
                          className="h-9 bg-secondary/40 border-border/50 text-sm"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-[11px] text-muted-foreground">Deskripsi</Label>
                        <Input
                          placeholder="Opsional"
                          value={bsDescription}
                          onChange={e => setBsDescription(e.target.value)}
                          className="h-9 bg-secondary/40 border-border/50 text-sm"
                        />
                      </div>

                      <div className="flex gap-2">
                        <div className="flex-1 space-y-1.5">
                          <Label className="text-[11px] text-muted-foreground">Kategori</Label>
                          <Select value={bsCategory} onValueChange={v => setBsCategory(v as typeof BLENDSHAPE_CATEGORIES[number])}>
                            <SelectTrigger className="h-9 bg-secondary/40 border-border/50 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {BLENDSHAPE_CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-sm">{c}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex-1 space-y-1.5">
                          <Label className="text-[11px] text-muted-foreground">Target</Label>
                          <Select value={bsTargetMode} onValueChange={v => setBsTargetMode(v as 'perfectsync' | 'standard' | 'both')}>
                            <SelectTrigger className="h-9 bg-secondary/40 border-border/50 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="both" className="text-sm">Both</SelectItem>
                              <SelectItem value="perfectsync" className="text-sm">Perfect Sync</SelectItem>
                              <SelectItem value="standard" className="text-sm">Standard</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <Button onClick={handleBsSave} disabled={bsSaving} className="w-full gap-2 h-10">
                        <Save className="w-4 h-4" />
                        {bsSaving ? 'Menyimpan…' : 'Simpan ke Library'}
                      </Button>
                    </div>
                  )}

                  <div className="border-t border-border/40 pt-1">
                    <h3 className="text-xs font-semibold text-foreground mb-3">Library</h3>
                    <BlendshapeLibrary refreshKey={bsRefreshKey} onPreview={handleBsPreview} />
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        </aside>
      </div>
    </div>
  );
}
