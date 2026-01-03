export interface Category {
  id: number;
  name: string;
  slug: string;
}

export interface Manga {
  id: number;
  title: string;
  alternative_title?: string;
  description: string;
  cover: string; // URL da imagem
  author: string;
  status: 'ONGOING' | 'COMPLETED' | 'HIATUS';
  categories: Category[];
  created_at: string;
}