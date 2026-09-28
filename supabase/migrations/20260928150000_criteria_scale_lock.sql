-- Phase 6: the scale of a criterion cannot change once feedback scores exist
-- for it (drafts included); old scores would fall outside the new scale.
-- Renaming, reweighting and reordering stay possible.
-- security definer: the sight lock hides other members' drafts from admins.

create function public.check_criterion_scale_in_use() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.scale_min, new.scale_max) is distinct from (old.scale_min, old.scale_max)
     and exists (select 1 from public.feedback_scores where criterion_id = new.id) then
    raise exception 'scale of criterion % cannot change, scores exist', new.id
      using errcode = 'P0001', hint = 'scale_in_use', detail = new.id::text;
  end if;
  return new;
end;
$$;

create trigger criteria_scale_lock
  before update on public.criteria
  for each row execute function public.check_criterion_scale_in_use();

revoke execute on function public.check_criterion_scale_in_use() from public, anon, authenticated;
