export interface TProstoCacheStrategy<KeyType> {
    obj: string
    ttl: number
    limit?: number
    keyFunc?: (...args: KeyType extends undefined ? [] : [KeyType]) => string
    cacheError?: boolean
}

export interface TProstoCacheObject<DataType> {
    [key: string]: {
        promise: Promise<DataType>
        expire: number,
        // eslint-disable-next-line no-undef
        timeout: NodeJS.Timeout
    }
}
