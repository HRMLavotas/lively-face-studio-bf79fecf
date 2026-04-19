import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Mail, Lock } from 'lucide-react';
import { toast } from 'sonner';

const emailSchema = z.string().trim().email({ message: 'Email tidak valid' }).max(255);
const passwordSchema = z.string().min(8, { message: 'Password minimal 8 karakter' }).max(72);

export default function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const from =
    (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/app';

  // Support ?tab=signup in URL
  const searchParams = new URLSearchParams(location.search);
  const defaultTab = searchParams.get('tab') === 'signup' ? 'signup' : 'signin';

  const [tab, setTab] = useState<'signin' | 'signup'>(defaultTab);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      navigate(from, { replace: true });
    }
  }, [user, authLoading, navigate, from]);

  const handleEmail = async (mode: 'signin' | 'signup') => {
    try {
      emailSchema.parse(email);
      passwordSchema.parse(password);
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast.error(err.issues[0].message);
      }
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
          },
        });
        if (error) throw error;
        toast.success('Akun berhasil dibuat!');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success('Selamat datang kembali!');
      }
      // Auth listener in useAuth will handle the redirect via the effect above
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setSubmitting(true);
    const result = await lovable.auth.signInWithOAuth('google', {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error('Sign in dengan Google gagal');
      setSubmitting(false);
      return;
    }
    if (result.redirected) return;
    // Tokens received, listener will redirect
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Link to="/" className="absolute top-4 left-4">
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <ArrowLeft className="w-4 h-4" />
        </Button>
      </Link>

      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-semibold text-foreground tracking-tight text-glow">
            VRM Assistant
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Masuk untuk mengakses asisten virtual Anda
          </p>
        </div>

        <div className="bg-card/80 backdrop-blur-md border border-border rounded-xl p-5 space-y-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleGoogle}
            disabled={submitting}
            className="w-full gap-2 bg-secondary/40"
          >
            <GoogleIcon /> Continue with Google
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">atau</span>
            </div>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as 'signin' | 'signup')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Masuk</TabsTrigger>
              <TabsTrigger value="signup">Daftar</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="mt-4 space-y-3">
              <EmailPasswordFields
                email={email}
                password={password}
                setEmail={setEmail}
                setPassword={setPassword}
              />
              <Button
                onClick={() => handleEmail('signin')}
                disabled={submitting}
                className="w-full"
              >
                {submitting ? 'Memproses…' : 'Masuk'}
              </Button>
            </TabsContent>

            <TabsContent value="signup" className="mt-4 space-y-3">
              <EmailPasswordFields
                email={email}
                password={password}
                setEmail={setEmail}
                setPassword={setPassword}
              />
              <Button
                onClick={() => handleEmail('signup')}
                disabled={submitting}
                className="w-full"
              >
                {submitting ? 'Memproses…' : 'Buat Akun'}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Dengan mendaftar, Anda mendapat akses Free tier secara default.
              </p>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function EmailPasswordFields({
  email,
  password,
  setEmail,
  setPassword,
}: {
  email: string;
  password: string;
  setEmail: (v: string) => void;
  setPassword: (v: string) => void;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-xs">Email</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="pl-9 bg-secondary/60"
            autoComplete="email"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password" className="text-xs">Password</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="pl-9 bg-secondary/60"
            autoComplete="current-password"
          />
        </div>
      </div>
    </>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.99 10.99 0 0012 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.99 10.99 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
        fill="#EA4335"
      />
    </svg>
  );
}
