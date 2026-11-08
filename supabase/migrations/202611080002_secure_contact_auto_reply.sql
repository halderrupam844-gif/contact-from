-- Harden the public contact endpoint.
-- The browser must submit through the Edge Function, which applies validation and rate limits.

alter table public.contact_submission_limits
  add column if not exists request_timestamps timestamptz[] not null default array[]::timestamptz[];

create or replace function public.consume_contact_submission(p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_timestamps timestamptz[];
begin
  insert into public.contact_submission_limits (ip_hash, request_timestamps, window_started_at, request_count)
  values (p_ip_hash, array[now()], now(), 1)
  on conflict (ip_hash) do update
  set
    request_timestamps = (
      select coalesce(array_agg(ts order by ts), array[]::timestamptz[])
      from unnest(public.contact_submission_limits.request_timestamps) as recent(ts)
      where ts > now() - interval '1 hour'
    ) || array[now()],
    window_started_at = now(),
    request_count = cardinality(
      (
        select coalesce(array_agg(ts order by ts), array[]::timestamptz[])
        from unnest(public.contact_submission_limits.request_timestamps) as recent(ts)
        where ts > now() - interval '1 hour'
      ) || array[now()]
    )
  returning request_timestamps into current_timestamps;

  return cardinality(current_timestamps) <= 5;
end;
$$;

revoke all on function public.consume_contact_submission(text) from public, anon, authenticated;
grant execute on function public.consume_contact_submission(text) to service_role;

-- Prevent callers from bypassing the Edge Function via the public Data API.
drop policy if exists "Visitors can submit contact forms" on public.contacts;
revoke insert on table public.contacts from anon, authenticated, public;
