/* eslint-disable promise/param-names */
/* eslint-disable jest/max-expects */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
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
