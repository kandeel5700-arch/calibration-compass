-- Keep the public app configuration endpoint limited to its single published configuration row.
DROP POLICY IF EXISTS "app_config readable by everyone" ON public.app_config;
CREATE POLICY "app_config read current version only"
ON public.app_config FOR SELECT TO public
USING (id = 1);

-- Attendance settings and operational reference data are readable only by approved employees and admins.
DROP POLICY IF EXISTS "Settings readable" ON public.attendance_settings;
CREATE POLICY "Settings readable by active employees"
ON public.attendance_settings FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'viewer'::public.app_role)
);

DROP POLICY IF EXISTS "Schedule readable by authenticated" ON public.work_schedule;
CREATE POLICY "Schedule readable by active employees"
ON public.work_schedule FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'viewer'::public.app_role)
);

DROP POLICY IF EXISTS "Equipment readable by authenticated" ON public.equipment;
CREATE POLICY "Equipment readable by active employees"
ON public.equipment FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'viewer'::public.app_role)
);

DROP POLICY IF EXISTS "History readable by authenticated" ON public.calibration_history;
CREATE POLICY "History readable by active employees"
ON public.calibration_history FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'viewer'::public.app_role)
);

DROP POLICY IF EXISTS "Control points readable by authenticated" ON public.control_points;
CREATE POLICY "Control points readable by active employees"
ON public.control_points FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'viewer'::public.app_role)
);

-- Protect private profile emails while preserving the staff directory's names and avatars.
DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON public.profiles;
CREATE POLICY "Users view own profile and admins view all"
ON public.profiles FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE OR REPLACE VIEW public.profile_directory AS
SELECT user_id, full_name, avatar_url
FROM public.profiles
WHERE public.has_role(auth.uid(), 'admin'::public.app_role)
   OR public.has_role(auth.uid(), 'viewer'::public.app_role);
GRANT SELECT ON public.profile_directory TO authenticated;

-- Approved staff can read tasks, but may only update completion fields for themselves.
DROP POLICY IF EXISTS "Tasks readable by authenticated" ON public.daily_tasks;
CREATE POLICY "Tasks readable by active employees"
ON public.daily_tasks FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'viewer'::public.app_role)
);

DROP POLICY IF EXISTS "Users can mark task complete" ON public.daily_tasks;
CREATE POLICY "Users can mark task complete"
ON public.daily_tasks FOR UPDATE TO authenticated
USING (
  (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'viewer'::public.app_role)
  )
  AND (completed_by IS NULL OR completed_by = auth.uid())
)
WITH CHECK (
  (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'viewer'::public.app_role)
  )
  AND (completed_by IS NULL OR completed_by = auth.uid())
  AND ((completed_by IS NULL) = (completed_at IS NULL))
);

CREATE OR REPLACE FUNCTION public.guard_daily_task_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  IF ROW(NEW.id, NEW.task_date, NEW.location_name, NEW.task_description, NEW.notes, NEW.created_by, NEW.created_at)
     IS DISTINCT FROM
     ROW(OLD.id, OLD.task_date, OLD.location_name, OLD.task_description, OLD.notes, OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION 'Only task completion fields may be changed';
  END IF;

  IF NEW.completed_by IS NOT NULL AND NEW.completed_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'A task can only be completed for the current user';
  END IF;

  IF (NEW.completed_by IS NULL) IS DISTINCT FROM (NEW.completed_at IS NULL) THEN
    RAISE EXCEPTION 'Task completion fields must be set or cleared together';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_daily_task_update ON public.daily_tasks;
CREATE TRIGGER guard_daily_task_update
BEFORE UPDATE ON public.daily_tasks
FOR EACH ROW EXECUTE FUNCTION public.guard_daily_task_update();