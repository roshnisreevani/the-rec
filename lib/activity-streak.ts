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
