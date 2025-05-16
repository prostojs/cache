import { binarySearch } from './bin-serach'

export interface TProstoCacheOptions<T = unknown> {
  limit: number
  ttl?: number
  ttlUnits?: 'ms' | 's' | 'm' | 'h'
  onExpire?: <TT = T>(key: string, value: TT) => unknown | Promise<unknown>
}

export interface TProstoCacheEntry<DataType = unknown> {
  value: DataType
  expires: number | null
  ttl?: number
  ttlUnits?: TProstoCacheOptions['ttlUnits']
}

const ttlUnitsChart = {
  ms: 1,
  s: 1000,
  m: 60000,
  h: 60000 * 60,
}

/**
 * ## ProstoCache
 *
 * A class that provides in-memory caching functionality.
 * It supports features like entry and cache level time-to-live (TTL), cache size limiting, and automatic entry expiration.
 *
 * @example
 * // Create a cache instance with a limit of 100 items and a default TTL of 1 hour
 * const cache = new ProstoCache({ limit: 100, ttl: 1, ttlUnits: 'h' });
 */
export class ProstoCache<DataType = unknown> {
  protected data = new Map<string, TProstoCacheEntry<DataType>>() // : Record<string, TProstoCacheEntry<DataType> | undefined> = {}

  protected expireOrder: number[] = []

  protected expireSeries = new Map<number, string[]>() // : Record<number, string[] | undefined> = {}

  protected options: TProstoCacheOptions<DataType>

  protected nextTimeout: NodeJS.Timeout | undefined

  constructor(options?: Partial<TProstoCacheOptions<DataType>>) {
    this.options = {
      limit: 1000,
      ...options,
    }
  }

  /**
   * Stores a value in the cache.
   * @param key key of the cache entry
   * @param value value
   * @param _ttl (optional) time-to-live on entry level
   * @param _ttlUnits (optional) ttl units (ms, s, m, h)
   *
   * @example
   * // Set a value in the cache with ttl of 10 seconds
   * cache.set('myKey', 'myValue', 10, 's');
   */
  // eslint-disable-next-line max-params
  public set<T = DataType>(
    key: string,
    value: T,
    _ttl?: number,
    _ttlUnits?: TProstoCacheOptions['ttlUnits']
  ) {
    if (this.options.limit === 0) {
      return
    }

    const expires = this.calcExpires(_ttl, _ttlUnits)

    if (this.data.has(key)) {
      this.data.delete(key) // for LRU
    }
    this.data.set(key, {
      value: value as unknown as DataType,
      expires,
      ttl: _ttl,
      ttlUnits: _ttlUnits,
    })

    // hard-limit eviction
    if (this.data.size > this.options.limit) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const oldestKey = this.data.keys().next().value!
      this.del(oldestKey)
    }

    if (expires) {
      this.pushExpires(key, expires)
    }
  }

  private calcExpires(_ttl?: number, _ttlUnits?: TProstoCacheOptions['ttlUnits']) {
    const ttlUnits = _ttlUnits ?? this.options.ttlUnits ?? 'ms'
    const ttl = typeof _ttl === 'number' ? _ttl : this.options.ttl

    const m = ttlUnitsChart[ttlUnits]
    return ttl ? Date.now() + ttl * m : null
  }

  /**
   * Retrieves a value from the cache.
   *
   * @example
   * // Retrieve a value from the cache
   * const value = cache.get('myKey');
   */
  // eslint-disable-next-line max-params
  public get<T = DataType>(
    key: string,
    extendTtl?: boolean,
    _ttl?: number,
    _ttlUnits?: TProstoCacheOptions['ttlUnits']
  ): T | undefined {
    const entry = this.data.get(key)
    if (extendTtl && entry?.expires) {
      this.replaceExpireSeriesForEntry(key, entry, _ttl, _ttlUnits)
    }
    if (entry) {
      this.data.delete(key) // for LRU
      this.data.set(key, entry)
    }
    return entry?.value as T
  }

  // eslint-disable-next-line max-params
  private replaceExpireSeriesForEntry(
    key: string,
    entry: TProstoCacheEntry<DataType>,
    _ttl?: number,
    _ttlUnits?: TProstoCacheOptions['ttlUnits']
  ) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.delExpireSeries(key, entry.expires!)
    entry.expires = this.calcExpires(_ttl ?? entry.ttl, _ttlUnits ?? entry.ttlUnits)
    if (entry.expires) {
      this.pushExpires(key, entry.expires)
    }
  }

  /**
   * Deletes an entry from the cache.
   *
   * @example
   * // Delete a value from the cache
   * cache.del('myKey');
   */
  public del(key: string) {
    const entry = this.data.get(key)
    if (entry) {
      this.data.delete(key)
      if (entry.expires) {
        this.delExpireSeries(key, entry.expires)
      }
    }
  }

  protected delExpireSeries(key: string, expires: number) {
    let es = this.expireSeries.get(expires)
    if (es) {
      es = es.filter(k => k !== key)
      this.expireSeries.set(expires, es)
      if (es.length === 0) {
        this.expireSeries.delete(expires)
        const { found, index } = this.searchExpireOrder(expires)
        if (found) {
          this.expireOrder.splice(index, 1)
          if (index === 0) {
            this.prepareTimeout()
          }
        }
      }
    }
  }

  /**
   * Clears all entries from the cache.
   *
   * @example
   * // Reset the cache
   * cache.reset();
   */
  public reset() {
    this.data.clear()
    if (this.nextTimeout) {
      clearTimeout(this.nextTimeout)
    }
    this.expireOrder = []
    this.expireSeries.clear()
  }

  protected searchExpireOrder(time: number) {
    return binarySearch(this.expireOrder, time)
  }

  protected prepareTimeout() {
    if (this.nextTimeout) {
      clearTimeout(this.nextTimeout)
    }
    const time = this.expireOrder[0]
    const del = (time: number) => {
      const series = this.expireSeries.get(time) || []
      for (const key of series) {
        if (this.options.onExpire) {
          this.options.onExpire(key, this.data.get(key)?.value)
        }
        this.data.delete(key)
      }
      this.expireSeries.delete(time)
      this.expireOrder = this.expireOrder.slice(1)
      this.prepareTimeout()
    }
    if (time) {
      const delta = time - Date.now()
      if (delta > 0) {
        this.nextTimeout = setTimeout(() => {
          del(time)
        }, delta)
        this.nextTimeout.unref()
      } else {
        del(time)
        this.prepareTimeout()
      }
    }
  }

  protected pushExpires(key: string, time: number) {
    const { found, index } = this.searchExpireOrder(time)
    if (!found) {
      this.expireOrder.splice(index, 0, time)
    }
    const es = this.expireSeries.get(time)
    const e = es || []
    if (!es) {
      this.expireSeries.set(time, e)
    }
    e.push(key)
    if (!found && index <= 0) {
      this.prepareTimeout()
    }
  }
}
