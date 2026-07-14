import { supabase } from '@/lib/supabase';

// Real replacement for MOCK_STREAK_WEEKS. Deliberately loose: any activity —
// literally just opening the app counts, same as posting, editing your
// profile, or poking around Groups — logs today as an "active day" for the
// streak. This is a friendly "you showed up" counter, not an attendance or
// performance stat.

/** Logs today (local date) as an active day for this user. Safe to call on
 * every app open — upserted, so repeat calls the same day are no-ops. */
export async function recordActivityToday(userId: string): Promise<void> {
  const today = new Date();
  const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const { error } = await supabase
    .from('activity_days')
    .upsert({ user_id: userId, day }, { onConflict: 'user_id,day', ignoreDuplicates: true });

  if (error) console.warn('[activity-streak] could not log activity', error);
}

/** Monday-start ISO-ish week key for a given date, e.g. "2026-W29". Used only
 * to group activity days into weeks — doesn't need to be true ISO 8601, just
 * consistent. */
function weekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // getUTCDay(): 0 = Sunday..6 = Saturday. Shift so Monday = start of week.
  const dayOfWeek = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayOfWeek);
  return d.toISOString().slice(0, 10);
}

/**
 * Fetches the user's activity log and returns how many consecutive weeks
 * (including the current one) have at least one active day, walking
 * backward from this week. A gap of even one week breaks the streak.
 */
export async function fetchActivityStreakWeeks(userId: string): Promise<number> {
  const { data, error } = await supabase.from('activity_days').select('day').eq('user_id', userId);
  if (error) throw error;

  const activeWeeks = new Set((data ?? []).map((row) => weekKey(new Date(`${row.day}T00:00:00Z`))));

  let streak = 0;
  const cursor = new Date();
  for (;;) {
    const key = weekKey(cursor);
    if (!activeWeeks.has(key)) break;
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 7);
  }

  return streak;
}
