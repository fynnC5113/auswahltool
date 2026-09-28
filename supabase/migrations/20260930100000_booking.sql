-- Phase 12: an applicant books or rebooks a slot (TECH_DESIGN 6.3).
-- The server chooses the pair (choosePair) and calls book_slot with the
-- secret key. The function repeats every rule the server checked, under the
-- per-round lock the overlap trigger also takes, so parallel bookings cannot
-- break them: slot free, pair allowed, limits (booked interviews), deadlines.
-- Rebooking frees the old slot (and its pair) in the same transaction.
-- ics_sequence goes up on every slot whose calendar entry changes.
--
-- Errors carry a hint the server translates:
--   slot_gone, slot_taken, applicant_gone, pair_changed, member_unavailable,
--   over_limit (member id in detail), too_late, rebook_closed;
--   person_overlap comes from the trigger check_slot_person_overlap.

create function public.book_slot(
  p_slot_id uuid,
  p_applicant_id uuid,
  p_interviewer_a uuid,
  p_interviewer_b uuid
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_round_id uuid;
  v_slot public.slots;
  v_old public.slots;
  v_rebook_hours int;
  v_member uuid;
  v_old_sequence int;
  v_new_sequence int;
begin
  select round_id into v_round_id from public.slots where id = p_slot_id;
  if v_round_id is null then
    raise exception 'slot % not found', p_slot_id using hint = 'slot_gone';
  end if;
  -- Same lock as the overlap trigger: slot writes of a round run one by one.
  perform pg_advisory_xact_lock(hashtext('slots:' || v_round_id::text));

  select * into v_slot from public.slots where id = p_slot_id;
  if v_slot.applicant_id is not null then
    raise exception 'slot % is taken', p_slot_id using hint = 'slot_taken';
  end if;
  if not exists (select 1 from public.applicants where id = p_applicant_id and round_id = v_round_id) then
    raise exception 'applicant % not in round', p_applicant_id using hint = 'applicant_gone';
  end if;

  -- A pair fixed by an admin stays.
  if p_interviewer_a is null or p_interviewer_b is null or p_interviewer_a = p_interviewer_b
     or (v_slot.interviewer_a is not null
         and (least(v_slot.interviewer_a, v_slot.interviewer_b), greatest(v_slot.interviewer_a, v_slot.interviewer_b))
             is distinct from (least(p_interviewer_a, p_interviewer_b), greatest(p_interviewer_a, p_interviewer_b))) then
    raise exception 'pair does not match slot %', p_slot_id using hint = 'pair_changed';
  end if;

  -- Active and not conflicted with this applicant.
  select m into v_member
  from (values (p_interviewer_a), (p_interviewer_b)) as v(m)
  where not exists (select 1 from public.team_members t where t.id = v.m and t.active)
     or exists (select 1 from public.conflicts c where c.applicant_id = p_applicant_id and c.member_id = v.m)
  limit 1;
  if v_member is not null then
    raise exception 'member % may not take this interview', v_member using hint = 'member_unavailable', detail = v_member::text;
  end if;

  -- Limits count booked interviews; the applicant's own current slot does not count.
  select v.m into v_member
  from (values (p_interviewer_a), (p_interviewer_b)) as v(m)
  join public.member_round_settings s on s.round_id = v_round_id and s.member_id = v.m
  where s.max_interviews is not null
    and s.max_interviews <= (
      select count(*) from public.slots b
      where b.round_id = v_round_id
        and b.applicant_id is not null
        and b.applicant_id <> p_applicant_id
        and v.m in (b.interviewer_a, b.interviewer_b)
    )
  limit 1;
  if v_member is not null then
    raise exception 'member % reached the limit', v_member using hint = 'over_limit', detail = v_member::text;
  end if;

  select rebook_hours_before into v_rebook_hours from public.rounds where id = v_round_id;
  select * into v_old from public.slots where applicant_id = p_applicant_id;
  if found and v_old.starts_at - make_interval(hours => v_rebook_hours) <= now() then
    raise exception 'rebooking closed for slot %', v_old.id using hint = 'rebook_closed';
  end if;
  -- Only slots that could still be rebooked may be booked (Fynn, 29.09.2026).
  if v_slot.starts_at - make_interval(hours => v_rebook_hours) <= now() then
    raise exception 'slot % starts too soon', p_slot_id using hint = 'too_late';
  end if;

  if v_old.id is not null then
    -- Like "Austragen" in /terminplanung: the pair goes, the next booking chooses again.
    update public.slots
    set applicant_id = null, booked_at = null, interviewer_a = null, interviewer_b = null,
        ics_sequence = ics_sequence + 1
    where id = v_old.id
    returning ics_sequence into v_old_sequence;
  end if;

  update public.slots
  set applicant_id = p_applicant_id, booked_at = now(),
      interviewer_a = p_interviewer_a, interviewer_b = p_interviewer_b,
      ics_sequence = ics_sequence + 1
  where id = p_slot_id
  returning ics_sequence into v_new_sequence;

  return jsonb_build_object(
    'old_slot_id', v_old.id,
    'old_interviewer_a', v_old.interviewer_a,
    'old_interviewer_b', v_old.interviewer_b,
    'old_sequence', v_old_sequence,
    'new_sequence', v_new_sequence
  );
end;
$$;

revoke execute on function public.book_slot(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.book_slot(uuid, uuid, uuid, uuid) to service_role;
