import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { LogOut, User as UserIcon, Settings as SettingsIcon, Crown, Wand2 } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
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
        className="h-8 border-border bg-secondary/60 backdrop-blur-md hover:bg-secondary"
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
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 rounded-full p-0 border-border bg-secondary/60 backdrop-blur-md hover:bg-secondary overflow-hidden"
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={profile?.avatar_url ?? undefined} alt={displayName} />
            <AvatarFallback className="text-xs bg-primary/10 text-primary">
              {initial}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 z-50">
        <DropdownMenuLabel className="flex items-center gap-2">
          <span className="truncate flex-1">{displayName}</span>
          {isPro && (
            <Badge className="text-[10px] h-4 px-1 bg-primary/20 text-primary border-primary/30">
              <Crown className="w-2.5 h-2.5 mr-0.5" /> Pro
            </Badge>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/profile')}>
          <UserIcon className="w-4 h-4 mr-2" /> Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate('/settings')}>
          <SettingsIcon className="w-4 h-4 mr-2" /> Settings
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem onClick={() => navigate('/admin/animations')}>
            <Wand2 className="w-4 h-4 mr-2" /> Animation Studio
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
          <LogOut className="w-4 h-4 mr-2" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
