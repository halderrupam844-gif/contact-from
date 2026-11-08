-- Rate limiting for the public contact submission Edge Function.
create table if not exists public.contact_submission_limits (
  ip_hash text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0
);

alter table public.contact_submission_limits enable row level security;
revoke all on table public.contact_submission_limits from anon, authenticated, public;

create or replace function public.consume_contact_submission(p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
begin
  insert into public.contact_submission_limits (ip_hash, window_started_at, request_count)
  values (p_ip_hash, now(), 1)
  on conflict (ip_hash) do update
  set
    window_started_at = case
      when public.contact_submission_limits.window_started_at < now() - interval '1 hour'
      then now()
      else public.contact_submission_limits.window_started_at
    end,
    request_count = case
      when public.contact_submission_limits.window_started_at < now() - interval '1 hour'
      then 1
      else public.contact_submission_limits.request_count + 1
    end
  returning request_count into current_count;

  return current_count <= 5;
end;
$$;

revoke all on function public.consume_contact_submission(text) from public, anon, authenticated;
grant execute on function public.consume_contact_submission(text) to service_role;
