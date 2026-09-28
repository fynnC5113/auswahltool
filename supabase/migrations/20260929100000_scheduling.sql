-- Phase 11: scheduling (Fynn, 29.09.2026).
-- 1. Slots are offered as time + location; the pair is chosen when the slot
--    is booked (or fixed by an admin). A booked slot always has a pair.
-- 2. member_round_settings.preferred: set by admins only (set_preferred).
--    Members still write their own row (max_interviews), but column privileges
--    keep them from touching "preferred".
-- 3. No interviewer may sit in two overlapping slots of a round, buffer
--    included. The location rule is an exclusion constraint; a person can be
--    interviewer_a or interviewer_b, so this one is a trigger.

-- ---------------------------------------------------------------------------
-- 1. Slots without a pair
-- ---------------------------------------------------------------------------

alter table public.slots alter column interviewer_a drop not null;
alter table public.slots alter column interviewer_b drop not null;
alter table public.slots add constraint slots_pair_complete
  check ((interviewer_a is null) = (interviewer_b is null));
alter table public.slots add constraint slots_booked_has_pair
  check (applicant_id is null or interviewer_a is not null);

-- ---------------------------------------------------------------------------
-- 2. preferred
-- ---------------------------------------------------------------------------

alter table public.member_round_settings
  add column preferred boolean not null default false;

revoke insert, update on table public.member_round_settings from authenticated;
-- An upsert updates every column it sends, so round_id and member_id stay
-- updatable; RLS still limits the row to the member's own.
grant insert (round_id, member_id, max_interviews) on table public.member_round_settings to authenticated;
grant update (round_id, member_id, max_interviews) on table public.member_round_settings to authenticated;

-- security definer: RLS lets members write only their own row, and the
-- column privileges above exclude "preferred" for everyone but this function.
create function public.set_preferred(p_round_id uuid, p_member_id uuid, p_preferred boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.is_admin()) then
    raise exception 'only admins may set preferred' using errcode = '42501';
  end if;
  insert into public.member_round_settings (round_id, member_id, preferred)
  values (p_round_id, p_member_id, p_preferred)
  on conflict (round_id, member_id) do update set preferred = excluded.preferred;
end;
$$;

revoke execute on function public.set_preferred(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_preferred(uuid, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. No overlap per person
-- ---------------------------------------------------------------------------

-- security definer: sees every slot of the round whoever writes
-- (admin session or, from Phase 12, service_role).
create function public.check_slot_person_overlap() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_member uuid;
begin
  if new.interviewer_a is null then
    return new;
  end if;
  -- Serialise slot writes per round so two parallel bookings cannot both pass.
  perform pg_advisory_xact_lock(hashtext('slots:' || new.round_id::text));

  select p.m into v_member
  from public.slots s
  cross join lateral (values (s.interviewer_a), (s.interviewer_b)) as p(m)
  where s.round_id = new.round_id
    and s.id <> new.id
    and p.m in (new.interviewer_a, new.interviewer_b)
    and tstzrange(s.starts_at, s.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
  limit 1;

  if v_member is not null then
    raise exception 'member % already sits in an overlapping slot', v_member
      using errcode = 'P0001', hint = 'person_overlap', detail = v_member::text;
  end if;
  return new;
end;
$$;

-- A booking alone (applicant_id) does not fire the check; setting the pair does.
create trigger slots_no_overlap_per_person
  before insert or update of round_id, starts_at, ends_at, interviewer_a, interviewer_b on public.slots
  for each row execute function public.check_slot_person_overlap();

revoke execute on function public.check_slot_person_overlap() from public, anon, authenticated;
