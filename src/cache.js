// Jednoduchá in-memory cache s TTL a limitem počtu položek.
// Ukládá i rozpracované Promise, takže souběžné požadavky na stejný klíč
// vyvolají jen jeden dotaz do API.
export class TtlCache {
  constructor({ ttlMs, maxEntries = 1000 }) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.map = new Map();
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value, ttlMs = this.ttlMs) {
    this.map.delete(key);
    this.map.set(key, { value, expiresAt: Date.now() + ttlMs });
    while (this.map.size > this.maxEntries) {
      this.map.delete(this.map.keys().next().value);
    }
  }

  delete(key) {
    this.map.delete(key);
  }

  // Vrátí hodnotu z cache, nebo ji spočítá pomocí loader().
  // Chyby se necachují.
  async getOrLoad(key, loader, ttlMs) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const promise = Promise.resolve().then(loader);
    this.set(key, promise, ttlMs);
    try {
      return await promise;
    } catch (err) {
      if (this.map.get(key)?.value === promise) this.map.delete(key);
      throw err;
    }
  }
}
