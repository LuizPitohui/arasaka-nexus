export type Paginated<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export type MangaSummary = {
  id: number;
  mangadex_id: string | null;
  title: string;
  cover: string;
  status: string;
  is_active: boolean;
  categories: string[];
};

export type Genre = {
  id: number;
  name: string;
  slug: string;
  manga_count: number;
};
