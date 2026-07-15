-- Single-elimination tournament brackets scoped to a group.
create table brackets (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  created_by uuid not null references profiles(id),
  name text not null,
  sport_tag text,
  description text,
  start_date date,
  seeding text not null default 'random' check (seeding in ('random', 'manual')),
  status text not null default 'active' check (status in ('active', 'completed')),
  created_at timestamptz not null default now()
);

-- Each participant slot (snapshot of name at creation time).
create table bracket_participants (
  id uuid primary key default gen_random_uuid(),
  bracket_id uuid not null references brackets(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  display_name text not null,
  seed int not null,
  created_at timestamptz not null default now(),
  unique(bracket_id, seed)
);

-- One row per match; later rounds start with null participants until winners advance.
create table bracket_matches (
  id uuid primary key default gen_random_uuid(),
  bracket_id uuid not null references brackets(id) on delete cascade,
  round int not null,
  match_index int not null,
  participant_a_id uuid references bracket_participants(id) on delete set null,
  participant_b_id uuid references bracket_participants(id) on delete set null,
  winner_id uuid references bracket_participants(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(bracket_id, round, match_index)
);

alter table brackets enable row level security;
alter table bracket_participants enable row level security;
alter table bracket_matches enable row level security;

-- Group members can read brackets in their groups.
create policy "group members read brackets"
  on brackets for select
  using (is_group_member(auth.uid(), group_id));

create policy "group members create brackets"
  on brackets for insert
  with check (is_group_member(auth.uid(), group_id) and auth.uid() = created_by);

create policy "bracket creator or owner can update"
  on brackets for update
  using (auth.uid() = created_by or is_group_owner(auth.uid(), group_id));

create policy "bracket creator or owner can delete"
  on brackets for delete
  using (auth.uid() = created_by or is_group_owner(auth.uid(), group_id));

create policy "group members read participants"
  on bracket_participants for select
  using (exists (
    select 1 from brackets b where b.id = bracket_id and is_group_member(auth.uid(), b.group_id)
  ));

create policy "group members insert participants"
  on bracket_participants for insert
  with check (exists (
    select 1 from brackets b where b.id = bracket_id and is_group_member(auth.uid(), b.group_id)
  ));

create policy "group members read matches"
  on bracket_matches for select
  using (exists (
    select 1 from brackets b where b.id = bracket_id and is_group_member(auth.uid(), b.group_id)
  ));

create policy "group members insert matches"
  on bracket_matches for insert
  with check (exists (
    select 1 from brackets b where b.id = bracket_id and is_group_member(auth.uid(), b.group_id)
  ));

create policy "group members update matches"
  on bracket_matches for update
  using (exists (
    select 1 from brackets b where b.id = bracket_id and is_group_member(auth.uid(), b.group_id)
  ));
