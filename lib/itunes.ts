// Thin wrapper around the (auth-free) iTunes Search API, used to find a
// user's walk-up song and its 30-second preview clip.

export type ItunesTrack = {
  trackId: number;
  trackName: string;
  artistName: string;
  artworkUrl: string | null;
  previewUrl: string;
};

type RawItunesResult = {
  trackId: number;
  trackName?: string;
  artistName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
};

export async function searchSongs(query: string): Promise<ItunesTrack[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const url = `https://itunes.apple.com/search?media=music&limit=10&term=${encodeURIComponent(trimmed)}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('iTunes search flopped. Try again?');
  }

  const json = (await response.json()) as { results?: RawItunesResult[] };
  const results = json.results ?? [];

  return results
    .filter((item) => !!item.previewUrl)
    .map((item) => ({
      trackId: item.trackId,
      trackName: item.trackName ?? 'Unknown track',
      artistName: item.artistName ?? 'Unknown artist',
      artworkUrl: item.artworkUrl100 ?? null,
      previewUrl: item.previewUrl as string,
    }));
}
