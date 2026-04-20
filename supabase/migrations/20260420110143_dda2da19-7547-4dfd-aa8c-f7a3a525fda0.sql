-- Storage bucket (private)
insert into storage.buckets (id, name, public)
values ('proctor-snapshots', 'proctor-snapshots', false)
on conflict (id) do nothing;

-- Tracking table
create table if not exists public.exam_snapshots (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  storage_path text not null,
  captured_at timestamptz not null default now(),
  flagged boolean not null default false,
  notes text
);

create index if not exists idx_exam_snapshots_attempt on public.exam_snapshots(attempt_id);
create index if not exists idx_exam_snapshots_exam on public.exam_snapshots(exam_id);
create index if not exists idx_exam_snapshots_captured on public.exam_snapshots(captured_at desc);

alter table public.exam_snapshots enable row level security;

-- Admin/teacher: full access
create policy "Admins manage all snapshots"
on public.exam_snapshots for all
to authenticated
using (public.get_my_role() in ('admin','teacher'))
with check (public.get_my_role() in ('admin','teacher'));

-- Students: insert own only (for own active attempt)
create policy "Students insert own snapshots"
on public.exam_snapshots for insert
to authenticated
with check (
  student_id = public.get_my_student_id()
  and exists (
    select 1 from public.exam_attempts a
    where a.id = attempt_id
      and a.student_id = public.get_my_student_id()
      and a.status = 'in_progress'
  )
);

-- Storage policies: snapshots stored under {attempt_id}/{timestamp}.jpg
create policy "Admins read all proctor snapshots"
on storage.objects for select
to authenticated
using (
  bucket_id = 'proctor-snapshots'
  and public.get_my_role() in ('admin','teacher')
);

create policy "Admins delete proctor snapshots"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'proctor-snapshots'
  and public.get_my_role() in ('admin','teacher')
);

create policy "Students upload own proctor snapshots"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'proctor-snapshots'
  and exists (
    select 1 from public.exam_attempts a
    where a.id::text = (storage.foldername(name))[1]
      and a.student_id = public.get_my_student_id()
      and a.status = 'in_progress'
  )
);

-- Add proctoring toggle to exams (default off so existing exams unaffected)
alter table public.exams
  add column if not exists enable_webcam_proctoring boolean not null default false,
  add column if not exists snapshot_interval_seconds integer not null default 30;