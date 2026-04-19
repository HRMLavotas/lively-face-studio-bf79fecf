import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Upload, Trash2, Pencil, Check, Crown } from 'lucide-react';
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', gender: '', personality: '' });
  const [deleteTarget, setDeleteTarget] = useState<VrmModel | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.name.toLowerCase().endsWith('.vrm')) {
      toast.error('Hanya file .vrm yang didukung');
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      toast.error('File terlalu besar (max 100MB)');
      return;
    }

    setUploading(true);
    // Per-user folder for storage RLS
    const filePath = `${user.id}/${Date.now()}_${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from('vrm-models')
      .upload(filePath, file);

    if (uploadError) {
      toast.error('Gagal upload file: ' + uploadError.message);
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
      toast.error('Gagal menyimpan data model: ' + dbError.message);
    } else {
      toast.success('Model berhasil diupload');
      onRefresh();
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleActivate = async (id: string) => {
    // Deactivate all first, then activate selected
    const { error: deactivateErr } = await supabase
      .from('vrm_models')
      .update({ is_active: false })
      .neq('id', id);

    if (deactivateErr) {
      toast.error('Gagal mengaktifkan model');
      return;
    }

    const { error } = await supabase
      .from('vrm_models')
      .update({ is_active: true })
      .eq('id', id);

    if (error) {
      toast.error('Gagal mengaktifkan model');
    } else {
      toast.success('Model diaktifkan');
      onRefresh();
    }
  };

  const handleDelete = async (model: VrmModel) => {
    const { error: storageErr } = await supabase.storage
      .from('vrm-models')
      .remove([model.file_path]);

    if (storageErr) console.warn('Storage delete error:', storageErr);

    const { error } = await supabase
      .from('vrm_models')
      .delete()
      .eq('id', model.id);

    if (error) {
      toast.error('Gagal menghapus model');
    } else {
      toast.success('Model dihapus');
      setDeleteTarget(null);
      onRefresh();
    }
  };

  const startEdit = (model: VrmModel) => {
    setEditingId(model.id);
    setEditForm({ name: model.name, gender: model.gender, personality: model.personality });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const { error } = await supabase
      .from('vrm_models')
      .update({
        name: editForm.name,
        gender: editForm.gender,
        personality: editForm.personality,
      })
      .eq('id', editingId);

    if (error) {
      toast.error('Gagal menyimpan perubahan');
    } else {
      toast.success('Model diperbarui');
      setEditingId(null);
      onRefresh();
    }
  };

  return (
    <>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-foreground">Model VRM</h2>
          <Badge variant="outline" className="text-xs border-primary/40 text-primary">
            <Crown className="w-3 h-3 mr-1" /> Pro
          </Badge>
        </div>
        <div>
          <input
            ref={inputRef}
            type="file"
            accept=".vrm"
            onChange={handleUpload}
            className="hidden"
          />
          <Button
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="gap-2"
          >
            <Upload className="w-3.5 h-3.5" />
            {uploading ? 'Uploading…' : 'Upload VRM'}
          </Button>
        </div>
      </div>

      {models.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Belum ada model. Upload file VRM untuk memulai.
        </p>
      ) : (
        <div className="space-y-3">
          {models.map((model) => (
            <div
              key={model.id}
              className={`rounded-lg border p-4 transition-colors ${
                model.is_active
                  ? 'border-primary/50 bg-primary/5'
                  : 'border-border bg-card/60'
              }`}
            >
              {editingId === model.id ? (
                <div className="space-y-3">
                  <Input
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    placeholder="Nama model"
                    className="bg-secondary/60"
                  />
                  <Select
                    value={editForm.gender}
                    onValueChange={(v) => setEditForm({ ...editForm, gender: v })}
                  >
                    <SelectTrigger className="bg-secondary/60">
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
                    className="bg-secondary/60 text-sm"
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveEdit} className="gap-1">
                      <Check className="w-3.5 h-3.5" /> Simpan
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      Batal
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground truncate">{model.name}</span>
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {model.gender}
                      </Badge>
                      {model.is_active && (
                        <Badge className="text-xs bg-primary/20 text-primary border-primary/30 shrink-0">
                          Aktif
                        </Badge>
                      )}
                    </div>
                    {model.personality && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {model.personality}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground/60 mt-1 font-mono">
                      {model.file_name}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!model.is_active && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleActivate(model.id)}
                        className="text-xs h-7"
                      >
                        Aktifkan
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => startEdit(model)}
                      className="h-7 w-7"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setDeleteTarget(model)}
                      className="h-7 w-7 text-destructive hover:text-destructive"
                    >
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
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hapus model?</AlertDialogTitle>
          <AlertDialogDescription>
            Model <span className="font-medium text-foreground">"{deleteTarget?.name}"</span> akan dihapus permanen beserta file-nya. Tindakan ini tidak dapat dibatalkan.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
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