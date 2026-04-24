import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowLeft, Crown, Camera, LogOut, User, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

const displayNameSchema = z.string().trim().min(1, 'Nama tidak boleh kosong').max(50);

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
    try { displayNameSchema.parse(displayName); }
    catch (err) { if (err instanceof z.ZodError) toast.error(err.issues[0].message); return; }
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ display_name: displayName }).eq('user_id', user.id);
    setSaving(false);
    if (error) toast.error('Gagal menyimpan');
    else toast.success('Profil tersimpan');
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith('image/')) { toast.error('Hanya file gambar'); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error('Maksimal 2MB'); return; }
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
    if (upErr) { toast.error('Upload gagal: ' + upErr.message); setUploading(false); return; }
    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
    const { error: updErr } = await supabase.from('profiles').update({ avatar_url: pub.publicUrl }).eq('user_id', user.id);
    if (updErr) toast.error('Gagal update avatar');
    else { setAvatarUrl(pub.publicUrl); toast.success('Avatar diperbarui'); }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const initial = (displayName || user?.email || 'U')[0]?.toUpperCase() ?? 'U';

  if (loading) {
    return (
      <div className="min-h-screen bg-background cyber-grid-animated scanlines flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin neon-glow-purple" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background cyber-grid-animated scanlines">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 border-b border-neon-purple cyber-glass-strong backdrop-blur-xl">
        <div className="max-w-xl mx-auto px-4 py-3.5 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/app')} className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0 hover-neon-glow">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-secondary border border-neon-purple flex items-center justify-center neon-glow-purple">
              <User className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <h1 className="text-base font-semibold text-foreground tracking-tight text-neon-purple">Profil</h1>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-8 space-y-8">
        {/* Avatar section */}
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="relative group">
            <Avatar className="h-24 w-24 ring-2 ring-neon-purple-bright ring-offset-2 ring-offset-background neon-glow-purple">
              <AvatarImage src={avatarUrl ?? undefined} alt={displayName} />
              <AvatarFallback className="text-3xl font-semibold bg-primary/10 text-primary">{initial}</AvatarFallback>
            </Avatar>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute inset-0 rounded-full cyber-glass-strong opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center border border-neon-purple-bright"
            >
              <Camera className="w-5 h-5 text-white" />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-foreground text-neon-purple">{displayName || 'Pengguna'}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{user?.email}</p>
          </div>
        </div>

        {/* Role badge */}
        <div className={`rounded-xl border p-4 flex items-center gap-3 corner-accent ${isPro ? 'border-neon-purple-bright cyber-glass neon-glow-purple' : 'border-neon-purple cyber-glass'}`}>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isPro ? 'bg-primary/15 border border-neon-purple-bright neon-glow-purple' : 'bg-secondary border border-neon-purple'}`}>
            {isPro ? <Crown className="w-4.5 h-4.5 text-primary" /> : <User className="w-4 h-4 text-muted-foreground" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">{isPro ? 'Pro' : 'Free'}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isPro ? 'Akses penuh ke semua fitur' : 'Upgrade untuk fitur premium'}
            </p>
          </div>
          {!isPro && (
            <Button size="sm" variant="outline" className="shrink-0 h-7 text-xs gap-1.5 border-neon-purple-bright text-primary hover-neon-glow">
              <Sparkles className="w-3 h-3" /> Upgrade
            </Button>
          )}
        </div>

        {/* Form */}
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs text-muted-foreground">Email</Label>
            <Input value={user?.email ?? ''} disabled className="h-10 cyber-glass border-neon-purple text-muted-foreground text-sm" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="displayName" className="text-xs text-muted-foreground">Nama Tampilan</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Nama kamu"
              className="h-10 cyber-glass border-neon-purple text-sm focus:border-neon-purple-bright focus:neon-glow-purple transition-all"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2.5 pt-2">
          <Button onClick={handleSave} disabled={saving} className="flex-1 h-10 neon-glow-purple hover-neon-lift">
            {saving ? 'Menyimpan…' : 'Simpan Perubahan'}
          </Button>
          <Button
            variant="outline"
            onClick={async () => { await signOut(); navigate('/'); }}
            className="h-10 gap-2 border-neon-purple text-muted-foreground hover:text-destructive hover:border-destructive/40 hover-neon-glow"
          >
            <LogOut className="w-4 h-4" /> Keluar
          </Button>
        </div>
      </div>
    </div>
  );
}
