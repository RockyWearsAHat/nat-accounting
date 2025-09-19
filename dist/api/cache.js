import { createClient } from "redis";
class RedisCache {
    constructor() {
        this.connected = false;
        try {
            this.client = createClient({
                url: process.env.REDIS_URL || "redis://localhost:6379",
                socket: {
                    connectTimeout: 5000,
                },
            });
            this.client.on("error", (err) => {
                console.warn("[Cache] Redis error:", err.message);
                this.connected = false;
            });
            this.client.on("connect", () => {
                console.log("[Cache] Redis connected");
                this.connected = true;
            });
            // Attempt to connect
            this.client.connect().catch((err) => {
                console.warn("[Cache] Redis connection failed:", err.message);
                this.connected = false;
            });
        }
        catch (error) {
            console.warn("[Cache] Redis initialization failed:", error);
            this.connected = false;
        }
    }
    async get(key) {
        if (!this.connected)
            return null;
        try {
            return await this.client.get(key);
        }
        catch (error) {
            console.warn("[Cache] Redis get error:", error);
            return null;
        }
    }
    async set(key, value, ttl = 300) {
        if (!this.connected)
            return;
        try {
            await this.client.setEx(key, ttl, value);
        }
        catch (error) {
            console.warn("[Cache] Redis set error:", error);
        }
    }
    async del(key) {
        if (!this.connected)
            return;
        try {
            await this.client.del(key);
        }
        catch (error) {
            console.warn("[Cache] Redis del error:", error);
        }
    }
}
class MemoryCache {
    constructor() {
        this.cache = new Map();
        this.connected = true;
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
    async get(key) {
        const entry = this.cache.get(key);
        if (!entry)
            return null;
        if (entry.expires < Date.now()) {
            this.cache.delete(key);
            return null;
        }
        return entry.value;
    }
    async set(key, value, ttl = 300) {
        this.cache.set(key, {
            value,
            expires: Date.now() + ttl * 1000,
        });
    }
    async del(key) {
        this.cache.delete(key);
    }
}
// Global cache instance
let cacheInstance = null;
export function getCache() {
    if (!cacheInstance) {
        // Try Redis first, fall back to memory cache
        try {
            cacheInstance = new RedisCache();
            // Give Redis a moment to connect
            setTimeout(() => {
                if (!cacheInstance?.connected) {
                    console.log("[Cache] Redis connection timeout, falling back to memory cache");
                    cacheInstance = new MemoryCache();
                }
            }, 2000);
        }
        catch (error) {
            console.log("[Cache] Redis failed, using memory cache");
            cacheInstance = new MemoryCache();
        }
    }
    return cacheInstance;
}
export function createCacheKey(...parts) {
    return parts.map((p) => p.replace(/[^a-zA-Z0-9]/g, "_")).join(":");
}
export async function getCachedEvents(key) {
    try {
        const cached = await getCache().get(key);
        if (cached) {
            console.log(`[Cache] Cache hit for ${key}`);
            return JSON.parse(cached);
        }
        console.log(`[Cache] Cache miss for ${key}`);
        return null;
    }
    catch (error) {
        console.warn("[Cache] Error getting cached events:", error);
        return null;
    }
}
export async function setCachedEvents(key, events, ttl = 300) {
    try {
        await getCache().set(key, JSON.stringify(events), ttl);
        console.log(`[Cache] Cached ${events.length} events for ${key}`);
    }
    catch (error) {
        console.warn("[Cache] Error setting cached events:", error);
    }
}
export async function invalidateCache(pattern) {
    try {
        if (pattern) {
            // For now, just clear the specific key
            await getCache().del(pattern);
        }
        else {
            // Clear all calendar-related cache (would need Redis KEYS command for full implementation)
            console.log("[Cache] Cache invalidation requested");
        }
    }
    catch (error) {
        console.warn("[Cache] Error invalidating cache:", error);
    }
}
