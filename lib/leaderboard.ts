import { fetchGroupDetail } from '@/lib/groups';
import { supabase } from '@/lib/supabase';

export type LeaderboardEditMode = 'commissioner' | 'anyone';

export type LeaderboardSettings = {
  trackWinsLosses: boolean;
  trackWinPct: boolean;
  trackGamesPlayed: boolean;
  trackAttendance: boolean;
  editMode: LeaderboardEditMode;
};

export type LeaderboardEntry = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  wins: number;
  losses: number;
  gamesPlayed: number;
  attendance: number;
  winPct: number | null; // derived; null until the member has a decided game
};

export type Leaderboard = {
  settings: LeaderboardSettings;
  entries: LeaderboardEntry[]; // ranked by the primary tracked metric
  isCommissioner: boolean; // current user owns the group
};

export type EntryStats = Pick<LeaderboardEntry, 'wins' | 'losses' | 'gamesPlayed' | 'attendance'>;

const DEFAULT_SETTINGS: LeaderboardSettings = {
  trackWinsLosses: true,
  trackWinPct: false,
  trackGamesPlayed: true,
  trackAttendance: false,
  editMode: 'commissioner',
};

type SettingsRow = {
  track_wins_losses: boolean;
  track_win_pct: boolean;
  track_games_played: boolean;
  track_attendance: boolean;
  edit_mode: LeaderboardEditMode;
};

type EntryRow = {
  user_id: string;
  wins: number;
  losses: number;
  games_played: number;
  attendance: number;
};

/** Ranking: primary tracked metric decides, in this precedence — Win% →
 * W-L → GP → attendance. Ties break toward more wins, then name. */
function rank(entries: LeaderboardEntry[], settings: LeaderboardSettings): LeaderboardEntry[] {
  const primary = (e: LeaderboardEntry): number => {
    if (settings.trackWinPct) return e.winPct ?? -1;
    if (settings.trackWinsLosses) return e.wins;
    if (settings.trackGamesPlayed) return e.gamesPlayed;
    if (settings.trackAttendance) return e.attendance;
    return 0;
  };
  return [...entries].sort(
    (a, b) => primary(b) - primary(a) || b.wins - a.wins || a.name.localeCompare(b.name)
  );
}

/**
 * The whole leaderboard for a group: settings, plus one ranked row per
 * current member (members without an entry yet appear with zeros). RLS
 * restricts everything here to group members.
 */
export async function fetchLeaderboard(groupId: string, userId: string): Promise<Leaderboard | null> {
  const [detail, settingsRes, entriesRes] = await Promise.all([
    fetchGroupDetail(groupId, userId),
    supabase.from('group_leaderboard_settings').select('*').eq('group_id', groupId).maybeSingle(),
    supabase.from('group_leaderboard_entries').select('*').eq('group_id', groupId),
  ]);

  if (!detail) return null;
  if (settingsRes.error) throw settingsRes.error;
  if (entriesRes.error) throw entriesRes.error;

  const row = settingsRes.data as SettingsRow | null;
  const settings: LeaderboardSettings = row
    ? {
        trackWinsLosses: row.track_wins_losses,
        trackWinPct: row.track_win_pct,
        trackGamesPlayed: row.track_games_played,
        trackAttendance: row.track_attendance,
        editMode: row.edit_mode,
      }
    : DEFAULT_SETTINGS; // row missing only if the migration backfill hasn't run

  const byUserId = new Map(((entriesRes.data ?? []) as EntryRow[]).map((e) => [e.user_id, e]));

  const entries = detail.members.map((member) => {
    const e = byUserId.get(member.userId);
    const wins = e?.wins ?? 0;
    const losses = e?.losses ?? 0;
    const decided = wins + losses;
    return {
      userId: member.userId,
      name: member.name,
      avatarUrl: member.avatarUrl,
      wins,
      losses,
      gamesPlayed: e?.games_played ?? 0,
      attendance: e?.attendance ?? 0,
      winPct: decided > 0 ? wins / decided : null,
    };
  });

  return {
    settings,
    entries: rank(entries, settings),
    isCommissioner: detail.group.myRole === 'owner',
  };
}

/** Commissioner-only (enforced by RLS). Upsert so it also heals a missing
 * settings row on pre-migration groups. */
export async function updateLeaderboardSettings(
  groupId: string,
  settings: LeaderboardSettings
): Promise<void> {
  const { error } = await supabase.from('group_leaderboard_settings').upsert(
    {
      group_id: groupId,
      track_wins_losses: settings.trackWinsLosses,
      track_win_pct: settings.trackWinPct,
      track_games_played: settings.trackGamesPlayed,
      track_attendance: settings.trackAttendance,
      edit_mode: settings.editMode,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'group_id' }
  );
  if (error) throw error;
}

/** Write a member's stats. Who may call this is enforced by RLS via
 * can_edit_leaderboard(): the commissioner always, any member only when the
 * group's edit mode is 'anyone'. */
export async function saveLeaderboardEntry(
  groupId: string,
  memberUserId: string,
  stats: EntryStats
): Promise<void> {
  const { error } = await supabase.from('group_leaderboard_entries').upsert(
    {
      group_id: groupId,
      user_id: memberUserId,
      wins: stats.wins,
      losses: stats.losses,
      games_played: stats.gamesPlayed,
      attendance: stats.attendance,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'group_id,user_id' }
  );
  if (error) throw error;
}
