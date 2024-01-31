/* eslint-disable jest/max-expects */
import { binarySearch } from './bin-serach'

describe('bin-search', () => {
  it('must', () => {
    expect(binarySearch([4, 6, 8], 2)).toStrictEqual({
      found: false,
      index: 0,
    })
    expect(binarySearch([4, 6, 8, 10], 2)).toStrictEqual({
      found: false,
      index: 0,
    })
    expect(binarySearch([4, 6, 8], 4)).toStrictEqual({
      found: true,
      index: 0,
    })
    expect(binarySearch([4, 6], 5)).toStrictEqual({
      found: false,
      index: 1,
    })
    expect(binarySearch([4, 6, 8], 5)).toStrictEqual({
      found: false,
      index: 1,
    })
    expect(binarySearch([4, 6, 8, 10], 5)).toStrictEqual({
      found: false,
      index: 1,
    })
    expect(binarySearch([4, 6, 8], 6)).toStrictEqual({
      found: true,
      index: 1,
    })
    expect(binarySearch([4, 6, 8], 7)).toStrictEqual({
      found: false,
      index: 2,
    })
    expect(binarySearch([4, 6, 8], 10)).toStrictEqual({
      found: false,
      index: 3,
    })
  })
})
