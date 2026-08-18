-- Audio proctoring: recorded microphone clips alongside webcam snapshots.

-- Fallback bucket, used only when R2 is unreachable (same arrangement as
-- proctor-snapshots).
insert into storage.buckets (id, name, public)
values ('proctor-audio', 'proctor-audio', false)
on conflict (id) do nothing;

create table if not exists public.exam_audio_clips (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  storage_path text not null,
  storage_provider text default 'supabase',
  mime_type text,
  duration_seconds integer,
  bytes integer,
  recorded_at timestamptz not null default now(),
  flagged boolean not null default false,
  notes text
);

comment on column public.exam_audio_clips.storage_provider is 'The storage provider used for this clip (supabase, r2, etc.)';

create index if not exists idx_exam_audio_clips_attempt on public.exam_audio_clips(attempt_id);
create index if not exists idx_exam_audio_clips_exam on public.exam_audio_clips(exam_id);
create index if not exists idx_exam_audio_clips_recorded on public.exam_audio_clips(recorded_at desc);

alter table public.exam_audio_clips enable row level security;

-- Admin/teacher: full access
create policy "Admins manage all audio clips"
on public.exam_audio_clips for all
to authenticated
using (public.get_my_role() in ('admin','teacher'))
with check (public.get_my_role() in ('admin','teacher'));

-- Students: insert own only, and only while their own attempt is running
create policy "Students insert own audio clips"
on public.exam_audio_clips for insert
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

-- Storage policies: clips stored under proctoring-audio/{attempt_id}/{timestamp}.webm
create policy "Admins read all proctor audio"
on storage.objects for select
to authenticated
using (
  bucket_id = 'proctor-audio'
  and public.get_my_role() in ('admin','teacher')
);

create policy "Admins delete proctor audio"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'proctor-audio'
  and public.get_my_role() in ('admin','teacher')
);

create policy "Students upload own proctor audio"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'proctor-audio'
  and exists (
    select 1 from public.exam_attempts a
    where a.id::text = (storage.foldername(name))[1]
      and a.student_id = public.get_my_student_id()
      and a.status = 'in_progress'
  )
);

-- Per-exam toggle, default off so existing exams are unaffected.
alter table public.exams
  add column if not exists enable_audio_proctoring boolean not null default false,
  add column if not exists audio_clip_seconds integer not null default 60;

comment on column public.exams.audio_clip_seconds is 'Length of each recorded microphone clip, in seconds (min 15)';
