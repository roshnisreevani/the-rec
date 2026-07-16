-- Free-text location on posts, entered by the author (no GPS, no maps API —
-- same pattern as the existing free-text location field on profiles).
alter table posts
  add column if not exists location text;
