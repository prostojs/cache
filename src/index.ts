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

/**
 * Cache entry linked into the recency list.
 * `prev` points towards the most recently used entry, `next` towards the least recently used one.
 */
export interface TProstoCacheNode<DataType = unknown> extends TProstoCacheEntry<DataType> {
  key: string
  prev: TProstoCacheNode<DataType> | undefined
  next: TProstoCacheNode<DataType> | undefined
}

// longer setTimeout delays overflow and fire right away
const MAX_TIMEOUT = 2 ** 31 - 1

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
  protected data = new Map<string, TProstoCacheNode<DataType>>()

  // LRU recency list: a cache hit relinks the node in O(1) instead of
  // re-inserting the key into the Map (Map delete+set churn leaves tombstones
  // that slow down lookups of frequently used keys)
  protected head: TProstoCacheNode<DataType> | undefined // most recently used

  protected tail: TProstoCacheNode<DataType> | undefined // least recently used

  protected expireOrder: number[] = []

  protected expireSeries = new Map<number, string[]>() // : Record<number, string[] | undefined> = {}

  protected options: TProstoCacheOptions<DataType>

  protected nextTimeout: ReturnType<typeof setTimeout> | undefined

  protected expiring = false

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

    const node = this.data.get(key)
    if (node) {
      if (node.expires) {
        this.delExpireSeries(key, node.expires)
      }
      node.value = value as unknown as DataType
      node.expires = expires
      node.ttl = _ttl
      node.ttlUnits = _ttlUnits
      this.moveToHead(node)
    } else {
      const newNode: TProstoCacheNode<DataType> = {
        key,
        value: value as unknown as DataType,
        expires,
        ttl: _ttl,
        ttlUnits: _ttlUnits,
        prev: undefined,
        next: undefined,
      }
      this.data.set(key, newNode)
      this.linkHead(newNode)
    }

    if (expires) {
      this.pushExpires(key, expires)
    }

    // hard-limit eviction (after pushExpires, so that del() also drops the expiry of
    // the entry just set when it is evicted right away, e.g. with a negative limit)
    if (this.data.size > this.options.limit) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.del(this.tail!.key)
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
    const node = this.data.get(key)
    if (!node) {
      return undefined
    }
    if (extendTtl && node.expires) {
      this.replaceExpireSeriesForEntry(key, node, _ttl, _ttlUnits)
    }
    this.moveToHead(node)
    return node.value as unknown as T
  }

  protected linkHead(node: TProstoCacheNode<DataType>) {
    node.prev = undefined
    node.next = this.head
    if (this.head) {
      this.head.prev = node
    } else {
      this.tail = node
    }
    this.head = node
  }

  protected unlink(node: TProstoCacheNode<DataType>) {
    if (node.prev) {
      node.prev.next = node.next
    } else {
      this.head = node.next
    }
    if (node.next) {
      node.next.prev = node.prev
    } else {
      this.tail = node.prev
    }
    node.prev = undefined
    node.next = undefined
  }

  protected moveToHead(node: TProstoCacheNode<DataType>) {
    if (node !== this.head) {
      this.unlink(node)
      this.linkHead(node)
    }
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
    const node = this.data.get(key)
    if (node) {
      this.data.delete(key)
      this.unlink(node)
      if (node.expires) {
        this.delExpireSeries(key, node.expires)
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
    this.head = undefined
    this.tail = undefined
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
    if (this.expiring) {
      // called from onExpire: the running expiry reschedules once its callbacks are done
      return
    }
    const time = this.expireOrder[0]
    if (time) {
      // overdue moments (e.g. after a blocked event loop) also go through the timer, so that
      // onExpire never runs synchronously inside set/get/del
      const delay = Math.max(0, time - Date.now())
      this.nextTimeout = setTimeout(
        () => {
          if (delay > MAX_TIMEOUT) {
            // the moment is beyond what one timer can wait for: wait again
            this.prepareTimeout()
          } else {
            this.expireDue(time)
          }
        },
        Math.min(delay, MAX_TIMEOUT)
      )
      // unref() exists in Node.js only, browsers return a numeric timer id
      const timer = this.nextTimeout as { unref?: () => unknown }
      if (typeof timer.unref === 'function') {
        timer.unref()
      }
    }
  }

  /**
   * Expires the moment the timer was set for and then any overdue moments, in time order
   * and in a loop (not recursively), and schedules the next timer.
   * Only the moments that were due when the timer fired are expired: moments that onExpire
   * makes due (e.g. by re-setting a key with a negative ttl) wait for the next timer, so a
   * callback that keeps re-arming itself cannot block the event loop.
   * The first error thrown by onExpire is rethrown once all of that is done.
   */
  protected expireDue(time: number) {
    const { found, index } = this.searchExpireOrder(Math.max(time, Date.now()))
    const due = this.expireOrder.slice(0, found ? index + 1 : index)
    let error: { e: unknown } | undefined
    for (const t of due) {
      try {
        this.expire(t)
      } catch (error_) {
        error = error ?? { e: error_ }
      }
    }
    this.prepareTimeout()
    if (error) {
      throw error.e
    }
  }

  /**
   * Expires all entries of the moment. If onExpire throws, the remaining entries are still
   * expired and the first error is rethrown afterwards.
   */
  protected expire(time: number) {
    const series = this.expireSeries.get(time) || []
    // detach the series up front so that onExpire may re-enter
    // (set/get/del/reset) without corrupting the expiry bookkeeping
    this.expireSeries.delete(time)
    const { found, index } = this.searchExpireOrder(time)
    if (found) {
      this.expireOrder.splice(index, 1)
    }
    let error: { e: unknown } | undefined
    this.expiring = true
    for (const key of series) {
      try {
        this.expireEntry(key, time)
      } catch (error_) {
        error = error ?? { e: error_ }
      }
    }
    this.expiring = false
    if (error) {
      throw error.e
    }
  }

  protected expireEntry(key: string, time: number) {
    const node = this.data.get(key)
    // skip entries an earlier callback removed (del/reset/eviction), re-set or extended
    // (a re-set with a negative ttl may land on this very moment again: it is then queued anew)
    if (!node || node.expires !== time || this.expireSeries.get(time)?.includes(key)) {
      return
    }
    try {
      if (this.options.onExpire) {
        this.options.onExpire(key, node.value)
      }
    } finally {
      // keep the entry if its own callback removed, re-set or extended it
      if (
        this.data.get(key) === node &&
        node.expires === time &&
        !this.expireSeries.get(time)?.includes(key)
      ) {
        this.data.delete(key)
        this.unlink(node)
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
