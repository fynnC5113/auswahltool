-- Phase 14: feedback is written only through public.save_feedback (Fynn,
-- 29.09.2026): only the two interviewers of the booked slot, from the start
-- of the interview, while the board is open; a submitted entry needs a score
-- and a reason for every criterion plus the overall text, and stays complete.
-- Direct writes on feedback and feedback_scores are revoked, so these rules
-- cannot be bypassed through the Data API. Reading is unchanged (sight lock).
-- Cascades (applicant, round, criterion) still delete feedback: referential
-- actions do not need the caller's privileges.

-- ---------------------------------------------------------------------------
-- No direct writes for members
-- ---------------------------------------------------------------------------

revoke insert, update, delete on public.feedback, public.feedback_scores from authenticated;

drop policy "own insert while open" on public.feedback;
drop policy "own update while open" on public.feedback;
drop policy "own delete while open" on public.feedback;
drop policy "own insert while open" on public.feedback_scores;
drop policy "own update while open" on public.feedback_scores;
drop policy "own delete while open" on public.feedback_scores;

-- ---------------------------------------------------------------------------
-- save_feedback
-- p_scores: [{ criterion_id, score (int or null), text }]
-- p_submit: true = submit (sets submitted_at once; it is never reset).
-- Returns submitted_at (null = still a draft).
-- Errors carry a hint: not_member, not_interviewer, not_started, frozen,
-- criterion_unknown, incomplete (details = the missing parts).
-- security definer: the caller has no write grants any more; every rule is
-- checked here against auth.uid().
-- ---------------------------------------------------------------------------

create function public.save_feedback(
  p_applicant_id uuid,
  p_overall text,
  p_scores jsonb,
  p_submit boolean
) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_round_id uuid;
  v_starts_at timestamptz;
  v_feedback_id uuid;
  v_submitted timestamptz;
  v_item jsonb;
  v_missing text;
begin
  if v_me is null or not (select private.is_member()) then
    raise exception 'not a member' using errcode = '42501', hint = 'not_member';
  end if;

  select a.round_id, s.starts_at into v_round_id, v_starts_at
  from public.applicants a
  join public.slots s on s.applicant_id = a.id
  where a.id = p_applicant_id and v_me in (s.interviewer_a, s.interviewer_b);
  if v_round_id is null then
    raise exception 'not an interviewer of this applicant' using errcode = '42501', hint = 'not_interviewer';
  end if;
  if now() < v_starts_at then
    raise exception 'interview has not started' using errcode = '22023', hint = 'not_started';
  end if;
  if not private.board_open_for_applicant(p_applicant_id) then
    raise exception 'board is frozen' using errcode = '42501', hint = 'frozen';
  end if;

  -- Serialises two saves of the same entry (autosave and submit).
  insert into public.feedback (applicant_id, member_id)
  values (p_applicant_id, v_me)
  on conflict (applicant_id, member_id) do nothing;
  select id, submitted_at into v_feedback_id, v_submitted
  from public.feedback
  where applicant_id = p_applicant_id and member_id = v_me
  for update;

  update public.feedback
  set overall_text = coalesce(p_overall, ''), updated_at = now()
  where id = v_feedback_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_scores, '[]'::jsonb)) loop
    if not exists (
      select 1 from public.criteria
      where id = (v_item->>'criterion_id')::uuid and round_id = v_round_id
    ) then
      raise exception 'criterion % is not part of this round', v_item->>'criterion_id'
        using errcode = '22023', hint = 'criterion_unknown';
    end if;
    insert into public.feedback_scores (feedback_id, criterion_id, score, text)
    values (
      v_feedback_id,
      (v_item->>'criterion_id')::uuid,
      nullif(v_item->>'score', '')::int,
      coalesce(v_item->>'text', '')
    )
    on conflict (feedback_id, criterion_id) do update
    set score = excluded.score, text = excluded.text;
  end loop;

  if p_submit or v_submitted is not null then
    select string_agg(part, ', ') into v_missing from (
      select c.id::text as part
      from public.criteria c
      left join public.feedback_scores fs on fs.feedback_id = v_feedback_id and fs.criterion_id = c.id
      where c.round_id = v_round_id
        and (fs.score is null or btrim(fs.text) = '')
      union all
      select 'overall'
      where btrim(coalesce(p_overall, '')) = ''
    ) m;
    if v_missing is not null then
      raise exception 'feedback is incomplete' using errcode = '23514', hint = 'incomplete', detail = v_missing;
    end if;
    if v_submitted is null then
      v_submitted := now();
      update public.feedback set submitted_at = v_submitted where id = v_feedback_id;
    end if;
  end if;

  return v_submitted;
end;
$$;

revoke execute on function public.save_feedback(uuid, text, jsonb, boolean) from public, anon;
grant execute on function public.save_feedback(uuid, text, jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- feedback_progress: who has submitted or started an entry, without content.
-- The sight lock hides other members' drafts (and, for an interviewer, the
-- partner's submitted entry), so "Feedback fehlt" needs a security definer
-- function. Returns rows only for active members.
-- ---------------------------------------------------------------------------

create function public.feedback_progress(p_round_id uuid)
returns table (applicant_id uuid, member_id uuid, submitted boolean)
language sql stable security definer set search_path = '' as $$
  select f.applicant_id, f.member_id, f.submitted_at is not null
  from public.feedback f
  join public.applicants a on a.id = f.applicant_id
  where a.round_id = p_round_id
    and (select private.is_member());
$$;

revoke execute on function public.feedback_progress(uuid) from public, anon;
grant execute on function public.feedback_progress(uuid) to authenticated;
