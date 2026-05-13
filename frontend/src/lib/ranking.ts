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
  /** Limite superior do percentil (0-100) que pertence a esse tier.
   *  Ex: 0.5 = top 0.5%. Sewer Rat tem 100 (resto). */
  max_percentile: number;
};

export type SeasonPayload = {
  id: number;
  slug: string;
  name: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
};

export type ProgressPayload = {
  next_rank: RankPayload;
  threshold_score: number;
  points_to_next: number;
  /** Fração 0-100 do score atual sobre o threshold do próximo tier. */
  percent: number;
};

export type BreakdownPayload = {
  chapter: number;
  reading_time: number;
  work_complete: number;
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
  /** Presente em rank_me e em leaderboard.me. Null quando user no tier máximo. */
  progress?: ProgressPayload | null;
  /** Soma de pontos por origem; presente nos mesmos endpoints. */
  breakdown?: BreakdownPayload;
  /** Total de agentes pontuando na season; presente em rank_me. */
  total_agents?: number;
};

export type LeaderboardResponse = {
  season: SeasonPayload;
  entries: RankEntry[];
  me: RankEntry | null;
  tiers: RankPayload[];
  total_agents: number;
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

/** Formata número grande com separador local (1.234). */
export const fmt = (n: number) => n.toLocaleString('pt-BR');

/** Converte ISO date string em "Xd Yh Zm" até a data, ou null se já passou. */
export function timeUntil(iso: string): { days: number; hours: number; minutes: number } | null {
  const target = new Date(iso).getTime();
  const now = Date.now();
  const diff = target - now;
  if (diff <= 0) return null;
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  return { days, hours, minutes };
}
