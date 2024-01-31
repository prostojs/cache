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
}

const ttlUnitsChart = {
  ms: 1,
  s: 1000,
  m: 60000,
  h: 60000 * 60,
}

export class ProstoCache<DataType = unknown> {
  protected data = new Map<string, TProstoCacheEntry<DataType>>() // : Record<string, TProstoCacheEntry<DataType> | undefined> = {}

  protected limits: string[] = []

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
    const ttlUnits = _ttlUnits ?? this.options.ttlUnits ?? 'ms'
    const ttl = typeof _ttl === 'number' ? _ttl : this.options.ttl
    const m = ttlUnitsChart[ttlUnits]
    const expires = ttl ? (Math.round(Date.now() / m) + ttl) * m : null
    if (expires) {
      this.del(key)
    }
    this.data.set(key, {
      value: value as unknown as DataType,
      expires,
    })
    if (expires) {
      this.pushExpires(key, expires)
    }
    if (this.options.limit > 0) {
      this.pushLimit(key)
    }
  }

  public get<T = DataType>(key: string): T | undefined {
    return this.data.get(key)?.value as unknown as T | undefined
  }

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

  public reset() {
    this.data.clear()
    if (this.nextTimeout) {
      clearTimeout(this.nextTimeout)
    }
    this.expireOrder = []
    this.expireSeries.clear()
    this.limits = []
  }

  protected searchExpireOrder(time: number) {
    return binarySearch(this.expireOrder, time)
  }

  protected pushLimit(key: string) {
    const limit = this.options.limit
    if (limit) {
      const newObj = [key, ...this.limits.filter(item => item !== key && this.data.get(item))]
      const tail = newObj.slice(limit)
      this.limits = newObj.slice(0, limit)
      if (tail.length > 0) {
        tail.forEach(tailItem => {
          this.del(tailItem)
        })
      }
    }
  }

  protected prepareTimeout() {
    if (this.nextTimeout) {
      clearTimeout(this.nextTimeout)
    }
    const time = this.expireOrder[0]
    const del = (time: number) => {
      for (const key of this.expireSeries.get(time) || []) {
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
      const delta = time - Math.round(Date.now() / 1)
      if (delta > 0) {
        this.nextTimeout = setTimeout(() => {
          del(time)
        }, delta)
      } else {
        del(time)
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
