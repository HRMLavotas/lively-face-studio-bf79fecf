import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Bot, Upload, MessageSquare, Volume2, ArrowRight, X, ChevronRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const STORAGE_KEY = 'vrm_onboarding_done';

const STEPS = [
  {
    icon: Upload,
    iconColor: 'text-primary',
    iconBg: 'bg-primary/10 border-primary/20',
    title: 'Upload Model VRM',
    desc: 'Pergi ke Pengaturan dan upload file .vrm karakter 3D pilihanmu. Bisa download gratis dari VRoid Hub.',
    action: { label: 'Buka Pengaturan', to: '/settings' },
  },
  {
    icon: Volume2,
    iconColor: 'text-accent',
    iconBg: 'bg-accent/10 border-accent/20',
    title: 'Pilih Suara',
    desc: 'Di Pengaturan, pilih suara ElevenLabs yang akan digunakan asisten untuk berbicara.',
    action: null,
  },
  {
    icon: MessageSquare,
    iconColor: 'text-primary',
    iconBg: 'bg-primary/10 border-primary/20',
    title: 'Mulai Chat',
    desc: 'Ketik pesan di panel chat. Asisten akan merespons dengan teks, suara, dan animasi ekspresi.',
    action: null,
  },
];

export default function OnboardingGuide() {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!user) return;
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) setShow(true);
  }, [user]);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setShow(false);
  };

  if (!show) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-card border border-border/60 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden animate-msg-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Selamat datang!</p>
              <p className="text-[10px] text-muted-foreground">Langkah {step + 1} dari {STEPS.length}</p>
            </div>
          </div>
          <button onClick={dismiss} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex gap-1.5 px-5 pt-4">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full flex-1 transition-all duration-300 ${
                i <= step ? 'bg-primary' : 'bg-border/50'
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="px-5 py-5 space-y-4">
          <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center ${current.iconBg}`}>
            <Icon className={`w-6 h-6 ${current.iconColor}`} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">{current.title}</h3>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{current.desc}</p>
          </div>
          {current.action && (
            <Link to={current.action.to} onClick={dismiss}>
              <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs border-primary/30 text-primary hover:bg-primary/10">
                {current.action.label} <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex items-center justify-between">
          <button onClick={dismiss} className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors">
            Lewati panduan
          </button>
          <Button
            size="sm"
            onClick={() => isLast ? dismiss() : setStep(s => s + 1)}
            className="gap-1.5 h-8 text-xs"
          >
            {isLast ? 'Mulai' : 'Lanjut'}
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
