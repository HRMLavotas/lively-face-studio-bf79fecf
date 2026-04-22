import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Upload, Trash2, Pencil, Check, X, Bot, Cpu, ExternalLink } from 'lucide-react';
import { UploadProgress } from '@/components/UploadProgress';
import { toast } from 'sonner';

interface VrmModel {
  id: string;
  name: string;
  gender: string;
  personality: string;
  is_active: boolean;
  file_path: string;
  file_name: string;
}

interface ModelManagerProps {
  models: VrmModel[];
  onRefresh: () => void;
}

export default function ModelManager({ models, onRefresh }: ModelManagerProps) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ name: string; progress: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', gender: '', personality: '' });
  const [deleteTarget, setDeleteTarget] = useState<VrmModel | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.name.toLowerCase().endsWith('.vrm')) { toast.error('Hanya file .vrm yang didukung'); return; }
    if (file.size > 100 * 1024 * 1024) { toast.error('File terlalu besar (max 100MB)'); return; }

    setUploading(true);
    setUploadProgress({ name: file.name, progress: 0 });
    const filePath = `${user.id}/${Date.now()}_${file.name}`;

    // Use XMLHttpRequest for real upload progress
    const uploadWithProgress = (): Promise<{ error: Error | null }> =>
      new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
        const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/vrm-models/${filePath}`);
        xhr.setRequestHeader('Authorization', `Bearer ${SUPABASE_KEY}`);
        xhr.setRequestHeader('x-upsert', 'false');
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            setUploadProgress({ name: file.name, progress: Math.round((ev.loaded / ev.total) * 95) });
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setUploadProgress({ name: file.name, progress: 100 });
            resolve({ error: null });
          } else {
            resolve({ error: new Error(`Upload failed: ${xhr.statusText}`) });
          }
        };
        xhr.onerror = () => resolve({ error: new Error('Network error') });
        xhr.send(file);
      });

    const { error: uploadError } = await uploadWithProgress();
    if (uploadError) {
      toast.error('Gagal upload: ' + uploadError.message);
      setUploadProgress({ name: file.name, progress: -1 });
      setUploading(false);
      return;
    }

    const { error: dbError } = await supabase.from('vrm_models').insert({
      name: file.name.replace('.vrm', ''),
      file_path: filePath,
      file_name: file.name,
      is_active: models.length === 0,
      user_id: user.id,
    });
    if (dbError) {
      toast.error('Gagal menyimpan: ' + dbError.message);
      setUploadProgress({ name: file.name, progress: -1 });
    } else {
      toast.success('Model berhasil diupload');
      onRefresh();
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleActivate = async (id: string) => {
    await supabase.from('vrm_models').update({ is_active: false }).neq('id', id);
    const { error } = await supabase.from('vrm_models').update({ is_active: true }).eq('id', id);
    if (error) toast.error('Gagal mengaktifkan model');
    else { toast.success('Model diaktifkan'); onRefresh(); }
  };

  const handleDelete = async (model: VrmModel) => {
    await supabase.storage.from('vrm-models').remove([model.file_path]);
    const { error } = await supabase.from('vrm_models').delete().eq('id', model.id);
    if (error) toast.error('Gagal menghapus model');
    else { toast.success('Model dihapus'); setDeleteTarget(null); onRefresh(); }
  };

  const startEdit = (model: VrmModel) => {
    setEditingId(model.id);
    setEditForm({ name: model.name, gender: model.gender, personality: model.personality });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const { error } = await supabase.from('vrm_models')
      .update({ name: editForm.name, gender: editForm.gender, personality: editForm.personality })
      .eq('id', editingId);
    if (error) toast.error('Gagal menyimpan');
    else { toast.success('Model diperbarui'); setEditingId(null); onRefresh(); }
  };

  return (
    <>
      <div className="space-y-5">
        {/* Section header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Model VRM</h2>
              <p className="text-[11px] text-muted-foreground">{models.length} model tersimpan</p>
            </div>
          </div>
          <div>
            <input ref={inputRef} type="file" accept=".vrm" onChange={handleUpload} className="hidden" />
            <Button size="sm" onClick={() => inputRef.current?.click()} disabled={uploading} className="gap-1.5 h-8 text-xs">
              <Upload className="w-3.5 h-3.5" />
              {uploading ? 'Uploading…' : 'Upload VRM'}
            </Button>
          </div>
        </div>

        {/* Upload progress */}
        {uploadProgress && (
          <UploadProgress
            progress={uploadProgress.progress}
            fileName={uploadProgress.name}
            onDone={() => setUploadProgress(null)}
          />
        )}

        {/* Empty state */}
        {models.length === 0 && !uploading ? (
          <button
            onClick={() => inputRef.current?.click()}
            className="w-full rounded-xl border-2 border-dashed border-border/50 hover:border-primary/40 hover:bg-primary/3 transition-all p-8 flex flex-col items-center gap-3 text-center group"
          >
            <div className="w-12 h-12 rounded-2xl bg-secondary border border-border/60 flex items-center justify-center group-hover:border-primary/30 group-hover:bg-primary/8 transition-all">
              <Upload className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground/70">Upload model VRM pertamamu</p>
              <p className="text-xs text-muted-foreground mt-0.5">Klik untuk memilih file .vrm (max 100MB)</p>
            </div>
            <a
              href="https://hub.vroid.com"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary transition-colors"
            >
              <ExternalLink className="w-3 h-3" /> Cari model di VRoid Hub
            </a>
          </button>
        ) : (
          <div className="space-y-2.5">
            {models.map((model) => (
              <div
                key={model.id}
                className={`rounded-xl border transition-all ${
                  model.is_active
                    ? 'border-primary/40 bg-primary/5 shadow-sm shadow-primary/10'
                    : 'border-border/50 bg-card/50 hover:border-border/80'
                }`}
              >
                {editingId === model.id ? (
                  <div className="p-4 space-y-3">
                    <Input
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      placeholder="Nama model"
                      className="h-9 bg-secondary/50 border-border/50 text-sm"
                    />
                    <Select value={editForm.gender} onValueChange={(v) => setEditForm({ ...editForm, gender: v })}>
                      <SelectTrigger className="h-9 bg-secondary/50 border-border/50 text-sm">
                        <SelectValue placeholder="Gender" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <Textarea
                      value={editForm.personality}
                      onChange={(e) => setEditForm({ ...editForm, personality: e.target.value })}
                      placeholder="Deskripsi kepribadian model…"
                      className="bg-secondary/50 border-border/50 text-sm resize-none"
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveEdit} className="gap-1.5 h-8 text-xs flex-1">
                        <Check className="w-3.5 h-3.5" /> Simpan
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="h-8 text-xs gap-1.5">
                        <X className="w-3.5 h-3.5" /> Batal
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 flex items-start gap-3">
                    {/* Model icon */}
                    <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center mt-0.5 ${
                      model.is_active ? 'bg-primary/15 border border-primary/25' : 'bg-secondary border border-border/60'
                    }`}>
                      <Cpu className={`w-4 h-4 ${model.is_active ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-foreground truncate">{model.name}</span>
                        {model.gender && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-secondary border border-border/50 text-muted-foreground">
                            {model.gender}
                          </span>
                        )}
                        {model.is_active && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/15 border border-primary/30 text-primary">
                            Aktif
                          </span>
                        )}
                      </div>
                      {model.personality && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{model.personality}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground/50 mt-1 font-mono truncate">{model.file_name}</p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {!model.is_active && (
                        <Button size="sm" variant="outline" onClick={() => handleActivate(model.id)} className="h-7 text-xs border-border/60 hover:border-primary/40 hover:text-primary">
                          Aktifkan
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => startEdit(model)} className="h-7 w-7 text-muted-foreground hover:text-foreground">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(model)} className="h-7 w-7 text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-card/95 backdrop-blur-xl border-border/60">
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus model?</AlertDialogTitle>
            <AlertDialogDescription>
              Model <span className="font-semibold text-foreground">"{deleteTarget?.name}"</span> akan dihapus permanen beserta file-nya. Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border/60">Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
