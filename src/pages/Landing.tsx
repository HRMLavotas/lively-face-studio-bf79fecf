import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sparkles, MessageSquare, Volume2, Upload, ArrowRight, Bot, Zap } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export default function Landing() {
  const { user, loading } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Nav */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-5 py-3.5 border-b border-border/30 bg-background/80 backdrop-blur-xl">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center">
            <Bot className="w-4 h-4 text-primary" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-glow">VRM Assistant</span>
        </div>
        <nav className="flex items-center gap-2">
          {!loading && user ? (
            <Link to="/app">
              <Button size="sm" className="gap-1.5 h-8 text-xs">
                Buka Aplikasi <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
          ) : (
            <>
              <Link to="/auth">
                <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-foreground">
                  Masuk
                </Button>
              </Link>
              <Link to="/auth?tab=signup">
                <Button size="sm" className="gap-1.5 h-8 text-xs">
                  Mulai Gratis <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </>
          )}
        </nav>
      </header>

      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center min-h-screen text-center px-5 pt-20">
        {/* Background glows */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] rounded-full bg-primary/6 blur-[130px]" />
          <div className="absolute top-1/2 left-1/4 w-[350px] h-[350px] rounded-full bg-accent/5 blur-[110px]" />
          <div className="absolute bottom-1/4 right-1/4 w-[250px] h-[250px] rounded-full bg-primary/4 blur-[90px]" />
        </div>

        <div className="relative z-10 max-w-3xl mx-auto space-y-7">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-primary/30 bg-primary/8 text-primary text-xs font-medium">
            <Sparkles className="w-3 h-3" />
            Asisten Virtual berbasis AI
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold leading-[1.1] tracking-tight">
            Asisten Virtual 3D{' '}
            <span className="text-primary text-glow">Interaktif</span>
            <br className="hidden sm:block" />
            {' '}yang Berbicara denganmu
          </h1>

          <p className="text-base sm:text-lg text-muted-foreground max-w-lg mx-auto leading-relaxed">
            Upload model VRM 3D pilihanmu, lalu chat dan berinteraksi secara real-time dengan asisten AI yang merespons dengan suara dan ekspresi wajah.
          </p>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
            <Link to={user ? '/app' : '/auth?tab=signup'}>
              <Button size="lg" className="gap-2 min-w-[180px] h-11 text-sm shadow-lg shadow-primary/20">
                {user ? 'Buka Aplikasi' : 'Mulai Sekarang'}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            {!user && (
              <Link to="/auth">
                <Button variant="outline" size="lg" className="min-w-[160px] h-11 text-sm border-border/60 bg-secondary/30 hover:bg-secondary/60">
                  Sudah punya akun
                </Button>
              </Link>
            )}
          </div>

          {/* Social proof hint */}
          <p className="text-xs text-muted-foreground/60">
            Gratis untuk memulai · Tidak perlu kartu kredit
          </p>
        </div>

        {/* App preview card */}
        <div className="relative z-10 mt-14 w-full max-w-2xl mx-auto">
          <div className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden shadow-2xl shadow-black/40">
            {/* Window chrome */}
            <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border/50 bg-secondary/20">
              <div className="w-2.5 h-2.5 rounded-full bg-destructive/50" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
              <span className="ml-2 text-[11px] text-muted-foreground/60 font-mono">VRM Assistant</span>
            </div>

            {/* Preview content */}
            <div className="relative h-60 bg-gradient-to-b from-secondary/15 to-background/60 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <div className="w-16 h-16 rounded-2xl border border-primary/30 bg-primary/8 flex items-center justify-center">
                  <Bot className="w-8 h-8 text-primary/60" />
                </div>
                <p className="text-xs text-muted-foreground/70">Model VRM 3D siap berinteraksi</p>
              </div>

              {/* Mock chat bubbles */}
              <div className="absolute bottom-4 left-4 right-4 flex flex-col gap-2">
                <div className="self-start bg-secondary/90 border border-border/40 rounded-2xl rounded-bl-sm px-3.5 py-2 text-xs text-foreground max-w-[65%] shadow-sm">
                  Halo! Ada yang bisa saya bantu? 👋
                </div>
                <div className="self-end bg-primary/20 border border-primary/30 rounded-2xl rounded-br-sm px-3.5 py-2 text-xs text-foreground max-w-[55%] shadow-sm">
                  Ceritakan tentang dirimu
                </div>
              </div>
            </div>
          </div>

          {/* Floating badges */}
          <div className="absolute -bottom-3 left-6 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border/60 shadow-lg text-xs text-foreground/70">
            <Zap className="w-3 h-3 text-primary" /> Real-time streaming
          </div>
          <div className="absolute -bottom-3 right-6 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border/60 shadow-lg text-xs text-foreground/70">
            <Volume2 className="w-3 h-3 text-accent" /> ElevenLabs TTS
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-28 px-5">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Semua yang kamu butuhkan
            </h2>
            <p className="text-sm text-muted-foreground mt-2">Satu platform untuk avatar virtual yang hidup</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              {
                icon: <Upload className="w-4.5 h-4.5 text-primary" />,
                iconBg: 'bg-primary/10 border-primary/20',
                title: 'Upload Model VRM',
                desc: 'Gunakan karakter 3D VRM favorit kamu sebagai wujud asisten virtual.',
              },
              {
                icon: <MessageSquare className="w-4.5 h-4.5 text-accent" />,
                iconBg: 'bg-accent/10 border-accent/20',
                title: 'Chat Real-time',
                desc: 'Berinteraksi dengan asisten AI yang cerdas melalui chat teks dengan streaming.',
              },
              {
                icon: <Volume2 className="w-4.5 h-4.5 text-primary" />,
                iconBg: 'bg-primary/10 border-primary/20',
                title: 'Suara & Ekspresi',
                desc: 'Asisten merespons dengan suara dan animasi ekspresi wajah yang natural.',
              },
            ].map((f) => (
              <div
                key={f.title}
                className="group rounded-xl border border-border/50 bg-card/50 p-5 space-y-3.5 hover:border-primary/30 hover:bg-card/70 transition-all duration-200"
              >
                <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${f.iconBg}`}>
                  {f.icon}
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-foreground">{f.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-1">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-5 border-t border-border/30">
        <div className="max-w-lg mx-auto text-center space-y-5">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Siap memulai?</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Buat akun gratis dan mulai berinteraksi dengan asisten virtual 3D-mu sendiri dalam hitungan menit.
          </p>
          <Link to={user ? '/app' : '/auth?tab=signup'}>
            <Button size="lg" className="gap-2 h-11 shadow-lg shadow-primary/20">
              {user ? 'Buka Aplikasi' : 'Daftar Gratis'}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-7 px-5 border-t border-border/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground/60">
        <div className="flex items-center gap-2">
          <Bot className="w-3.5 h-3.5 text-primary/60" />
          <span>VRM Assistant</span>
        </div>
        <p>© {new Date().getFullYear()} VRM Assistant. All rights reserved.</p>
      </footer>
    </div>
  );
}
