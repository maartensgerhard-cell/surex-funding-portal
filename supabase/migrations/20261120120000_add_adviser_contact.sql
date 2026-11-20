-- SureX Funding Portal: add adviser contact and secure follow-up access
-- Run ONLY in the surex-funding-portal Supabase project.

alter table public.funding_requests
  add column if not exists adviser_email text,
  add column if not exists access_token_hash text,
  add column if not exists access_token_expires_at timestamptz,
  add column if not exists request_reference text;

create unique index if not exists funding_requests_reference_uidx
  on public.funding_requests(request_reference)
  where request_reference is not null;

create index if not exists funding_requests_email_idx
  on public.funding_requests(adviser_email);

-- Keep the tables private: no public or anon policies are created here.
-- The application will access records only through protected server-side functions.
