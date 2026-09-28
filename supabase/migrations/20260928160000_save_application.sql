-- Phase 7: create or edit an application with its answers and department
-- choices in one transaction. security invoker:
--   - the server calls it with the secret key (service_role) for the public
--     form and the applicant page /b/[token], after checking deadline and token;
--   - an admin calls it with their session (/einstellungen/erfassen), and the
--     admin's RLS policies apply to every write below.
-- Members and anon may not call it.
--
-- p_create:         true = insert a new applicant, false = edit an existing one
-- p_applicant:      { id, round_id, name, email, cohort, department_unsure,
--                     cv_path, token_hash, source }
--                   id is chosen by the server beforehand, because the CV is
--                   uploaded to <round_id>/<id>.pdf before this call.
--                   On edit only name, cohort, department_unsure and cv_path
--                   (if present) change; email, token and source stay.
-- p_answers:        [{ question_id, text }], one per question of the round
-- p_department_ids: [department_id, ...], replaces the previous choice
--
-- Every question of the round must have a non-blank answer, and questions and
-- departments must belong to the applicant's round.

create function public.save_application(
  p_create boolean,
  p_applicant jsonb,
  p_answers jsonb,
  p_department_ids jsonb
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := (p_applicant->>'id')::uuid;
  v_round_id uuid;
  v_missing int;
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
      id, round_id, name, email, cohort, department_unsure, cv_path, token_hash, source
    ) values (
      v_id, (p_applicant->>'round_id')::uuid, p_applicant->>'name', p_applicant->>'email',
      p_applicant->>'cohort', coalesce((p_applicant->>'department_unsure')::boolean, false),
      p_applicant->>'cv_path', p_applicant->>'token_hash', coalesce(p_applicant->>'source', 'form')
    ) returning round_id into v_round_id;
  else
    update public.applicants set
      name = p_applicant->>'name',
      cohort = p_applicant->>'cohort',
      department_unsure = coalesce((p_applicant->>'department_unsure')::boolean, false),
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
  from jsonb_array_elements(p_answers) e;

  select count(*) into v_missing
  from public.questions q
  where q.round_id = v_round_id
    and not exists (
      select 1 from public.answers a
      where a.applicant_id = v_id and a.question_id = q.id and btrim(a.text) <> ''
    );
  if v_missing > 0 then
    raise exception '% question(s) without an answer', v_missing
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

revoke execute on function public.save_application(boolean, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_application(boolean, jsonb, jsonb, jsonb) to authenticated, service_role;
