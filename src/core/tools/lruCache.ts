export interface LruCacheOptions<V> {
  maxSize: number;
  sizeCalculation: (value: V) => number;
  ttl: number;
}

interface CacheEntry<V> {
  value: V;
  size: number;
  expiresAt: number;
}

export class LruCache<K, V> {
  private readonly maxSize: number;
  private readonly ttl: number;
  private readonly sizeCalculation: (value: V) => number;
  private readonly map = new Map<K, CacheEntry<V>>();
  private totalSize = 0;

  constructor(options: LruCacheOptions<V>) {
    this.maxSize = options.maxSize;
    this.ttl = options.ttl;
    this.sizeCalculation = options.sizeCalculation;
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      return undefined;
    }
    // refresh LRU order
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    const size = this.sizeCalculation(value);
    const expiresAt = Date.now() + this.ttl;

    if (this.map.has(key)) {
      this.delete(key);
    }

    this.map.set(key, { value, size, expiresAt });
    this.totalSize += size;

    this.prune();
  }

  delete(key: K): void {
    const entry = this.map.get(key);
    if (!entry) return;
    this.map.delete(key);
    this.totalSize -= entry.size;
  }

  clear(): void {
    this.map.clear();
    this.totalSize = 0;
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.map) {
      if (entry.expiresAt <= now) {
        this.delete(key);
      }
    }

    while (this.totalSize > this.maxSize && this.map.size > 0) {
      const oldestKey = this.map.keys().next().value as K | undefined;
      if (oldestKey === undefined) break;
      this.delete(oldestKey);
    }
  }
}
