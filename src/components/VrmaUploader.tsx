import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';

interface VrmaUploaderProps {
  onFileSelected: (file: File, blobUrl: string) => void;
}

export default function VrmaUploader({ onFileSelected }: VrmaUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.vrma')) {
      toast.error('Hanya file .vrma yang didukung');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error('File terlalu besar (max 50MB)');
      return;
    }
    const url = URL.createObjectURL(file);
    onFileSelected(file, url);
    // reset so selecting same file again still triggers change
    e.target.value = '';
  };

  return (
    <>
      <input ref={inputRef} type="file" accept=".vrma" onChange={handle} className="hidden" />
      <Button
        type="button"
        variant="outline"
        onClick={(e) => {
          e.preventDefault();
          inputRef.current?.click();
        }}
        className="w-full font-mono text-xs gap-2"
      >
        <Upload className="w-3.5 h-3.5" />
        Pilih File .vrma
      </Button>
    </>
  );
}
