/**
 * Comunidade — types + helpers de fetch pra perfis publicos, follow,
 * seguidores/seguindo. Endpoints todos em /accounts/...
 */

import { api } from '@/lib/api';
import type { RankPayload } from '@/lib/ranking';

export type PublicUser = {
  id: number;
  username: string;
  avatar: string | null;
  bio: string;
  rank: RankPayload;
  score: number;
  followers_count: number;
  following_count: number;
  is_self: boolean;
  is_following: boolean;
};

export type PublicList = {
  id: number;
  name: string;
  description: string;
  is_public: boolean;
  item_count: number;
  items: {
    id: number;
    manga: { id: number; title: string; cover: string };
    position: number;
    added_at: string;
  }[];
  created_at: string;
  updated_at: string;
};

export const fetchPublicUser = (username: string) =>
  api.get<PublicUser>(`/accounts/users/${encodeURIComponent(username)}/`, {
    auth: false,
  });

export const fetchPublicUserLists = (username: string) =>
  api.get<PublicList[]>(
    `/accounts/users/${encodeURIComponent(username)}/lists/`,
    { auth: false },
  );

export const followUser = (username: string) =>
  api.post<{ is_following: boolean; followers_count: number }>(
    `/accounts/follow/${encodeURIComponent(username)}/`,
    {},
  );

export const unfollowUser = (username: string) =>
  api.delete<{ is_following: boolean; followers_count: number }>(
    `/accounts/follow/${encodeURIComponent(username)}/`,
  );

export const fetchFollowers = () =>
  api.get<PublicUser[]>('/accounts/me/followers/');

export const fetchFollowing = () =>
  api.get<PublicUser[]>('/accounts/me/following/');
