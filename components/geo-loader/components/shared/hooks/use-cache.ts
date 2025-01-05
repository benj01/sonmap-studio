import { useState, useCallback, useEffect } from 'react';
import { CacheEntry, CacheOptions } from '../types';

export function useCache<T>(options: CacheOptions = {}) {
  const [cache] = useState<Map<string, CacheEntry<T>>>(new Map());
  const [size, setSize] = useState(0);

  const defaultOptions: Required<CacheOptions> = {
    ttl: options.ttl || 5 * 60 * 1000, // 5 minutes
    maxSize: options.maxSize || 100     // 100 entries
  };

  // Clean up expired entries
  useEffect(() => {
    const cleanup = () => {
      const now = Date.now();
      let removed = 0;
      
      for (const [key, entry] of cache.entries()) {
        if (now > entry.expires) {
          cache.delete(key);
          removed++;
        }
      }

      if (removed > 0) {
        setSize(cache.size);
      }
    };

    const interval = setInterval(cleanup, 60000); // Clean up every minute
    return () => clearInterval(interval);
  }, [cache]);

  const set = useCallback((key: string, value: T) => {
    // Remove oldest entry if cache is full
    if (cache.size >= defaultOptions.maxSize) {
      const oldestKey = Array.from(cache.keys())[0];
      cache.delete(oldestKey);
    }

    cache.set(key, {
      data: value,
      timestamp: Date.now(),
      expires: Date.now() + defaultOptions.ttl
    });

    setSize(cache.size);
  }, [cache, defaultOptions.maxSize, defaultOptions.ttl]);

  const get = useCallback((key: string): T | undefined => {
    const entry = cache.get(key);
    if (!entry) {
      return undefined;
    }

    if (Date.now() > entry.expires) {
      cache.delete(key);
      setSize(cache.size);
      return undefined;
    }

    return entry.data;
  }, [cache]);

  const remove = useCallback((key: string) => {
    const deleted = cache.delete(key);
    if (deleted) {
      setSize(cache.size);
    }
    return deleted;
  }, [cache]);

  const clear = useCallback(() => {
    cache.clear();
    setSize(0);
  }, [cache]);

  const has = useCallback((key: string): boolean => {
    const entry = cache.get(key);
    if (!entry) {
      return false;
    }

    if (Date.now() > entry.expires) {
      cache.delete(key);
      setSize(cache.size);
      return false;
    }

    return true;
  }, [cache]);

  const getSize = useCallback(() => size, [size]);

  const getEntries = useCallback(() => {
    const now = Date.now();
    const entries: Array<[string, T]> = [];

    for (const [key, entry] of cache.entries()) {
      if (now <= entry.expires) {
        entries.push([key, entry.data]);
      }
    }

    return entries;
  }, [cache]);

  const updateTTL = useCallback((key: string, ttl: number) => {
    const entry = cache.get(key);
    if (entry) {
      entry.expires = Date.now() + ttl;
      cache.set(key, entry);
      return true;
    }
    return false;
  }, [cache]);

  return {
    set,
    get,
    remove,
    clear,
    has,
    getSize,
    getEntries,
    updateTTL
  };
}
