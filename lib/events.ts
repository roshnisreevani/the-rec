import { supabase } from '@/lib/supabase';

export type RsvpStatus = 'attending' | 'declined';

export type EventAttendee = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  status: RsvpStatus;
};

export type MvpTallyRow = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  votes: number;
};

export type GroupEvent = {
  id: string;
  groupId: string;
  title: string;
  sport: string | null;
  eventDate: string;
  location: string;
  maxSpots: number | null; // null = unlimited
  createdBy: string;
  attendingCount: number;
  attendees: EventAttendee[]; // attending, first-committed-first — facepile + MVP pool
  decliners: EventAttendee[]; // declined, for the attendee list modal
  myStatus: RsvpStatus | null;
  myVoteFor: string | null;
  mvpTally: MvpTallyRow[]; // sorted most votes first (concluded events)
};

export function isConcluded(event: Pick<GroupEvent, 'eventDate'>): boolean {
  return new Date(event.eventDate).getTime() <= Date.now();
}

export function isFull(event: Pick<GroupEvent, 'maxSpots' | 'attendingCount'>): boolean {
  return event.maxSpots !== null && event.attendingCount >= event.maxSpots;
}

export function formatEventDate(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${time}`;
}

type EventRow = {
  id: string;
  group_id: string;
  title: string;
  sport: string | null;
  event_date: string;
  location: string;
  max_spots: number | null;
  created_by: string;
};

type RsvpRow = {
  event_id: string;
  user_id: string;
  status: RsvpStatus;
  responded_at: string;
  profile: { name: string | null; avatar_url: string | null } | null;
};

type VoteRow = {
  event_id: string;
  voter_id: string;
  voted_for_id: string;
};

/**
 * All of a group's events with RSVP counts, the current user's response,
 * and — for concluded events — the MVP vote tally. Ordered upcoming-soonest
 * first, then concluded most-recent first. RLS restricts everything to
 * group members.
 */
export async function fetchGroupEvents(groupId: string, userId: string): Promise<GroupEvent[]> {
  const { data: eventRows, error: eventsError } = await supabase
    .from('group_events')
    .select('*')
    .eq('group_id', groupId)
    .order('event_date', { ascending: false });

  if (eventsError) throw eventsError;
  const events = (eventRows ?? []) as EventRow[];
  if (events.length === 0) return [];

  const eventIds = events.map((e) => e.id);
  const [rsvpsRes, votesRes] = await Promise.all([
    supabase
      .from('group_event_rsvps')
      .select('event_id, user_id, status, responded_at, profile:profiles!group_event_rsvps_user_id_fkey(name, avatar_url)')
      .in('event_id', eventIds),
    supabase.from('group_event_mvp_votes').select('event_id, voter_id, voted_for_id').in('event_id', eventIds),
  ]);

  if (rsvpsRes.error) throw rsvpsRes.error;
  if (votesRes.error) throw votesRes.error;

  const rsvps = (rsvpsRes.data ?? []) as unknown as RsvpRow[];
  const votes = (votesRes.data ?? []) as VoteRow[];

  const toAttendee = (r: RsvpRow): EventAttendee => ({
    userId: r.user_id,
    name: r.profile?.name?.trim() || 'Nameless legend',
    avatarUrl: r.profile?.avatar_url ?? null,
    status: r.status,
  });

  const result = events.map((row) => {
    // First-committed-first — keeps the facepile/attendee ordering stable.
    const eventRsvps = rsvps
      .filter((r) => r.event_id === row.id)
      .sort((a, b) => a.responded_at.localeCompare(b.responded_at));
    const attendees: EventAttendee[] = eventRsvps.filter((r) => r.status === 'attending').map(toAttendee);
    const decliners: EventAttendee[] = eventRsvps.filter((r) => r.status === 'declined').map(toAttendee);

    const eventVotes = votes.filter((v) => v.event_id === row.id);
    const voteCounts = new Map<string, number>();
    for (const v of eventVotes) {
      voteCounts.set(v.voted_for_id, (voteCounts.get(v.voted_for_id) ?? 0) + 1);
    }
    // Only attendees can receive votes (DB-enforced), so names resolve from
    // the attendee list.
    const mvpTally: MvpTallyRow[] = attendees
      .map((a) => ({ userId: a.userId, name: a.name, avatarUrl: a.avatarUrl, votes: voteCounts.get(a.userId) ?? 0 }))
      .filter((t) => t.votes > 0)
      .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));

    return {
      id: row.id,
      groupId: row.group_id,
      title: row.title,
      sport: row.sport,
      eventDate: row.event_date,
      location: row.location,
      maxSpots: row.max_spots,
      createdBy: row.created_by,
      attendingCount: attendees.length,
      attendees,
      decliners,
      myStatus: eventRsvps.find((r) => r.user_id === userId)?.status ?? null,
      myVoteFor: eventVotes.find((v) => v.voter_id === userId)?.voted_for_id ?? null,
      mvpTally,
    };
  });

  // Upcoming soonest-first, then concluded most-recent-first.
  const upcoming = result.filter((e) => !isConcluded(e)).sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  const concluded = result.filter(isConcluded);
  return [...upcoming, ...concluded];
}

export type UpcomingEvent = {
  id: string;
  groupId: string;
  groupName: string;
  title: string;
  sport: string | null;
  eventDate: string;
  attendingCount: number;
  myStatus: RsvpStatus;
};

type MyRsvpRow = {
  status: RsvpStatus;
  event: {
    id: string;
    group_id: string;
    title: string;
    sport: string | null;
    event_date: string;
    group: { name: string } | null;
  } | null;
};

/**
 * Every upcoming game the user has RSVP'd "attending" to, across all of
 * their groups — powers the Profile "Upcoming" section. Attending-only
 * (declined RSVPs aren't a game you're planning to show up to), soonest
 * first. RLS restricts this to the user's own RSVP rows either way.
 */
export async function fetchMyUpcomingEvents(userId: string): Promise<UpcomingEvent[]> {
  const { data, error } = await supabase
    .from('group_event_rsvps')
    .select(
      'status, event:group_events!group_event_rsvps_event_id_fkey(id, group_id, title, sport, event_date, group:groups(name))'
    )
    .eq('user_id', userId)
    .eq('status', 'attending');

  if (error) throw error;
  const rows = (data ?? []) as unknown as MyRsvpRow[];

  const eventIds = rows.map((r) => r.event?.id).filter((id): id is string => !!id);
  let counts = new Map<string, number>();
  if (eventIds.length > 0) {
    const { data: rsvpRows, error: countError } = await supabase
      .from('group_event_rsvps')
      .select('event_id')
      .in('event_id', eventIds)
      .eq('status', 'attending');
    if (countError) throw countError;
    for (const r of rsvpRows ?? []) {
      counts.set(r.event_id, (counts.get(r.event_id) ?? 0) + 1);
    }
  }

  return rows
    .filter((r) => r.event && !isConcluded({ eventDate: r.event.event_date }))
    .map((r) => ({
      id: r.event!.id,
      groupId: r.event!.group_id,
      groupName: r.event!.group?.name ?? 'a group',
      title: r.event!.title,
      sport: r.event!.sport,
      eventDate: r.event!.event_date,
      attendingCount: counts.get(r.event!.id) ?? 0,
      myStatus: r.status,
    }))
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));
}

/** Owner-only (enforced by RLS). */
export async function createEvent(input: {
  groupId: string;
  createdBy: string;
  title: string;
  sport: string | null;
  eventDate: Date;
  location: string;
  maxSpots: number | null;
}): Promise<void> {
  const { error } = await supabase.from('group_events').insert({
    group_id: input.groupId,
    created_by: input.createdBy,
    title: input.title,
    sport: input.sport,
    event_date: input.eventDate.toISOString(),
    location: input.location,
    max_spots: input.maxSpots,
  });
  if (error) throw error;
}

/**
 * Set or change the current user's RSVP. Refuses to take a spot on a full
 * event unless the user already holds one (changing your own response always
 * works) — the same rule the database's event_has_spot() policy enforces;
 * this check just gives a friendlier error first.
 */
export async function rsvpToEvent(event: GroupEvent, userId: string, status: RsvpStatus): Promise<void> {
  if (status === 'attending' && event.myStatus !== 'attending' && isFull(event)) {
    throw new Error('This game is full.');
  }

  const { error } = await supabase.from('group_event_rsvps').upsert(
    { event_id: event.id, user_id: userId, status, responded_at: new Date().toISOString() },
    { onConflict: 'event_id,user_id' }
  );
  if (error) throw error;
}

/** Vote (or change your vote) for an event's MVP. The database refuses votes
 * before event_date, for non-attendee candidates, and self-votes. */
export async function voteMvp(eventId: string, voterId: string, votedForId: string): Promise<void> {
  const { error } = await supabase.from('group_event_mvp_votes').upsert(
    { event_id: eventId, voter_id: voterId, voted_for_id: votedForId },
    { onConflict: 'event_id,voter_id' }
  );
  if (error) throw error;
}
