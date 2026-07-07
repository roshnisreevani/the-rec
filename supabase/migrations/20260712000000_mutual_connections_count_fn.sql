-- Computing "X mutual connections" between the current user and someone
-- else's profile requires seeing the *other* user's accepted-connection
-- peers, which normal RLS won't allow (connections rows are only visible to
-- the two people involved). A SECURITY DEFINER function is the standard,
-- safe way around this: it runs with elevated privilege internally but only
-- ever returns a single count, never the underlying rows, so it can't be
-- used to enumerate anyone's connections.
create or replace function public.mutual_connections_count(other_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  result integer;
begin
  if auth.uid() is null then
    return 0;
  end if;

  select count(*) into result
  from (
    select case when user_a = auth.uid() then user_b else user_a end as peer
    from public.connections
    where status = 'accepted' and (user_a = auth.uid() or user_b = auth.uid())
  ) mine
  join (
    select case when user_a = other_user_id then user_b else user_a end as peer
    from public.connections
    where status = 'accepted' and (user_a = other_user_id or user_b = other_user_id)
  ) theirs
  on mine.peer = theirs.peer;

  return coalesce(result, 0);
end;
$$;

grant execute on function public.mutual_connections_count(uuid) to authenticated;
