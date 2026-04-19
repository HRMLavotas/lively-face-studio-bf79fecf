import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sparkles, MessageSquare, Volume2, Upload, ArrowRight, Bot } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export default function Landing() {
  const { user, loading } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Nav */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          <span className="text-sm font-semibold tracking-tight text-glow">VRM Assistant</span>
        </div>
        <div className="flex items-center gap-2">
          {!loading && user ? (
            <Link to="/app">
              <Button size="sm" className="gap-1.5">
                Buka Aplikasi <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          ) : (
            <>
              <Link to="/auth">
                <Button variant="ghost" size="sm">
                  Masuk
                </Button>
              </Link>
              <Link to="/auth?tab=signup">
                <Button size="sm" className="gap-1.5">
                  Mulai Gratis <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </>
          )}
        </div>
      </header>

      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center min-h-screen text-center px-4 pt-20">
        {/* Glow blobs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px]" />
          <div className="absolute top-1/3 left-1/4 w-[300px] h-[300px] rounded-full bg-accent/5 blur-[100px]" />
        </div>

        <div className="relative z-10 max-w-3xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-medium">
            <Sparkles className="w-3 h-3" />
            Asisten Virtual berbasis AI
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold leading-tight tracking-tight">
            Asisten Virtual 3D{' '}
            <span className="text-primary text-glow">Interaktif</span>
            <br />
            yang Berbicara denganmu
          </h1>

          <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Upload model VRM 3D pilihanmu, lalu chat dan berinteraksi secara real-time dengan asisten AI yang merespons dengan suara dan ekspresi wajah.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link to={user ? '/app' : '/auth?tab=signup'}>
              <Button size="lg" className="gap-2 min-w-[180px]">
                {user ? 'Buka Aplikasi' : 'Mulai Sekarang'}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            {!user && (
              <Link to="/auth">
                <Button variant="outline" size="lg" className="min-w-[160px] bg-secondary/40">
                  Sudah punya akun
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Preview card */}
        <div className="relative z-10 mt-16 w-full max-w-2xl mx-auto">
          <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm overflow-hidden shadow-2xl">
            <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border/60 bg-secondary/20">
              <div className="w-2.5 h-2.5 rounded-full bg-destructive/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
              <span className="ml-2 text-xs text-muted-foreground">VRM Assistant</span>
            </div>
            <div className="relative h-64 bg-gradient-to-b from-secondary/20 to-background/80 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <div className="w-16 h-16 rounded-full border-2 border-primary/40 bg-primary/10 flex items-center justify-center">
                  <Bot className="w-8 h-8 text-primary/70" />
                </div>
                <p className="text-sm">Model VRM 3D siap berinteraksi</p>
              </div>
              {/* Mock chat bubbles */}
              <div className="absolute bottom-4 left-4 right-4 flex flex-col gap-2">
                <div className="self-start bg-secondary/80 rounded-lg rounded-bl-sm px-3 py-1.5 text-xs text-foreground max-w-[60%]">
                  Halo! Ada yang bisa saya bantu? 👋
                </div>
                <div className="self-end bg-primary/20 border border-primary/30 rounded-lg rounded-br-sm px-3 py-1.5 text-xs text-foreground max-w-[60%]">
                  Ceritakan tentang dirimu
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12 tracking-tight">
            Semua yang kamu butuhkan
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              {
                icon: <Upload className="w-5 h-5 text-primary" />,
                title: 'Upload Model VRM',
                desc: 'Gunakan karakter 3D VRM favorit kamu sebagai wujud asisten virtual.',
              },
              {
                icon: <MessageSquare className="w-5 h-5 text-accent" />,
                title: 'Chat Real-time',
                desc: 'Berinteraksi dengan asisten AI yang cerdas melalui chat teks.',
              },
              {
                icon: <Volume2 className="w-5 h-5 text-primary" />,
                title: 'Suara & Ekspresi',
                desc: 'Asisten merespons dengan suara dan animasi ekspresi wajah yang natural.',
              },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-border/60 bg-card/60 p-5 space-y-3 hover:border-primary/30 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center">
                  {f.icon}
                </div>
                <h3 className="font-semibold text-sm">{f.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 border-t border-border/40">
        <div className="max-w-xl mx-auto text-center space-y-5">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Siap memulai?
          </h2>
          <p className="text-muted-foreground text-sm">
            Buat akun gratis dan mulai berinteraksi dengan asisten virtual 3D-mu sendiri dalam hitungan menit.
          </p>
          <Link to={user ? '/app' : '/auth?tab=signup'}>
            <Button size="lg" className="gap-2">
              {user ? 'Buka Aplikasi' : 'Daftar Gratis'}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-border/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Bot className="w-3.5 h-3.5 text-primary" />
          <span>VRM Assistant</span>
        </div>
        <p>© {new Date().getFullYear()} VRM Assistant. All rights reserved.</p>
      </footer>
    </div>
  );
}
