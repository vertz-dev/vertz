export interface ImageProps {
  src: string;
  width: number;
  height: number;
  alt: string;
  class?: string;
  pictureClass?: string;
  style?: string;
  loading?: 'lazy' | 'eager';
  decoding?: 'async' | 'sync' | 'auto';
  fetchpriority?: 'high' | 'low' | 'auto';
  priority?: boolean;
  quality?: number;
  fit?: 'cover' | 'contain' | 'fill';
  [key: string]: unknown;
}
