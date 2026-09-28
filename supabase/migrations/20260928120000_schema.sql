-- Phase 2: all tables from TECH_DESIGN section 4.
-- RLS policies, is_member()/is_admin() and the board freeze follow in phase 3.
-- Until then RLS is enabled (explicitly here, and by "Automatic RLS") with no
-- policies, so only service_role can read or write.

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- 4.1 Persistent (survives the deletion of a round)
-- ---------------------------------------------------------------------------

create table public.team_members (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index team_members_email_key on public.team_members (lower(email));

create table public.round_stats (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  applications int not null,
  interviews int not null,
  admitted int not null,
  by_cohort jsonb not null default '{}'::jsonb,
  by_department jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4.2 Per round (deleted with the round via on delete cascade)
-- ---------------------------------------------------------------------------

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  title text not null,
  seats int not null check (seats > 0),
  interview_minutes int not null check (interview_minutes > 0),
  buffer_minutes int not null default 0 check (buffer_minutes >= 0),
  application_opens_at timestamptz not null,
  application_closes_at timestamptz not null,
  interviews_from date not null,
  interviews_until date not null,
  rebook_hours_before int not null default 24 check (rebook_hours_before >= 0),
  deletion_date date not null,
  mail_transport text not null default 'gmail' check (mail_transport in ('graph', 'gmail')),
  reply_to text not null,
  privacy_notice text not null default '',
  selection_started_at timestamptz,
  board_frozen_at timestamptz,
  board_frozen_by uuid references public.team_members (id) on delete set null,
  deletion_reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  check (application_closes_at > application_opens_at),
  check (interviews_until >= interviews_from)
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  position int not null,
  text text not null,
  unique (round_id, position)
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  position int not null,
  name text not null,
  description text not null default '',
  unique (round_id, position)
);

create table public.criteria (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  position int not null,
  name text not null,
  description text not null default '',
  weight numeric not null check (weight > 0),
  scale_min int not null,
  scale_max int not null,
  unique (round_id, position),
  check (scale_min < scale_max)
);

create table public.applicants (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  name text not null,
  email text not null,
  cohort text not null,
  department_unsure boolean not null default false,
  cv_path text,
  token_hash text not null unique,
  source text not null default 'form' check (source in ('form', 'admin')),
  status text not null default 'active' check (status in ('active', 'no_show')),
  sight_lock_lifted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One application per address and round, case-insensitive.
create unique index applicants_round_email_key on public.applicants (round_id, lower(email));

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.applicants (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  text text not null,
  unique (applicant_id, question_id)
);

create table public.applicant_departments (
  applicant_id uuid not null references public.applicants (id) on delete cascade,
  department_id uuid not null references public.departments (id) on delete cascade,
  primary key (applicant_id, department_id)
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  name text not null,
  is_default boolean not null default false
);
-- At most one default location per round.
create unique index locations_one_default on public.locations (round_id) where is_default;

create table public.blocked_times (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text not null default '',
  check (ends_at > starts_at)
);

create table public.availabilities (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  member_id uuid not null references public.team_members (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  unique (round_id, member_id, starts_at),
  check (ends_at > starts_at)
);

create table public.member_round_settings (
  round_id uuid not null references public.rounds (id) on delete cascade,
  member_id uuid not null references public.team_members (id) on delete cascade,
  max_interviews int check (max_interviews >= 0),
  primary key (round_id, member_id)
);

create table public.slots (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  starts_at timestamptz not null,
  interview_ends_at timestamptz not null,
  ends_at timestamptz not null,
  interviewer_a uuid not null references public.team_members (id),
  interviewer_b uuid not null references public.team_members (id),
  status text not null default 'proposed' check (status in ('proposed', 'confirmed')),
  -- Unique: prevents double bookings. Withdrawal deletes the applicant and frees the slot.
  applicant_id uuid unique references public.applicants (id) on delete set null,
  booked_at timestamptz,
  ics_sequence int not null default 0,
  check (interview_ends_at > starts_at),
  check (ends_at >= interview_ends_at),
  check (interviewer_a <> interviewer_b),
  -- No two slots at the same location may overlap, buffer included.
  -- '[)' keeps back-to-back slots legal.
  constraint slots_no_overlap_per_location exclude using gist (
    location_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
);

create table public.conflicts (
  applicant_id uuid not null references public.applicants (id) on delete cascade,
  member_id uuid not null references public.team_members (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (applicant_id, member_id)
);

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.applicants (id) on delete cascade,
  member_id uuid not null references public.team_members (id) on delete cascade,
  overall_text text not null default '',
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (applicant_id, member_id)
);

create table public.feedback_scores (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.feedback (id) on delete cascade,
  criterion_id uuid not null references public.criteria (id) on delete cascade,
  score int,
  text text not null default '',
  unique (feedback_id, criterion_id)
);

-- score must lie within the criterion's scale; a check constraint cannot
-- look at another table, so a trigger does it.
create function public.check_feedback_score_scale() returns trigger
language plpgsql set search_path = '' as $$
declare
  c record;
begin
  if new.score is null then
    return new;
  end if;
  select scale_min, scale_max into c from public.criteria where id = new.criterion_id;
  if new.score < c.scale_min or new.score > c.scale_max then
    raise exception 'score % outside scale %..%', new.score, c.scale_min, c.scale_max
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger feedback_scores_scale
  before insert or update on public.feedback_scores
  for each row execute function public.check_feedback_score_scale();

create table public.board_positions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  applicant_id uuid not null unique references public.applicants (id) on delete cascade,
  zone text not null default 'pool' check (zone in ('pool', 'seat', 'also', 'reject')),
  position int,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.team_members (id) on delete set null
);

create table public.board_events (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  applicant_id uuid not null references public.applicants (id) on delete cascade,
  actor_id uuid references public.team_members (id) on delete set null,
  from_zone text check (from_zone in ('pool', 'seat', 'also', 'reject')),
  from_position int,
  to_zone text not null check (to_zone in ('pool', 'seat', 'also', 'reject')),
  to_position int,
  undoes_event_id uuid references public.board_events (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes on foreign keys used for lookups and cascades
-- ---------------------------------------------------------------------------

create index on public.applicants (round_id);
create index on public.answers (question_id);
create index on public.applicant_departments (department_id);
create index on public.locations (round_id);
create index on public.blocked_times (location_id);
create index on public.availabilities (member_id);
create index on public.slots (round_id);
create index on public.slots (interviewer_a);
create index on public.slots (interviewer_b);
create index on public.conflicts (member_id);
create index on public.feedback (member_id);
create index on public.feedback_scores (criterion_id);
create index on public.board_positions (round_id);
create index on public.board_events (round_id);
create index on public.board_events (applicant_id);

-- ---------------------------------------------------------------------------
-- RLS on (no policies yet) and grants
-- "Automatically expose new tables" is off, so every table needs explicit grants.
-- anon gets nothing: the public form and applicant pages go through the server.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'team_members', 'round_stats', 'rounds', 'questions', 'departments', 'criteria',
    'applicants', 'answers', 'applicant_departments', 'locations', 'blocked_times',
    'availabilities', 'member_round_settings', 'slots', 'conflicts', 'feedback',
    'feedback_scores', 'board_positions', 'board_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated, service_role', t);
  end loop;
end;
$$;

revoke execute on function public.check_feedback_score_scale() from public, anon, authenticated;
