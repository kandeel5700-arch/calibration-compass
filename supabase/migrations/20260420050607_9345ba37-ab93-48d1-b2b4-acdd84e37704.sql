-- Allow users to insert and update their own salary
CREATE POLICY "Users insert own salary"
ON public.user_salary FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own salary"
ON public.user_salary FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Update handle_new_user to also accept daily_rate from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rate numeric := 0;
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);

  IF (SELECT COUNT(*) FROM auth.users) = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'pending');
  END IF;

  -- Capture optional daily_rate from signup metadata
  BEGIN
    v_rate := COALESCE((NEW.raw_user_meta_data->>'daily_rate')::numeric, 0);
  EXCEPTION WHEN OTHERS THEN
    v_rate := 0;
  END;

  INSERT INTO public.user_salary (user_id, daily_rate)
  VALUES (NEW.id, v_rate);

  RETURN NEW;
END;
$function$;