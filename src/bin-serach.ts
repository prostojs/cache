export interface TBinaryResult {
  found: boolean
  index: number
}

export function binarySearch(a: number[], n: number): TBinaryResult {
  let start = 0
  let end = a.length - 1
  let mid = 0

  while (start <= end) {
    mid = Math.ceil((start + end) / 2)

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
    index: mid > 0 ? mid : 0,
  }
}
