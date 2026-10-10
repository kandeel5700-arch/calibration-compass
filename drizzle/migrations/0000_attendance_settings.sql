CREATE TABLE public.attendance_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  overtime_first_minutes integer NOT NULL DEFAULT 60,
  overtime_step_minutes integer NOT NULL DEFAULT 30,
  period_start_day_1 smallint NOT NULL DEFAULT 6,
  period_start_day_2 smallint NOT NULL DEFAULT 21,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.attendance_settings TO authenticated;
GRANT ALL ON public.attendance_settings TO service_role;
ALTER TABLE public.attendance_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Settings readable" ON public.attendance_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manages settings" ON public.attendance_settings FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
INSERT INTO public.attendance_settings (id) VALUES (1) ON CONFLICT DO NOTHING;