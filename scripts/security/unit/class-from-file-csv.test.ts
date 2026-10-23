import { describe, expect, it } from 'vitest'
import { parseDelimited, rowsFromDelimited } from '../../../apps/admin-dashboard/src/utils/class-from-file'

describe('CSV/TSV reading (Class from file)', () => {
  it('reads quoted cells with the delimiter, quotes and line breaks, a BOM and CRLF', () => {
    const rows = rowsFromDelimited('﻿name;age;ok;zip\r\n"Rossi; Mario";42;TRUE;00100\r\n"a ""q""\nline";;false;7\r\n')
    expect(rows).toEqual([
      { name: 'Rossi; Mario', age: 42, ok: true, zip: '00100' },
      { name: 'a "q"\nline', age: null, ok: false, zip: 7 },
    ])
  })
  it('guesses the delimiter from the first line and honours a given one', () => {
    expect(parseDelimited('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']])
    expect(parseDelimited('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']])
    expect(rowsFromDelimited('a\tb\n1\t2.5\n', '\t')).toEqual([{ a: 1, b: 2.5 }])
  })
  it('skips empty lines, names blank columns and returns nothing for an empty file', () => {
    expect(rowsFromDelimited('a,\n\n1,2\n')).toEqual([{ a: 1, column_2: 2 }])
    expect(rowsFromDelimited('')).toEqual([])
  })
})
