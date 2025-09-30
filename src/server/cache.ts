import { createClient } from "redis";

interface CacheClient {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, ttl?: number) => Promise<void>;
  del: (key: string) => Promise<void>;
  connected: boolean;
}

class RedisCache implements CacheClient {
  private client: any;
  public connected = false;

  constructor() {
    try {
      this.client = createClient({
        url: process.env.REDIS_URL || "redis://localhost:6379",
        socket: {
          connectTimeout: 5000,
        },
      });

      this.client.on("error", (err: any) => {
        console.warn("[Cache] Redis error:", err.message);
        this.connected = false;
      });

      this.client.on("connect", () => {
        console.log("[Cache] Redis connected");
        this.connected = true;
      });

      // Attempt to connect
      this.client.connect().catch((err: any) => {
        console.warn("[Cache] Redis connection failed:", err.message);
        this.connected = false;
      });
    } catch (error) {
      console.warn("[Cache] Redis initialization failed:", error);
      this.connected = false;
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.connected) return null;
    try {
      return await this.client.get(key);
    } catch (error) {
      console.warn("[Cache] Redis get error:", error);
      return null;
    }
  }

  async set(key: string, value: string, ttl = 300): Promise<void> {
    if (!this.connected) return;
    try {
      await this.client.setEx(key, ttl, value);
    } catch (error) {
      console.warn("[Cache] Redis set error:", error);
    }
  }

  async del(key: string): Promise<void> {
    if (!this.connected) return;
    try {
      await this.client.del(key);
    } catch (error) {
      console.warn("[Cache] Redis del error:", error);
    }
  }
}

class MemoryCache implements CacheClient {
  private cache = new Map<string, { value: string; expires: number }>();
  public connected = true;

  constructor() {
    console.log("[Cache] Using in-memory cache (Redis not available)");
    // Clean up expired entries every 5 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.cache.entries()) {
        if (entry.expires < now) {
          this.cache.delete(key);
        }
      }
    }, 300000);
  }

  async get(key: string): Promise<string | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expires < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttl = 300): Promise<void> {
    this.cache.set(key, {
      value,
      expires: Date.now() + ttl * 1000,
    });
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
  }
}

// Global cache instance
let cacheInstance: CacheClient | null = null;

export function getCache(): CacheClient {
  if (!cacheInstance) {
    // Try Redis first, fall back to memory cache
    try {
      cacheInstance = new RedisCache();
      // Give Redis a moment to connect
      setTimeout(() => {
        if (!cacheInstance?.connected) {
          console.log(
            "[Cache] Redis connection timeout, falling back to memory cache"
          );
          cacheInstance = new MemoryCache();
        }
      }, 2000);
    } catch (error) {
      console.log("[Cache] Redis failed, using memory cache");
      cacheInstance = new MemoryCache();
    }
  }
  return cacheInstance;
}

export function createCacheKey(...parts: string[]): string {
  return parts.map((p) => p.replace(/[^a-zA-Z0-9]/g, "_")).join(":");
}

export async function getCachedEvents(key: string): Promise<any[] | null> {
  try {
    const cached = await getCache().get(key);
    if (cached) {
      console.log(`[Cache] Cache hit for ${key}`);
      return JSON.parse(cached);
    }
    console.log(`[Cache] Cache miss for ${key}`);
    return null;
  } catch (error) {
    console.warn("[Cache] Error getting cached events:", error);
    return null;
  }
}

export async function setCachedEvents(
  key: string,
  events: any[],
  ttl = 300
): Promise<void> {
  try {
    await getCache().set(key, JSON.stringify(events), ttl);
    console.log(`[Cache] Cached ${events.length} events for ${key}`);
  } catch (error) {
    console.warn("[Cache] Error setting cached events:", error);
  }
}

export async function invalidateCache(pattern?: string): Promise<void> {
  try {
    if (pattern) {
      // For now, just clear the specific key
      await getCache().del(pattern);
    } else {
      // Clear all calendar-related cache (would need Redis KEYS command for full implementation)
      console.log("[Cache] Cache invalidation requested");
    }
  } catch (error) {
    console.warn("[Cache] Error invalidating cache:", error);
  }
}

// Import this to access the internal eventCache from icloud.ts
let icloudEventCache: Record<string, any[]> | null = null;

export function setIcloudEventCache(cache: Record<string, any[]>): void {
  icloudEventCache = cache;
}

export async function clearAllCalendarCaches(context = "unknown"): Promise<void> {
  try {
    let clearedCount = 0;
    
    // Clear iCloud in-memory cache if available
    if (icloudEventCache) {
      const memoryCacheKeys = Object.keys(icloudEventCache);
      memoryCacheKeys.forEach(key => {
        if (key.includes('icloud') || key.includes('merged') || key.includes('google')) {
          delete icloudEventCache![key];
          clearedCount++;
        }
      });
    }

    // Clear new cache system with comprehensive patterns
    const cache = getCache();
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    
    const cachePatterns = [
      // All events endpoints
      'icloud:all', 'merged:all', 'google:all',
      // Daily endpoints for today and nearby dates
      `icloud:day:${today}`, `icloud:day:${yesterday}`, `icloud:day:${tomorrow}`,
      `merged:day:${today}`, `merged:day:${yesterday}`, `merged:day:${tomorrow}`, 
      // Weekly and monthly
      'icloud:week', 'icloud:month', 'merged:week', 'merged:month',
      'google:week', 'google:month',
      // Config caches
      'icloud:config', 'calendar:config'
    ];
    
    for (const pattern of cachePatterns) {
      await cache.del(pattern);
    }
    
    console.log(`[${context.toUpperCase()}] Cleared ${clearedCount} memory entries + ${cachePatterns.length} new cache patterns`);
  } catch (error) {
    console.warn(`[${context.toUpperCase()}] Error clearing caches:`, error);
  }
}
