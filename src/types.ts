export interface Video {
  id: string; // YouTube video id
  artist: string;
  title: string;
  album?: string;
  durationSeconds: number;
  source: 'seed' | 'discovered';
}

export interface Playlist {
  generatedAt: string;
  totalSeconds: number;
  videos: Video[];
}
