export interface Product {
  id: number;
  name: string;
  description: string;
  price: string;
  image: string;
  created_at: string;
  updated_at: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface ApiMetric {
  url: string;
  method: string;
  responseTime: number;
  statusCode: number;
  payloadSize: number;
  timestamp: number;
}

export interface CacheLog {
  timestamp: number;
  event: 'hit' | 'miss' | 'write' | 'delete' | 'evict';
  resourceName: string;
  strategyUsed: string;
  responseTime?: number;
  size?: number;
}
