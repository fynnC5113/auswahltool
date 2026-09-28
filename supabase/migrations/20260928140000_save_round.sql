-- Phase 6: save a round with its questions, departments and criteria in one
-- transaction. security invoker: the admin's own RLS policies apply to every
-- insert, update and delete below.
--
-- p_round:       { id (null = new), year, title, seats, interview_minutes,
--                  buffer_minutes, rebook_hours_before, application_opens_at,
--                  application_closes_at, interviews_from, interviews_until,
--                  deletion_date, mail_transport, reply_to, privacy_notice }
-- p_questions:   [{ id (null = new), text }]
-- p_departments: [{ id, name, description }]
-- p_criteria:    [{ id, name, description, weight, scale_min, scale_max }]
-- Array order is the new position (0, 1, 2 ...).
--
-- Items missing from an array are deleted, unless they are already in use
-- (answers, department choices, feedback scores): the cascade would delete
-- those too. Then nothing is saved and the error lists the ids in "details".

-- ---------------------------------------------------------------------------
-- In use? security definer, because the sight lock hides other members'
-- feedback drafts even from admins, and a draft must block the removal too.
-- Returns only true/false.
-- ---------------------------------------------------------------------------

create function private.config_item_in_use(p_kind text, p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_kind
    when 'question' then exists (select 1 from public.answers where question_id = p_id)
    when 'department' then exists (select 1 from public.applicant_departments where department_id = p_id)
    when 'criterion' then exists (select 1 from public.feedback_scores where criterion_id = p_id)
  end;
$$;

revoke execute on function private.config_item_in_use(text, uuid) from public, anon;
grant execute on function private.config_item_in_use(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- save_round
-- ---------------------------------------------------------------------------

create function public.save_round(
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
begin
  if not (select private.is_admin()) then
    raise exception 'only admins may save a round' using errcode = '42501';
  end if;

  -- ----- round -----
  if v_round_id is null then
    insert into public.rounds (
      year, title, seats, interview_minutes, buffer_minutes, rebook_hours_before,
      application_opens_at, application_closes_at, interviews_from, interviews_until,
      deletion_date, mail_transport, reply_to, privacy_notice
    ) values (
      (p_round->>'year')::int, p_round->>'title', (p_round->>'seats')::int,
      (p_round->>'interview_minutes')::int, (p_round->>'buffer_minutes')::int,
      (p_round->>'rebook_hours_before')::int,
      (p_round->>'application_opens_at')::timestamptz, (p_round->>'application_closes_at')::timestamptz,
      (p_round->>'interviews_from')::date, (p_round->>'interviews_until')::date,
      (p_round->>'deletion_date')::date, p_round->>'mail_transport', p_round->>'reply_to',
      coalesce(p_round->>'privacy_notice', '')
    ) returning id into v_round_id;
  else
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
      privacy_notice = coalesce(p_round->>'privacy_notice', '')
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
  -- position is unique per round; negative positions free 0, 1, 2 ... for the
  -- new order below.
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
      insert into public.departments (round_id, position, name, description)
      values (v_round_id, v_pos, v_item->>'name', coalesce(v_item->>'description', ''));
    else
      update public.departments
      set position = v_pos, name = v_item->>'name', description = coalesce(v_item->>'description', '')
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

revoke execute on function public.save_round(jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_round(jsonb, jsonb, jsonb, jsonb) to authenticated;
