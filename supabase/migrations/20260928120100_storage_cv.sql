-- Private bucket for CVs: PDF only, max. 10 MB (10 * 1024 * 1024 bytes).
-- Access policies on storage.objects follow in phase 3.
-- Path convention: <round_id>/<applicant_id>.pdf, so a round's files share one prefix.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cv', 'cv', false, 10485760, array['application/pdf']);
