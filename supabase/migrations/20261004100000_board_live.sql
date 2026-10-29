-- Phase 17: board live, history with undo, freezing (Fynn, 30.09.2026).
--   - board_events goes into the Realtime publication: every open board
--     hears new history entries (RLS "members read" decides who gets them)
--     and reloads.
--   - board_events.seq: order of the history. created_at is the start of
--     the transaction, and a transaction that waited for the board lock can
--     have started before the one it waited for; seq is taken at insert,
--     under the lock.
--   - Kinds freeze and unfreeze (applicant_id null).
--   - undo_board_event: any member undoes a move or a department change,
--     admins also "+"/"−" of the seats. Writes a new entry with
--     undoes_event_id. Freezing is not undone here but with unfreeze_board.
--   - freeze_board / unfreeze_board: admins only. Freezing can be lifted
--     again (Fynn, 30.09.2026), both show up in the history.

-- ---------------------------------------------------------------------------
-- History order and kinds
-- ---------------------------------------------------------------------------

alter table public.board_events add column seq bigint generated always as identity;
create unique index board_events_seq on public.board_events (round_id, seq);
create index on public.board_events (undoes_event_id);

alter table public.board_events
  drop constraint board_events_kind,
  add constraint board_events_kind check (
    (kind = 'move' and applicant_id is not null and to_zone is not null)
    or (kind = 'seats' and applicant_id is null and from_seats is not null and to_seats is not null)
    or (kind = 'departments' and applicant_id is not null and to_department_ids is not null)
    or (kind in ('freeze', 'unfreeze') and applicant_id is null)
  );

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.board_events;

-- ---------------------------------------------------------------------------
-- undo_board_event
-- p_pool: the pool in the order the caller sees it (as for move_card); only
-- used when a card goes back into the pool.
-- Returns the new history entry, or null if nothing changed.
-- Hints: not_member, frozen, not_started, unknown_event, not_undoable,
-- already_undone, moved_since (the card moved later or is elsewhere),
-- changed_since (seats or departments changed later), origin_gone (details
-- = seat), seat_taken (details = seat), not_seated, not_admin, stale.
-- ---------------------------------------------------------------------------

create function public.undo_board_event(p_event_id uuid, p_pool uuid[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  e public.board_events;
  v_seats int;
  v_zone text;
  v_position int;
  v_current uuid[];
  v_new uuid;
begin
  select * into e from public.board_events where id = p_event_id;
  if e.id is null then
    raise exception 'unknown history entry' using errcode = 'P0002', hint = 'unknown_event';
  end if;
  perform private.board_guard(e.round_id);

  if e.kind not in ('move', 'seats', 'departments') then
    raise exception 'this entry cannot be undone' using errcode = '22023', hint = 'not_undoable';
  end if;
  if exists (select 1 from public.board_events where undoes_event_id = e.id) then
    raise exception 'already undone' using errcode = 'P0001', hint = 'already_undone';
  end if;

  if e.kind = 'move' then
    select zone, position into v_zone, v_position from public.board_positions where applicant_id = e.applicant_id;
    v_zone := coalesce(v_zone, 'pool');
    if exists (
      select 1 from public.board_events
      where applicant_id = e.applicant_id and kind = 'move' and round_id = e.round_id and seq > e.seq
    ) or v_zone <> e.to_zone or (v_zone = 'seat' and v_position is distinct from e.to_position) then
      raise exception 'the card has moved since' using errcode = 'P0001', hint = 'moved_since';
    end if;
    if e.from_zone = 'seat' then
      select seats into v_seats from public.rounds where id = e.round_id;
      if e.from_position > v_seats then
        raise exception 'the seat is gone' using errcode = 'P0001', hint = 'origin_gone', detail = e.from_position::text;
      end if;
    end if;
    -- move_card checks the seat and the pool again and writes the entry.
    v_new := public.move_card(e.applicant_id, coalesce(e.from_zone, 'pool'), e.from_position, p_pool);

  elsif e.kind = 'seats' then
    if not (select private.is_admin()) then
      raise exception 'only admins may change the seats' using errcode = '42501', hint = 'not_admin';
    end if;
    select seats into v_seats from public.rounds where id = e.round_id;
    if v_seats <> e.to_seats then
      raise exception 'the seats changed since' using errcode = 'P0001', hint = 'changed_since';
    end if;
    perform public.set_seats(e.round_id, e.from_seats - e.to_seats);
    select id into v_new from public.board_events where round_id = e.round_id order by seq desc limit 1;

  else
    if not exists (select 1 from public.board_positions where applicant_id = e.applicant_id and zone = 'seat') then
      raise exception 'card is not on a seat' using errcode = '22023', hint = 'not_seated';
    end if;
    select coalesce(array_agg(department_id order by department_id), '{}') into v_current
    from public.board_departments where applicant_id = e.applicant_id;
    if v_current <> (select coalesce(array_agg(x order by x), '{}') from unnest(e.to_department_ids) x) then
      raise exception 'the departments changed since' using errcode = 'P0001', hint = 'changed_since';
    end if;
    v_new := public.set_board_departments(e.applicant_id, coalesce(e.from_department_ids, '{}'));
  end if;

  if v_new is not null then
    update public.board_events set undoes_event_id = e.id where id = v_new;
  end if;
  return v_new;
end;
$$;

revoke execute on function public.undo_board_event(uuid, uuid[]) from public, anon;
grant execute on function public.undo_board_event(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- freeze_board / unfreeze_board (admins). Hints: not_member, not_admin,
-- frozen, not_started (freeze), not_frozen (unfreeze).
-- ---------------------------------------------------------------------------

create function public.freeze_board(p_round_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.board_guard(p_round_id);
  if not (select private.is_admin()) then
    raise exception 'only admins may freeze the board' using errcode = '42501', hint = 'not_admin';
  end if;
  update public.rounds set board_frozen_at = now(), board_frozen_by = (select auth.uid()) where id = p_round_id;
  insert into public.board_events (round_id, actor_id, kind) values (p_round_id, (select auth.uid()), 'freeze');
end;
$$;

revoke execute on function public.freeze_board(uuid) from public, anon;
grant execute on function public.freeze_board(uuid) to authenticated;

create function public.unfreeze_board(p_round_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not (select private.is_member()) then
    raise exception 'not a member' using errcode = '42501', hint = 'not_member';
  end if;
  if not (select private.is_admin()) then
    raise exception 'only admins may lift the freeze' using errcode = '42501', hint = 'not_admin';
  end if;
  perform pg_advisory_xact_lock(hashtext('board:' || p_round_id::text));
  update public.rounds set board_frozen_at = null, board_frozen_by = null
  where id = p_round_id and board_frozen_at is not null;
  if not found then
    raise exception 'the board is not frozen' using errcode = 'P0001', hint = 'not_frozen';
  end if;
  insert into public.board_events (round_id, actor_id, kind) values (p_round_id, (select auth.uid()), 'unfreeze');
end;
$$;

revoke execute on function public.unfreeze_board(uuid) from public, anon;
grant execute on function public.unfreeze_board(uuid) to authenticated;
