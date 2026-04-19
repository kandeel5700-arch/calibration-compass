-- Enums
CREATE TYPE public.leave_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.leave_type AS ENUM ('annual', 'casual', 'sick', 'permission');

-- Leave requests table
CREATE TABLE public.leave_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  leave_type public.leave_type NOT NULL DEFAULT 'casual',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  status public.leave_status NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT leave_dates_valid CHECK (end_date >= start_date)
);

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own leaves"
ON public.leave_requests FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users insert own leaves"
ON public.leave_requests FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own pending leaves"
ON public.leave_requests FOR DELETE TO authenticated
USING (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "Admin manages leaves"
ON public.leave_requests FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_leave_requests_updated_at
BEFORE UPDATE ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_leave_requests_user ON public.leave_requests(user_id, created_at DESC);
CREATE INDEX idx_leave_requests_status ON public.leave_requests(status);