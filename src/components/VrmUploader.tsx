import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';

interface VrmUploaderProps {
  onModelLoad: (url: string) => void;
}

export default function VrmUploader({ onModelLoad }: VrmUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.vrm')) {
      toast.error('Hanya file .vrm yang didukung');
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      toast.error('File terlalu besar (max 100MB)');
      return;
    }

    const url = URL.createObjectURL(file);
    onModelLoad(url);
    toast.success(`Model "${file.name}" berhasil dimuat`);
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".vrm"
        onChange={handleFile}
        className="hidden"
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        className="font-mono text-xs border-border bg-secondary/60 backdrop-blur-md hover:bg-secondary gap-2"
      >
        <Upload className="w-3.5 h-3.5" />
        Upload VRM
      </Button>
    </>
  );
}
