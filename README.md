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
cache.get<T = DataType>(key: string): T | undefined
```

- `key`: The key of the value to retrieve.
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
import { ProstoCache } from 'your-prosto-cache-package-name'

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
- When the cache reaches its limit, the oldest entries are removed first.
- The `onExpire` callback, if provided, is called whenever an entry expires.

## License

MIT License
