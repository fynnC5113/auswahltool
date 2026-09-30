-- Phase 16: Draft Board (Fynn, 30.09.2026).
--   - Three zones: pool (ordered: the order left at the end is the waiting
--     list), seat (fixed boxes 1..N, a freed seat stays empty), reject (no
--     order). "Auch gern" is gone.
--   - Cards on a seat get one or two departments from the team
--     (board_departments); the applicant's wish stays separate.
--   - departments.short_name for the board ("Termine", "ÖA", …).
--   - The board is usable only after "Auswahlrunde starten" and until it is
--     frozen (private.board_active). private.board_open stays as it is,
--     because feedback uses it too.
--   - Members write only through move_card, set_seats (admins) and
--     set_board_departments. Each takes the round lock, checks the rules
--     again and writes position, renumbering and history in one step.
--     Direct writes on the board tables are revoked.

-- ---------------------------------------------------------------------------
-- Short names
-- ---------------------------------------------------------------------------

alter table public.departments add column short_name text not null default '';

-- ---------------------------------------------------------------------------
-- Zones: pool, seat, reject
-- ---------------------------------------------------------------------------

update public.board_positions set zone = 'pool', position = null where zone = 'also';

do $$
declare
  c record;
begin
  for c in
    select conrelid::regclass::text as tbl, conname from pg_constraint
    where contype = 'c'
      and conrelid in ('public.board_positions'::regclass, 'public.board_events'::regclass)
      and pg_get_constraintdef(oid) like '%zone%'
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
end;
$$;

alter table public.board_positions
  add constraint board_positions_zone check (zone in ('pool', 'seat', 'reject')),
  add constraint board_positions_position check (
    (zone = 'reject' and position is null)
    or (zone = 'seat' and position >= 1)
    or (zone = 'pool' and (position is null or position >= 1))
  );

-- One card per seat, also when two moves race past the lock.
create unique index board_positions_seat on public.board_positions (round_id, position) where zone = 'seat';

-- ---------------------------------------------------------------------------
-- History: moves, seat count, departments
-- ---------------------------------------------------------------------------

alter table public.board_events
  alter column applicant_id drop not null,
  alter column to_zone drop not null,
  add column kind text not null default 'move',
  add column from_seats int,
  add column to_seats int,
  add column from_department_ids uuid[],
  add column to_department_ids uuid[],
  add constraint board_events_zones check (
    (from_zone is null or from_zone in ('pool', 'seat', 'reject'))
    and (to_zone is null or to_zone in ('pool', 'seat', 'reject'))
  ),
  add constraint board_events_kind check (
    (kind = 'move' and applicant_id is not null and to_zone is not null)
    or (kind = 'seats' and applicant_id is null and from_seats is not null and to_seats is not null)
    or (kind = 'departments' and applicant_id is not null and to_department_ids is not null)
  );

-- ---------------------------------------------------------------------------
-- Departments given by the team (at most two per card)
-- ---------------------------------------------------------------------------

create table public.board_departments (
  round_id uuid not null references public.rounds (id) on delete cascade,
  applicant_id uuid not null references public.applicants (id) on delete cascade,
  department_id uuid not null references public.departments (id) on delete cascade,
  primary key (applicant_id, department_id)
);
create index on public.board_departments (round_id);
create index on public.board_departments (department_id);

alter table public.board_departments enable row level security;
grant select on public.board_departments to authenticated;
grant select, insert, update, delete on public.board_departments to service_role;

create policy "members read" on public.board_departments for select to authenticated
  using ((select private.is_member()));

-- ---------------------------------------------------------------------------
-- No direct writes for members
-- ---------------------------------------------------------------------------

revoke insert, update, delete on public.board_positions, public.board_events from authenticated;
drop policy "members insert while open" on public.board_positions;
drop policy "members update while open" on public.board_positions;
drop policy "members append while open" on public.board_events;

-- ---------------------------------------------------------------------------
-- Board usable: selection started and not frozen
-- ---------------------------------------------------------------------------

create function private.board_active(p_round_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.rounds
    where id = p_round_id
      and selection_started_at is not null and selection_started_at <= now()
      and board_frozen_at is null
  );
$$;

revoke execute on function private.board_active(uuid) from public, anon;
grant execute on function private.board_active(uuid) to authenticated;

-- A department given on the board cannot be removed from the round either.
create or replace function private.config_item_in_use(p_kind text, p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_kind
    when 'question' then exists (select 1 from public.answers where question_id = p_id)
    when 'department' then
      exists (select 1 from public.applicant_departments where department_id = p_id)
      or exists (select 1 from public.board_departments where department_id = p_id)
    when 'criterion' then exists (select 1 from public.feedback_scores where criterion_id = p_id)
  end;
$$;

-- Checks shared by the three board functions; takes the round's board lock.
create function private.board_guard(p_round_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not (select private.is_member()) then
    raise exception 'not a member' using errcode = '42501', hint = 'not_member';
  end if;
  -- Board writes of a round run one by one.
  perform pg_advisory_xact_lock(hashtext('board:' || p_round_id::text));
  if exists (select 1 from public.rounds where id = p_round_id and board_frozen_at is not null) then
    raise exception 'board is frozen' using errcode = '42501', hint = 'frozen';
  end if;
  if not private.board_active(p_round_id) then
    raise exception 'selection has not started' using errcode = '42501', hint = 'not_started';
  end if;
end;
$$;

revoke execute on function private.board_guard(uuid) from public, anon;
grant execute on function private.board_guard(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- move_card
-- p_to_zone: pool | seat | reject. p_to_position: seat number (seat), place
-- in the pool (1 = top, null = end), ignored for reject.
-- p_pool: the pool in the order the caller sees it, before the move. Needed
-- when the card goes into the pool: the pool is then stored completely in
-- that order (cards without a stored place are sorted by short score in the
-- browser). Rejected as stale if it no longer matches the stored pool.
-- Returns the history entry, or null if nothing changed.
-- Hints: not_member, frozen, not_started, unknown_applicant, seat_missing,
-- seat_taken (details = seat), pool_missing, stale.
-- ---------------------------------------------------------------------------

create or replace function public.move_card(
  p_applicant_id uuid,
  p_to_zone text,
  p_to_position int,
  p_pool uuid[]
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_round_id uuid;
  v_seats int;
  v_from_zone text;
  v_from_position int;
  v_actual uuid[];
  v_new uuid[];
  v_at int;
  v_event uuid;
  v_i int;
begin
  select round_id into v_round_id from public.applicants where id = p_applicant_id;
  if v_round_id is null then
    raise exception 'unknown applicant' using errcode = 'P0002', hint = 'unknown_applicant';
  end if;
  perform private.board_guard(v_round_id);
  if p_to_zone is null or p_to_zone not in ('pool', 'seat', 'reject') then
    raise exception 'unknown zone' using errcode = '22023', hint = 'seat_missing';
  end if;

  select seats into v_seats from public.rounds where id = v_round_id;
  select zone, position into v_from_zone, v_from_position
  from public.board_positions where applicant_id = p_applicant_id;
  v_from_zone := coalesce(v_from_zone, 'pool');

  -- The pool as stored: every applicant of the round without a row or in zone pool.
  select coalesce(array_agg(a.id), '{}') into v_actual
  from public.applicants a
  left join public.board_positions bp on bp.applicant_id = a.id
  where a.round_id = v_round_id and coalesce(bp.zone, 'pool') = 'pool';

  if p_pool is not null then
    if (select coalesce(array_agg(x order by x), '{}') from unnest(p_pool) x)
       <> (select coalesce(array_agg(x order by x), '{}') from unnest(v_actual) x)
       or exists (
         -- Stored places must appear in the same order in p_pool.
         select 1 from (
           select bp.position, t.o, lag(t.o) over (order by bp.position) as prev
           from unnest(p_pool) with ordinality as t(id, o)
           join public.board_positions bp on bp.applicant_id = t.id and bp.zone = 'pool' and bp.position is not null
         ) s where s.prev > s.o
       ) then
      -- Not 40001: PostgREST on Supabase retries serialization failures until the gateway times out.
      raise exception 'board changed' using errcode = 'P0001', hint = 'stale';
    end if;
    if v_from_zone = 'pool' and v_from_position is null then
      select o::int into v_from_position from unnest(p_pool) with ordinality as t(id, o) where id = p_applicant_id;
    end if;
  end if;

  if p_to_zone = 'seat' then
    if p_to_position is null or p_to_position < 1 or p_to_position > v_seats then
      raise exception 'no such seat' using errcode = '22023', hint = 'seat_missing';
    end if;
    if v_from_zone = 'seat' and v_from_position = p_to_position then
      return null;
    end if;
    if exists (
      select 1 from public.board_positions
      where round_id = v_round_id and zone = 'seat' and position = p_to_position
    ) then
      raise exception 'seat is taken' using errcode = '23505', hint = 'seat_taken', detail = p_to_position::text;
    end if;
  elsif p_to_zone = 'reject' and v_from_zone = 'reject' then
    return null;
  elsif p_to_zone = 'pool' and p_pool is null then
    raise exception 'pool order missing' using errcode = '22023', hint = 'pool_missing';
  end if;

  if p_to_zone = 'pool' then
    v_new := array_remove(p_pool, p_applicant_id);
    v_at := least(greatest(coalesce(p_to_position, cardinality(v_new) + 1), 1), cardinality(v_new) + 1);
    if v_from_zone = 'pool' and v_from_position = v_at then
      return null;
    end if;
    v_new := v_new[1:v_at - 1] || p_applicant_id || v_new[v_at:];
    for v_i in 1 .. cardinality(v_new) loop
      insert into public.board_positions (round_id, applicant_id, zone, position, updated_by)
      values (v_round_id, v_new[v_i], 'pool', v_i, v_me)
      on conflict (applicant_id) do update
      set zone = 'pool', position = excluded.position, updated_at = now(),
          updated_by = case when public.board_positions.applicant_id = p_applicant_id then v_me
                            else public.board_positions.updated_by end
      where public.board_positions.position is distinct from excluded.position
         or public.board_positions.zone <> 'pool';
    end loop;
  else
    insert into public.board_positions (round_id, applicant_id, zone, position, updated_by)
    values (v_round_id, p_applicant_id, p_to_zone, case when p_to_zone = 'seat' then p_to_position end, v_me)
    on conflict (applicant_id) do update
    set zone = excluded.zone, position = excluded.position, updated_at = now(), updated_by = v_me;
    -- The pool closes its gap; cards without a stored place keep none.
    if v_from_zone = 'pool' then
      update public.board_positions bp set position = r.n
      from (
        select applicant_id, row_number() over (order by position)::int as n
        from public.board_positions
        where round_id = v_round_id and zone = 'pool' and position is not null
      ) r
      where bp.applicant_id = r.applicant_id and bp.position <> r.n;
    end if;
  end if;

  insert into public.board_events (
    round_id, applicant_id, actor_id, kind, from_zone, from_position, to_zone, to_position
  ) values (
    v_round_id, p_applicant_id, v_me, 'move', v_from_zone, v_from_position, p_to_zone,
    case p_to_zone when 'seat' then p_to_position when 'pool' then v_at end
  ) returning id into v_event;
  return v_event;
end;
$$;

revoke execute on function public.move_card(uuid, text, int, uuid[]) from public, anon;
grant execute on function public.move_card(uuid, text, int, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- set_seats: admins add seat N+1 or remove seat N (only while it is empty,
-- at least one seat remains). Hints: not_member, not_admin, frozen,
-- not_started, seat_taken (details = seat), minimum. Returns the new count.
-- ---------------------------------------------------------------------------

create function public.set_seats(p_round_id uuid, p_delta int) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_seats int;
begin
  perform private.board_guard(p_round_id);
  if not (select private.is_admin()) then
    raise exception 'only admins may change the seats' using errcode = '42501', hint = 'not_admin';
  end if;
  if p_delta not in (1, -1) then
    raise exception 'delta must be 1 or -1' using errcode = '22023';
  end if;
  select seats into v_seats from public.rounds where id = p_round_id;
  if p_delta = -1 then
    if v_seats <= 1 then
      raise exception 'at least one seat' using errcode = '22023', hint = 'minimum';
    end if;
    if exists (
      select 1 from public.board_positions
      where round_id = p_round_id and zone = 'seat' and position = v_seats
    ) then
      raise exception 'last seat is taken' using errcode = '23505', hint = 'seat_taken', detail = v_seats::text;
    end if;
  end if;
  update public.rounds set seats = v_seats + p_delta where id = p_round_id;
  insert into public.board_events (round_id, actor_id, kind, from_seats, to_seats)
  values (p_round_id, (select auth.uid()), 'seats', v_seats, v_seats + p_delta);
  return v_seats + p_delta;
end;
$$;

revoke execute on function public.set_seats(uuid, int) from public, anon;
grant execute on function public.set_seats(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- set_board_departments: one or two departments for a card on a seat (an
-- empty list removes them). Hints: not_member, frozen, not_started,
-- unknown_applicant, not_seated, too_many, department_unknown.
-- Returns the history entry, or null if nothing changed.
-- ---------------------------------------------------------------------------

create function public.set_board_departments(p_applicant_id uuid, p_department_ids uuid[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_round_id uuid;
  v_new uuid[];
  v_old uuid[];
  v_event uuid;
begin
  select round_id into v_round_id from public.applicants where id = p_applicant_id;
  if v_round_id is null then
    raise exception 'unknown applicant' using errcode = 'P0002', hint = 'unknown_applicant';
  end if;
  perform private.board_guard(v_round_id);
  if not exists (select 1 from public.board_positions where applicant_id = p_applicant_id and zone = 'seat') then
    raise exception 'card is not on a seat' using errcode = '22023', hint = 'not_seated';
  end if;

  select coalesce(array_agg(distinct x order by x), '{}') into v_new from unnest(p_department_ids) x;
  if cardinality(v_new) > 2 then
    raise exception 'at most two departments' using errcode = '22023', hint = 'too_many';
  end if;
  if exists (
    select 1 from unnest(v_new) x
    where not exists (select 1 from public.departments d where d.id = x and d.round_id = v_round_id)
  ) then
    raise exception 'department is not part of this round' using errcode = '22023', hint = 'department_unknown';
  end if;

  select coalesce(array_agg(department_id order by department_id), '{}') into v_old
  from public.board_departments where applicant_id = p_applicant_id;
  if v_old = v_new then
    return null;
  end if;

  delete from public.board_departments where applicant_id = p_applicant_id;
  insert into public.board_departments (round_id, applicant_id, department_id)
  select v_round_id, p_applicant_id, x from unnest(v_new) x;

  insert into public.board_events (round_id, applicant_id, actor_id, kind, from_department_ids, to_department_ids)
  values (v_round_id, p_applicant_id, (select auth.uid()), 'departments', v_old, v_new)
  returning id into v_event;
  return v_event;
end;
$$;

revoke execute on function public.set_board_departments(uuid, uuid[]) from public, anon;
grant execute on function public.set_board_departments(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- save_round: same as 20261002100000_required_answers.sql, plus the short
-- name of each department, and the number of seats cannot drop below a seat
-- that has a card (hint seat_taken, details = highest taken seat).
-- ---------------------------------------------------------------------------

create or replace function public.save_round(
  p_round jsonb,
  p_questions jsonb,
  p_departments jsonb,
  p_criteria jsonb
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_round_id uuid := nullif(p_round->>'id', '')::uuid;
  v_in_use text;
  v_item jsonb;
  v_pos int;
  v_id uuid;
  v_taken int;
begin
  if not (select private.is_admin()) then
    raise exception 'only admins may save a round' using errcode = '42501';
  end if;

  -- ----- round -----
  if v_round_id is null then
    insert into public.rounds (
      year, title, seats, interview_minutes, buffer_minutes, rebook_hours_before,
      application_opens_at, application_closes_at, interviews_from, interviews_until,
      deletion_date, mail_transport, reply_to, privacy_notice, required_answers
    ) values (
      (p_round->>'year')::int, p_round->>'title', (p_round->>'seats')::int,
      (p_round->>'interview_minutes')::int, (p_round->>'buffer_minutes')::int,
      (p_round->>'rebook_hours_before')::int,
      (p_round->>'application_opens_at')::timestamptz, (p_round->>'application_closes_at')::timestamptz,
      (p_round->>'interviews_from')::date, (p_round->>'interviews_until')::date,
      (p_round->>'deletion_date')::date, p_round->>'mail_transport', p_round->>'reply_to',
      coalesce(p_round->>'privacy_notice', ''), (p_round->>'required_answers')::int
    ) returning id into v_round_id;
  else
    select max(position) into v_taken from public.board_positions
    where round_id = v_round_id and zone = 'seat';
    if v_taken > (p_round->>'seats')::int then
      raise exception 'a seat above the new number has a card'
        using errcode = '23505', hint = 'seat_taken', detail = v_taken::text;
    end if;
    update public.rounds set
      year = (p_round->>'year')::int,
      title = p_round->>'title',
      seats = (p_round->>'seats')::int,
      interview_minutes = (p_round->>'interview_minutes')::int,
      buffer_minutes = (p_round->>'buffer_minutes')::int,
      rebook_hours_before = (p_round->>'rebook_hours_before')::int,
      application_opens_at = (p_round->>'application_opens_at')::timestamptz,
      application_closes_at = (p_round->>'application_closes_at')::timestamptz,
      interviews_from = (p_round->>'interviews_from')::date,
      interviews_until = (p_round->>'interviews_until')::date,
      deletion_date = (p_round->>'deletion_date')::date,
      mail_transport = p_round->>'mail_transport',
      reply_to = p_round->>'reply_to',
      privacy_notice = coalesce(p_round->>'privacy_notice', ''),
      required_answers = (p_round->>'required_answers')::int
    where id = v_round_id;
    if not found then
      raise exception 'round not found' using errcode = 'P0002';
    end if;
  end if;

  -- ----- removals blocked by existing data -----
  select string_agg(x.id::text, ',') into v_in_use from (
    select q.id from public.questions q
    where q.round_id = v_round_id
      and q.id::text not in (select e->>'id' from jsonb_array_elements(p_questions) e where e->>'id' is not null)
      and private.config_item_in_use('question', q.id)
    union all
    select d.id from public.departments d
    where d.round_id = v_round_id
      and d.id::text not in (select e->>'id' from jsonb_array_elements(p_departments) e where e->>'id' is not null)
      and private.config_item_in_use('department', d.id)
    union all
    select c.id from public.criteria c
    where c.round_id = v_round_id
      and c.id::text not in (select e->>'id' from jsonb_array_elements(p_criteria) e where e->>'id' is not null)
      and private.config_item_in_use('criterion', c.id)
  ) x;
  if v_in_use is not null then
    raise exception 'items in use cannot be removed'
      using errcode = 'P0001', hint = 'in_use', detail = v_in_use;
  end if;

  -- ----- remove the rest, then move remaining rows out of the way -----
  delete from public.questions q where q.round_id = v_round_id
    and q.id::text not in (select e->>'id' from jsonb_array_elements(p_questions) e where e->>'id' is not null);
  delete from public.departments d where d.round_id = v_round_id
    and d.id::text not in (select e->>'id' from jsonb_array_elements(p_departments) e where e->>'id' is not null);
  delete from public.criteria c where c.round_id = v_round_id
    and c.id::text not in (select e->>'id' from jsonb_array_elements(p_criteria) e where e->>'id' is not null);

  update public.questions set position = -position - 1 where round_id = v_round_id;
  update public.departments set position = -position - 1 where round_id = v_round_id;
  update public.criteria set position = -position - 1 where round_id = v_round_id;

  -- ----- questions -----
  for v_item, v_pos in select e, (o - 1)::int from jsonb_array_elements(p_questions) with ordinality as t(e, o) loop
    v_id := nullif(v_item->>'id', '')::uuid;
    if v_id is null then
      insert into public.questions (round_id, position, text)
      values (v_round_id, v_pos, v_item->>'text');
    else
      update public.questions set position = v_pos, text = v_item->>'text'
      where id = v_id and round_id = v_round_id;
      if not found then
        raise exception 'question % not in this round', v_id using errcode = 'P0002';
      end if;
    end if;
  end loop;

  -- ----- departments -----
  for v_item, v_pos in select e, (o - 1)::int from jsonb_array_elements(p_departments) with ordinality as t(e, o) loop
    v_id := nullif(v_item->>'id', '')::uuid;
    if v_id is null then
      insert into public.departments (round_id, position, name, description, short_name)
      values (v_round_id, v_pos, v_item->>'name', coalesce(v_item->>'description', ''), coalesce(v_item->>'short_name', ''));
    else
      update public.departments
      set position = v_pos, name = v_item->>'name', description = coalesce(v_item->>'description', ''),
          short_name = coalesce(v_item->>'short_name', '')
      where id = v_id and round_id = v_round_id;
      if not found then
        raise exception 'department % not in this round', v_id using errcode = 'P0002';
      end if;
    end if;
  end loop;

  -- ----- criteria -----
  for v_item, v_pos in select e, (o - 1)::int from jsonb_array_elements(p_criteria) with ordinality as t(e, o) loop
    v_id := nullif(v_item->>'id', '')::uuid;
    if v_id is null then
      insert into public.criteria (round_id, position, name, description, weight, scale_min, scale_max)
      values (
        v_round_id, v_pos, v_item->>'name', coalesce(v_item->>'description', ''),
        (v_item->>'weight')::numeric, (v_item->>'scale_min')::int, (v_item->>'scale_max')::int
      );
    else
      update public.criteria set
        position = v_pos,
        name = v_item->>'name',
        description = coalesce(v_item->>'description', ''),
        weight = (v_item->>'weight')::numeric,
        scale_min = (v_item->>'scale_min')::int,
        scale_max = (v_item->>'scale_max')::int
      where id = v_id and round_id = v_round_id;
      if not found then
        raise exception 'criterion % not in this round', v_id using errcode = 'P0002';
      end if;
    end if;
  end loop;

  return v_round_id;
end;
$$;
