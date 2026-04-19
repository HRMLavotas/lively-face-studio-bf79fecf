import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowLeft, Crown, Upload, LogOut } from 'lucide-react';
import { toast } from 'sonner';

const displayNameSchema = z.string().trim().min(1, { message: 'Nama tidak boleh kosong' }).max(50);

export default function Profile() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isPro, roles } = useUserRole();
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setDisplayName(data?.display_name ?? '');
        setAvatarUrl(data?.avatar_url ?? null);
        setLoading(false);
      });
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    try {
      displayNameSchema.parse(displayName);
    } catch (err) {
      if (err instanceof z.ZodError) toast.error(err.issues[0].message);
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName })
      .eq('user_id', user.id);
    setSaving(false);
    if (error) toast.error('Gagal menyimpan');
    else toast.success('Profil tersimpan');
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Hanya file gambar');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Maksimal 2MB');
      return;
    }
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
    if (upErr) {
      toast.error('Upload gagal: ' + upErr.message);
      setUploading(false);
      return;
    }
    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
    const { error: updErr } = await supabase
      .from('profiles')
      .update({ avatar_url: pub.publicUrl })
      .eq('user_id', user.id);
    if (updErr) toast.error('Gagal update avatar');
    else {
      setAvatarUrl(pub.publicUrl);
      toast.success('Avatar diperbarui');
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const initial = (displayName || user?.email || 'U')[0]?.toUpperCase() ?? 'U';

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate('/app')} className="h-8 w-8">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Profil</h1>
        </div>

        <div className="space-y-6">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20 border-2 border-border">
              <AvatarImage src={avatarUrl ?? undefined} alt={displayName} />
              <AvatarFallback className="text-2xl bg-primary/10 text-primary">{initial}</AvatarFallback>
            </Avatar>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="gap-2"
              >
                <Upload className="w-3.5 h-3.5" />
                {uploading ? 'Mengunggah…' : 'Ubah Avatar'}
              </Button>
              <p className="text-xs text-muted-foreground mt-1.5">JPG, PNG. Max 2MB.</p>
            </div>
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label className="text-xs">Email</Label>
            <Input value={user?.email ?? ''} disabled className="bg-secondary/40" />
          </div>

          {/* Display name */}
          <div className="space-y-1.5">
            <Label htmlFor="displayName" className="text-xs">Nama Tampilan</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="bg-secondary/60"
            />
          </div>

          {/* Role */}
          <div className="space-y-1.5">
            <Label className="text-xs">Tingkat Akun</Label>
            <div className="flex items-center gap-2">
              {isPro ? (
                <Badge className="bg-primary/20 text-primary border-primary/30">
                  <Crown className="w-3 h-3 mr-1" /> Pro
                </Badge>
              ) : (
                <Badge variant="secondary">Free</Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {roles.length > 0 ? roles.join(', ') : 'free'}
              </span>
            </div>
            {!isPro && (
              <p className="text-xs text-muted-foreground mt-2">
                Upgrade ke Pro untuk akses model VRM unlimited & semua voice ElevenLabs (segera hadir).
              </p>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              {saving ? 'Menyimpan…' : 'Simpan'}
            </Button>
            <Button variant="outline" onClick={handleSignOut} className="gap-2">
              <LogOut className="w-4 h-4" /> Keluar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
