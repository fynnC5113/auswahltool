-- Phase 3: RLS policies after TECH_DESIGN section 5.
-- Every policy targets "authenticated" only. anon has no table grants (phase 2)
-- and no storage policy, so it can read and write nothing.
-- The applicant pages, the public form and the daily job use service_role,
-- which bypasses RLS.

-- ---------------------------------------------------------------------------
-- Helper functions
-- Kept in a schema the Data API does not expose (Supabase docs recommend this
-- for security definer functions). security definer lets them read
-- team_members / feedback without triggering those tables' own policies.
-- ---------------------------------------------------------------------------

create schema if not exists private;
grant usage on schema private to authenticated;

-- Signed in and active. Checked on every request, so deactivation is immediate.
create function private.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members
    where id = (select auth.uid()) and active
  );
$$;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members
    where id = (select auth.uid()) and active and role = 'admin'
  );
$$;

-- True while the round's board is not frozen.
create function private.board_open(p_round_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.rounds
    where id = p_round_id and board_frozen_at is null
  );
$$;

create function private.board_open_for_applicant(p_applicant_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.applicants a
    join public.rounds r on r.id = a.round_id
    where a.id = p_applicant_id and r.board_frozen_at is null
  );
$$;

-- Sight lock (TECH_DESIGN 5). The author always sees their own entry, drafts
-- included. Anyone else sees only submitted entries, and only if one of the
-- four conditions holds.
create function private.can_read_feedback(
  p_applicant_id uuid, p_member_id uuid, p_submitted_at timestamptz
) returns boolean
language sql stable security definer set search_path = '' as $$
  select
    p_member_id = (select auth.uid())
    or (
      p_submitted_at is not null
      and (
        -- 1. the reader is not an interviewer in the applicant's slot
        not exists (
          select 1 from public.slots s
          where s.applicant_id = p_applicant_id
            and (select auth.uid()) in (s.interviewer_a, s.interviewer_b)
        )
        -- 2. the reader has submitted their own feedback on this applicant
        or exists (
          select 1 from public.feedback f
          where f.applicant_id = p_applicant_id
            and f.member_id = (select auth.uid())
            and f.submitted_at is not null
        )
        -- 3. an admin lifted the lock for this applicant
        -- 4. the selection round has started
        or exists (
          select 1 from public.applicants a
          join public.rounds r on r.id = a.round_id
          where a.id = p_applicant_id
            and (a.sight_lock_lifted or r.selection_started_at <= now())
        )
      )
    );
$$;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Members read, admins write
-- team_members, rounds and configuration, applicants, locations and slots.
-- Bookings are written by the server with service_role.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'team_members', 'rounds', 'questions', 'departments', 'criteria',
    'applicants', 'answers', 'applicant_departments',
    'locations', 'blocked_times', 'slots'
  ] loop
    execute format(
      'create policy "members read" on public.%I for select to authenticated
         using ((select private.is_member()))', t);
    execute format(
      'create policy "admins insert" on public.%I for insert to authenticated
         with check ((select private.is_admin()))', t);
    execute format(
      'create policy "admins update" on public.%I for update to authenticated
         using ((select private.is_admin())) with check ((select private.is_admin()))', t);
    execute format(
      'create policy "admins delete" on public.%I for delete to authenticated
         using ((select private.is_admin()))', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Members read, each member writes only their own rows (admins included)
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['availabilities', 'member_round_settings'] loop
    execute format(
      'create policy "members read" on public.%I for select to authenticated
         using ((select private.is_member()))', t);
    execute format(
      'create policy "own insert" on public.%I for insert to authenticated
         with check ((select private.is_member()) and member_id = (select auth.uid()))', t);
    execute format(
      'create policy "own update" on public.%I for update to authenticated
         using ((select private.is_member()) and member_id = (select auth.uid()))
         with check ((select private.is_member()) and member_id = (select auth.uid()))', t);
    execute format(
      'create policy "own delete" on public.%I for delete to authenticated
         using ((select private.is_member()) and member_id = (select auth.uid()))', t);
  end loop;
end;
$$;

-- conflicts: a member sets and removes only their own marking.
create policy "members read" on public.conflicts for select to authenticated
  using ((select private.is_member()));
create policy "own insert" on public.conflicts for insert to authenticated
  with check ((select private.is_member()) and member_id = (select auth.uid()));
create policy "own delete" on public.conflicts for delete to authenticated
  using ((select private.is_member()) and member_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- feedback and feedback_scores
-- Read: sight lock. Write: own entry only, and only while the board is open.
-- ---------------------------------------------------------------------------

create policy "members read with sight lock" on public.feedback for select to authenticated
  using (
    (select private.is_member())
    and private.can_read_feedback(applicant_id, member_id, submitted_at)
  );
create policy "own insert while open" on public.feedback for insert to authenticated
  with check (
    (select private.is_member())
    and member_id = (select auth.uid())
    and private.board_open_for_applicant(applicant_id)
  );
create policy "own update while open" on public.feedback for update to authenticated
  using (
    (select private.is_member())
    and member_id = (select auth.uid())
    and private.board_open_for_applicant(applicant_id)
  )
  with check (
    (select private.is_member())
    and member_id = (select auth.uid())
    and private.board_open_for_applicant(applicant_id)
  );
create policy "own delete while open" on public.feedback for delete to authenticated
  using (
    (select private.is_member())
    and member_id = (select auth.uid())
    and private.board_open_for_applicant(applicant_id)
  );

-- Scores are readable exactly when their feedback entry is: the subquery on
-- feedback runs through feedback's own policy.
create policy "members read with feedback" on public.feedback_scores for select to authenticated
  using (
    (select private.is_member())
    and exists (select 1 from public.feedback f where f.id = feedback_id)
  );
create policy "own insert while open" on public.feedback_scores for insert to authenticated
  with check (
    (select private.is_member())
    and exists (
      select 1 from public.feedback f
      where f.id = feedback_id
        and f.member_id = (select auth.uid())
        and private.board_open_for_applicant(f.applicant_id)
    )
  );
create policy "own update while open" on public.feedback_scores for update to authenticated
  using (
    (select private.is_member())
    and exists (
      select 1 from public.feedback f
      where f.id = feedback_id
        and f.member_id = (select auth.uid())
        and private.board_open_for_applicant(f.applicant_id)
    )
  )
  with check (
    (select private.is_member())
    and exists (
      select 1 from public.feedback f
      where f.id = feedback_id
        and f.member_id = (select auth.uid())
        and private.board_open_for_applicant(f.applicant_id)
    )
  );
create policy "own delete while open" on public.feedback_scores for delete to authenticated
  using (
    (select private.is_member())
    and exists (
      select 1 from public.feedback f
      where f.id = feedback_id
        and f.member_id = (select auth.uid())
        and private.board_open_for_applicant(f.applicant_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Board: members move cards while the board is open. Freezing is an update
-- on rounds, which only admins may do (policy above).
-- board_positions are removed only by cascade, so there is no delete policy.
-- board_events is append-only: no update or delete policy.
-- ---------------------------------------------------------------------------

create policy "members read" on public.board_positions for select to authenticated
  using ((select private.is_member()));
create policy "members insert while open" on public.board_positions for insert to authenticated
  with check ((select private.is_member()) and private.board_open(round_id));
create policy "members update while open" on public.board_positions for update to authenticated
  using ((select private.is_member()) and private.board_open(round_id))
  with check ((select private.is_member()) and private.board_open(round_id));

create policy "members read" on public.board_events for select to authenticated
  using ((select private.is_member()));
create policy "members append while open" on public.board_events for insert to authenticated
  with check (
    (select private.is_member())
    and actor_id = (select auth.uid())
    and private.board_open(round_id)
  );

-- ---------------------------------------------------------------------------
-- round_stats: members read; only the daily job writes (service_role).
-- ---------------------------------------------------------------------------

create policy "members read" on public.round_stats for select to authenticated
  using ((select private.is_member()));

-- ---------------------------------------------------------------------------
-- Storage bucket cv: members read (needed for signed URLs), admins write.
-- ---------------------------------------------------------------------------

create policy "cv: members read" on storage.objects for select to authenticated
  using (bucket_id = 'cv' and (select private.is_member()));
create policy "cv: admins insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'cv' and (select private.is_admin()));
create policy "cv: admins update" on storage.objects for update to authenticated
  using (bucket_id = 'cv' and (select private.is_admin()))
  with check (bucket_id = 'cv' and (select private.is_admin()));
create policy "cv: admins delete" on storage.objects for delete to authenticated
  using (bucket_id = 'cv' and (select private.is_admin()));
