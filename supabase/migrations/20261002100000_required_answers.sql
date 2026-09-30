-- Round 2026 (Fynn and Bian, 30.09.2026):
--   - rounds.required_answers: how many questions an application must answer
--     (e.g. 2 of 3, any of them). null = every question, as before.
--   - applicants.department_all: "Ich bin für alle Ressorts offen", its own
--     answer next to department_unsure ("weiß ich noch nicht"); both leave the
--     department choice empty.
-- save_round writes required_answers; save_application stores only non-blank
-- answers and checks the minimum instead of "every question".

alter table public.rounds
  add column required_answers int check (required_answers >= 0);

alter table public.applicants
  add column department_all boolean not null default false,
  add constraint applicants_department_all_or_unsure check (not (department_all and department_unsure));

-- ---------------------------------------------------------------------------
-- save_round: same as 20260928140000_save_round.sql, plus required_answers.
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

-- ---------------------------------------------------------------------------
-- save_application: same as 20260928170000_privacy_confirmed.sql, plus
-- department_all, only non-blank answers, and the minimum of answered
-- questions: rounds.required_answers (capped at the number of questions),
-- or every question when it is null.
-- ---------------------------------------------------------------------------

create or replace function public.save_application(
  p_create boolean,
  p_applicant jsonb,
  p_answers jsonb,
  p_department_ids jsonb
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := (p_applicant->>'id')::uuid;
  v_round_id uuid;
  v_questions int;
  v_required int;
  v_answered int;
begin
  -- Nested on purpose: service_role is not granted the private schema.
  if current_user <> 'service_role' then
    if not (select private.is_admin()) then
      raise exception 'only admins may save an application' using errcode = '42501';
    end if;
  end if;

  -- ----- applicant -----
  if p_create then
    insert into public.applicants (
      id, round_id, name, email, cohort, department_unsure, department_all, cv_path, token_hash, source, privacy_confirmed_at
    ) values (
      v_id, (p_applicant->>'round_id')::uuid, p_applicant->>'name', p_applicant->>'email',
      p_applicant->>'cohort', coalesce((p_applicant->>'department_unsure')::boolean, false),
      coalesce((p_applicant->>'department_all')::boolean, false),
      p_applicant->>'cv_path', p_applicant->>'token_hash', coalesce(p_applicant->>'source', 'form'),
      case when coalesce((p_applicant->>'privacy_confirmed')::boolean, false) then now() end
    ) returning round_id into v_round_id;
  else
    update public.applicants set
      name = p_applicant->>'name',
      cohort = p_applicant->>'cohort',
      department_unsure = coalesce((p_applicant->>'department_unsure')::boolean, false),
      department_all = coalesce((p_applicant->>'department_all')::boolean, false),
      cv_path = case when p_applicant ? 'cv_path' then p_applicant->>'cv_path' else cv_path end,
      updated_at = now()
    where id = v_id
    returning round_id into v_round_id;
    if not found then
      raise exception 'applicant not found' using errcode = 'P0002';
    end if;
  end if;

  -- ----- answers -----
  if exists (
    select 1 from jsonb_array_elements(p_answers) e
    where not exists (
      select 1 from public.questions q
      where q.id = (e->>'question_id')::uuid and q.round_id = v_round_id
    )
  ) then
    raise exception 'question not in this round' using errcode = 'P0002';
  end if;

  delete from public.answers where applicant_id = v_id;
  insert into public.answers (applicant_id, question_id, text)
  select v_id, (e->>'question_id')::uuid, e->>'text'
  from jsonb_array_elements(p_answers) e
  where btrim(coalesce(e->>'text', '')) <> '';

  select count(*) into v_questions from public.questions where round_id = v_round_id;
  select least(coalesce(r.required_answers, v_questions), v_questions) into v_required
  from public.rounds r where r.id = v_round_id;
  select count(*) into v_answered from public.answers where applicant_id = v_id;
  if v_answered < v_required then
    raise exception '% of % required answers', v_answered, v_required
      using errcode = 'P0001', hint = 'answer_missing';
  end if;

  -- ----- departments -----
  if exists (
    select 1 from jsonb_array_elements_text(p_department_ids) d
    where not exists (
      select 1 from public.departments x
      where x.id = d::uuid and x.round_id = v_round_id
    )
  ) then
    raise exception 'department not in this round' using errcode = 'P0002';
  end if;

  delete from public.applicant_departments where applicant_id = v_id;
  insert into public.applicant_departments (applicant_id, department_id)
  select distinct v_id, d::uuid from jsonb_array_elements_text(p_department_ids) d;

  return v_id;
end;
$$;
