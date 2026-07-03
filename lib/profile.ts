import { supabase } from '@/lib/supabase';
import type { SportTag } from '@/lib/sports';

export type { SportTag };

export type PickThreeItem = {
  url: string;
  caption: string;
};

export type WalkupSong = {
  title: string;
  artist: string;
  artworkUrl: string | null;
  previewUrl: string;
};

export type Trophy = {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
};

export type Profile = {
  id: string;
  name: string;
  location: string;
  sportTags: SportTag[];
  legend: string;
  avatarUrl: string | null;
  walkupSong: WalkupSong | null;
  pickThree: PickThreeItem[];
  trophies: Trophy[];
};

export function emptyProfile(id: string): Profile {
  return {
    id,
    name: '',
    location: '',
    sportTags: [],
    legend: '',
    avatarUrl: null,
    walkupSong: null,
    pickThree: [],
    trophies: [],
  };
}

type ProfileRow = {
  id: string;
  name: string | null;
  location: string | null;
  sport_tags: string[] | null;
  legend: string | null;
  avatar_url: string | null;
  walkup_song_title: string | null;
  walkup_song_artist: string | null;
  walkup_song_artwork_url: string | null;
  walkup_song_preview_url: string | null;
  pick_three: PickThreeItem[] | null;
  trophies: Trophy[] | null;
};

function rowToProfile(row: ProfileRow): Profile {
  const hasSong = !!row.walkup_song_title && !!row.walkup_song_preview_url;

  return {
    id: row.id,
    name: row.name ?? '',
    location: row.location ?? '',
    sportTags: (row.sport_tags ?? []) as SportTag[],
    legend: row.legend ?? '',
    avatarUrl: row.avatar_url,
    walkupSong: hasSong
      ? {
          title: row.walkup_song_title as string,
          artist: row.walkup_song_artist ?? 'Unknown artist',
          artworkUrl: row.walkup_song_artwork_url,
          previewUrl: row.walkup_song_preview_url as string,
        }
      : null,
    pickThree: row.pick_three ?? [],
    trophies: row.trophies ?? [],
  };
}

export async function fetchProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();

  if (error) throw error;
  if (!data) return emptyProfile(userId);

  return rowToProfile(data as ProfileRow);
}

export async function saveProfile(profile: Profile): Promise<void> {
  const { error } = await supabase.from('profiles').upsert({
    id: profile.id,
    name: profile.name,
    location: profile.location,
    sport_tags: profile.sportTags,
    legend: profile.legend,
    avatar_url: profile.avatarUrl,
    walkup_song_title: profile.walkupSong?.title ?? null,
    walkup_song_artist: profile.walkupSong?.artist ?? null,
    walkup_song_artwork_url: profile.walkupSong?.artworkUrl ?? null,
    walkup_song_preview_url: profile.walkupSong?.previewUrl ?? null,
    pick_three: profile.pickThree,
    trophies: profile.trophies,
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
}
