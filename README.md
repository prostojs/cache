# @prostojs/cache

ProstoCache is a class that provides in-memory caching functionality.
It supports features like entry and cache level time-to-live (TTL), cache size limiting, and automatic entry expiration.

## Installation

To use ProstoCache, install it via npm:

```bash
npm install @prostojs/cache
```

## Usage

Import `ProstoCache` in your project:

```typescript
import { ProstoCache } from '@prostojs/cache'
```

Create an instance of `ProstoCache`

```typescript
const cache = new ProstoCache(options)
```

## Options

When creating a new instance of `ProstoCache`, you can pass an optional `options` object to customize its behavior:

- `limit` (number): Maximum number of items the cache can hold. **1000** by default.
- `ttl` (number, optional): Default time-to-live for cache entries in specified units.
- `ttlUnits` (**'ms'** | 's' | 'm' | 'h', optional): Units for TTL ('ms' for milliseconds, 's' for seconds, 'm' for minutes, 'h' for hours).
- `onExpire` (function, optional): Callback function to be called when an entry expires. It receives the key and value of the expired entry.

## Methods

### set

Stores a value in the cache.

```typescript
cache.set(key: string, value: any, ttl?: number, ttlUnits?: 'ms' | 's' | 'm' | 'h'): void
```

- `key`: The key under which to store the value.
- `value`: The value to store.
- `ttl` (optional): Time-to-live for this specific entry.
- `ttlUnits` (optional): Units for the entry's TTL.

### get

Retrieves a value from the cache.

```typescript
cache.get<T = DataType>(key: string, extendTtl?: boolean, ttl?: number, ttlUnits?: 'ms' | 's' | 'm' | 'h'): T | undefined
```

- `key`: The key of the value to retrieve.
- `extendTtl` (optional): Restarts the entry's TTL on a hit (entries without TTL are unaffected).
- `ttl`, `ttlUnits` (optional): TTL to use when extending; defaults to the entry's own TTL.
- Returns the value associated with the key, or `undefined` if the key does not exist or has expired.

### del

Deletes an entry from the cache.

```typescript
cache.del(key: string): void
```

- `key`: The key of the entry to delete.

### reset

Clears all entries from the cache.

```typescript
cache.reset(): void
```

## Example

```typescript
import { ProstoCache } from '@prostojs/cache'

// Create a cache instance with a limit of 100 items and a default TTL of 1 hour
const cache = new ProstoCache({ limit: 100, ttl: 1, ttlUnits: 'h' })

// Set a value in the cache
cache.set('myKey', 'myValue')

// Retrieve a value from the cache
const value = cache.get('myKey')
console.log(value) // Outputs: 'myValue'

// Delete a value from the cache
cache.del('myKey')

// Reset the cache
cache.reset()
```

## Notes

- The cache automatically handles the expiration of entries based on the TTL provided.
- When the cache reaches its limit, the least recently used entry is evicted. Both `get` (on a hit) and `set` mark an entry as recently used; marking is O(1) and does not slow down lookups of frequently used keys.
- Calling `set` for an existing key replaces its value and its TTL (an entry set without TTL and with no cache-level `ttl` never expires).
- TTLs longer than the `setTimeout` limit (2^31 − 1 ms, about 24.8 days) are supported: such entries expire on time, not right away.
- The `onExpire` callback, if provided, is called whenever an entry expires. It may call `set`, `get`, `del` or `reset`; re-setting the expiring key (or extending it with `get(key, true)`) inside the callback keeps the entry. Entries that a callback removes, re-sets or extends before their own turn (including via `reset`) do not get the callback. Entries due at the same moment are reported in insertion order, overdue entries (e.g. after a blocked event loop) in expiry order. The callback always runs from the expiry timer, never inside a `set`, `get` or `del` call. One timer run only expires what was due when it fired: an entry that a callback re-queues onto the moment being expired, or makes due at a later moment (e.g. re-set with a negative `ttl`), waits for a following timer run, so a callback that keeps re-arming itself cannot block the event loop. If the callback throws, the remaining entries still expire and the next expiry is still scheduled; the first error is then rethrown from the timer (an uncaught exception, as before).
- Works in Node.js and browsers: the expiry timer is `unref()`-ed where the runtime supports it, so it never keeps a Node.js process alive.

## License

MIT License
