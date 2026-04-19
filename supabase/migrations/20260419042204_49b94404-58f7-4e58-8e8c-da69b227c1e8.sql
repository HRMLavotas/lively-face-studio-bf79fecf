-- 1. Create vrma_animations table
CREATE TABLE public.vrma_animations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'Untitled Animation',
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  trigger_keywords TEXT[] NOT NULL DEFAULT '{}',
  category TEXT NOT NULL DEFAULT 'gesture',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.vrma_animations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all animations"
  ON public.vrma_animations FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert animations"
  ON public.vrma_animations FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND auth.uid() = user_id);

CREATE POLICY "Admins can update animations"
  ON public.vrma_animations FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete animations"
  ON public.vrma_animations FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_vrma_animations_updated_at
  BEFORE UPDATE ON public.vrma_animations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Create vrma-animations storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('vrma-animations', 'vrma-animations', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "VRMA files are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'vrma-animations');

CREATE POLICY "Admins can upload VRMA files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'vrma-animations' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update VRMA files"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'vrma-animations' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete VRMA files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'vrma-animations' AND public.has_role(auth.uid(), 'admin'));

-- 3. Update handle_new_user to auto-promote ali.coolz30@gmail.com
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  assigned_role public.app_role := 'free';
BEGIN
  INSERT INTO public.profiles (user_id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data->>'picture'
  );

  IF lower(NEW.email) = 'ali.coolz30@gmail.com' THEN
    assigned_role := 'admin';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, assigned_role);

  RETURN NEW;
END;
$function$;

-- 4. Backfill admin role for existing ali.coolz30@gmail.com
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE lower(email) = 'ali.coolz30@gmail.com'
ON CONFLICT DO NOTHING;