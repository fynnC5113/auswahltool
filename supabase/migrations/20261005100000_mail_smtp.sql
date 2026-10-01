-- Mail via any SMTP server (01.10.2026): the Law Clinic Orga-Team sends from
-- team@bls-lc.de over a member's mailbox.org account, under a DPA. Gmail
-- stays as the fallback; the round chooses the transport.

alter table public.rounds drop constraint if exists rounds_mail_transport_check;
alter table public.rounds
  add constraint rounds_mail_transport_check check (mail_transport in ('gmail', 'graph', 'smtp'));
