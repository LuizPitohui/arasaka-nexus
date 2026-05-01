export type Paginated<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export type ContentRating = 'safe' | 'suggestive' | 'erotica' | 'pornographic';

export const ADULT_RATINGS: ContentRating[] = ['erotica', 'pornographic'];

export function isAdultRating(rating?: string | null): boolean {
  return rating === 'erotica' || rating === 'pornographic';
}

export type MangaSummary = {
  id: number;
  mangadex_id: string | null;
  title: string;
  cover: string;
  status: string;
  content_rating: ContentRating;
  is_active: boolean;
  categories: string[];
};

export type Genre = {
  id: number;
  name: string;
  slug: string;
  manga_count: number;
};
