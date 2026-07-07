import { supabase } from '@/lib/supabase';

export type UserSettings = {
  notifyGroupActivity: boolean;
  notifyBanterReplies: boolean;
  locationPrivacyApproximate: boolean;
  allowConnectionRequests: boolean;
  isPrivate: boolean;
};

type SettingsColumn =
  | 'notify_group_activity'
  | 'notify_banter_replies'
  | 'location_privacy_approximate'
  | 'allow_connection_requests'
  | 'is_private';

export async function fetchSettings(userId: string): Promise<UserSettings> {
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'notify_group_activity, notify_banter_replies, location_privacy_approximate, allow_connection_requests, is_private'
    )
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;

  return {
    notifyGroupActivity: data?.notify_group_activity ?? true,
    notifyBanterReplies: data?.notify_banter_replies ?? true,
    locationPrivacyApproximate: data?.location_privacy_approximate ?? false,
    allowConnectionRequests: data?.allow_connection_requests ?? true,
    isPrivate: data?.is_private ?? true,
  };
}

export async function updateSetting(userId: string, column: SettingsColumn, value: boolean): Promise<void> {
  const { error } = await supabase.from('profiles').update({ [column]: value }).eq('id', userId);
  if (error) throw error;
}
