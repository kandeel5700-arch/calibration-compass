create table if not exists public.work_schedule (
  day_of_week smallint primary key check (day_of_week between 0 and 6),
  start_hour numeric(4,2) not null default 8 check (start_hour >= 0 and start_hour < 24),
  end_hour numeric(4,2) not null default 16 check (end_hour > 0 and end_hour <= 24),
  standard_hours numeric(4,2) not null default 8 check (standard_hours >= 0 and standard_hours <= 24),
  is_working_day boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.work_schedule enable row level security;

drop policy if exists "Schedule readable by authenticated" on public.work_schedule;
create policy "Schedule readable by authenticated"
  on public.work_schedule for select to authenticated using (true);

drop policy if exists "Admin manages schedule" on public.work_schedule;
create policy "Admin manages schedule"
  on public.work_schedule for all to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

drop trigger if exists trg_work_schedule_updated on public.work_schedule;
create trigger trg_work_schedule_updated
  before update on public.work_schedule
  for each row execute function public.update_updated_at_column();

insert into public.work_schedule (day_of_week, start_hour, end_hour, standard_hours, is_working_day) values
  (0, 8, 16, 8, true),
  (1, 8, 16, 8, true),
  (2, 8, 16, 8, true),
  (3, 8, 16, 8, true),
  (4, 8, 16, 8, true),
  (5, 8, 16, 8, false),
  (6, 12, 16, 4, true)
on conflict (day_of_week) do nothing;