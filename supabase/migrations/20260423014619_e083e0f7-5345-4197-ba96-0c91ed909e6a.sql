
ALTER TABLE public.vrm_models DISABLE TRIGGER trg_deactivate_other_vrm_models;
UPDATE public.vrm_models SET gender = 'female' WHERE gender NOT IN ('male','female');
ALTER TABLE public.vrm_models ENABLE TRIGGER trg_deactivate_other_vrm_models;

ALTER TABLE public.vrm_models ALTER COLUMN gender SET DEFAULT 'female';
ALTER TABLE public.vrm_models DROP CONSTRAINT IF EXISTS vrm_models_gender_check;
ALTER TABLE public.vrm_models ADD CONSTRAINT vrm_models_gender_check CHECK (gender IN ('male','female'));

ALTER TABLE public.voice_settings ADD COLUMN IF NOT EXISTS gender text NOT NULL DEFAULT 'female';
ALTER TABLE public.voice_settings DROP CONSTRAINT IF EXISTS voice_settings_gender_check;
ALTER TABLE public.voice_settings ADD CONSTRAINT voice_settings_gender_check CHECK (gender IN ('male','female'));
