# @prostojs/cache

Light and fast in-memory cache with TTL and limit support.

## Install

npm: `npm install @prostojs/cache`

Via CDN:

```
<script src="https://unpkg.com/@prostojs/cache"></script>
```

## Usage

The `limit` queue works as FIFO.

The `ttl` works via setTimeout. Every time there is only one timeout fired
for the earliest expiring entry. After the entry is removed or expired
a new timeout is fired for the next earliest expiring entry. If several
entries expire at the same time it will still handle it via single
timeout handler.

```ts
const { ProstoCache } = require('@prostojs/cache')

// constructor accepts type of cache object
const cache = new ProstoCache<string>({
  ttl: 1000 * 60, // time to live (by default null e.g. unlimited)
  limit: 100, // limit cache entries (1000 by default)
  // limit: 0 will prevent cache from storing values
})

// set values
cache.set('key1', 'value1')
cache.set('key2', 'value2')

// it's possible to replace the object type
cache.set<number[]>('otherType', [1, 2, 3])

// get values
cache.get('key1') // "value1"
cache.get('key2') // "value2"
cache.get('key3') // undefined

// replacing object type on get
cache.get<number[]>('otherType') // [1, 2, 3]

// reset cache (deletes all values)
cache.reset()

//del values
cache.del('key1')
cache.del('key2')
```
