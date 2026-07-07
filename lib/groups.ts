import { supabase } from '@/lib/supabase';

export type GroupType = 'friend_group' | 'team' | 'pickup_group' | 'league';
export type GroupPrivacy = 'private' | 'public';
export type GroupRole = 'owner' | 'member';

export const GROUP_TYPE_LABELS: Record<GroupType, string> = {
  friend_group: 'Friend Group',
  team: 'Team',
  pickup_group: 'Pickup Group',
  league: 'League',
};

export const GROUP_TYPES: GroupType[] = ['friend_group', 'team', 'pickup_group', 'league'];

export type Group = {
  id: string;
  name: string;
  description: string;
  groupType: GroupType;
  privacy: GroupPrivacy;
  avatarUrl: string | null;
  createdBy: string;
  createdAt: string;
  memberCount: number;
  myRole: GroupRole;
  activityPreview: string;
};

export type GroupMember = {
  id: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: GroupRole;
  joinedAt: string;
};

export type PendingGroupInvite = {
  id: string;
  groupId: string;
  groupName: string;
  groupAvatarUrl: string | null;
  invitedByName: string;
  createdAt: string;
};

export type JoinRequest = {
  id: string;
  groupId: string;
  userId: string;
  userName: string;
  userAvatarUrl: string | null;
  createdAt: string;
};

export type InvitablePerson = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

export type GroupInvitePreview = {
  groupId: string;
  name: string;
  description: string;
  groupType: GroupType;
  privacy: GroupPrivacy;
  avatarUrl: string | null;
  memberCount: number;
};

export type JoinViaInviteResult = 'joined' | 'requested' | 'already_member';

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function generateInviteCode(): string {
  return Math.random().toString(36).slice(2, 10);
}

type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  group_type: GroupType;
  privacy: GroupPrivacy;
  avatar_url: string | null;
  created_by: string;
  created_at: string;
  group_members: { count: number }[] | null;
};

/**
 * All groups the given user belongs to, newest-membership first. Each
 * group's "activity preview" is the most recent join event in that group
 * (falling back to "Created <time ago>" for a brand-new solo group) —
 * there's no real group-scoped feed yet, so membership joins are the only
 * activity signal available.
 */
export async function fetchMyGroups(userId: string): Promise<Group[]> {
  const { data: memberships, error: membershipError } = await supabase
    .from('group_members')
    .select('group_id, role, joined_at')
    .eq('user_id', userId)
    .order('joined_at', { ascending: false });

  if (membershipError) throw membershipError;
  if (!memberships || memberships.length === 0) return [];

  const groupIds = memberships.map((m) => m.group_id as string);
  const roleByGroupId = new Map(memberships.map((m) => [m.group_id as string, m.role as GroupRole]));

  const [{ data: groupRows, error: groupsError }, { data: recentRows, error: recentError }] = await Promise.all([
    supabase.from('groups').select('*, group_members(count)').in('id', groupIds),
    supabase
      .from('group_members')
      .select('group_id, user_id, joined_at, profiles(name)')
      .in('group_id', groupIds)
      .order('joined_at', { ascending: false }),
  ]);

  if (groupsError) throw groupsError;
  if (recentError) throw recentError;

  const createdByByGroupId = new Map(
    ((groupRows ?? []) as unknown as GroupRow[]).map((row) => [row.id, row.created_by])
  );

  const latestJoinByGroupId = new Map<string, { userId: string; name: string; joinedAt: string }>();
  for (const row of (recentRows ?? []) as unknown as Array<{
    group_id: string;
    user_id: string;
    joined_at: string;
    profiles: { name: string | null } | null;
  }>) {
    if (latestJoinByGroupId.has(row.group_id)) continue;
    latestJoinByGroupId.set(row.group_id, {
      userId: row.user_id,
      name: row.profiles?.name?.trim() || 'Someone',
      joinedAt: row.joined_at,
    });
  }

  return ((groupRows ?? []) as unknown as GroupRow[])
    .map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? '',
      groupType: row.group_type,
      privacy: row.privacy,
      avatarUrl: row.avatar_url ?? null,
      createdBy: row.created_by,
      createdAt: row.created_at,
      memberCount: row.group_members?.[0]?.count ?? 1,
      myRole: roleByGroupId.get(row.id) ?? 'member',
      activityPreview: (() => {
        const latestJoin = latestJoinByGroupId.get(row.id);
        return latestJoin && latestJoin.userId !== createdByByGroupId.get(row.id)
          ? `${latestJoin.name} joined ${timeAgo(latestJoin.joinedAt)}`
          : `Created ${timeAgo(row.created_at)}`;
      })(),
    }))
    .sort((a, b) => {
      const aJoined = memberships.find((m) => m.group_id === a.id)?.joined_at ?? '';
      const bJoined = memberships.find((m) => m.group_id === b.id)?.joined_at ?? '';
      return bJoined.localeCompare(aJoined);
    });
}

export async function createGroup(input: {
  name: string;
  description: string;
  groupType: GroupType;
  privacy: GroupPrivacy;
  avatarUrl: string | null;
  createdBy: string;
}): Promise<Group> {
  const { data, error } = await supabase
    .from('groups')
    .insert({
      name: input.name,
      description: input.description,
      group_type: input.groupType,
      privacy: input.privacy,
      avatar_url: input.avatarUrl,
      created_by: input.createdBy,
    })
    .select('*')
    .single();

  if (error) throw error;

  const row = data as unknown as Omit<GroupRow, 'group_members'>;
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    groupType: row.group_type,
    privacy: row.privacy,
    avatarUrl: row.avatar_url ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    memberCount: 1,
    myRole: 'owner',
    activityPreview: `Created ${timeAgo(row.created_at)}`,
  };
}

export async function fetchGroupDetail(
  groupId: string,
  userId: string
): Promise<{ group: Group; members: GroupMember[] } | null> {
  const { data: groupRow, error: groupError } = await supabase
    .from('groups')
    .select('*, group_members(count)')
    .eq('id', groupId)
    .maybeSingle();

  if (groupError) throw groupError;
  if (!groupRow) return null;

  const { data: memberRows, error: membersError } = await supabase
    .from('group_members')
    .select('id, user_id, role, joined_at, profiles(name, avatar_url)')
    .eq('group_id', groupId)
    .order('role', { ascending: true })
    .order('joined_at', { ascending: true });

  if (membersError) throw membersError;

  const members: GroupMember[] = ((memberRows ?? []) as unknown as Array<{
    id: string;
    user_id: string;
    role: GroupRole;
    joined_at: string;
    profiles: { name: string | null; avatar_url: string | null } | null;
  }>).map((row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.profiles?.name?.trim() || 'Nameless legend',
    avatarUrl: row.profiles?.avatar_url ?? null,
    role: row.role,
    joinedAt: row.joined_at,
  }));

  const row = groupRow as unknown as GroupRow;
  const myMembership = members.find((m) => m.userId === userId);
  const latestJoin = members.slice().sort((a, b) => b.joinedAt.localeCompare(a.joinedAt))[0];

  const group: Group = {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    groupType: row.group_type,
    privacy: row.privacy,
    avatarUrl: row.avatar_url ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    memberCount: row.group_members?.[0]?.count ?? members.length,
    myRole: myMembership?.role ?? 'member',
    activityPreview:
      latestJoin && latestJoin.userId !== row.created_by
        ? `${latestJoin.name} joined ${timeAgo(latestJoin.joinedAt)}`
        : `Created ${timeAgo(row.created_at)}`,
  };

  return { group, members };
}

export async function leaveGroup(groupId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId);
  if (error) throw error;
}

export async function deleteGroup(groupId: string): Promise<void> {
  const { error } = await supabase.from('groups').delete().eq('id', groupId);
  if (error) throw error;
}

export function getGroupInviteUrl(code: string): string {
  return `https://therec.app/join/${code}`;
}

/**
 * Returns the group's existing shareable invite code, creating one the
 * first time it's requested.
 */
export async function fetchOrCreateInviteCode(groupId: string, userId: string): Promise<string> {
  const { data: existing, error: fetchError } = await supabase
    .from('group_invites')
    .select('code')
    .eq('group_id', groupId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (existing) return existing.code as string;

  const code = generateInviteCode();
  const { error: insertError } = await supabase
    .from('group_invites')
    .insert({ group_id: groupId, code, created_by: userId });

  if (insertError) throw insertError;
  return code;
}

export async function regenerateInviteCode(groupId: string): Promise<string> {
  const code = generateInviteCode();
  const { error } = await supabase.from('group_invites').update({ code }).eq('group_id', groupId);
  if (error) throw error;
  return code;
}

export async function fetchPendingInviteUserIds(groupId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('group_invite_members')
    .select('invited_user_id')
    .eq('group_id', groupId)
    .eq('status', 'pending');

  if (error) throw error;
  return (data ?? []).map((row) => row.invited_user_id as string);
}

export async function searchUsersToInvite(query: string, excludeUserIds: string[]): Promise<InvitablePerson[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, avatar_url')
    .ilike('name', `%${trimmed}%`)
    .limit(20);

  if (error) throw error;

  const excluded = new Set(excludeUserIds);
  return ((data ?? []) as unknown as Array<{ id: string; name: string | null; avatar_url: string | null }>)
    .filter((row) => !excluded.has(row.id) && row.name?.trim())
    .map((row) => ({ id: row.id, name: row.name as string, avatarUrl: row.avatar_url }));
}

export async function inviteUserToGroup(groupId: string, invitedUserId: string, invitedBy: string): Promise<void> {
  const { error } = await supabase.from('group_invite_members').upsert(
    { group_id: groupId, invited_user_id: invitedUserId, invited_by: invitedBy, status: 'pending' },
    { onConflict: 'group_id,invited_user_id' }
  );
  if (error) throw error;
}

export async function fetchMyPendingGroupInvites(userId: string): Promise<PendingGroupInvite[]> {
  const { data, error } = await supabase
    .from('group_invite_members')
    .select('id, group_id, created_at, group:groups(name, avatar_url), inviter:profiles!invited_by(name)')
    .eq('invited_user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return ((data ?? []) as unknown as Array<{
    id: string;
    group_id: string;
    created_at: string;
    group: { name: string; avatar_url: string | null } | null;
    inviter: { name: string | null } | null;
  }>).map((row) => ({
    id: row.id,
    groupId: row.group_id,
    groupName: row.group?.name ?? 'a group',
    groupAvatarUrl: row.group?.avatar_url ?? null,
    invitedByName: row.inviter?.name?.trim() || 'Someone',
    createdAt: row.created_at,
  }));
}

export async function respondToGroupInvite(
  invite: { id: string; groupId: string },
  userId: string,
  accept: boolean
): Promise<void> {
  if (accept) {
    const { error: joinError } = await supabase
      .from('group_members')
      .insert({ group_id: invite.groupId, user_id: userId, role: 'member' });
    if (joinError) throw joinError;
  }

  const { error } = await supabase
    .from('group_invite_members')
    .update({ status: accept ? 'accepted' : 'declined' })
    .eq('id', invite.id);
  if (error) throw error;
}

export async function fetchGroupInvitePreview(code: string): Promise<GroupInvitePreview | null> {
  const { data, error } = await supabase.rpc('get_group_invite_preview', { p_code: code });
  if (error) throw error;

  const row = (data as unknown as Array<{
    group_id: string;
    name: string;
    description: string | null;
    group_type: GroupType;
    privacy: GroupPrivacy;
    avatar_url: string | null;
    member_count: number;
  }>)?.[0];

  if (!row) return null;

  return {
    groupId: row.group_id,
    name: row.name,
    description: row.description ?? '',
    groupType: row.group_type,
    privacy: row.privacy,
    avatarUrl: row.avatar_url ?? null,
    memberCount: row.member_count,
  };
}

export async function joinGroupViaInvite(code: string): Promise<JoinViaInviteResult> {
  const { data, error } = await supabase.rpc('join_group_via_invite', { p_code: code });
  if (error) throw error;
  return data as JoinViaInviteResult;
}

export async function fetchJoinRequests(groupId: string): Promise<JoinRequest[]> {
  const { data, error } = await supabase
    .from('group_join_requests')
    .select('id, group_id, user_id, created_at, profiles(name, avatar_url)')
    .eq('group_id', groupId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return ((data ?? []) as unknown as Array<{
    id: string;
    group_id: string;
    user_id: string;
    created_at: string;
    profiles: { name: string | null; avatar_url: string | null } | null;
  }>).map((row) => ({
    id: row.id,
    groupId: row.group_id,
    userId: row.user_id,
    userName: row.profiles?.name?.trim() || 'Nameless legend',
    userAvatarUrl: row.profiles?.avatar_url ?? null,
    createdAt: row.created_at,
  }));
}

export async function respondToJoinRequest(requestId: string, approve: boolean): Promise<void> {
  const { error } = await supabase.rpc('respond_join_request', { p_request_id: requestId, p_approve: approve });
  if (error) throw error;
}
