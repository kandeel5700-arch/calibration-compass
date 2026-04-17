
-- ROLES
CREATE TYPE public.app_role AS ENUM ('admin', 'viewer');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- EQUIPMENT
CREATE TABLE public.equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  model TEXT,
  serial_number TEXT NOT NULL,
  last_calibration_date DATE NOT NULL,
  validity_months INTEGER NOT NULL DEFAULT 12,
  next_calibration_date DATE NOT NULL,
  notes TEXT,
  image_url TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_equipment_serial ON public.equipment(serial_number);
CREATE INDEX idx_equipment_next_cal ON public.equipment(next_calibration_date);

-- CALIBRATION HISTORY
CREATE TABLE public.calibration_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  calibration_date DATE NOT NULL,
  validity_months INTEGER NOT NULL,
  notes TEXT,
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.calibration_history ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_calhist_equipment ON public.calibration_history(equipment_id);

-- HELPERS
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Auto compute next_calibration_date
CREATE OR REPLACE FUNCTION public.compute_next_calibration()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  NEW.next_calibration_date := NEW.last_calibration_date + (NEW.validity_months || ' months')::interval;
  RETURN NEW;
END;
$$;

CREATE TRIGGER equipment_compute_next_cal
  BEFORE INSERT OR UPDATE OF last_calibration_date, validity_months ON public.equipment
  FOR EACH ROW EXECUTE FUNCTION public.compute_next_calibration();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_equipment_updated_at
  BEFORE UPDATE ON public.equipment
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile + role on signup (first user = admin)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);
  IF (SELECT COUNT(*) FROM auth.users) = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'viewer');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Log calibration history
CREATE OR REPLACE FUNCTION public.log_calibration_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (OLD.last_calibration_date IS DISTINCT FROM NEW.last_calibration_date) THEN
    INSERT INTO public.calibration_history (equipment_id, calibration_date, validity_months, notes, performed_by)
    VALUES (NEW.id, NEW.last_calibration_date, NEW.validity_months, NEW.notes, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER equipment_calibration_log
  AFTER INSERT OR UPDATE OF last_calibration_date ON public.equipment
  FOR EACH ROW EXECUTE FUNCTION public.log_calibration_change();

-- RLS POLICIES
CREATE POLICY "Profiles viewable by authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admin manages profiles" ON public.profiles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users see own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin manages roles" ON public.user_roles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Equipment readable by authenticated" ON public.equipment
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin inserts equipment" ON public.equipment
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin updates equipment" ON public.equipment
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin deletes equipment" ON public.equipment
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "History readable by authenticated" ON public.calibration_history
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manages history" ON public.calibration_history
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- STORAGE
INSERT INTO storage.buckets (id, name, public) VALUES ('equipment-images', 'equipment-images', true);

CREATE POLICY "Equipment images publicly readable" ON storage.objects
  FOR SELECT USING (bucket_id = 'equipment-images');
CREATE POLICY "Admin uploads equipment images" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'equipment-images' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin updates equipment images" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'equipment-images' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin deletes equipment images" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'equipment-images' AND public.has_role(auth.uid(), 'admin'));
