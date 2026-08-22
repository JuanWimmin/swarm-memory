# b4a 1.8.1 — verified API (README)

Buffer/Uint8Array bridge. **Use it instead of the `Buffer` global in Bare code.** Every function mirrors the Node Buffer API
of the same name.

- Create: `b4a.from(string, [encoding])`, `b4a.from(array)`, `b4a.from(arrayBuffer, [byteOffset, length])`, `b4a.from(buffer)`,
  `b4a.alloc(size, [fill, encoding])`, `b4a.allocUnsafe(size)`, `b4a.allocUnsafeSlow(size)`, `b4a.concat(buffers, [totalLength])`.
- Inspect: `b4a.isBuffer(x)` (true for any Uint8Array), `b4a.isEncoding(enc)`, `b4a.byteLength(string)`, `b4a.equals(a, b)`,
  `b4a.compare(a, b)`, `b4a.includes(buf, value, [byteOffset], [encoding])`, `b4a.indexOf(...)`, `b4a.lastIndexOf(...)`.
- Convert: `b4a.toString(buf, [encoding, start, end])` (`'hex'`, `'utf8'`, `'base64'`, ...), `b4a.toBuffer(buf)`,
  `b4a.write(buf, string, [offset, length], [encoding])`, `b4a.copy(src, dst, [targetStart, sourceStart, sourceEnd])`,
  `b4a.fill(buf, value, [offset, end], [encoding])`.
- Numbers: `writeUInt32LE/readUInt32LE`, `writeInt32LE/readInt32LE`, `writeDoubleLE/readDoubleLE`, `writeFloatLE/readFloatLE`,
  `swap16/32/64`.

Typical: `b4a.toString(key, 'hex')` ↔ `b4a.from(hex, 'hex')`; `b4a.equals(node.from.key, base.local.key)`.
Not in README: `b4a.toJSON`, `b4a.slice` (use `buf.subarray`), `b4a.toHex`.
