
-- Create vrm_models table
CREATE TABLE public.vrm_models (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Untitled Model',
  gender TEXT NOT NULL DEFAULT 'other',
  personality TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT false,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.vrm_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read vrm_models" ON public.vrm_models FOR SELECT USING (true);
CREATE POLICY "Anyone can insert vrm_models" ON public.vrm_models FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update vrm_models" ON public.vrm_models FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete vrm_models" ON public.vrm_models FOR DELETE USING (true);

-- Trigger: deactivate other models when one is activated
CREATE OR REPLACE FUNCTION public.deactivate_other_vrm_models()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active = true THEN
    UPDATE public.vrm_models SET is_active = false WHERE id != NEW.id AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_deactivate_other_vrm_models
BEFORE INSERT OR UPDATE ON public.vrm_models
FOR EACH ROW
EXECUTE FUNCTION public.deactivate_other_vrm_models();

-- Create voice_settings table
CREATE TABLE public.voice_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  voice_id TEXT NOT NULL,
  voice_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.voice_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read voice_settings" ON public.voice_settings FOR SELECT USING (true);
CREATE POLICY "Anyone can update voice_settings" ON public.voice_settings FOR UPDATE USING (true);

-- Trigger: deactivate other voices when one is activated
CREATE OR REPLACE FUNCTION public.deactivate_other_voices()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active = true THEN
    UPDATE public.voice_settings SET is_active = false WHERE id != NEW.id AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_deactivate_other_voices
BEFORE INSERT OR UPDATE ON public.voice_settings
FOR EACH ROW
EXECUTE FUNCTION public.deactivate_other_voices();

-- Seed voice_settings with ElevenLabs voices
INSERT INTO public.voice_settings (voice_id, voice_name, is_active) VALUES
  ('EXAVITQu4vr4xnSDxMaL', 'Sarah', true),
  ('CwhRBWXzGAHq8TQ4Fs17', 'Roger', false),
  ('FGY2WhTYpPnrIDTdsKH5', 'Laura', false),
  ('IKne3meq5aSn9XLyUdCD', 'Charlie', false),
  ('JBFqnCBsd6RMkjVDRZzb', 'George', false),
  ('N2lVS1w4EtoT3dr4eOWO', 'Callum', false),
  ('TX3LPaxmHKxFdv7VOQHJ', 'Liam', false),
  ('Xb7hH8MSUJpSbSDYk0k2', 'Alice', false),
  ('XrExE9yKIg1WjnnlVkGX', 'Matilda', false),
  ('bIHbv24MWmeRgasZH58o', 'Will', false),
  ('cgSgspJ2msm6clMCkdW9', 'Jessica', false),
  ('cjVigY5qzO86Huf0OWal', 'Eric', false),
  ('iP95p4xoKVk53GoZ742B', 'Chris', false),
  ('nPczCjzI2devNBz1zQrb', 'Brian', false),
  ('onwK4e9ZLuTAKqWW03F9', 'Daniel', false),
  ('pFZP5JQG7iQjIQuC4Bku', 'Lily', false),
  ('pqHfZKP75CvOlQylNhV4', 'Bill', false);

-- Create storage bucket for VRM files
INSERT INTO storage.buckets (id, name, public) VALUES ('vrm-models', 'vrm-models', true);

CREATE POLICY "Anyone can read vrm files" ON storage.objects FOR SELECT USING (bucket_id = 'vrm-models');
CREATE POLICY "Anyone can upload vrm files" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'vrm-models');
CREATE POLICY "Anyone can delete vrm files" ON storage.objects FOR DELETE USING (bucket_id = 'vrm-models');
