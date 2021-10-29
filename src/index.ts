import { TProstoCacheObject, TProstoCacheStrategy } from './types'

export interface TProstoCacheOptions {
    limit?: number
    ttl?: number
}

export interface TProstoCacheEntry<DataType = unknown> {
    value: DataType
    expires: number | null
}

export class ProstoCache<DataType = unknown> {

    protected data: Record<string, TProstoCacheEntry<DataType>> = {}
    protected limits: string[] = []
    protected expireOrder: number[] = []
    protected expireSeries: Record<number, string[]> = {}

    protected options: TProstoCacheOptions
    protected nextTimeout: NodeJS.Timeout | undefined

    constructor(options?: TProstoCacheOptions) {
        this.options = {
            limit: 1000,
            ...options,
        }
    }

    public set<T = DataType>(key: string, value: T) {
        if (this.options?.limit === 0) return
        const expires = this.options?.ttl ? Math.round(new Date().getTime() / 1) + this.options?.ttl : null
        if (expires) {
            this.del(key)
        }
        this.data[key] = {
            value: value as unknown as DataType,
            expires,
        }
        if (expires) {
            this.pushExpires(key, expires)
        }
        this.pushLimit(key)
    }

    public get<T = DataType>(key: string): T | undefined {
        return this.data[key]?.value as unknown as T | undefined
    }

    public del(key: string) {
        const entry = this.data[key]
        if (entry) {
            delete this.data[key]
            if (entry.expires) {
                let es = this.expireSeries[entry.expires]
                if (es) {
                    es = this.expireSeries[entry.expires] = es.filter(k => k !== key)
                }
                if (!es || !es.length) {
                    delete this.expireSeries[entry.expires]
                    const { found, index } = this.searchExpireOrder(entry.expires)
                    if (found) {
                        this.expireOrder.splice(index, 1)
                        if (index === 0) {
                            console.log('calling prepareTimeout')
                            this.prepareTimeout()
                        }
                    }
                }
            }
        }
    }

    public reset() {
        this.data = {}
        if (this.nextTimeout) {
            clearTimeout(this.nextTimeout)
        }
        this.expireOrder = []
        this.expireSeries = {}
        this.limits = []
    }

    protected searchExpireOrder(time: number) {
        return binarySearch(this.expireOrder, time)
    }

    protected pushLimit(key: string) {
        const limit = this.options?.limit
        if (limit) {
            const newObj = [key, ...(this.limits.filter(item => item !== key && this.data[item]))]
            const tail = newObj.slice(limit)
            this.limits = newObj.slice(0, limit)
            if (tail.length) {
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
            for (const key of (this.expireSeries[time] || [])) {
                delete this.data[key]
            }
            delete this.expireSeries[time]
            this.expireOrder = this.expireOrder.slice(1)
            this.prepareTimeout()
        }
        if (time) {
            const delta = time - Math.round(new Date().getTime() / 1)
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
        const e = this.expireSeries[time] = this.expireSeries[time] || []
        e.push(key)
        if (!found && index === 0) {
            this.prepareTimeout()
        }
    }
}

interface BinaryResult {
    found: boolean
    index: number
}

function binarySearch(a: number[], n: number): BinaryResult {
    let start = 0
    let end = a.length - 1
    let mid: number = 0

    while (start <= end) {
        mid = Math.floor((start + end) / 2)

        if (a[mid] === n) {
            return {
                found: true,
                index: mid,
            }
        }

        if (n < a[mid]) {
            end = mid - 1
            mid--
        } else {
            start = mid + 1
            mid++
        }
    }
    return {
        found: false,
        index: mid,
    }
}