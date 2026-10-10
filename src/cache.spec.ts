/* eslint-disable promise/param-names */
/* eslint-disable jest/max-expects */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import type { TProstoCacheNode } from '.'
import { ProstoCache } from '.'

/** Utility to wait with real timers */
const sleep = async (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/* ------------------------------------------------------------------
 * BASE BEHAVIOUR
 * ------------------------------------------------------------------ */

describe('ProstoCache – base behaviour', () => {
  afterEach(() => {
    // always restore real timers for next test
    jest.useRealTimers()
    jest.clearAllTimers()
  })

  it('must cache objects', () => {
    const cache = new ProstoCache()
    cache.set('key', 'object')
    expect(cache.get('key')).toBe('object')
  })

  it('must del object', () => {
    const cache = new ProstoCache()
    cache.set('key', 'object')
    cache.del('key')
    expect(cache.get('key')).toBeUndefined()
  })

  it('must reset cache', () => {
    const cache = new ProstoCache()
    cache.set('key', 'object')
    cache.reset()
    expect(cache.get('key')).toBeUndefined()
  })

  it('must limit cache', () => {
    const cache = new ProstoCache({ limit: 2 })
    cache.set('key1', 'object1')
    cache.set('key2', 'object2')
    cache.set('key3', 'object3')
    expect(cache.get('key3')).toBe('object3')
    expect(cache.get('key2')).toBe('object2')
    expect(cache.get('key1')).toBeUndefined()
  })

  it('must ttl cache (deterministic)', () => {
    jest.useFakeTimers()
    const cache = new ProstoCache({ ttl: 100 })
    cache.set('key1', 'object1') // ttl 100 ms
    cache.set('key2', 'object2') // ttl 100 ms (same tick)
    cache.set('key3', 'object3', 500) // custom 500 ms

    jest.advanceTimersByTime(99)
    expect(cache.get('key3')).toBe('object3')
    expect(cache.get('key2')).toBe('object2')
    expect(cache.get('key1')).toBe('object1')

    jest.advanceTimersByTime(2) // total 101 ms
    expect(cache.get('key3')).toBe('object3')
    expect(cache.get('key2')).toBeUndefined()
    expect(cache.get('key1')).toBeUndefined()

    jest.advanceTimersByTime(400) // total 501 ms
    expect(cache.get('key3')).toBeUndefined()
  })

  it('must prepare timeout when removing first ttl entry', async () => {
    const cache = new ProstoCache({ ttl: 80 })
    cache.set('key1', 'object1')
    await sleep(2)
    cache.set('key2', 'object2')
    cache.set('key3', 'object3')
    await sleep(2)
    const spy = jest.spyOn(cache as any, 'prepareTimeout')
    expect(cache.get('key1')).toBe('object1')
    cache.del('key1')
    expect(spy).toHaveBeenCalledTimes(1)
    await sleep(80)
    expect(cache.get('key3')).toBeUndefined()
  })

  it('must clear timeout on reset', async () => {
    const cache = new ProstoCache({ ttl: 50 })
    cache.set('key1', 'object1')
    await sleep(2)
    expect((cache as any).nextTimeout).toBeDefined()
    const spy = jest.spyOn(global, 'clearTimeout') as jest.SpyInstance
    cache.reset()
    expect(spy).toHaveBeenCalledWith((cache as any).nextTimeout)
  })
})

/* ------------------------------------------------------------------
 * EDGE CASES
 * ------------------------------------------------------------------ */

describe('ProstoCache – edge cases', () => {
  afterEach(() => {
    jest.useRealTimers()
    jest.clearAllTimers()
  })

  it('respects ttlUnits conversion (1 s)', () => {
    jest.useFakeTimers()
    const cache = new ProstoCache({ ttl: 1, ttlUnits: 's' })
    cache.set('k', 'v')
    jest.advanceTimersByTime(999)
    expect(cache.get('k')).toBe('v')
    jest.advanceTimersByTime(2)
    expect(cache.get('k')).toBeUndefined()
  })

  it('limit = 0 disables caching entirely', () => {
    const cache = new ProstoCache({ limit: 0 })
    cache.set('key', 'object')
    expect(cache.get('key')).toBeUndefined()
  })

  it('limit < 0 stores nothing and leaves no expiry behind', () => {
    jest.useFakeTimers()
    const onExpire = jest.fn()
    const cache = new ProstoCache({ limit: -1, ttl: 10, onExpire })
    cache.set('key', 'object')
    expect(cache.get('key')).toBeUndefined()
    expect(jest.getTimerCount()).toBe(0)
    jest.advanceTimersByTime(20)
    expect(onExpire).not.toHaveBeenCalled()
  })

  it('evicting an entry drops its expiry', () => {
    jest.useFakeTimers()
    const onExpire = jest.fn()
    const cache = new ProstoCache({ limit: 1, onExpire })
    cache.set('a', 1, 10)
    cache.set('b', 2) // evicts 'a'
    expect(jest.getTimerCount()).toBe(0)
    jest.advanceTimersByTime(20)
    expect(onExpire).not.toHaveBeenCalled()
    expect(cache.get('b')).toBe(2)
  })

  it('ttl longer than the max setTimeout delay (~24.8 days) does not expire early', () => {
    jest.useFakeTimers()
    const day = 24 * 60 * 60 * 1000
    const onExpire = jest.fn()
    const cache = new ProstoCache({ onExpire })
    cache.set('k', 'v', 30 * 24, 'h')
    jest.advanceTimersByTime(1)
    expect(cache.get('k')).toBe('v')
    jest.advanceTimersByTime(25 * day)
    expect(cache.get('k')).toBe('v')
    expect(onExpire).not.toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(1)
    jest.advanceTimersByTime(5 * day)
    expect(cache.get('k')).toBeUndefined()
    expect(onExpire).toHaveBeenCalledWith('k', 'v')
    expect(jest.getTimerCount()).toBe(0)
  })

  it('updates existing key & keeps newest value', () => {
    const cache = new ProstoCache({ limit: 2 })
    cache.set('k', 'v1')
    // eslint-disable-next-line sonarjs/no-element-overwrite
    cache.set('k', 'v2')
    expect(cache.get('k')).toBe('v2')
    // second insert must not grow size beyond limit=2
    cache.set('a', 'b')
    expect(cache.get('k')).toBeDefined()
  })

  it('extends ttl on get() when extendTtl = true', () => {
    jest.useFakeTimers()
    const cache = new ProstoCache({ ttl: 30 })
    cache.set('k', 'v')
    jest.advanceTimersByTime(20)
    cache.get('k', true, 30) // prolong another 30 ms
    jest.advanceTimersByTime(20)
    expect(cache.get('k')).toBe('v') // still alive (40 ms total)
    jest.advanceTimersByTime(31)
    expect(cache.get('k')).toBeUndefined()
  })

  it('invokes onExpire callback exactly once', () => {
    jest.useFakeTimers()
    const cb = jest.fn()
    const cache = new ProstoCache({ ttl: 10, onExpire: cb })
    cache.set('key', 'obj')
    jest.advanceTimersByTime(11)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith('key', 'obj')
  })

  it('deletes ttl metadata when key manually del()', () => {
    jest.useFakeTimers()
    const cache = new ProstoCache({ ttl: 50 })
    cache.set('k', 'v')
    cache.del('k')
    // advance beyond ttl – no errors, no extra expirations
    jest.advanceTimersByTime(60)
    expect(cache.get('k')).toBeUndefined()
  })
})

/* ------------------------------------------------------------------
 * LRU ORDER
 * ------------------------------------------------------------------ */

/** Keys from most to least recently used, read without touching recency */
function lruKeys(cache: ProstoCache): string[] {
  const internals = cache as unknown as {
    data: Map<string, TProstoCacheNode>
    head?: TProstoCacheNode
    tail?: TProstoCacheNode
  }
  const keys: string[] = []
  let node = internals.head
  while (node) {
    keys.push(node.key)
    node = node.next
  }
  // backward walk and Map must agree with the forward walk
  const back: string[] = []
  node = internals.tail
  while (node) {
    back.unshift(node.key)
    node = node.prev
  }
  expect(back).toStrictEqual(keys)
  expect(internals.data.size).toBe(keys.length)
  expect(new Set(internals.data.keys())).toStrictEqual(new Set(keys))
  return keys
}

describe('ProstoCache – LRU order', () => {
  afterEach(() => {
    jest.useRealTimers()
    jest.clearAllTimers()
  })

  it('get() hit marks the entry as most recently used', () => {
    const cache = new ProstoCache({ limit: 3 })
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)
    expect(lruKeys(cache)).toStrictEqual(['c', 'b', 'a'])
    expect(cache.get('a')).toBe(1)
    expect(lruKeys(cache)).toStrictEqual(['a', 'c', 'b'])
    cache.set('d', 4)
    expect(lruKeys(cache)).toStrictEqual(['d', 'a', 'c'])
    expect(cache.get('b')).toBeUndefined()
  })

  it('get() miss does not change the order', () => {
    const cache = new ProstoCache({ limit: 3 })
    cache.set('a', 1)
    cache.set('b', 2)
    expect(cache.get('x')).toBeUndefined()
    expect(lruKeys(cache)).toStrictEqual(['b', 'a'])
  })

  it('repeated hits on a hot key keep it and evict the rest by recency', () => {
    const cache = new ProstoCache({ limit: 3 })
    cache.set('hot', 0)
    cache.set('a', 1)
    cache.set('b', 2)
    for (let i = 0; i < 1000; i++) {
      expect(cache.get('hot')).toBe(0)
    }
    expect(lruKeys(cache)).toStrictEqual(['hot', 'b', 'a'])
    cache.set('c', 3) // evicts a
    cache.set('d', 4) // evicts b
    expect(lruKeys(cache)).toStrictEqual(['d', 'c', 'hot'])
    cache.set('e', 5) // evicts hot (no longer used)
    expect(lruKeys(cache)).toStrictEqual(['e', 'd', 'c'])
  })

  it('evicts strictly in least-recently-used order', () => {
    const cache = new ProstoCache({ limit: 3 })
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)
    cache.get('b')
    cache.get('a')
    // recency: a, b, c
    cache.set('d', 4)
    expect(lruKeys(cache)).toStrictEqual(['d', 'a', 'b'])
    cache.set('e', 5)
    expect(lruKeys(cache)).toStrictEqual(['e', 'd', 'a'])
    cache.set('f', 6)
    expect(lruKeys(cache)).toStrictEqual(['f', 'e', 'd'])
  })

  it('re-set of an existing key updates the value, refreshes recency and does not grow', () => {
    const cache = new ProstoCache({ limit: 3 })
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)
    // eslint-disable-next-line sonarjs/no-element-overwrite
    cache.set('a', 10)
    expect(lruKeys(cache)).toStrictEqual(['a', 'c', 'b'])
    expect((cache as any).data.size).toBe(3)
    cache.set('d', 4)
    expect(lruKeys(cache)).toStrictEqual(['d', 'a', 'c'])
    expect(cache.get('a')).toBe(10)
  })

  it('del() in the middle, at the head and at the tail keeps the list consistent', () => {
    const cache = new ProstoCache({ limit: 3 })
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)
    cache.del('b') // middle
    expect(lruKeys(cache)).toStrictEqual(['c', 'a'])
    cache.set('d', 4) // fits, no eviction
    expect(lruKeys(cache)).toStrictEqual(['d', 'c', 'a'])
    cache.set('e', 5) // evicts a
    expect(lruKeys(cache)).toStrictEqual(['e', 'd', 'c'])
    cache.del('e') // head
    expect(lruKeys(cache)).toStrictEqual(['d', 'c'])
    cache.del('c') // tail
    expect(lruKeys(cache)).toStrictEqual(['d'])
    cache.del('d') // only entry
    expect(lruKeys(cache)).toStrictEqual([])
    cache.del('missing')
    cache.set('f', 6)
    expect(lruKeys(cache)).toStrictEqual(['f'])
  })

  it('limit = 1 keeps only the latest entry', () => {
    const cache = new ProstoCache({ limit: 1 })
    cache.set('a', 1)
    expect(cache.get('a')).toBe(1)
    cache.set('b', 2)
    expect(lruKeys(cache)).toStrictEqual(['b'])
    expect(cache.get('a')).toBeUndefined()
    cache.set('b', 3)
    expect(lruKeys(cache)).toStrictEqual(['b'])
    expect(cache.get('b')).toBe(3)
    cache.del('b')
    expect(lruKeys(cache)).toStrictEqual([])
    cache.set('c', 4)
    expect(cache.get('c')).toBe(4)
  })

  it('reset() clears the recency list and the limit still applies afterwards', () => {
    const cache = new ProstoCache({ limit: 2 })
    cache.set('a', 1)
    cache.set('b', 2)
    cache.reset()
    expect(lruKeys(cache)).toStrictEqual([])
    expect(cache.get('a')).toBeUndefined()
    cache.set('c', 3)
    cache.set('d', 4)
    cache.get('c')
    cache.set('e', 5)
    expect(lruKeys(cache)).toStrictEqual(['e', 'c'])
  })

  it('expired entries leave the recency list', () => {
    jest.useFakeTimers()
    const cache = new ProstoCache({ limit: 3 })
    cache.set('a', 1)
    cache.set('t', 2, 10)
    cache.set('b', 3)
    jest.advanceTimersByTime(11)
    expect(lruKeys(cache)).toStrictEqual(['b', 'a'])
    cache.set('c', 4) // fits into the freed slot, no eviction
    expect(lruKeys(cache)).toStrictEqual(['c', 'b', 'a'])
  })

  it('onExpire removing the entry itself does not corrupt the list', () => {
    jest.useFakeTimers()
    const cache: ProstoCache = new ProstoCache({
      limit: 3,
      onExpire: key => {
        cache.del(key)
      },
    })
    cache.set('a', 1)
    cache.set('t', 2, 10)
    cache.set('b', 3)
    jest.advanceTimersByTime(11)
    expect(lruKeys(cache)).toStrictEqual(['b', 'a'])
  })

  it('re-set of an existing key replaces its previous expiry', () => {
    jest.useFakeTimers()
    const cb = jest.fn()
    const cache = new ProstoCache({ onExpire: cb })
    cache.set('k', 'v1', 50)
    cache.set('k', 'v2', 500)
    jest.advanceTimersByTime(60)
    expect(cache.get('k')).toBe('v2')
    expect(cb).not.toHaveBeenCalled()
    jest.advanceTimersByTime(500)
    expect(cache.get('k')).toBeUndefined()
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith('k', 'v2')
  })

  it('re-set without ttl drops the previous expiry', () => {
    jest.useFakeTimers()
    const cache = new ProstoCache()
    cache.set('k', 'v1', 50)
    cache.set('k', 'v2')
    jest.advanceTimersByTime(100)
    expect(cache.get('k')).toBe('v2')
  })
})

/* ------------------------------------------------------------------
 * onExpire RE-ENTRANCY
 * ------------------------------------------------------------------ */

describe('ProstoCache – onExpire re-entrancy', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.clearAllTimers()
  })

  it('onExpire deleting the expiring entry does not stop later expiries', () => {
    const cache: ProstoCache = new ProstoCache({
      onExpire: key => {
        cache.del(key)
      },
    })
    cache.set('a', 1, 10)
    cache.set('b', 2, 50)
    jest.advanceTimersByTime(11)
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe(2)
    jest.advanceTimersByTime(50)
    expect(cache.get('b')).toBeUndefined()
    expect((cache as any).expireOrder).toStrictEqual([])
    expect((cache as any).expireSeries.size).toBe(0)
  })

  it('onExpire re-setting the same key keeps the new value and its new ttl', () => {
    const reSet = (key: string, value: unknown) => {
      cache.set(key, `${value as string}+`, 10)
    }
    const onExpire = jest.fn().mockImplementationOnce(reSet).mockImplementationOnce(reSet)
    const cache: ProstoCache = new ProstoCache({ onExpire })
    cache.set('k', 'v', 10)
    jest.advanceTimersByTime(11)
    expect(cache.get('k')).toBe('v+')
    jest.advanceTimersByTime(10)
    expect(cache.get('k')).toBe('v++')
    jest.advanceTimersByTime(10)
    expect(cache.get('k')).toBeUndefined()
    expect(onExpire.mock.calls).toStrictEqual([
      ['k', 'v'],
      ['k', 'v+'],
      ['k', 'v++'],
    ])
    expect(lruKeys(cache)).toStrictEqual([])
  })

  it('onExpire extending the ttl via get() keeps the entry', () => {
    const onExpire = jest.fn().mockImplementationOnce((key: string) => {
      cache.get(key, true)
    })
    const cache: ProstoCache = new ProstoCache({ onExpire })
    cache.set('k', 'v', 10)
    jest.advanceTimersByTime(11)
    expect(cache.get('k')).toBe('v')
    jest.advanceTimersByTime(10)
    expect(cache.get('k')).toBeUndefined()
    expect(onExpire).toHaveBeenCalledTimes(2)
  })

  it('onExpire calling reset() leaves an empty, usable cache', () => {
    const cache: ProstoCache = new ProstoCache({
      onExpire: () => {
        cache.reset()
      },
    })
    cache.set('a', 1, 10)
    cache.set('b', 2, 10)
    cache.set('x', 3)
    jest.advanceTimersByTime(11)
    expect(lruKeys(cache)).toStrictEqual([])
    cache.set('c', 4, 10)
    expect(cache.get('c')).toBe(4)
    jest.advanceTimersByTime(11)
    expect(lruKeys(cache)).toStrictEqual([])
  })

  it('onExpire calling reset() is not called for the remaining entries of the same moment', () => {
    const onExpire = jest.fn(() => {
      cache.reset()
    })
    const cache: ProstoCache = new ProstoCache({ onExpire })
    cache.set('a', 1, 10)
    cache.set('b', 2, 10)
    cache.set('c', 3, 10)
    jest.advanceTimersByTime(11)
    expect(onExpire.mock.calls).toStrictEqual([['a', 1]])
  })

  it('onExpire removing or re-setting other entries of the same moment skips their callback', () => {
    const onExpire = jest.fn().mockImplementationOnce(() => {
      // called for 'a'
      cache.del('b')
      cache.set('c', 'c2', 20)
    })
    const cache: ProstoCache = new ProstoCache({ onExpire })
    cache.set('a', 1, 10)
    cache.set('b', 2, 10)
    cache.set('c', 3, 10)
    cache.set('d', 4, 10)
    jest.advanceTimersByTime(11)
    expect(onExpire.mock.calls).toStrictEqual([
      ['a', 1],
      ['d', 4],
    ])
    expect(lruKeys(cache)).toStrictEqual(['c'])
    jest.advanceTimersByTime(20)
    expect(onExpire.mock.calls[2]).toStrictEqual(['c', 'c2'])
    expect(lruKeys(cache)).toStrictEqual([])
  })

  it('late timers expire overdue entries in time order even when onExpire reschedules', () => {
    const onExpire = jest.fn().mockImplementationOnce(() => {
      // called for 'a1': removes the next overdue moment, which reschedules the expiry timer
      cache.del('x')
    })
    const cache: ProstoCache = new ProstoCache({ onExpire })
    cache.set('a1', 1, 10)
    cache.set('a2', 2, 10)
    cache.set('x', 3, 20)
    cache.set('c', 4, 30)
    cache.set('d', 5, 1000)
    // event loop blocked: the clock moves on, the timer fires late
    jest.setSystemTime(Date.now() + 100)
    jest.advanceTimersByTime(10)
    expect(onExpire.mock.calls).toStrictEqual([
      ['a1', 1],
      ['a2', 2],
      ['c', 4],
    ])
    expect(lruKeys(cache)).toStrictEqual(['d'])
    expect(jest.getTimerCount()).toBe(1)
    jest.advanceTimersByTime(1000)
    expect(onExpire).toHaveBeenLastCalledWith('d', 5)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('expires many overdue moments without growing the call stack', () => {
    const count = 20_000
    const onExpire = jest.fn()
    const cache = new ProstoCache({ limit: count, onExpire })
    for (let i = 0; i < count; i++) {
      jest.setSystemTime(Date.now() + 1)
      cache.set(`k${i}`, i, 1)
    }
    jest.setSystemTime(Date.now() + 10)
    expect(() => {
      jest.advanceTimersByTime(1)
    }).not.toThrow()
    expect(onExpire).toHaveBeenCalledTimes(count)
    expect(lruKeys(cache)).toStrictEqual([])
  })

  it('onExpire throwing does not stop the other entries of the moment nor later expiries', () => {
    const onExpire = jest
      .fn()
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        // called for 'b'
        throw new Error('boom')
      })
    const cache = new ProstoCache({ onExpire })
    cache.set('a', 1, 10)
    cache.set('b', 2, 10)
    cache.set('c', 3, 10)
    cache.set('d', 4, 50)
    // the error still surfaces from the timer, after the batch is done and the timer rescheduled
    expect(() => {
      jest.advanceTimersByTime(10)
    }).toThrow('boom')
    expect(onExpire.mock.calls).toStrictEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ])
    expect(lruKeys(cache)).toStrictEqual(['d'])
    expect(jest.getTimerCount()).toBe(1)
    jest.advanceTimersByTime(40)
    expect(onExpire).toHaveBeenLastCalledWith('d', 4)
    expect(lruKeys(cache)).toStrictEqual([])
    expect(jest.getTimerCount()).toBe(0)
  })

  it('onExpire throwing for overdue moments expires all of them and surfaces the first error', () => {
    const boom = (key: string) => {
      throw new Error(`boom ${key}`)
    }
    // throws for 'a', 'b' and 'e', not for 'c'
    const onExpire = jest
      .fn()
      .mockImplementationOnce(boom)
      .mockImplementationOnce(boom)
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(boom)
    const cache = new ProstoCache({ onExpire })
    cache.set('a', 1, 10)
    cache.set('b', 2, 20)
    cache.set('c', 3, 30)
    cache.set('d', 4, 1000)
    // event loop blocked: the clock moves on, the timer fires late
    jest.setSystemTime(Date.now() + 100)
    expect(() => {
      jest.advanceTimersByTime(10)
    }).toThrow('boom a')
    expect(onExpire).toHaveBeenCalledTimes(3)
    expect(lruKeys(cache)).toStrictEqual(['d'])
    expect(jest.getTimerCount()).toBe(1)
    // the cache keeps working: entries set from outside get scheduled and expire
    cache.set('e', 5, 10)
    expect(jest.getTimerCount()).toBe(1)
    expect(() => {
      jest.advanceTimersByTime(10)
    }).toThrow('boom e')
    expect(lruKeys(cache)).toStrictEqual(['d'])
  })

  it('set/get/del never run onExpire synchronously, even for overdue entries', () => {
    const onExpire = jest.fn(() => {
      // called for 'b' only
      cache.del('a')
      throw new Error('boom')
    })
    const cache: ProstoCache = new ProstoCache({ onExpire })
    cache.set('x', 0)
    cache.set('a', 1, 10)
    cache.set('b', 2, 20)
    // event loop blocked: both entries are overdue, the timer has not fired yet
    jest.setSystemTime(Date.now() + 50)
    expect(() => {
      cache.set('a', 'new', 100) // reschedules the timer for the overdue 'b'
      cache.get('x', true)
      cache.del('y')
    }).not.toThrow()
    expect(onExpire).not.toHaveBeenCalled()
    expect(lruKeys(cache)).toStrictEqual(['x', 'a', 'b'])
    expect(() => {
      jest.advanceTimersByTime(0)
    }).toThrow('boom')
    expect(onExpire.mock.calls).toStrictEqual([['b', 2]])
    expect(lruKeys(cache)).toStrictEqual(['x'])
    expect(jest.getTimerCount()).toBe(0)
  })

  it('onExpire re-arming its key as already overdue expires it on the next timer, not in a loop', () => {
    const onExpire = jest.fn()
    for (let i = 0; i < 5; i++) {
      onExpire.mockImplementationOnce((key: string, value: number) => {
        cache.set(key, value + 1, -1) // overdue right away
      })
    }
    const cache: ProstoCache = new ProstoCache({ onExpire })
    cache.set('a', 0, 10)
    cache.set('b', 'later', 20)
    jest.advanceTimersByTime(10)
    expect(onExpire.mock.calls).toStrictEqual([['a', 0]])
    jest.advanceTimersToNextTimer(5)
    expect(onExpire.mock.calls).toStrictEqual([0, 1, 2, 3, 4, 5].map(v => ['a', v]))
    expect(lruKeys(cache)).toStrictEqual(['b'])
    jest.advanceTimersByTime(10)
    expect(onExpire).toHaveBeenLastCalledWith('b', 'later')
    expect(jest.getTimerCount()).toBe(0)
  })

  it('onExpire re-setting its key onto the moment being expired keeps it until the next timer', () => {
    const onExpire = jest.fn().mockImplementationOnce((key: string) => {
      jest.setSystemTime(Date.now() + 1) // the callback took 1ms
      cache.set(key, 'new', -1) // lands on the very moment being expired
    })
    const cache: ProstoCache = new ProstoCache({ onExpire })
    cache.set('a', 'old', 10)
    jest.advanceTimersByTime(10)
    expect(onExpire.mock.calls).toStrictEqual([['a', 'old']])
    expect(cache.get('a')).toBe('new')
    jest.advanceTimersToNextTimer()
    expect(onExpire.mock.calls).toStrictEqual([
      ['a', 'old'],
      ['a', 'new'],
    ])
    expect(lruKeys(cache)).toStrictEqual([])
    expect(jest.getTimerCount()).toBe(0)
  })
})

describe('ProstoCache – environments', () => {
  it('works where timers have no unref() (browsers)', async () => {
    const realSetTimeout = global.setTimeout
    // browsers return a numeric timer id
    const spy = jest
      .spyOn(global, 'setTimeout')
      .mockImplementation(((fn: () => void, ms?: number) =>
        Number(realSetTimeout(fn, ms))) as unknown as typeof setTimeout)
    try {
      const onExpire = jest.fn()
      const cache = new ProstoCache({ onExpire })
      expect(() => {
        cache.set('a', 1, 30)
        cache.set('b', 2, 10) // reschedules the earlier timer
      }).not.toThrow()
      await sleep(50)
      expect(onExpire.mock.calls).toStrictEqual([
        ['b', 2],
        ['a', 1],
      ])
    } finally {
      spy.mockRestore()
    }
  })
})
