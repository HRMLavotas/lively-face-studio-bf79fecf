-- 1. Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'pro', 'free');

-- 2. Create profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- 3. Create user_roles table (separate from profiles to prevent privilege escalation)
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 4. Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert roles"
  ON public.user_roles FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update roles"
  ON public.user_roles FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles"
  ON public.user_roles FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- 5. Update updated_at trigger function (idempotent)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Auto-create profile and assign 'free' role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'free');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 7. Add user_id to vrm_models and voice_settings
ALTER TABLE public.vrm_models ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.voice_settings ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 8. Replace open RLS policies on vrm_models with user-scoped ones
DROP POLICY IF EXISTS "Anyone can read vrm_models" ON public.vrm_models;
DROP POLICY IF EXISTS "Anyone can insert vrm_models" ON public.vrm_models;
DROP POLICY IF EXISTS "Anyone can update vrm_models" ON public.vrm_models;
DROP POLICY IF EXISTS "Anyone can delete vrm_models" ON public.vrm_models;

CREATE POLICY "Users can view their own models"
  ON public.vrm_models FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own models"
  ON public.vrm_models FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own models"
  ON public.vrm_models FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own models"
  ON public.vrm_models FOR DELETE
  USING (auth.uid() = user_id);

-- 9. Replace voice_settings policies — defaults (user_id IS NULL) visible to everyone
DROP POLICY IF EXISTS "Anyone can read voice_settings" ON public.voice_settings;
DROP POLICY IF EXISTS "Anyone can update voice_settings" ON public.voice_settings;

CREATE POLICY "Anyone can view default and own voices"
  ON public.voice_settings FOR SELECT
  USING (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "Users can insert their own voice settings"
  ON public.voice_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own voice settings"
  ON public.voice_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own voice settings"
  ON public.voice_settings FOR DELETE
  USING (auth.uid() = user_id);

-- 10. Update vrm-models bucket: per-user folder access
CREATE POLICY "VRM models are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'vrm-models');

CREATE POLICY "Users can upload their own VRM models"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'vrm-models'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update their own VRM files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'vrm-models'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own VRM files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'vrm-models'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 11. Create avatars bucket for profile pictures
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Avatars are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );