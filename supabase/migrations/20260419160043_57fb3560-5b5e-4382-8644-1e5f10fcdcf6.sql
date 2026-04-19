DROP POLICY IF EXISTS "Users update own open attendance" ON public.attendance;

CREATE POLICY "Users update own open attendance"
ON public.attendance
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);