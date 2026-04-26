import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Bot, Upload, MessageSquare, Volume2, ArrowRight, X, ChevronRight, Layers, Lightbulb, Camera } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const STORAGE_KEY = 'vrm_onboarding_v3';

const STEPS = [
  {
    icon: Upload,
    iconColor: 'text-primary',
    iconBg: 'bg-primary/10 border-primary/20',
    title: 'Upload Model VRM',
    desc: 'Pergi ke Pengaturan dan upload file .vrm karakter 3D pilihanmu. Bisa download gratis dari VRoid Hub.',
    action: { label: 'Buka Pengaturan', to: '/settings' },
    hint: null,
  },
  {
    icon: Camera,
    iconColor: 'text-primary',
    iconBg: 'bg-primary/10 border-primary/20',
    title: 'Kontrol Kamera & Scene',
    desc: 'Gunakan tombol di kolom kanan untuk mengatur sudut kamera, background, dan pencahayaan karakter.',
    action: null,
    hint: '📍 Lihat tombol di pojok kanan layar',
  },
  {
    icon: Volume2,
    iconColor: 'text-accent',
    iconBg: 'bg-accent/10 border-accent/20',
    title: 'Pilih Suara',
    desc: 'Di Pengaturan, pilih suara ElevenLabs atau gunakan Web Speech gratis untuk asisten berbicara.',
    action: null,
    hint: null,
  },
  {
    icon: Lightbulb,
    iconColor: 'text-indigo-400',
    iconBg: 'bg-indigo-500/10 border-indigo-500/20',
    title: '✨ Anime Mode (Baru!)',
    desc: 'Bisa mengobrol dalam bahasa apa pun, tapi asisten membalas dengan suara Jepang asli. Aktifkan "Auto-Translate to JP" di Pengaturan TTS.',
    action: { label: 'Coba VITS Anime', to: '/settings?tab=tts' },
    hint: '💡 Biar asisten makin berasa "Kawaii"',
  },
  {
    icon: MessageSquare,
    iconColor: 'text-primary',
    iconBg: 'bg-primary/10 border-primary/20',
    title: 'Mulai Chat',
    desc: 'Ketik pesan atau gunakan tombol mikrofon untuk bicara langsung. Asisten merespons dengan suara dan ekspresi.',
    action: null,
    hint: '💡 Tekan Ctrl+K untuk buka/tutup chat',
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
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(6,4,14,0.75)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-sm panel-overlay rounded-2xl shadow-2xl overflow-hidden animate-msg-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b"
          style={{ borderColor: 'rgba(168,85,247,0.2)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl btn-overlay flex items-center justify-center">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Selamat datang!</p>
              <p className="text-[10px]" style={{ color: 'rgba(192,168,255,0.5)' }}>Langkah {step + 1} dari {STEPS.length}</p>
            </div>
          </div>
          <button onClick={dismiss} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex gap-1.5 px-5 pt-4">
          {STEPS.map((_, i) => (
            <div key={i} className="h-1 rounded-full flex-1 transition-all duration-300"
              style={{ background: i <= step ? '#a855f7' : 'rgba(168,85,247,0.15)' }} />
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
          {current.hint && (
            <p className="text-xs px-3 py-2 rounded-lg"
              style={{ background: 'rgba(168,85,247,0.1)', color: 'rgba(192,168,255,0.7)', border: '1px solid rgba(168,85,247,0.2)' }}>
              {current.hint}
            </p>
          )}
          {current.action && (
            <Link to={current.action.to} onClick={dismiss}>
              <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs btn-overlay mt-1">
                {current.action.label} <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex items-center justify-between">
          <button onClick={dismiss} className="text-xs transition-colors"
            style={{ color: 'rgba(192,168,255,0.4)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(192,168,255,0.7)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(192,168,255,0.4)')}>
            Lewati panduan
          </button>
          <Button size="sm" onClick={() => isLast ? dismiss() : setStep(s => s + 1)}
            className="gap-1.5 h-8 text-xs bg-primary hover:bg-primary/90 border-0">
            {isLast ? 'Mulai' : 'Lanjut'}
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
