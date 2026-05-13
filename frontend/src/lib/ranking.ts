/**
 * Types e helpers do sistema de rank competitivo por season.
 *
 * Backend: accounts/ranking.py + endpoints /accounts/{rank/me,leaderboard,seasons}/
 * Emblems estáticos servidos em /emblems/<NN>-<slug>.png.
 */

import { api } from '@/lib/api';

export type RankPayload = {
  tier: number;
  slug: string;
  name: string;
  emblem: string;
};

export type SeasonPayload = {
  id: number;
  slug: string;
  name: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
};

export type RankEntry = {
  season: SeasonPayload;
  username: string;
  avatar: string | null;
  score: number;
  position: number | null;
  rank: RankPayload;
  peak_rank: RankPayload;
  computed_at: string | null;
};

export type LeaderboardResponse = {
  season: SeasonPayload;
  entries: RankEntry[];
  me: RankEntry | null;
  tiers: RankPayload[];
};

export type SeasonHistoryEntry = SeasonPayload & {
  my_score: number;
  my_peak_rank: RankPayload;
  my_final_rank: RankPayload;
};

export const fetchMyRank = () => api.get<RankEntry>('/accounts/rank/me/');
export const fetchLeaderboard = (params?: { limit?: number; season?: string }) => {
  const q = new URLSearchParams();
  if (params?.limit) q.set('limit', String(params.limit));
  if (params?.season) q.set('season', params.season);
  const qs = q.toString();
  return api.get<LeaderboardResponse>(`/accounts/leaderboard/${qs ? `?${qs}` : ''}`);
};
export const fetchSeasons = () => api.get<SeasonHistoryEntry[]>('/accounts/seasons/');
