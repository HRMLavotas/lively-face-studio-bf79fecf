import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { LogOut, User as UserIcon, Settings as SettingsIcon, Crown, Wand2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function UserMenu() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isPro, isAdmin } = useUserRole();
  const [profile, setProfile] = useState<{ display_name: string | null; avatar_url: string | null } | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => setProfile(data));
  }, [user]);

  if (!user) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => navigate('/auth')}
        className="h-8 text-xs btn-overlay"
      >
        Sign In
      </Button>
    );
  }

  const displayName = profile?.display_name || user.email?.split('@')[0] || 'User';
  const initial = displayName[0]?.toUpperCase() ?? 'U';

  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out');
    navigate('/');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="relative h-9 w-9 rounded-full transition-all overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          style={{ boxShadow: '0 0 0 2px rgba(168,85,247,0.5), 0 2px 10px rgba(0,0,0,0.7)' }}
        >
          <Avatar className="h-9 w-9">
            <AvatarImage src={profile?.avatar_url ?? undefined} alt={displayName} />
            <AvatarFallback className="text-xs font-bold"
              style={{ background: 'rgba(10,8,20,0.90)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.5)' }}>
              {initial}
            </AvatarFallback>
          </Avatar>
          {/* Online dot */}
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-400 border-2"
            style={{ borderColor: 'rgba(6,4,14,1)' }} />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56 z-50 p-1.5 panel-overlay shadow-xl">
        {/* User info header */}
        <div className="px-2 py-2.5 mb-1 rounded-md" style={{ background: 'rgba(168,85,247,0.08)' }}>
          <div className="flex items-center gap-2.5">
            <Avatar className="h-9 w-9 shrink-0" style={{ boxShadow: '0 0 0 1.5px rgba(168,85,247,0.4)' }}>
              <AvatarImage src={profile?.avatar_url ?? undefined} />
              <AvatarFallback className="text-xs font-bold"
                style={{ background: 'rgba(10,8,20,0.90)', color: '#c084fc' }}>{initial}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground truncate leading-none">{displayName}</p>
              <p className="text-[10px] truncate mt-0.5" style={{ color: 'rgba(192,168,255,0.6)' }}>{user.email}</p>
            </div>
            {isPro && (
              <span className="shrink-0 flex items-center gap-0.5 text-[10px] font-bold rounded-full px-1.5 py-0.5"
                style={{ background: 'rgba(168,85,247,0.25)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.5)' }}>
                <Crown className="w-2.5 h-2.5" /> Pro
              </span>
            )}
          </div>
        </div>

        <DropdownMenuSeparator className="my-1" style={{ background: 'rgba(168,85,247,0.2)' }} />

        <DropdownMenuItem
          onClick={() => navigate('/profile')}
          className="flex items-center gap-2 px-2 py-2 rounded-md text-sm cursor-pointer text-foreground/90 focus:text-foreground focus:bg-primary/10"
        >
          <UserIcon className="w-3.5 h-3.5" style={{ color: '#a78bfa' }} />
          <span className="flex-1">Profil</span>
          <ChevronRight className="w-3 h-3 opacity-40" />
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => navigate('/settings')}
          className="flex items-center gap-2 px-2 py-2 rounded-md text-sm cursor-pointer text-foreground/90 focus:text-foreground focus:bg-primary/10"
        >
          <SettingsIcon className="w-3.5 h-3.5" style={{ color: '#a78bfa' }} />
          <span className="flex-1">Pengaturan</span>
          <ChevronRight className="w-3 h-3 opacity-40" />
        </DropdownMenuItem>

        {isAdmin && (
          <DropdownMenuItem
            onClick={() => navigate('/admin/animations')}
            className="flex items-center gap-2 px-2 py-2 rounded-md text-sm cursor-pointer text-foreground/90 focus:text-foreground focus:bg-primary/10"
          >
            <Wand2 className="w-3.5 h-3.5" style={{ color: '#a78bfa' }} />
            <span className="flex-1">Animation Studio</span>
            <ChevronRight className="w-3 h-3 opacity-40" />
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator className="my-1" style={{ background: 'rgba(168,85,247,0.2)' }} />

        <DropdownMenuItem
          onClick={handleSignOut}
          className="flex items-center gap-2 px-2 py-2 rounded-md text-sm cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Keluar</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
