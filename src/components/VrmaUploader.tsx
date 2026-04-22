import { useRef, useState } from 'react';
import { Upload, FileVideo } from 'lucide-react';
import { toast } from 'sonner';

interface VrmaUploaderProps {
  onFileSelected: (file: File, blobUrl: string) => void;
}

export default function VrmaUploader({ onFileSelected }: VrmaUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const processFile = (file: File) => {
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
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  return (
    <>
      <input ref={inputRef} type="file" accept=".vrma" onChange={handleChange} className="hidden" />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`w-full rounded-xl border-2 border-dashed transition-all p-5 flex flex-col items-center gap-2.5 text-center group ${
          isDragging
            ? 'border-primary/60 bg-primary/8'
            : 'border-border/50 hover:border-primary/40 hover:bg-primary/4'
        }`}
      >
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
          isDragging ? 'bg-primary/20 border border-primary/30' : 'bg-secondary border border-border/60 group-hover:border-primary/30 group-hover:bg-primary/10'
        }`}>
          <FileVideo className={`w-5 h-5 transition-colors ${isDragging ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'}`} />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground/80">
            {isDragging ? 'Lepaskan file di sini' : 'Pilih atau drag file .vrma'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Max 50MB</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-primary/70 border border-primary/25 bg-primary/8 rounded-full px-3 py-1">
          <Upload className="w-3 h-3" /> Browse file
        </div>
      </button>
    </>
  );
}
