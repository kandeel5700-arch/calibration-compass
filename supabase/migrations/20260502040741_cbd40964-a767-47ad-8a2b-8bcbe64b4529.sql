-- Daily tasks table
CREATE TABLE public.daily_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_date DATE NOT NULL DEFAULT CURRENT_DATE,
  location_name TEXT NOT NULL,
  task_description TEXT NOT NULL,
  notes TEXT,
  created_by UUID NOT NULL,
  completed_by UUID,
  completed_at TIMESTAMP WITH TIME ZONE,
  completion_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_daily_tasks_date ON public.daily_tasks(task_date DESC);

ALTER TABLE public.daily_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tasks readable by authenticated"
ON public.daily_tasks FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Admin manages tasks"
ON public.daily_tasks FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can mark task complete"
ON public.daily_tasks FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE TRIGGER update_daily_tasks_updated_at
BEFORE UPDATE ON public.daily_tasks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Control points table
CREATE TABLE public.control_points (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  easting NUMERIC NOT NULL,
  northing NUMERIC NOT NULL,
  elevation NUMERIC NOT NULL,
  location_description TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.control_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Control points readable by authenticated"
ON public.control_points FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Admin manages control points"
ON public.control_points FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_control_points_updated_at
BEFORE UPDATE ON public.control_points
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();