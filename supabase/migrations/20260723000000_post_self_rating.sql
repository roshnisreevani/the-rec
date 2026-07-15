-- Self-rating on posts: author rates their own performance 1–5 at post time.
-- The rating is visible to everyone EXCEPT the author (enforced in app code).
alter table posts
  add column if not exists self_rating smallint check (self_rating between 1 and 5);
