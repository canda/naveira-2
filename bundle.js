'use strict';

var global$1 = (typeof global !== "undefined" ? global :
            typeof self !== "undefined" ? self :
            typeof window !== "undefined" ? window : {});

var lookup = [];
var revLookup = [];
var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array;
var inited = false;
function init () {
  inited = true;
  var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (var i = 0, len = code.length; i < len; ++i) {
    lookup[i] = code[i];
    revLookup[code.charCodeAt(i)] = i;
  }

  revLookup['-'.charCodeAt(0)] = 62;
  revLookup['_'.charCodeAt(0)] = 63;
}

function toByteArray (b64) {
  if (!inited) {
    init();
  }
  var i, j, l, tmp, placeHolders, arr;
  var len = b64.length;

  if (len % 4 > 0) {
    throw new Error('Invalid string. Length must be a multiple of 4')
  }

  // the number of equal signs (place holders)
  // if there are two placeholders, than the two characters before it
  // represent one byte
  // if there is only one, then the three characters before it represent 2 bytes
  // this is just a cheap hack to not do indexOf twice
  placeHolders = b64[len - 2] === '=' ? 2 : b64[len - 1] === '=' ? 1 : 0;

  // base64 is 4/3 + up to two characters of the original data
  arr = new Arr(len * 3 / 4 - placeHolders);

  // if there are placeholders, only get up to the last complete 4 chars
  l = placeHolders > 0 ? len - 4 : len;

  var L = 0;

  for (i = 0, j = 0; i < l; i += 4, j += 3) {
    tmp = (revLookup[b64.charCodeAt(i)] << 18) | (revLookup[b64.charCodeAt(i + 1)] << 12) | (revLookup[b64.charCodeAt(i + 2)] << 6) | revLookup[b64.charCodeAt(i + 3)];
    arr[L++] = (tmp >> 16) & 0xFF;
    arr[L++] = (tmp >> 8) & 0xFF;
    arr[L++] = tmp & 0xFF;
  }

  if (placeHolders === 2) {
    tmp = (revLookup[b64.charCodeAt(i)] << 2) | (revLookup[b64.charCodeAt(i + 1)] >> 4);
    arr[L++] = tmp & 0xFF;
  } else if (placeHolders === 1) {
    tmp = (revLookup[b64.charCodeAt(i)] << 10) | (revLookup[b64.charCodeAt(i + 1)] << 4) | (revLookup[b64.charCodeAt(i + 2)] >> 2);
    arr[L++] = (tmp >> 8) & 0xFF;
    arr[L++] = tmp & 0xFF;
  }

  return arr
}

function tripletToBase64 (num) {
  return lookup[num >> 18 & 0x3F] + lookup[num >> 12 & 0x3F] + lookup[num >> 6 & 0x3F] + lookup[num & 0x3F]
}

function encodeChunk (uint8, start, end) {
  var tmp;
  var output = [];
  for (var i = start; i < end; i += 3) {
    tmp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2]);
    output.push(tripletToBase64(tmp));
  }
  return output.join('')
}

function fromByteArray (uint8) {
  if (!inited) {
    init();
  }
  var tmp;
  var len = uint8.length;
  var extraBytes = len % 3; // if we have 1 byte left, pad 2 bytes
  var output = '';
  var parts = [];
  var maxChunkLength = 16383; // must be multiple of 3

  // go through the array every three bytes, we'll deal with trailing stuff later
  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
    parts.push(encodeChunk(uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)));
  }

  // pad the end with zeros, but make sure to not forget the extra bytes
  if (extraBytes === 1) {
    tmp = uint8[len - 1];
    output += lookup[tmp >> 2];
    output += lookup[(tmp << 4) & 0x3F];
    output += '==';
  } else if (extraBytes === 2) {
    tmp = (uint8[len - 2] << 8) + (uint8[len - 1]);
    output += lookup[tmp >> 10];
    output += lookup[(tmp >> 4) & 0x3F];
    output += lookup[(tmp << 2) & 0x3F];
    output += '=';
  }

  parts.push(output);

  return parts.join('')
}

function read (buffer, offset, isLE, mLen, nBytes) {
  var e, m;
  var eLen = nBytes * 8 - mLen - 1;
  var eMax = (1 << eLen) - 1;
  var eBias = eMax >> 1;
  var nBits = -7;
  var i = isLE ? (nBytes - 1) : 0;
  var d = isLE ? -1 : 1;
  var s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

function write (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c;
  var eLen = nBytes * 8 - mLen - 1;
  var eMax = (1 << eLen) - 1;
  var eBias = eMax >> 1;
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0);
  var i = isLE ? 0 : (nBytes - 1);
  var d = isLE ? 1 : -1;
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128;
}

var toString = {}.toString;

var isArray = Array.isArray || function (arr) {
  return toString.call(arr) == '[object Array]';
};

var INSPECT_MAX_BYTES = 50;

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * Due to various browser bugs, sometimes the Object implementation will be used even
 * when the browser supports typed arrays.
 *
 * Note:
 *
 *   - Firefox 4-29 lacks support for adding new properties to `Uint8Array` instances,
 *     See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
 *
 *   - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
 *
 *   - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
 *     incorrect length in some situations.

 * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they
 * get the Object implementation, which is slower but behaves correctly.
 */
Buffer.TYPED_ARRAY_SUPPORT = global$1.TYPED_ARRAY_SUPPORT !== undefined
  ? global$1.TYPED_ARRAY_SUPPORT
  : true;

/*
 * Export kMaxLength after typed array support is determined.
 */
var _kMaxLength = kMaxLength();

function kMaxLength () {
  return Buffer.TYPED_ARRAY_SUPPORT
    ? 0x7fffffff
    : 0x3fffffff
}

function createBuffer (that, length) {
  if (kMaxLength() < length) {
    throw new RangeError('Invalid typed array length')
  }
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    that = new Uint8Array(length);
    that.__proto__ = Buffer.prototype;
  } else {
    // Fallback: Return an object instance of the Buffer class
    if (that === null) {
      that = new Buffer(length);
    }
    that.length = length;
  }

  return that
}

/**
 * The Buffer constructor returns instances of `Uint8Array` that have their
 * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
 * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
 * and the `Uint8Array` methods. Square bracket notation works as expected -- it
 * returns a single octet.
 *
 * The `Uint8Array` prototype remains unmodified.
 */

function Buffer (arg, encodingOrOffset, length) {
  if (!Buffer.TYPED_ARRAY_SUPPORT && !(this instanceof Buffer)) {
    return new Buffer(arg, encodingOrOffset, length)
  }

  // Common case.
  if (typeof arg === 'number') {
    if (typeof encodingOrOffset === 'string') {
      throw new Error(
        'If encoding is specified then the first argument must be a string'
      )
    }
    return allocUnsafe(this, arg)
  }
  return from(this, arg, encodingOrOffset, length)
}

Buffer.poolSize = 8192; // not used by this implementation

// TODO: Legacy, not needed anymore. Remove in next major version.
Buffer._augment = function (arr) {
  arr.__proto__ = Buffer.prototype;
  return arr
};

function from (that, value, encodingOrOffset, length) {
  if (typeof value === 'number') {
    throw new TypeError('"value" argument must not be a number')
  }

  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
    return fromArrayBuffer(that, value, encodingOrOffset, length)
  }

  if (typeof value === 'string') {
    return fromString(that, value, encodingOrOffset)
  }

  return fromObject(that, value)
}

/**
 * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
 * if value is a number.
 * Buffer.from(str[, encoding])
 * Buffer.from(array)
 * Buffer.from(buffer)
 * Buffer.from(arrayBuffer[, byteOffset[, length]])
 **/
Buffer.from = function (value, encodingOrOffset, length) {
  return from(null, value, encodingOrOffset, length)
};

if (Buffer.TYPED_ARRAY_SUPPORT) {
  Buffer.prototype.__proto__ = Uint8Array.prototype;
  Buffer.__proto__ = Uint8Array;
}

function assertSize (size) {
  if (typeof size !== 'number') {
    throw new TypeError('"size" argument must be a number')
  } else if (size < 0) {
    throw new RangeError('"size" argument must not be negative')
  }
}

function alloc (that, size, fill, encoding) {
  assertSize(size);
  if (size <= 0) {
    return createBuffer(that, size)
  }
  if (fill !== undefined) {
    // Only pay attention to encoding if it's a string. This
    // prevents accidentally sending in a number that would
    // be interpretted as a start offset.
    return typeof encoding === 'string'
      ? createBuffer(that, size).fill(fill, encoding)
      : createBuffer(that, size).fill(fill)
  }
  return createBuffer(that, size)
}

/**
 * Creates a new filled Buffer instance.
 * alloc(size[, fill[, encoding]])
 **/
Buffer.alloc = function (size, fill, encoding) {
  return alloc(null, size, fill, encoding)
};

function allocUnsafe (that, size) {
  assertSize(size);
  that = createBuffer(that, size < 0 ? 0 : checked(size) | 0);
  if (!Buffer.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < size; ++i) {
      that[i] = 0;
    }
  }
  return that
}

/**
 * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
 * */
Buffer.allocUnsafe = function (size) {
  return allocUnsafe(null, size)
};
/**
 * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
 */
Buffer.allocUnsafeSlow = function (size) {
  return allocUnsafe(null, size)
};

function fromString (that, string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') {
    encoding = 'utf8';
  }

  if (!Buffer.isEncoding(encoding)) {
    throw new TypeError('"encoding" must be a valid string encoding')
  }

  var length = byteLength(string, encoding) | 0;
  that = createBuffer(that, length);

  var actual = that.write(string, encoding);

  if (actual !== length) {
    // Writing a hex string, for example, that contains invalid characters will
    // cause everything after the first invalid character to be ignored. (e.g.
    // 'abxxcd' will be treated as 'ab')
    that = that.slice(0, actual);
  }

  return that
}

function fromArrayLike (that, array) {
  var length = array.length < 0 ? 0 : checked(array.length) | 0;
  that = createBuffer(that, length);
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255;
  }
  return that
}

function fromArrayBuffer (that, array, byteOffset, length) {
  array.byteLength; // this throws if `array` is not a valid ArrayBuffer

  if (byteOffset < 0 || array.byteLength < byteOffset) {
    throw new RangeError('\'offset\' is out of bounds')
  }

  if (array.byteLength < byteOffset + (length || 0)) {
    throw new RangeError('\'length\' is out of bounds')
  }

  if (byteOffset === undefined && length === undefined) {
    array = new Uint8Array(array);
  } else if (length === undefined) {
    array = new Uint8Array(array, byteOffset);
  } else {
    array = new Uint8Array(array, byteOffset, length);
  }

  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    that = array;
    that.__proto__ = Buffer.prototype;
  } else {
    // Fallback: Return an object instance of the Buffer class
    that = fromArrayLike(that, array);
  }
  return that
}

function fromObject (that, obj) {
  if (internalIsBuffer(obj)) {
    var len = checked(obj.length) | 0;
    that = createBuffer(that, len);

    if (that.length === 0) {
      return that
    }

    obj.copy(that, 0, 0, len);
    return that
  }

  if (obj) {
    if ((typeof ArrayBuffer !== 'undefined' &&
        obj.buffer instanceof ArrayBuffer) || 'length' in obj) {
      if (typeof obj.length !== 'number' || isnan(obj.length)) {
        return createBuffer(that, 0)
      }
      return fromArrayLike(that, obj)
    }

    if (obj.type === 'Buffer' && isArray(obj.data)) {
      return fromArrayLike(that, obj.data)
    }
  }

  throw new TypeError('First argument must be a string, Buffer, ArrayBuffer, Array, or array-like object.')
}

function checked (length) {
  // Note: cannot use `length < kMaxLength()` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= kMaxLength()) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + kMaxLength().toString(16) + ' bytes')
  }
  return length | 0
}

function SlowBuffer (length) {
  if (+length != length) { // eslint-disable-line eqeqeq
    length = 0;
  }
  return Buffer.alloc(+length)
}
Buffer.isBuffer = isBuffer;
function internalIsBuffer (b) {
  return !!(b != null && b._isBuffer)
}

Buffer.compare = function compare (a, b) {
  if (!internalIsBuffer(a) || !internalIsBuffer(b)) {
    throw new TypeError('Arguments must be Buffers')
  }

  if (a === b) return 0

  var x = a.length;
  var y = b.length;

  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i];
      y = b[i];
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
};

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'latin1':
    case 'binary':
    case 'base64':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
};

Buffer.concat = function concat (list, length) {
  if (!isArray(list)) {
    throw new TypeError('"list" argument must be an Array of Buffers')
  }

  if (list.length === 0) {
    return Buffer.alloc(0)
  }

  var i;
  if (length === undefined) {
    length = 0;
    for (i = 0; i < list.length; ++i) {
      length += list[i].length;
    }
  }

  var buffer = Buffer.allocUnsafe(length);
  var pos = 0;
  for (i = 0; i < list.length; ++i) {
    var buf = list[i];
    if (!internalIsBuffer(buf)) {
      throw new TypeError('"list" argument must be an Array of Buffers')
    }
    buf.copy(buffer, pos);
    pos += buf.length;
  }
  return buffer
};

function byteLength (string, encoding) {
  if (internalIsBuffer(string)) {
    return string.length
  }
  if (typeof ArrayBuffer !== 'undefined' && typeof ArrayBuffer.isView === 'function' &&
      (ArrayBuffer.isView(string) || string instanceof ArrayBuffer)) {
    return string.byteLength
  }
  if (typeof string !== 'string') {
    string = '' + string;
  }

  var len = string.length;
  if (len === 0) return 0

  // Use a for loop to avoid recursion
  var loweredCase = false;
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'latin1':
      case 'binary':
        return len
      case 'utf8':
      case 'utf-8':
      case undefined:
        return utf8ToBytes(string).length
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2
      case 'hex':
        return len >>> 1
      case 'base64':
        return base64ToBytes(string).length
      default:
        if (loweredCase) return utf8ToBytes(string).length // assume utf8
        encoding = ('' + encoding).toLowerCase();
        loweredCase = true;
    }
  }
}
Buffer.byteLength = byteLength;

function slowToString (encoding, start, end) {
  var loweredCase = false;

  // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
  // property of a typed array.

  // This behaves neither like String nor Uint8Array in that we set start/end
  // to their upper/lower bounds if the value passed is out of range.
  // undefined is handled specially as per ECMA-262 6th Edition,
  // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
  if (start === undefined || start < 0) {
    start = 0;
  }
  // Return early if start > this.length. Done here to prevent potential uint32
  // coercion fail below.
  if (start > this.length) {
    return ''
  }

  if (end === undefined || end > this.length) {
    end = this.length;
  }

  if (end <= 0) {
    return ''
  }

  // Force coersion to uint32. This will also coerce falsey/NaN values to 0.
  end >>>= 0;
  start >>>= 0;

  if (end <= start) {
    return ''
  }

  if (!encoding) encoding = 'utf8';

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'latin1':
      case 'binary':
        return latin1Slice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase();
        loweredCase = true;
    }
  }
}

// The property is used by `Buffer.isBuffer` and `is-buffer` (in Safari 5-7) to detect
// Buffer instances.
Buffer.prototype._isBuffer = true;

function swap (b, n, m) {
  var i = b[n];
  b[n] = b[m];
  b[m] = i;
}

Buffer.prototype.swap16 = function swap16 () {
  var len = this.length;
  if (len % 2 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 16-bits')
  }
  for (var i = 0; i < len; i += 2) {
    swap(this, i, i + 1);
  }
  return this
};

Buffer.prototype.swap32 = function swap32 () {
  var len = this.length;
  if (len % 4 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 32-bits')
  }
  for (var i = 0; i < len; i += 4) {
    swap(this, i, i + 3);
    swap(this, i + 1, i + 2);
  }
  return this
};

Buffer.prototype.swap64 = function swap64 () {
  var len = this.length;
  if (len % 8 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 64-bits')
  }
  for (var i = 0; i < len; i += 8) {
    swap(this, i, i + 7);
    swap(this, i + 1, i + 6);
    swap(this, i + 2, i + 5);
    swap(this, i + 3, i + 4);
  }
  return this
};

Buffer.prototype.toString = function toString () {
  var length = this.length | 0;
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
};

Buffer.prototype.equals = function equals (b) {
  if (!internalIsBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
};

Buffer.prototype.inspect = function inspect () {
  var str = '';
  var max = INSPECT_MAX_BYTES;
  if (this.length > 0) {
    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ');
    if (this.length > max) str += ' ... ';
  }
  return '<Buffer ' + str + '>'
};

Buffer.prototype.compare = function compare (target, start, end, thisStart, thisEnd) {
  if (!internalIsBuffer(target)) {
    throw new TypeError('Argument must be a Buffer')
  }

  if (start === undefined) {
    start = 0;
  }
  if (end === undefined) {
    end = target ? target.length : 0;
  }
  if (thisStart === undefined) {
    thisStart = 0;
  }
  if (thisEnd === undefined) {
    thisEnd = this.length;
  }

  if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
    throw new RangeError('out of range index')
  }

  if (thisStart >= thisEnd && start >= end) {
    return 0
  }
  if (thisStart >= thisEnd) {
    return -1
  }
  if (start >= end) {
    return 1
  }

  start >>>= 0;
  end >>>= 0;
  thisStart >>>= 0;
  thisEnd >>>= 0;

  if (this === target) return 0

  var x = thisEnd - thisStart;
  var y = end - start;
  var len = Math.min(x, y);

  var thisCopy = this.slice(thisStart, thisEnd);
  var targetCopy = target.slice(start, end);

  for (var i = 0; i < len; ++i) {
    if (thisCopy[i] !== targetCopy[i]) {
      x = thisCopy[i];
      y = targetCopy[i];
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
};

// Finds either the first index of `val` in `buffer` at offset >= `byteOffset`,
// OR the last index of `val` in `buffer` at offset <= `byteOffset`.
//
// Arguments:
// - buffer - a Buffer to search
// - val - a string, Buffer, or number
// - byteOffset - an index into `buffer`; will be clamped to an int32
// - encoding - an optional encoding, relevant is val is a string
// - dir - true for indexOf, false for lastIndexOf
function bidirectionalIndexOf (buffer, val, byteOffset, encoding, dir) {
  // Empty buffer means no match
  if (buffer.length === 0) return -1

  // Normalize byteOffset
  if (typeof byteOffset === 'string') {
    encoding = byteOffset;
    byteOffset = 0;
  } else if (byteOffset > 0x7fffffff) {
    byteOffset = 0x7fffffff;
  } else if (byteOffset < -0x80000000) {
    byteOffset = -0x80000000;
  }
  byteOffset = +byteOffset;  // Coerce to Number.
  if (isNaN(byteOffset)) {
    // byteOffset: it it's undefined, null, NaN, "foo", etc, search whole buffer
    byteOffset = dir ? 0 : (buffer.length - 1);
  }

  // Normalize byteOffset: negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = buffer.length + byteOffset;
  if (byteOffset >= buffer.length) {
    if (dir) return -1
    else byteOffset = buffer.length - 1;
  } else if (byteOffset < 0) {
    if (dir) byteOffset = 0;
    else return -1
  }

  // Normalize val
  if (typeof val === 'string') {
    val = Buffer.from(val, encoding);
  }

  // Finally, search either indexOf (if dir is true) or lastIndexOf
  if (internalIsBuffer(val)) {
    // Special case: looking for empty string/buffer always fails
    if (val.length === 0) {
      return -1
    }
    return arrayIndexOf(buffer, val, byteOffset, encoding, dir)
  } else if (typeof val === 'number') {
    val = val & 0xFF; // Search for a byte value [0-255]
    if (Buffer.TYPED_ARRAY_SUPPORT &&
        typeof Uint8Array.prototype.indexOf === 'function') {
      if (dir) {
        return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset)
      } else {
        return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset)
      }
    }
    return arrayIndexOf(buffer, [ val ], byteOffset, encoding, dir)
  }

  throw new TypeError('val must be string, number or Buffer')
}

function arrayIndexOf (arr, val, byteOffset, encoding, dir) {
  var indexSize = 1;
  var arrLength = arr.length;
  var valLength = val.length;

  if (encoding !== undefined) {
    encoding = String(encoding).toLowerCase();
    if (encoding === 'ucs2' || encoding === 'ucs-2' ||
        encoding === 'utf16le' || encoding === 'utf-16le') {
      if (arr.length < 2 || val.length < 2) {
        return -1
      }
      indexSize = 2;
      arrLength /= 2;
      valLength /= 2;
      byteOffset /= 2;
    }
  }

  function read (buf, i) {
    if (indexSize === 1) {
      return buf[i]
    } else {
      return buf.readUInt16BE(i * indexSize)
    }
  }

  var i;
  if (dir) {
    var foundIndex = -1;
    for (i = byteOffset; i < arrLength; i++) {
      if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
        if (foundIndex === -1) foundIndex = i;
        if (i - foundIndex + 1 === valLength) return foundIndex * indexSize
      } else {
        if (foundIndex !== -1) i -= i - foundIndex;
        foundIndex = -1;
      }
    }
  } else {
    if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength;
    for (i = byteOffset; i >= 0; i--) {
      var found = true;
      for (var j = 0; j < valLength; j++) {
        if (read(arr, i + j) !== read(val, j)) {
          found = false;
          break
        }
      }
      if (found) return i
    }
  }

  return -1
}

Buffer.prototype.includes = function includes (val, byteOffset, encoding) {
  return this.indexOf(val, byteOffset, encoding) !== -1
};

Buffer.prototype.indexOf = function indexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, true)
};

Buffer.prototype.lastIndexOf = function lastIndexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, false)
};

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0;
  var remaining = buf.length - offset;
  if (!length) {
    length = remaining;
  } else {
    length = Number(length);
    if (length > remaining) {
      length = remaining;
    }
  }

  // must be an even number of digits
  var strLen = string.length;
  if (strLen % 2 !== 0) throw new TypeError('Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2;
  }
  for (var i = 0; i < length; ++i) {
    var parsed = parseInt(string.substr(i * 2, 2), 16);
    if (isNaN(parsed)) return i
    buf[offset + i] = parsed;
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function latin1Write (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8';
    length = this.length;
    offset = 0;
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset;
    length = this.length;
    offset = 0;
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset | 0;
    if (isFinite(length)) {
      length = length | 0;
      if (encoding === undefined) encoding = 'utf8';
    } else {
      encoding = length;
      length = undefined;
    }
  // legacy write(string, encoding, offset, length) - remove in v0.13
  } else {
    throw new Error(
      'Buffer.write(string, encoding, offset[, length]) is no longer supported'
    )
  }

  var remaining = this.length - offset;
  if (length === undefined || length > remaining) length = remaining;

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('Attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8';

  var loweredCase = false;
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'latin1':
      case 'binary':
        return latin1Write(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase();
        loweredCase = true;
    }
  }
};

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
};

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return fromByteArray(buf)
  } else {
    return fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  end = Math.min(buf.length, end);
  var res = [];

  var i = start;
  while (i < end) {
    var firstByte = buf[i];
    var codePoint = null;
    var bytesPerSequence = (firstByte > 0xEF) ? 4
      : (firstByte > 0xDF) ? 3
      : (firstByte > 0xBF) ? 2
      : 1;

    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint;

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte;
          }
          break
        case 2:
          secondByte = buf[i + 1];
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F);
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint;
            }
          }
          break
        case 3:
          secondByte = buf[i + 1];
          thirdByte = buf[i + 2];
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F);
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint;
            }
          }
          break
        case 4:
          secondByte = buf[i + 1];
          thirdByte = buf[i + 2];
          fourthByte = buf[i + 3];
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F);
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint;
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD;
      bytesPerSequence = 1;
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000;
      res.push(codePoint >>> 10 & 0x3FF | 0xD800);
      codePoint = 0xDC00 | codePoint & 0x3FF;
    }

    res.push(codePoint);
    i += bytesPerSequence;
  }

  return decodeCodePointsArray(res)
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
var MAX_ARGUMENTS_LENGTH = 0x1000;

function decodeCodePointsArray (codePoints) {
  var len = codePoints.length;
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  var res = '';
  var i = 0;
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
    );
  }
  return res
}

function asciiSlice (buf, start, end) {
  var ret = '';
  end = Math.min(buf.length, end);

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i] & 0x7F);
  }
  return ret
}

function latin1Slice (buf, start, end) {
  var ret = '';
  end = Math.min(buf.length, end);

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i]);
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length;

  if (!start || start < 0) start = 0;
  if (!end || end < 0 || end > len) end = len;

  var out = '';
  for (var i = start; i < end; ++i) {
    out += toHex(buf[i]);
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end);
  var res = '';
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256);
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length;
  start = ~~start;
  end = end === undefined ? len : ~~end;

  if (start < 0) {
    start += len;
    if (start < 0) start = 0;
  } else if (start > len) {
    start = len;
  }

  if (end < 0) {
    end += len;
    if (end < 0) end = 0;
  } else if (end > len) {
    end = len;
  }

  if (end < start) end = start;

  var newBuf;
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    newBuf = this.subarray(start, end);
    newBuf.__proto__ = Buffer.prototype;
  } else {
    var sliceLen = end - start;
    newBuf = new Buffer(sliceLen, undefined);
    for (var i = 0; i < sliceLen; ++i) {
      newBuf[i] = this[i + start];
    }
  }

  return newBuf
};

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset | 0;
  byteLength = byteLength | 0;
  if (!noAssert) checkOffset(offset, byteLength, this.length);

  var val = this[offset];
  var mul = 1;
  var i = 0;
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul;
  }

  return val
};

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset | 0;
  byteLength = byteLength | 0;
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length);
  }

  var val = this[offset + --byteLength];
  var mul = 1;
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul;
  }

  return val
};

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length);
  return this[offset]
};

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length);
  return this[offset] | (this[offset + 1] << 8)
};

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length);
  return (this[offset] << 8) | this[offset + 1]
};

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length);

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
};

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length);

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
};

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset | 0;
  byteLength = byteLength | 0;
  if (!noAssert) checkOffset(offset, byteLength, this.length);

  var val = this[offset];
  var mul = 1;
  var i = 0;
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul;
  }
  mul *= 0x80;

  if (val >= mul) val -= Math.pow(2, 8 * byteLength);

  return val
};

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset | 0;
  byteLength = byteLength | 0;
  if (!noAssert) checkOffset(offset, byteLength, this.length);

  var i = byteLength;
  var mul = 1;
  var val = this[offset + --i];
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul;
  }
  mul *= 0x80;

  if (val >= mul) val -= Math.pow(2, 8 * byteLength);

  return val
};

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length);
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
};

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length);
  var val = this[offset] | (this[offset + 1] << 8);
  return (val & 0x8000) ? val | 0xFFFF0000 : val
};

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length);
  var val = this[offset + 1] | (this[offset] << 8);
  return (val & 0x8000) ? val | 0xFFFF0000 : val
};

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length);

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
};

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length);

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
};

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length);
  return read(this, offset, true, 23, 4)
};

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length);
  return read(this, offset, false, 23, 4)
};

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length);
  return read(this, offset, true, 52, 8)
};

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length);
  return read(this, offset, false, 52, 8)
};

function checkInt (buf, value, offset, ext, max, min) {
  if (!internalIsBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('"value" argument is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value;
  offset = offset | 0;
  byteLength = byteLength | 0;
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1;
    checkInt(this, value, offset, byteLength, maxBytes, 0);
  }

  var mul = 1;
  var i = 0;
  this[offset] = value & 0xFF;
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF;
  }

  return offset + byteLength
};

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value;
  offset = offset | 0;
  byteLength = byteLength | 0;
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1;
    checkInt(this, value, offset, byteLength, maxBytes, 0);
  }

  var i = byteLength - 1;
  var mul = 1;
  this[offset + i] = value & 0xFF;
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF;
  }

  return offset + byteLength
};

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0);
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value);
  this[offset] = (value & 0xff);
  return offset + 1
};

function objectWriteUInt16 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffff + value + 1;
  for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; ++i) {
    buf[offset + i] = (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
      (littleEndian ? i : 1 - i) * 8;
  }
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0);
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff);
    this[offset + 1] = (value >>> 8);
  } else {
    objectWriteUInt16(this, value, offset, true);
  }
  return offset + 2
};

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0);
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8);
    this[offset + 1] = (value & 0xff);
  } else {
    objectWriteUInt16(this, value, offset, false);
  }
  return offset + 2
};

function objectWriteUInt32 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffffffff + value + 1;
  for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; ++i) {
    buf[offset + i] = (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff;
  }
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0);
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset + 3] = (value >>> 24);
    this[offset + 2] = (value >>> 16);
    this[offset + 1] = (value >>> 8);
    this[offset] = (value & 0xff);
  } else {
    objectWriteUInt32(this, value, offset, true);
  }
  return offset + 4
};

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0);
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24);
    this[offset + 1] = (value >>> 16);
    this[offset + 2] = (value >>> 8);
    this[offset + 3] = (value & 0xff);
  } else {
    objectWriteUInt32(this, value, offset, false);
  }
  return offset + 4
};

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1);

    checkInt(this, value, offset, byteLength, limit - 1, -limit);
  }

  var i = 0;
  var mul = 1;
  var sub = 0;
  this[offset] = value & 0xFF;
  while (++i < byteLength && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
      sub = 1;
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF;
  }

  return offset + byteLength
};

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1);

    checkInt(this, value, offset, byteLength, limit - 1, -limit);
  }

  var i = byteLength - 1;
  var mul = 1;
  var sub = 0;
  this[offset + i] = value & 0xFF;
  while (--i >= 0 && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
      sub = 1;
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF;
  }

  return offset + byteLength
};

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80);
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value);
  if (value < 0) value = 0xff + value + 1;
  this[offset] = (value & 0xff);
  return offset + 1
};

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000);
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff);
    this[offset + 1] = (value >>> 8);
  } else {
    objectWriteUInt16(this, value, offset, true);
  }
  return offset + 2
};

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000);
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8);
    this[offset + 1] = (value & 0xff);
  } else {
    objectWriteUInt16(this, value, offset, false);
  }
  return offset + 2
};

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000);
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff);
    this[offset + 1] = (value >>> 8);
    this[offset + 2] = (value >>> 16);
    this[offset + 3] = (value >>> 24);
  } else {
    objectWriteUInt32(this, value, offset, true);
  }
  return offset + 4
};

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000);
  if (value < 0) value = 0xffffffff + value + 1;
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24);
    this[offset + 1] = (value >>> 16);
    this[offset + 2] = (value >>> 8);
    this[offset + 3] = (value & 0xff);
  } else {
    objectWriteUInt32(this, value, offset, false);
  }
  return offset + 4
};

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
  if (offset < 0) throw new RangeError('Index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4);
  }
  write(buf, value, offset, littleEndian, 23, 4);
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
};

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
};

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8);
  }
  write(buf, value, offset, littleEndian, 52, 8);
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
};

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
};

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!start) start = 0;
  if (!end && end !== 0) end = this.length;
  if (targetStart >= target.length) targetStart = target.length;
  if (!targetStart) targetStart = 0;
  if (end > 0 && end < start) end = start;

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('sourceStart out of bounds')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length;
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start;
  }

  var len = end - start;
  var i;

  if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (i = len - 1; i >= 0; --i) {
      target[i + targetStart] = this[i + start];
    }
  } else if (len < 1000 || !Buffer.TYPED_ARRAY_SUPPORT) {
    // ascending copy from start
    for (i = 0; i < len; ++i) {
      target[i + targetStart] = this[i + start];
    }
  } else {
    Uint8Array.prototype.set.call(
      target,
      this.subarray(start, start + len),
      targetStart
    );
  }

  return len
};

// Usage:
//    buffer.fill(number[, offset[, end]])
//    buffer.fill(buffer[, offset[, end]])
//    buffer.fill(string[, offset[, end]][, encoding])
Buffer.prototype.fill = function fill (val, start, end, encoding) {
  // Handle string cases:
  if (typeof val === 'string') {
    if (typeof start === 'string') {
      encoding = start;
      start = 0;
      end = this.length;
    } else if (typeof end === 'string') {
      encoding = end;
      end = this.length;
    }
    if (val.length === 1) {
      var code = val.charCodeAt(0);
      if (code < 256) {
        val = code;
      }
    }
    if (encoding !== undefined && typeof encoding !== 'string') {
      throw new TypeError('encoding must be a string')
    }
    if (typeof encoding === 'string' && !Buffer.isEncoding(encoding)) {
      throw new TypeError('Unknown encoding: ' + encoding)
    }
  } else if (typeof val === 'number') {
    val = val & 255;
  }

  // Invalid ranges are not set to a default, so can range check early.
  if (start < 0 || this.length < start || this.length < end) {
    throw new RangeError('Out of range index')
  }

  if (end <= start) {
    return this
  }

  start = start >>> 0;
  end = end === undefined ? this.length : end >>> 0;

  if (!val) val = 0;

  var i;
  if (typeof val === 'number') {
    for (i = start; i < end; ++i) {
      this[i] = val;
    }
  } else {
    var bytes = internalIsBuffer(val)
      ? val
      : utf8ToBytes(new Buffer(val, encoding).toString());
    var len = bytes.length;
    for (i = 0; i < end - start; ++i) {
      this[i + start] = bytes[i % len];
    }
  }

  return this
};

// HELPER FUNCTIONS
// ================

var INVALID_BASE64_RE = /[^+\/0-9A-Za-z-_]/g;

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = stringtrim(str).replace(INVALID_BASE64_RE, '');
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '=';
  }
  return str
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity;
  var codePoint;
  var length = string.length;
  var leadSurrogate = null;
  var bytes = [];

  for (var i = 0; i < length; ++i) {
    codePoint = string.charCodeAt(i);

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
          continue
        }

        // valid lead
        leadSurrogate = codePoint;

        continue
      }

      // 2 leads in a row
      if (codePoint < 0xDC00) {
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
        leadSurrogate = codePoint;
        continue
      }

      // valid surrogate pair
      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000;
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
    }

    leadSurrogate = null;

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      );
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      );
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      );
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = [];
  for (var i = 0; i < str.length; ++i) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF);
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo;
  var byteArray = [];
  for (var i = 0; i < str.length; ++i) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i);
    hi = c >> 8;
    lo = c % 256;
    byteArray.push(lo);
    byteArray.push(hi);
  }

  return byteArray
}


function base64ToBytes (str) {
  return toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; ++i) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i];
  }
  return i
}

function isnan (val) {
  return val !== val // eslint-disable-line no-self-compare
}


// the following is from is-buffer, also by Feross Aboukhadijeh and with same lisence
// The _isBuffer check is for Safari 5-7 support, because it's missing
// Object.prototype.constructor. Remove this eventually
function isBuffer(obj) {
  return obj != null && (!!obj._isBuffer || isFastBuffer(obj) || isSlowBuffer(obj))
}

function isFastBuffer (obj) {
  return !!obj.constructor && typeof obj.constructor.isBuffer === 'function' && obj.constructor.isBuffer(obj)
}

// For Node v0.10 support. Remove this eventually.
function isSlowBuffer (obj) {
  return typeof obj.readFloatLE === 'function' && typeof obj.slice === 'function' && isFastBuffer(obj.slice(0, 0))
}

var bufferEs6 = /*#__PURE__*/Object.freeze({
            __proto__: null,
            INSPECT_MAX_BYTES: INSPECT_MAX_BYTES,
            kMaxLength: _kMaxLength,
            Buffer: Buffer,
            SlowBuffer: SlowBuffer,
            isBuffer: isBuffer
});

// shim for using process in browser
// based off https://github.com/defunctzombie/node-process/blob/master/browser.js

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
var cachedSetTimeout = defaultSetTimout;
var cachedClearTimeout = defaultClearTimeout;
if (typeof global$1.setTimeout === 'function') {
    cachedSetTimeout = setTimeout;
}
if (typeof global$1.clearTimeout === 'function') {
    cachedClearTimeout = clearTimeout;
}

function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}
function nextTick(fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
}
// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
var title = 'browser';
var platform = 'browser';
var browser = true;
var env = {};
var argv = [];
var version = ''; // empty string to avoid regexp issues
var versions = {};
var release = {};
var config = {};

function noop() {}

var on = noop;
var addListener = noop;
var once = noop;
var off = noop;
var removeListener = noop;
var removeAllListeners = noop;
var emit = noop;

function binding(name) {
    throw new Error('process.binding is not supported');
}

function cwd () { return '/' }
function chdir (dir) {
    throw new Error('process.chdir is not supported');
}function umask() { return 0; }

// from https://github.com/kumavis/browser-process-hrtime/blob/master/index.js
var performance = global$1.performance || {};
var performanceNow =
  performance.now        ||
  performance.mozNow     ||
  performance.msNow      ||
  performance.oNow       ||
  performance.webkitNow  ||
  function(){ return (new Date()).getTime() };

// generate timestamp or delta
// see http://nodejs.org/api/process.html#process_process_hrtime
function hrtime(previousTimestamp){
  var clocktime = performanceNow.call(performance)*1e-3;
  var seconds = Math.floor(clocktime);
  var nanoseconds = Math.floor((clocktime%1)*1e9);
  if (previousTimestamp) {
    seconds = seconds - previousTimestamp[0];
    nanoseconds = nanoseconds - previousTimestamp[1];
    if (nanoseconds<0) {
      seconds--;
      nanoseconds += 1e9;
    }
  }
  return [seconds,nanoseconds]
}

var startTime = new Date();
function uptime() {
  var currentTime = new Date();
  var dif = currentTime - startTime;
  return dif / 1000;
}

var process = {
  nextTick: nextTick,
  title: title,
  browser: browser,
  env: env,
  argv: argv,
  version: version,
  versions: versions,
  on: on,
  addListener: addListener,
  once: once,
  off: off,
  removeListener: removeListener,
  removeAllListeners: removeAllListeners,
  emit: emit,
  binding: binding,
  cwd: cwd,
  chdir: chdir,
  umask: umask,
  hrtime: hrtime,
  platform: platform,
  release: release,
  config: config,
  uptime: uptime
};

var browser$1 = true;

var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

function unwrapExports (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

function createCommonjsModule(fn, module) {
	return module = { exports: {} }, fn(module, module.exports), module.exports;
}

/**
 * Helpers.
 */

var s = 1000;
var m = s * 60;
var h = m * 60;
var d = h * 24;
var w = d * 7;
var y = d * 365.25;

/**
 * Parse or format the given `val`.
 *
 * Options:
 *
 *  - `long` verbose formatting [false]
 *
 * @param {String|Number} val
 * @param {Object} [options]
 * @throws {Error} throw an error if val is not a non-empty string or a number
 * @return {String|Number}
 * @api public
 */

var ms = function(val, options) {
  options = options || {};
  var type = typeof val;
  if (type === 'string' && val.length > 0) {
    return parse(val);
  } else if (type === 'number' && isFinite(val)) {
    return options.long ? fmtLong(val) : fmtShort(val);
  }
  throw new Error(
    'val is not a non-empty string or a valid number. val=' +
      JSON.stringify(val)
  );
};

/**
 * Parse the given `str` and return milliseconds.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function parse(str) {
  str = String(str);
  if (str.length > 100) {
    return;
  }
  var match = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(
    str
  );
  if (!match) {
    return;
  }
  var n = parseFloat(match[1]);
  var type = (match[2] || 'ms').toLowerCase();
  switch (type) {
    case 'years':
    case 'year':
    case 'yrs':
    case 'yr':
    case 'y':
      return n * y;
    case 'weeks':
    case 'week':
    case 'w':
      return n * w;
    case 'days':
    case 'day':
    case 'd':
      return n * d;
    case 'hours':
    case 'hour':
    case 'hrs':
    case 'hr':
    case 'h':
      return n * h;
    case 'minutes':
    case 'minute':
    case 'mins':
    case 'min':
    case 'm':
      return n * m;
    case 'seconds':
    case 'second':
    case 'secs':
    case 'sec':
    case 's':
      return n * s;
    case 'milliseconds':
    case 'millisecond':
    case 'msecs':
    case 'msec':
    case 'ms':
      return n;
    default:
      return undefined;
  }
}

/**
 * Short format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function fmtShort(ms) {
  var msAbs = Math.abs(ms);
  if (msAbs >= d) {
    return Math.round(ms / d) + 'd';
  }
  if (msAbs >= h) {
    return Math.round(ms / h) + 'h';
  }
  if (msAbs >= m) {
    return Math.round(ms / m) + 'm';
  }
  if (msAbs >= s) {
    return Math.round(ms / s) + 's';
  }
  return ms + 'ms';
}

/**
 * Long format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function fmtLong(ms) {
  var msAbs = Math.abs(ms);
  if (msAbs >= d) {
    return plural(ms, msAbs, d, 'day');
  }
  if (msAbs >= h) {
    return plural(ms, msAbs, h, 'hour');
  }
  if (msAbs >= m) {
    return plural(ms, msAbs, m, 'minute');
  }
  if (msAbs >= s) {
    return plural(ms, msAbs, s, 'second');
  }
  return ms + ' ms';
}

/**
 * Pluralization helper.
 */

function plural(ms, msAbs, n, name) {
  var isPlural = msAbs >= n * 1.5;
  return Math.round(ms / n) + ' ' + name + (isPlural ? 's' : '');
}

/**
 * This is the common logic for both the Node.js and web browser
 * implementations of `debug()`.
 */

function setup(env) {
	createDebug.debug = createDebug;
	createDebug.default = createDebug;
	createDebug.coerce = coerce;
	createDebug.disable = disable;
	createDebug.enable = enable;
	createDebug.enabled = enabled;
	createDebug.humanize = ms;

	Object.keys(env).forEach(key => {
		createDebug[key] = env[key];
	});

	/**
	* Active `debug` instances.
	*/
	createDebug.instances = [];

	/**
	* The currently active debug mode names, and names to skip.
	*/

	createDebug.names = [];
	createDebug.skips = [];

	/**
	* Map of special "%n" handling functions, for the debug "format" argument.
	*
	* Valid key names are a single, lower or upper-case letter, i.e. "n" and "N".
	*/
	createDebug.formatters = {};

	/**
	* Selects a color for a debug namespace
	* @param {String} namespace The namespace string for the for the debug instance to be colored
	* @return {Number|String} An ANSI color code for the given namespace
	* @api private
	*/
	function selectColor(namespace) {
		let hash = 0;

		for (let i = 0; i < namespace.length; i++) {
			hash = ((hash << 5) - hash) + namespace.charCodeAt(i);
			hash |= 0; // Convert to 32bit integer
		}

		return createDebug.colors[Math.abs(hash) % createDebug.colors.length];
	}
	createDebug.selectColor = selectColor;

	/**
	* Create a debugger with the given `namespace`.
	*
	* @param {String} namespace
	* @return {Function}
	* @api public
	*/
	function createDebug(namespace) {
		let prevTime;

		function debug(...args) {
			// Disabled?
			if (!debug.enabled) {
				return;
			}

			const self = debug;

			// Set `diff` timestamp
			const curr = Number(new Date());
			const ms = curr - (prevTime || curr);
			self.diff = ms;
			self.prev = prevTime;
			self.curr = curr;
			prevTime = curr;

			args[0] = createDebug.coerce(args[0]);

			if (typeof args[0] !== 'string') {
				// Anything else let's inspect with %O
				args.unshift('%O');
			}

			// Apply any `formatters` transformations
			let index = 0;
			args[0] = args[0].replace(/%([a-zA-Z%])/g, (match, format) => {
				// If we encounter an escaped % then don't increase the array index
				if (match === '%%') {
					return match;
				}
				index++;
				const formatter = createDebug.formatters[format];
				if (typeof formatter === 'function') {
					const val = args[index];
					match = formatter.call(self, val);

					// Now we need to remove `args[index]` since it's inlined in the `format`
					args.splice(index, 1);
					index--;
				}
				return match;
			});

			// Apply env-specific formatting (colors, etc.)
			createDebug.formatArgs.call(self, args);

			const logFn = self.log || createDebug.log;
			logFn.apply(self, args);
		}

		debug.namespace = namespace;
		debug.enabled = createDebug.enabled(namespace);
		debug.useColors = createDebug.useColors();
		debug.color = selectColor(namespace);
		debug.destroy = destroy;
		debug.extend = extend;
		// Debug.formatArgs = formatArgs;
		// debug.rawLog = rawLog;

		// env-specific initialization logic for debug instances
		if (typeof createDebug.init === 'function') {
			createDebug.init(debug);
		}

		createDebug.instances.push(debug);

		return debug;
	}

	function destroy() {
		const index = createDebug.instances.indexOf(this);
		if (index !== -1) {
			createDebug.instances.splice(index, 1);
			return true;
		}
		return false;
	}

	function extend(namespace, delimiter) {
		const newDebug = createDebug(this.namespace + (typeof delimiter === 'undefined' ? ':' : delimiter) + namespace);
		newDebug.log = this.log;
		return newDebug;
	}

	/**
	* Enables a debug mode by namespaces. This can include modes
	* separated by a colon and wildcards.
	*
	* @param {String} namespaces
	* @api public
	*/
	function enable(namespaces) {
		createDebug.save(namespaces);

		createDebug.names = [];
		createDebug.skips = [];

		let i;
		const split = (typeof namespaces === 'string' ? namespaces : '').split(/[\s,]+/);
		const len = split.length;

		for (i = 0; i < len; i++) {
			if (!split[i]) {
				// ignore empty strings
				continue;
			}

			namespaces = split[i].replace(/\*/g, '.*?');

			if (namespaces[0] === '-') {
				createDebug.skips.push(new RegExp('^' + namespaces.substr(1) + '$'));
			} else {
				createDebug.names.push(new RegExp('^' + namespaces + '$'));
			}
		}

		for (i = 0; i < createDebug.instances.length; i++) {
			const instance = createDebug.instances[i];
			instance.enabled = createDebug.enabled(instance.namespace);
		}
	}

	/**
	* Disable debug output.
	*
	* @return {String} namespaces
	* @api public
	*/
	function disable() {
		const namespaces = [
			...createDebug.names.map(toNamespace),
			...createDebug.skips.map(toNamespace).map(namespace => '-' + namespace)
		].join(',');
		createDebug.enable('');
		return namespaces;
	}

	/**
	* Returns true if the given mode name is enabled, false otherwise.
	*
	* @param {String} name
	* @return {Boolean}
	* @api public
	*/
	function enabled(name) {
		if (name[name.length - 1] === '*') {
			return true;
		}

		let i;
		let len;

		for (i = 0, len = createDebug.skips.length; i < len; i++) {
			if (createDebug.skips[i].test(name)) {
				return false;
			}
		}

		for (i = 0, len = createDebug.names.length; i < len; i++) {
			if (createDebug.names[i].test(name)) {
				return true;
			}
		}

		return false;
	}

	/**
	* Convert regexp to namespace
	*
	* @param {RegExp} regxep
	* @return {String} namespace
	* @api private
	*/
	function toNamespace(regexp) {
		return regexp.toString()
			.substring(2, regexp.toString().length - 2)
			.replace(/\.\*\?$/, '*');
	}

	/**
	* Coerce `val`.
	*
	* @param {Mixed} val
	* @return {Mixed}
	* @api private
	*/
	function coerce(val) {
		if (val instanceof Error) {
			return val.stack || val.message;
		}
		return val;
	}

	createDebug.enable(createDebug.load());

	return createDebug;
}

var common = setup;

var browser$2 = createCommonjsModule(function (module, exports) {
/* eslint-env browser */

/**
 * This is the web browser implementation of `debug()`.
 */

exports.log = log;
exports.formatArgs = formatArgs;
exports.save = save;
exports.load = load;
exports.useColors = useColors;
exports.storage = localstorage();

/**
 * Colors.
 */

exports.colors = [
	'#0000CC',
	'#0000FF',
	'#0033CC',
	'#0033FF',
	'#0066CC',
	'#0066FF',
	'#0099CC',
	'#0099FF',
	'#00CC00',
	'#00CC33',
	'#00CC66',
	'#00CC99',
	'#00CCCC',
	'#00CCFF',
	'#3300CC',
	'#3300FF',
	'#3333CC',
	'#3333FF',
	'#3366CC',
	'#3366FF',
	'#3399CC',
	'#3399FF',
	'#33CC00',
	'#33CC33',
	'#33CC66',
	'#33CC99',
	'#33CCCC',
	'#33CCFF',
	'#6600CC',
	'#6600FF',
	'#6633CC',
	'#6633FF',
	'#66CC00',
	'#66CC33',
	'#9900CC',
	'#9900FF',
	'#9933CC',
	'#9933FF',
	'#99CC00',
	'#99CC33',
	'#CC0000',
	'#CC0033',
	'#CC0066',
	'#CC0099',
	'#CC00CC',
	'#CC00FF',
	'#CC3300',
	'#CC3333',
	'#CC3366',
	'#CC3399',
	'#CC33CC',
	'#CC33FF',
	'#CC6600',
	'#CC6633',
	'#CC9900',
	'#CC9933',
	'#CCCC00',
	'#CCCC33',
	'#FF0000',
	'#FF0033',
	'#FF0066',
	'#FF0099',
	'#FF00CC',
	'#FF00FF',
	'#FF3300',
	'#FF3333',
	'#FF3366',
	'#FF3399',
	'#FF33CC',
	'#FF33FF',
	'#FF6600',
	'#FF6633',
	'#FF9900',
	'#FF9933',
	'#FFCC00',
	'#FFCC33'
];

/**
 * Currently only WebKit-based Web Inspectors, Firefox >= v31,
 * and the Firebug extension (any Firefox version) are known
 * to support "%c" CSS customizations.
 *
 * TODO: add a `localStorage` variable to explicitly enable/disable colors
 */

// eslint-disable-next-line complexity
function useColors() {
	// NB: In an Electron preload script, document will be defined but not fully
	// initialized. Since we know we're in Chrome, we'll just detect this case
	// explicitly
	if (typeof window !== 'undefined' && window.process && (window.process.type === 'renderer' || window.process.__nwjs)) {
		return true;
	}

	// Internet Explorer and Edge do not support colors.
	if (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)) {
		return false;
	}

	// Is webkit? http://stackoverflow.com/a/16459606/376773
	// document is undefined in react-native: https://github.com/facebook/react-native/pull/1632
	return (typeof document !== 'undefined' && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance) ||
		// Is firebug? http://stackoverflow.com/a/398120/376773
		(typeof window !== 'undefined' && window.console && (window.console.firebug || (window.console.exception && window.console.table))) ||
		// Is firefox >= v31?
		// https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
		(typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31) ||
		// Double check webkit in userAgent just in case we are in a worker
		(typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/));
}

/**
 * Colorize log arguments if enabled.
 *
 * @api public
 */

function formatArgs(args) {
	args[0] = (this.useColors ? '%c' : '') +
		this.namespace +
		(this.useColors ? ' %c' : ' ') +
		args[0] +
		(this.useColors ? '%c ' : ' ') +
		'+' + module.exports.humanize(this.diff);

	if (!this.useColors) {
		return;
	}

	const c = 'color: ' + this.color;
	args.splice(1, 0, c, 'color: inherit');

	// The final "%c" is somewhat tricky, because there could be other
	// arguments passed either before or after the %c, so we need to
	// figure out the correct index to insert the CSS into
	let index = 0;
	let lastC = 0;
	args[0].replace(/%[a-zA-Z%]/g, match => {
		if (match === '%%') {
			return;
		}
		index++;
		if (match === '%c') {
			// We only are interested in the *last* %c
			// (the user may have provided their own)
			lastC = index;
		}
	});

	args.splice(lastC, 0, c);
}

/**
 * Invokes `console.log()` when available.
 * No-op when `console.log` is not a "function".
 *
 * @api public
 */
function log(...args) {
	// This hackery is required for IE8/9, where
	// the `console.log` function doesn't have 'apply'
	return typeof console === 'object' &&
		console.log &&
		console.log(...args);
}

/**
 * Save `namespaces`.
 *
 * @param {String} namespaces
 * @api private
 */
function save(namespaces) {
	try {
		if (namespaces) {
			exports.storage.setItem('debug', namespaces);
		} else {
			exports.storage.removeItem('debug');
		}
	} catch (error) {
		// Swallow
		// XXX (@Qix-) should we be logging these?
	}
}

/**
 * Load `namespaces`.
 *
 * @return {String} returns the previously persisted debug modes
 * @api private
 */
function load() {
	let r;
	try {
		r = exports.storage.getItem('debug');
	} catch (error) {
		// Swallow
		// XXX (@Qix-) should we be logging these?
	}

	// If debug isn't set in LS, and we're in Electron, try to load $DEBUG
	if (!r && typeof process !== 'undefined' && 'env' in process) {
		r = process.env.DEBUG;
	}

	return r;
}

/**
 * Localstorage attempts to return the localstorage.
 *
 * This is necessary because safari throws
 * when a user disables cookies/localstorage
 * and you attempt to access it.
 *
 * @return {LocalStorage}
 * @api private
 */

function localstorage() {
	try {
		// TVMLKit (Apple TV JS Runtime) does not have a window object, just localStorage in the global context
		// The Browser also has localStorage in the global context.
		return localStorage;
	} catch (error) {
		// Swallow
		// XXX (@Qix-) should we be logging these?
	}
}

module.exports = common(exports);

const {formatters} = module.exports;

/**
 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
 */

formatters.j = function (v) {
	try {
		return JSON.stringify(v);
	} catch (error) {
		return '[UnexpectedJSONParseError]: ' + error.message;
	}
};
});
var browser_1 = browser$2.log;
var browser_2 = browser$2.formatArgs;
var browser_3 = browser$2.save;
var browser_4 = browser$2.load;
var browser_5 = browser$2.useColors;
var browser_6 = browser$2.storage;
var browser_7 = browser$2.colors;

// MIT lisence
// from https://github.com/substack/tty-browserify/blob/1ba769a6429d242f36226538835b4034bf6b7886/index.js

function isatty() {
  return false;
}

function ReadStream() {
  throw new Error('tty.ReadStream is not implemented');
}

function WriteStream() {
  throw new Error('tty.ReadStream is not implemented');
}

var tty = {
  isatty: isatty,
  ReadStream: ReadStream,
  WriteStream: WriteStream
};

var inherits;
if (typeof Object.create === 'function'){
  inherits = function inherits(ctor, superCtor) {
    // implementation from standard node.js 'util' module
    ctor.super_ = superCtor;
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  inherits = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor;
    var TempCtor = function () {};
    TempCtor.prototype = superCtor.prototype;
    ctor.prototype = new TempCtor();
    ctor.prototype.constructor = ctor;
  };
}
var inherits$1 = inherits;

var formatRegExp = /%[sdj%]/g;
function format(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
}

// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
function deprecate(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global$1.process)) {
    return function() {
      return deprecate(fn, msg).apply(this, arguments);
    };
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
}

var debugs = {};
var debugEnviron;
function debuglog(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = 0;
      debugs[set] = function() {
        var msg = format.apply(null, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
}

/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    _extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}

// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray$1(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var length = output.reduce(function(prev, cur) {
    if (cur.indexOf('\n') >= 0) ;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray$1(ar) {
  return Array.isArray(ar);
}

function isBoolean(arg) {
  return typeof arg === 'boolean';
}

function isNull(arg) {
  return arg === null;
}

function isNullOrUndefined(arg) {
  return arg == null;
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isString(arg) {
  return typeof arg === 'string';
}

function isSymbol(arg) {
  return typeof arg === 'symbol';
}

function isUndefined(arg) {
  return arg === void 0;
}

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}

function isFunction(arg) {
  return typeof arg === 'function';
}

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}

function isBuffer$1(maybeBuf) {
  return isBuffer(maybeBuf);
}

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
function log() {
  console.log('%s - %s', timestamp(), format.apply(null, arguments));
}

function _extend(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
}
function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

var debugUtil = {
  inherits: inherits$1,
  _extend: _extend,
  log: log,
  isBuffer: isBuffer$1,
  isPrimitive: isPrimitive,
  isFunction: isFunction,
  isError: isError,
  isDate: isDate,
  isObject: isObject,
  isRegExp: isRegExp,
  isUndefined: isUndefined,
  isSymbol: isSymbol,
  isString: isString,
  isNumber: isNumber,
  isNullOrUndefined: isNullOrUndefined,
  isNull: isNull,
  isBoolean: isBoolean,
  isArray: isArray$1,
  inspect: inspect,
  deprecate: deprecate,
  format: format,
  debuglog: debuglog
};

var node = createCommonjsModule(function (module, exports) {
/**
 * Module dependencies.
 */




/**
 * This is the Node.js implementation of `debug()`.
 */

exports.init = init;
exports.log = log;
exports.formatArgs = formatArgs;
exports.save = save;
exports.load = load;
exports.useColors = useColors;

/**
 * Colors.
 */

exports.colors = [6, 2, 3, 4, 5, 1];

try {
	// Optional dependency (as in, doesn't need to be installed, NOT like optionalDependencies in package.json)
	// eslint-disable-next-line import/no-extraneous-dependencies
	const supportsColor = require('supports-color');

	if (supportsColor && (supportsColor.stderr || supportsColor).level >= 2) {
		exports.colors = [
			20,
			21,
			26,
			27,
			32,
			33,
			38,
			39,
			40,
			41,
			42,
			43,
			44,
			45,
			56,
			57,
			62,
			63,
			68,
			69,
			74,
			75,
			76,
			77,
			78,
			79,
			80,
			81,
			92,
			93,
			98,
			99,
			112,
			113,
			128,
			129,
			134,
			135,
			148,
			149,
			160,
			161,
			162,
			163,
			164,
			165,
			166,
			167,
			168,
			169,
			170,
			171,
			172,
			173,
			178,
			179,
			184,
			185,
			196,
			197,
			198,
			199,
			200,
			201,
			202,
			203,
			204,
			205,
			206,
			207,
			208,
			209,
			214,
			215,
			220,
			221
		];
	}
} catch (error) {
	// Swallow - we only care if `supports-color` is available; it doesn't have to be.
}

/**
 * Build up the default `inspectOpts` object from the environment variables.
 *
 *   $ DEBUG_COLORS=no DEBUG_DEPTH=10 DEBUG_SHOW_HIDDEN=enabled node script.js
 */

exports.inspectOpts = Object.keys(process.env).filter(key => {
	return /^debug_/i.test(key);
}).reduce((obj, key) => {
	// Camel-case
	const prop = key
		.substring(6)
		.toLowerCase()
		.replace(/_([a-z])/g, (_, k) => {
			return k.toUpperCase();
		});

	// Coerce string value into JS value
	let val = process.env[key];
	if (/^(yes|on|true|enabled)$/i.test(val)) {
		val = true;
	} else if (/^(no|off|false|disabled)$/i.test(val)) {
		val = false;
	} else if (val === 'null') {
		val = null;
	} else {
		val = Number(val);
	}

	obj[prop] = val;
	return obj;
}, {});

/**
 * Is stdout a TTY? Colored output is enabled when `true`.
 */

function useColors() {
	return 'colors' in exports.inspectOpts ?
		Boolean(exports.inspectOpts.colors) :
		tty.isatty(process.stderr.fd);
}

/**
 * Adds ANSI color escape codes if enabled.
 *
 * @api public
 */

function formatArgs(args) {
	const {namespace: name, useColors} = this;

	if (useColors) {
		const c = this.color;
		const colorCode = '\u001B[3' + (c < 8 ? c : '8;5;' + c);
		const prefix = `  ${colorCode};1m${name} \u001B[0m`;

		args[0] = prefix + args[0].split('\n').join('\n' + prefix);
		args.push(colorCode + 'm+' + module.exports.humanize(this.diff) + '\u001B[0m');
	} else {
		args[0] = getDate() + name + ' ' + args[0];
	}
}

function getDate() {
	if (exports.inspectOpts.hideDate) {
		return '';
	}
	return new Date().toISOString() + ' ';
}

/**
 * Invokes `util.format()` with the specified arguments and writes to stderr.
 */

function log(...args) {
	return process.stderr.write(debugUtil.format(...args) + '\n');
}

/**
 * Save `namespaces`.
 *
 * @param {String} namespaces
 * @api private
 */
function save(namespaces) {
	if (namespaces) {
		process.env.DEBUG = namespaces;
	} else {
		// If you set a process.env field to null or undefined, it gets cast to the
		// string 'null' or 'undefined'. Just delete instead.
		delete process.env.DEBUG;
	}
}

/**
 * Load `namespaces`.
 *
 * @return {String} returns the previously persisted debug modes
 * @api private
 */

function load() {
	return process.env.DEBUG;
}

/**
 * Init logic for `debug` instances.
 *
 * Create a new `inspectOpts` object in case `useColors` is set
 * differently for a particular `debug` instance.
 */

function init(debug) {
	debug.inspectOpts = {};

	const keys = Object.keys(exports.inspectOpts);
	for (let i = 0; i < keys.length; i++) {
		debug.inspectOpts[keys[i]] = exports.inspectOpts[keys[i]];
	}
}

module.exports = common(exports);

const {formatters} = module.exports;

/**
 * Map %o to `util.inspect()`, all on a single line.
 */

formatters.o = function (v) {
	this.inspectOpts.colors = this.useColors;
	return debugUtil.inspect(v, this.inspectOpts)
		.replace(/\s*\n\s*/g, ' ');
};

/**
 * Map %O to `util.inspect()`, allowing multiple lines if needed.
 */

formatters.O = function (v) {
	this.inspectOpts.colors = this.useColors;
	return debugUtil.inspect(v, this.inspectOpts);
};
});
var node_1 = node.init;
var node_2 = node.log;
var node_3 = node.formatArgs;
var node_4 = node.save;
var node_5 = node.load;
var node_6 = node.useColors;
var node_7 = node.colors;
var node_8 = node.inspectOpts;

var src = createCommonjsModule(function (module) {
/**
 * Detect Electron renderer / nwjs process, which is node, but we should
 * treat as a browser.
 */

if (typeof process === 'undefined' || process.type === 'renderer' || browser$1 === true || process.__nwjs) {
	module.exports = browser$2;
} else {
	module.exports = node;
}
});

// originally pulled out of simple-peer

var getBrowserRtc = function getBrowserRTC () {
  if (typeof window === 'undefined') return null
  var wrtc = {
    RTCPeerConnection: window.RTCPeerConnection || window.mozRTCPeerConnection ||
      window.webkitRTCPeerConnection,
    RTCSessionDescription: window.RTCSessionDescription ||
      window.mozRTCSessionDescription || window.webkitRTCSessionDescription,
    RTCIceCandidate: window.RTCIceCandidate || window.mozRTCIceCandidate ||
      window.webkitRTCIceCandidate
  };
  if (!wrtc.RTCPeerConnection) return null
  return wrtc
};

var require$$0 = {};

var randombytes = require$$0.randomBytes;

var domain;

// This constructor is used to store event handlers. Instantiating this is
// faster than explicitly calling `Object.create(null)` to get a "clean" empty
// object (tested with v8 v4.9).
function EventHandlers() {}
EventHandlers.prototype = Object.create(null);

function EventEmitter() {
  EventEmitter.init.call(this);
}

// nodejs oddity
// require('events') === require('events').EventEmitter
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.usingDomains = false;

EventEmitter.prototype.domain = undefined;
EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

EventEmitter.init = function() {
  this.domain = null;
  if (EventEmitter.usingDomains) {
    // if there is an active domain, then attach to it.
    if (domain.active ) ;
  }

  if (!this._events || this._events === Object.getPrototypeOf(this)._events) {
    this._events = new EventHandlers();
    this._eventsCount = 0;
  }

  this._maxListeners = this._maxListeners || undefined;
};

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
  if (typeof n !== 'number' || n < 0 || isNaN(n))
    throw new TypeError('"n" argument must be a positive number');
  this._maxListeners = n;
  return this;
};

function $getMaxListeners(that) {
  if (that._maxListeners === undefined)
    return EventEmitter.defaultMaxListeners;
  return that._maxListeners;
}

EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
  return $getMaxListeners(this);
};

// These standalone emit* functions are used to optimize calling of event
// handlers for fast cases because emit() itself often has a variable number of
// arguments and can be deoptimized because of that. These functions always have
// the same number of arguments and thus do not get deoptimized, so the code
// inside them can execute faster.
function emitNone(handler, isFn, self) {
  if (isFn)
    handler.call(self);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self);
  }
}
function emitOne(handler, isFn, self, arg1) {
  if (isFn)
    handler.call(self, arg1);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1);
  }
}
function emitTwo(handler, isFn, self, arg1, arg2) {
  if (isFn)
    handler.call(self, arg1, arg2);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2);
  }
}
function emitThree(handler, isFn, self, arg1, arg2, arg3) {
  if (isFn)
    handler.call(self, arg1, arg2, arg3);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2, arg3);
  }
}

function emitMany(handler, isFn, self, args) {
  if (isFn)
    handler.apply(self, args);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].apply(self, args);
  }
}

EventEmitter.prototype.emit = function emit(type) {
  var er, handler, len, args, i, events, domain;
  var doError = (type === 'error');

  events = this._events;
  if (events)
    doError = (doError && events.error == null);
  else if (!doError)
    return false;

  domain = this.domain;

  // If there is no 'error' event listener then throw.
  if (doError) {
    er = arguments[1];
    if (domain) {
      if (!er)
        er = new Error('Uncaught, unspecified "error" event');
      er.domainEmitter = this;
      er.domain = domain;
      er.domainThrown = false;
      domain.emit('error', er);
    } else if (er instanceof Error) {
      throw er; // Unhandled 'error' event
    } else {
      // At least give some kind of context to the user
      var err = new Error('Uncaught, unspecified "error" event. (' + er + ')');
      err.context = er;
      throw err;
    }
    return false;
  }

  handler = events[type];

  if (!handler)
    return false;

  var isFn = typeof handler === 'function';
  len = arguments.length;
  switch (len) {
    // fast cases
    case 1:
      emitNone(handler, isFn, this);
      break;
    case 2:
      emitOne(handler, isFn, this, arguments[1]);
      break;
    case 3:
      emitTwo(handler, isFn, this, arguments[1], arguments[2]);
      break;
    case 4:
      emitThree(handler, isFn, this, arguments[1], arguments[2], arguments[3]);
      break;
    // slower
    default:
      args = new Array(len - 1);
      for (i = 1; i < len; i++)
        args[i - 1] = arguments[i];
      emitMany(handler, isFn, this, args);
  }

  return true;
};

function _addListener(target, type, listener, prepend) {
  var m;
  var events;
  var existing;

  if (typeof listener !== 'function')
    throw new TypeError('"listener" argument must be a function');

  events = target._events;
  if (!events) {
    events = target._events = new EventHandlers();
    target._eventsCount = 0;
  } else {
    // To avoid recursion in the case that type === "newListener"! Before
    // adding it to the listeners, first emit "newListener".
    if (events.newListener) {
      target.emit('newListener', type,
                  listener.listener ? listener.listener : listener);

      // Re-assign `events` because a newListener handler could have caused the
      // this._events to be assigned to a new object
      events = target._events;
    }
    existing = events[type];
  }

  if (!existing) {
    // Optimize the case of one listener. Don't need the extra array object.
    existing = events[type] = listener;
    ++target._eventsCount;
  } else {
    if (typeof existing === 'function') {
      // Adding the second element, need to change to array.
      existing = events[type] = prepend ? [listener, existing] :
                                          [existing, listener];
    } else {
      // If we've already got an array, just append.
      if (prepend) {
        existing.unshift(listener);
      } else {
        existing.push(listener);
      }
    }

    // Check for listener leak
    if (!existing.warned) {
      m = $getMaxListeners(target);
      if (m && m > 0 && existing.length > m) {
        existing.warned = true;
        var w = new Error('Possible EventEmitter memory leak detected. ' +
                            existing.length + ' ' + type + ' listeners added. ' +
                            'Use emitter.setMaxListeners() to increase limit');
        w.name = 'MaxListenersExceededWarning';
        w.emitter = target;
        w.type = type;
        w.count = existing.length;
        emitWarning(w);
      }
    }
  }

  return target;
}
function emitWarning(e) {
  typeof console.warn === 'function' ? console.warn(e) : console.log(e);
}
EventEmitter.prototype.addListener = function addListener(type, listener) {
  return _addListener(this, type, listener, false);
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.prependListener =
    function prependListener(type, listener) {
      return _addListener(this, type, listener, true);
    };

function _onceWrap(target, type, listener) {
  var fired = false;
  function g() {
    target.removeListener(type, g);
    if (!fired) {
      fired = true;
      listener.apply(target, arguments);
    }
  }
  g.listener = listener;
  return g;
}

EventEmitter.prototype.once = function once(type, listener) {
  if (typeof listener !== 'function')
    throw new TypeError('"listener" argument must be a function');
  this.on(type, _onceWrap(this, type, listener));
  return this;
};

EventEmitter.prototype.prependOnceListener =
    function prependOnceListener(type, listener) {
      if (typeof listener !== 'function')
        throw new TypeError('"listener" argument must be a function');
      this.prependListener(type, _onceWrap(this, type, listener));
      return this;
    };

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener =
    function removeListener(type, listener) {
      var list, events, position, i, originalListener;

      if (typeof listener !== 'function')
        throw new TypeError('"listener" argument must be a function');

      events = this._events;
      if (!events)
        return this;

      list = events[type];
      if (!list)
        return this;

      if (list === listener || (list.listener && list.listener === listener)) {
        if (--this._eventsCount === 0)
          this._events = new EventHandlers();
        else {
          delete events[type];
          if (events.removeListener)
            this.emit('removeListener', type, list.listener || listener);
        }
      } else if (typeof list !== 'function') {
        position = -1;

        for (i = list.length; i-- > 0;) {
          if (list[i] === listener ||
              (list[i].listener && list[i].listener === listener)) {
            originalListener = list[i].listener;
            position = i;
            break;
          }
        }

        if (position < 0)
          return this;

        if (list.length === 1) {
          list[0] = undefined;
          if (--this._eventsCount === 0) {
            this._events = new EventHandlers();
            return this;
          } else {
            delete events[type];
          }
        } else {
          spliceOne(list, position);
        }

        if (events.removeListener)
          this.emit('removeListener', type, originalListener || listener);
      }

      return this;
    };

EventEmitter.prototype.removeAllListeners =
    function removeAllListeners(type) {
      var listeners, events;

      events = this._events;
      if (!events)
        return this;

      // not listening for removeListener, no need to emit
      if (!events.removeListener) {
        if (arguments.length === 0) {
          this._events = new EventHandlers();
          this._eventsCount = 0;
        } else if (events[type]) {
          if (--this._eventsCount === 0)
            this._events = new EventHandlers();
          else
            delete events[type];
        }
        return this;
      }

      // emit removeListener for all listeners on all events
      if (arguments.length === 0) {
        var keys = Object.keys(events);
        for (var i = 0, key; i < keys.length; ++i) {
          key = keys[i];
          if (key === 'removeListener') continue;
          this.removeAllListeners(key);
        }
        this.removeAllListeners('removeListener');
        this._events = new EventHandlers();
        this._eventsCount = 0;
        return this;
      }

      listeners = events[type];

      if (typeof listeners === 'function') {
        this.removeListener(type, listeners);
      } else if (listeners) {
        // LIFO order
        do {
          this.removeListener(type, listeners[listeners.length - 1]);
        } while (listeners[0]);
      }

      return this;
    };

EventEmitter.prototype.listeners = function listeners(type) {
  var evlistener;
  var ret;
  var events = this._events;

  if (!events)
    ret = [];
  else {
    evlistener = events[type];
    if (!evlistener)
      ret = [];
    else if (typeof evlistener === 'function')
      ret = [evlistener.listener || evlistener];
    else
      ret = unwrapListeners(evlistener);
  }

  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  if (typeof emitter.listenerCount === 'function') {
    return emitter.listenerCount(type);
  } else {
    return listenerCount.call(emitter, type);
  }
};

EventEmitter.prototype.listenerCount = listenerCount;
function listenerCount(type) {
  var events = this._events;

  if (events) {
    var evlistener = events[type];

    if (typeof evlistener === 'function') {
      return 1;
    } else if (evlistener) {
      return evlistener.length;
    }
  }

  return 0;
}

EventEmitter.prototype.eventNames = function eventNames() {
  return this._eventsCount > 0 ? Reflect.ownKeys(this._events) : [];
};

// About 1.5x faster than the two-arg version of Array#splice().
function spliceOne(list, index) {
  for (var i = index, k = i + 1, n = list.length; k < n; i += 1, k += 1)
    list[i] = list[k];
  list.pop();
}

function arrayClone(arr, i) {
  var copy = new Array(i);
  while (i--)
    copy[i] = arr[i];
  return copy;
}

function unwrapListeners(arr) {
  var ret = new Array(arr.length);
  for (var i = 0; i < ret.length; ++i) {
    ret[i] = arr[i].listener || arr[i];
  }
  return ret;
}

function BufferList() {
  this.head = null;
  this.tail = null;
  this.length = 0;
}

BufferList.prototype.push = function (v) {
  var entry = { data: v, next: null };
  if (this.length > 0) this.tail.next = entry;else this.head = entry;
  this.tail = entry;
  ++this.length;
};

BufferList.prototype.unshift = function (v) {
  var entry = { data: v, next: this.head };
  if (this.length === 0) this.tail = entry;
  this.head = entry;
  ++this.length;
};

BufferList.prototype.shift = function () {
  if (this.length === 0) return;
  var ret = this.head.data;
  if (this.length === 1) this.head = this.tail = null;else this.head = this.head.next;
  --this.length;
  return ret;
};

BufferList.prototype.clear = function () {
  this.head = this.tail = null;
  this.length = 0;
};

BufferList.prototype.join = function (s) {
  if (this.length === 0) return '';
  var p = this.head;
  var ret = '' + p.data;
  while (p = p.next) {
    ret += s + p.data;
  }return ret;
};

BufferList.prototype.concat = function (n) {
  if (this.length === 0) return Buffer.alloc(0);
  if (this.length === 1) return this.head.data;
  var ret = Buffer.allocUnsafe(n >>> 0);
  var p = this.head;
  var i = 0;
  while (p) {
    p.data.copy(ret, i);
    i += p.data.length;
    p = p.next;
  }
  return ret;
};

// Copyright Joyent, Inc. and other Node contributors.
var isBufferEncoding = Buffer.isEncoding
  || function(encoding) {
       switch (encoding && encoding.toLowerCase()) {
         case 'hex': case 'utf8': case 'utf-8': case 'ascii': case 'binary': case 'base64': case 'ucs2': case 'ucs-2': case 'utf16le': case 'utf-16le': case 'raw': return true;
         default: return false;
       }
     };


function assertEncoding(encoding) {
  if (encoding && !isBufferEncoding(encoding)) {
    throw new Error('Unknown encoding: ' + encoding);
  }
}

// StringDecoder provides an interface for efficiently splitting a series of
// buffers into a series of JS strings without breaking apart multi-byte
// characters. CESU-8 is handled as part of the UTF-8 encoding.
//
// @TODO Handling all encodings inside a single object makes it very difficult
// to reason about this code, so it should be split up in the future.
// @TODO There should be a utf8-strict encoding that rejects invalid UTF-8 code
// points as used by CESU-8.
function StringDecoder(encoding) {
  this.encoding = (encoding || 'utf8').toLowerCase().replace(/[-_]/, '');
  assertEncoding(encoding);
  switch (this.encoding) {
    case 'utf8':
      // CESU-8 represents each of Surrogate Pair by 3-bytes
      this.surrogateSize = 3;
      break;
    case 'ucs2':
    case 'utf16le':
      // UTF-16 represents each of Surrogate Pair by 2-bytes
      this.surrogateSize = 2;
      this.detectIncompleteChar = utf16DetectIncompleteChar;
      break;
    case 'base64':
      // Base-64 stores 3 bytes in 4 chars, and pads the remainder.
      this.surrogateSize = 3;
      this.detectIncompleteChar = base64DetectIncompleteChar;
      break;
    default:
      this.write = passThroughWrite;
      return;
  }

  // Enough space to store all bytes of a single character. UTF-8 needs 4
  // bytes, but CESU-8 may require up to 6 (3 bytes per surrogate).
  this.charBuffer = new Buffer(6);
  // Number of bytes received for the current incomplete multi-byte character.
  this.charReceived = 0;
  // Number of bytes expected for the current incomplete multi-byte character.
  this.charLength = 0;
}

// write decodes the given buffer and returns it as JS string that is
// guaranteed to not contain any partial multi-byte characters. Any partial
// character found at the end of the buffer is buffered up, and will be
// returned when calling write again with the remaining bytes.
//
// Note: Converting a Buffer containing an orphan surrogate to a String
// currently works, but converting a String to a Buffer (via `new Buffer`, or
// Buffer#write) will replace incomplete surrogates with the unicode
// replacement character. See https://codereview.chromium.org/121173009/ .
StringDecoder.prototype.write = function(buffer) {
  var charStr = '';
  // if our last write ended with an incomplete multibyte character
  while (this.charLength) {
    // determine how many remaining bytes this buffer has to offer for this char
    var available = (buffer.length >= this.charLength - this.charReceived) ?
        this.charLength - this.charReceived :
        buffer.length;

    // add the new bytes to the char buffer
    buffer.copy(this.charBuffer, this.charReceived, 0, available);
    this.charReceived += available;

    if (this.charReceived < this.charLength) {
      // still not enough chars in this buffer? wait for more ...
      return '';
    }

    // remove bytes belonging to the current character from the buffer
    buffer = buffer.slice(available, buffer.length);

    // get the character that was split
    charStr = this.charBuffer.slice(0, this.charLength).toString(this.encoding);

    // CESU-8: lead surrogate (D800-DBFF) is also the incomplete character
    var charCode = charStr.charCodeAt(charStr.length - 1);
    if (charCode >= 0xD800 && charCode <= 0xDBFF) {
      this.charLength += this.surrogateSize;
      charStr = '';
      continue;
    }
    this.charReceived = this.charLength = 0;

    // if there are no more bytes in this buffer, just emit our char
    if (buffer.length === 0) {
      return charStr;
    }
    break;
  }

  // determine and set charLength / charReceived
  this.detectIncompleteChar(buffer);

  var end = buffer.length;
  if (this.charLength) {
    // buffer the incomplete character bytes we got
    buffer.copy(this.charBuffer, 0, buffer.length - this.charReceived, end);
    end -= this.charReceived;
  }

  charStr += buffer.toString(this.encoding, 0, end);

  var end = charStr.length - 1;
  var charCode = charStr.charCodeAt(end);
  // CESU-8: lead surrogate (D800-DBFF) is also the incomplete character
  if (charCode >= 0xD800 && charCode <= 0xDBFF) {
    var size = this.surrogateSize;
    this.charLength += size;
    this.charReceived += size;
    this.charBuffer.copy(this.charBuffer, size, 0, size);
    buffer.copy(this.charBuffer, 0, 0, size);
    return charStr.substring(0, end);
  }

  // or just emit the charStr
  return charStr;
};

// detectIncompleteChar determines if there is an incomplete UTF-8 character at
// the end of the given buffer. If so, it sets this.charLength to the byte
// length that character, and sets this.charReceived to the number of bytes
// that are available for this character.
StringDecoder.prototype.detectIncompleteChar = function(buffer) {
  // determine how many bytes we have to check at the end of this buffer
  var i = (buffer.length >= 3) ? 3 : buffer.length;

  // Figure out if one of the last i bytes of our buffer announces an
  // incomplete char.
  for (; i > 0; i--) {
    var c = buffer[buffer.length - i];

    // See http://en.wikipedia.org/wiki/UTF-8#Description

    // 110XXXXX
    if (i == 1 && c >> 5 == 0x06) {
      this.charLength = 2;
      break;
    }

    // 1110XXXX
    if (i <= 2 && c >> 4 == 0x0E) {
      this.charLength = 3;
      break;
    }

    // 11110XXX
    if (i <= 3 && c >> 3 == 0x1E) {
      this.charLength = 4;
      break;
    }
  }
  this.charReceived = i;
};

StringDecoder.prototype.end = function(buffer) {
  var res = '';
  if (buffer && buffer.length)
    res = this.write(buffer);

  if (this.charReceived) {
    var cr = this.charReceived;
    var buf = this.charBuffer;
    var enc = this.encoding;
    res += buf.slice(0, cr).toString(enc);
  }

  return res;
};

function passThroughWrite(buffer) {
  return buffer.toString(this.encoding);
}

function utf16DetectIncompleteChar(buffer) {
  this.charReceived = buffer.length % 2;
  this.charLength = this.charReceived ? 2 : 0;
}

function base64DetectIncompleteChar(buffer) {
  this.charReceived = buffer.length % 3;
  this.charLength = this.charReceived ? 3 : 0;
}

Readable.ReadableState = ReadableState;

var debug = debuglog('stream');
inherits$1(Readable, EventEmitter);

function prependListener(emitter, event, fn) {
  // Sadly this is not cacheable as some libraries bundle their own
  // event emitter implementation with them.
  if (typeof emitter.prependListener === 'function') {
    return emitter.prependListener(event, fn);
  } else {
    // This is a hack to make sure that our error handler is attached before any
    // userland ones.  NEVER DO THIS. This is here only because this code needs
    // to continue to work with older versions of Node.js that do not include
    // the prependListener() method. The goal is to eventually remove this hack.
    if (!emitter._events || !emitter._events[event])
      emitter.on(event, fn);
    else if (Array.isArray(emitter._events[event]))
      emitter._events[event].unshift(fn);
    else
      emitter._events[event] = [fn, emitter._events[event]];
  }
}
function listenerCount$1 (emitter, type) {
  return emitter.listeners(type).length;
}
function ReadableState(options, stream) {

  options = options || {};

  // object stream flag. Used to make read(n) ignore n and to
  // make all the buffer merging and length checks go away
  this.objectMode = !!options.objectMode;

  if (stream instanceof Duplex) this.objectMode = this.objectMode || !!options.readableObjectMode;

  // the point at which it stops calling _read() to fill the buffer
  // Note: 0 is a valid value, means "don't call _read preemptively ever"
  var hwm = options.highWaterMark;
  var defaultHwm = this.objectMode ? 16 : 16 * 1024;
  this.highWaterMark = hwm || hwm === 0 ? hwm : defaultHwm;

  // cast to ints.
  this.highWaterMark = ~ ~this.highWaterMark;

  // A linked list is used to store data chunks instead of an array because the
  // linked list can remove elements from the beginning faster than
  // array.shift()
  this.buffer = new BufferList();
  this.length = 0;
  this.pipes = null;
  this.pipesCount = 0;
  this.flowing = null;
  this.ended = false;
  this.endEmitted = false;
  this.reading = false;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, because any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // whenever we return null, then we set a flag to say
  // that we're awaiting a 'readable' event emission.
  this.needReadable = false;
  this.emittedReadable = false;
  this.readableListening = false;
  this.resumeScheduled = false;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // when piping, we only care about 'readable' events that happen
  // after read()ing all the bytes and not getting any pushback.
  this.ranOut = false;

  // the number of writers that are awaiting a drain event in .pipe()s
  this.awaitDrain = 0;

  // if true, a maybeReadMore has been scheduled
  this.readingMore = false;

  this.decoder = null;
  this.encoding = null;
  if (options.encoding) {
    this.decoder = new StringDecoder(options.encoding);
    this.encoding = options.encoding;
  }
}
function Readable(options) {

  if (!(this instanceof Readable)) return new Readable(options);

  this._readableState = new ReadableState(options, this);

  // legacy
  this.readable = true;

  if (options && typeof options.read === 'function') this._read = options.read;

  EventEmitter.call(this);
}

// Manually shove something into the read() buffer.
// This returns true if the highWaterMark has not been hit yet,
// similar to how Writable.write() returns true if you should
// write() some more.
Readable.prototype.push = function (chunk, encoding) {
  var state = this._readableState;

  if (!state.objectMode && typeof chunk === 'string') {
    encoding = encoding || state.defaultEncoding;
    if (encoding !== state.encoding) {
      chunk = Buffer.from(chunk, encoding);
      encoding = '';
    }
  }

  return readableAddChunk(this, state, chunk, encoding, false);
};

// Unshift should *always* be something directly out of read()
Readable.prototype.unshift = function (chunk) {
  var state = this._readableState;
  return readableAddChunk(this, state, chunk, '', true);
};

Readable.prototype.isPaused = function () {
  return this._readableState.flowing === false;
};

function readableAddChunk(stream, state, chunk, encoding, addToFront) {
  var er = chunkInvalid(state, chunk);
  if (er) {
    stream.emit('error', er);
  } else if (chunk === null) {
    state.reading = false;
    onEofChunk(stream, state);
  } else if (state.objectMode || chunk && chunk.length > 0) {
    if (state.ended && !addToFront) {
      var e = new Error('stream.push() after EOF');
      stream.emit('error', e);
    } else if (state.endEmitted && addToFront) {
      var _e = new Error('stream.unshift() after end event');
      stream.emit('error', _e);
    } else {
      var skipAdd;
      if (state.decoder && !addToFront && !encoding) {
        chunk = state.decoder.write(chunk);
        skipAdd = !state.objectMode && chunk.length === 0;
      }

      if (!addToFront) state.reading = false;

      // Don't add to the buffer if we've decoded to an empty string chunk and
      // we're not in object mode
      if (!skipAdd) {
        // if we want the data now, just emit it.
        if (state.flowing && state.length === 0 && !state.sync) {
          stream.emit('data', chunk);
          stream.read(0);
        } else {
          // update the buffer info.
          state.length += state.objectMode ? 1 : chunk.length;
          if (addToFront) state.buffer.unshift(chunk);else state.buffer.push(chunk);

          if (state.needReadable) emitReadable(stream);
        }
      }

      maybeReadMore(stream, state);
    }
  } else if (!addToFront) {
    state.reading = false;
  }

  return needMoreData(state);
}

// if it's past the high water mark, we can push in some more.
// Also, if we have no data yet, we can stand some
// more bytes.  This is to work around cases where hwm=0,
// such as the repl.  Also, if the push() triggered a
// readable event, and the user called read(largeNumber) such that
// needReadable was set, then we ought to push more, so that another
// 'readable' event will be triggered.
function needMoreData(state) {
  return !state.ended && (state.needReadable || state.length < state.highWaterMark || state.length === 0);
}

// backwards compatibility.
Readable.prototype.setEncoding = function (enc) {
  this._readableState.decoder = new StringDecoder(enc);
  this._readableState.encoding = enc;
  return this;
};

// Don't raise the hwm > 8MB
var MAX_HWM = 0x800000;
function computeNewHighWaterMark(n) {
  if (n >= MAX_HWM) {
    n = MAX_HWM;
  } else {
    // Get the next highest power of 2 to prevent increasing hwm excessively in
    // tiny amounts
    n--;
    n |= n >>> 1;
    n |= n >>> 2;
    n |= n >>> 4;
    n |= n >>> 8;
    n |= n >>> 16;
    n++;
  }
  return n;
}

// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function howMuchToRead(n, state) {
  if (n <= 0 || state.length === 0 && state.ended) return 0;
  if (state.objectMode) return 1;
  if (n !== n) {
    // Only flow one buffer at a time
    if (state.flowing && state.length) return state.buffer.head.data.length;else return state.length;
  }
  // If we're asking for more than the current hwm, then raise the hwm.
  if (n > state.highWaterMark) state.highWaterMark = computeNewHighWaterMark(n);
  if (n <= state.length) return n;
  // Don't have enough
  if (!state.ended) {
    state.needReadable = true;
    return 0;
  }
  return state.length;
}

// you can override either this method, or the async _read(n) below.
Readable.prototype.read = function (n) {
  debug('read', n);
  n = parseInt(n, 10);
  var state = this._readableState;
  var nOrig = n;

  if (n !== 0) state.emittedReadable = false;

  // if we're doing read(0) to trigger a readable event, but we
  // already have a bunch of data in the buffer, then just trigger
  // the 'readable' event and move on.
  if (n === 0 && state.needReadable && (state.length >= state.highWaterMark || state.ended)) {
    debug('read: emitReadable', state.length, state.ended);
    if (state.length === 0 && state.ended) endReadable(this);else emitReadable(this);
    return null;
  }

  n = howMuchToRead(n, state);

  // if we've ended, and we're now clear, then finish it up.
  if (n === 0 && state.ended) {
    if (state.length === 0) endReadable(this);
    return null;
  }

  // All the actual chunk generation logic needs to be
  // *below* the call to _read.  The reason is that in certain
  // synthetic stream cases, such as passthrough streams, _read
  // may be a completely synchronous operation which may change
  // the state of the read buffer, providing enough data when
  // before there was *not* enough.
  //
  // So, the steps are:
  // 1. Figure out what the state of things will be after we do
  // a read from the buffer.
  //
  // 2. If that resulting state will trigger a _read, then call _read.
  // Note that this may be asynchronous, or synchronous.  Yes, it is
  // deeply ugly to write APIs this way, but that still doesn't mean
  // that the Readable class should behave improperly, as streams are
  // designed to be sync/async agnostic.
  // Take note if the _read call is sync or async (ie, if the read call
  // has returned yet), so that we know whether or not it's safe to emit
  // 'readable' etc.
  //
  // 3. Actually pull the requested chunks out of the buffer and return.

  // if we need a readable event, then we need to do some reading.
  var doRead = state.needReadable;
  debug('need readable', doRead);

  // if we currently have less than the highWaterMark, then also read some
  if (state.length === 0 || state.length - n < state.highWaterMark) {
    doRead = true;
    debug('length less than watermark', doRead);
  }

  // however, if we've ended, then there's no point, and if we're already
  // reading, then it's unnecessary.
  if (state.ended || state.reading) {
    doRead = false;
    debug('reading or ended', doRead);
  } else if (doRead) {
    debug('do read');
    state.reading = true;
    state.sync = true;
    // if the length is currently zero, then we *need* a readable event.
    if (state.length === 0) state.needReadable = true;
    // call internal read method
    this._read(state.highWaterMark);
    state.sync = false;
    // If _read pushed data synchronously, then `reading` will be false,
    // and we need to re-evaluate how much data we can return to the user.
    if (!state.reading) n = howMuchToRead(nOrig, state);
  }

  var ret;
  if (n > 0) ret = fromList(n, state);else ret = null;

  if (ret === null) {
    state.needReadable = true;
    n = 0;
  } else {
    state.length -= n;
  }

  if (state.length === 0) {
    // If we have nothing in the buffer, then we want to know
    // as soon as we *do* get something into the buffer.
    if (!state.ended) state.needReadable = true;

    // If we tried to read() past the EOF, then emit end on the next tick.
    if (nOrig !== n && state.ended) endReadable(this);
  }

  if (ret !== null) this.emit('data', ret);

  return ret;
};

function chunkInvalid(state, chunk) {
  var er = null;
  if (!isBuffer(chunk) && typeof chunk !== 'string' && chunk !== null && chunk !== undefined && !state.objectMode) {
    er = new TypeError('Invalid non-string/buffer chunk');
  }
  return er;
}

function onEofChunk(stream, state) {
  if (state.ended) return;
  if (state.decoder) {
    var chunk = state.decoder.end();
    if (chunk && chunk.length) {
      state.buffer.push(chunk);
      state.length += state.objectMode ? 1 : chunk.length;
    }
  }
  state.ended = true;

  // emit 'readable' now to make sure it gets picked up.
  emitReadable(stream);
}

// Don't emit readable right away in sync mode, because this can trigger
// another read() call => stack overflow.  This way, it might trigger
// a nextTick recursion warning, but that's not so bad.
function emitReadable(stream) {
  var state = stream._readableState;
  state.needReadable = false;
  if (!state.emittedReadable) {
    debug('emitReadable', state.flowing);
    state.emittedReadable = true;
    if (state.sync) nextTick(emitReadable_, stream);else emitReadable_(stream);
  }
}

function emitReadable_(stream) {
  debug('emit readable');
  stream.emit('readable');
  flow(stream);
}

// at this point, the user has presumably seen the 'readable' event,
// and called read() to consume some data.  that may have triggered
// in turn another _read(n) call, in which case reading = true if
// it's in progress.
// However, if we're not ended, or reading, and the length < hwm,
// then go ahead and try to read some more preemptively.
function maybeReadMore(stream, state) {
  if (!state.readingMore) {
    state.readingMore = true;
    nextTick(maybeReadMore_, stream, state);
  }
}

function maybeReadMore_(stream, state) {
  var len = state.length;
  while (!state.reading && !state.flowing && !state.ended && state.length < state.highWaterMark) {
    debug('maybeReadMore read 0');
    stream.read(0);
    if (len === state.length)
      // didn't get any data, stop spinning.
      break;else len = state.length;
  }
  state.readingMore = false;
}

// abstract method.  to be overridden in specific implementation classes.
// call cb(er, data) where data is <= n in length.
// for virtual (non-string, non-buffer) streams, "length" is somewhat
// arbitrary, and perhaps not very meaningful.
Readable.prototype._read = function (n) {
  this.emit('error', new Error('not implemented'));
};

Readable.prototype.pipe = function (dest, pipeOpts) {
  var src = this;
  var state = this._readableState;

  switch (state.pipesCount) {
    case 0:
      state.pipes = dest;
      break;
    case 1:
      state.pipes = [state.pipes, dest];
      break;
    default:
      state.pipes.push(dest);
      break;
  }
  state.pipesCount += 1;
  debug('pipe count=%d opts=%j', state.pipesCount, pipeOpts);

  var doEnd = (!pipeOpts || pipeOpts.end !== false);

  var endFn = doEnd ? onend : cleanup;
  if (state.endEmitted) nextTick(endFn);else src.once('end', endFn);

  dest.on('unpipe', onunpipe);
  function onunpipe(readable) {
    debug('onunpipe');
    if (readable === src) {
      cleanup();
    }
  }

  function onend() {
    debug('onend');
    dest.end();
  }

  // when the dest drains, it reduces the awaitDrain counter
  // on the source.  This would be more elegant with a .once()
  // handler in flow(), but adding and removing repeatedly is
  // too slow.
  var ondrain = pipeOnDrain(src);
  dest.on('drain', ondrain);

  var cleanedUp = false;
  function cleanup() {
    debug('cleanup');
    // cleanup event handlers once the pipe is broken
    dest.removeListener('close', onclose);
    dest.removeListener('finish', onfinish);
    dest.removeListener('drain', ondrain);
    dest.removeListener('error', onerror);
    dest.removeListener('unpipe', onunpipe);
    src.removeListener('end', onend);
    src.removeListener('end', cleanup);
    src.removeListener('data', ondata);

    cleanedUp = true;

    // if the reader is waiting for a drain event from this
    // specific writer, then it would cause it to never start
    // flowing again.
    // So, if this is awaiting a drain, then we just call it now.
    // If we don't know, then assume that we are waiting for one.
    if (state.awaitDrain && (!dest._writableState || dest._writableState.needDrain)) ondrain();
  }

  // If the user pushes more data while we're writing to dest then we'll end up
  // in ondata again. However, we only want to increase awaitDrain once because
  // dest will only emit one 'drain' event for the multiple writes.
  // => Introduce a guard on increasing awaitDrain.
  var increasedAwaitDrain = false;
  src.on('data', ondata);
  function ondata(chunk) {
    debug('ondata');
    increasedAwaitDrain = false;
    var ret = dest.write(chunk);
    if (false === ret && !increasedAwaitDrain) {
      // If the user unpiped during `dest.write()`, it is possible
      // to get stuck in a permanently paused state if that write
      // also returned false.
      // => Check whether `dest` is still a piping destination.
      if ((state.pipesCount === 1 && state.pipes === dest || state.pipesCount > 1 && indexOf(state.pipes, dest) !== -1) && !cleanedUp) {
        debug('false write response, pause', src._readableState.awaitDrain);
        src._readableState.awaitDrain++;
        increasedAwaitDrain = true;
      }
      src.pause();
    }
  }

  // if the dest has an error, then stop piping into it.
  // however, don't suppress the throwing behavior for this.
  function onerror(er) {
    debug('onerror', er);
    unpipe();
    dest.removeListener('error', onerror);
    if (listenerCount$1(dest, 'error') === 0) dest.emit('error', er);
  }

  // Make sure our error handler is attached before userland ones.
  prependListener(dest, 'error', onerror);

  // Both close and finish should trigger unpipe, but only once.
  function onclose() {
    dest.removeListener('finish', onfinish);
    unpipe();
  }
  dest.once('close', onclose);
  function onfinish() {
    debug('onfinish');
    dest.removeListener('close', onclose);
    unpipe();
  }
  dest.once('finish', onfinish);

  function unpipe() {
    debug('unpipe');
    src.unpipe(dest);
  }

  // tell the dest that it's being piped to
  dest.emit('pipe', src);

  // start the flow if it hasn't been started already.
  if (!state.flowing) {
    debug('pipe resume');
    src.resume();
  }

  return dest;
};

function pipeOnDrain(src) {
  return function () {
    var state = src._readableState;
    debug('pipeOnDrain', state.awaitDrain);
    if (state.awaitDrain) state.awaitDrain--;
    if (state.awaitDrain === 0 && src.listeners('data').length) {
      state.flowing = true;
      flow(src);
    }
  };
}

Readable.prototype.unpipe = function (dest) {
  var state = this._readableState;

  // if we're not piping anywhere, then do nothing.
  if (state.pipesCount === 0) return this;

  // just one destination.  most common case.
  if (state.pipesCount === 1) {
    // passed in one, but it's not the right one.
    if (dest && dest !== state.pipes) return this;

    if (!dest) dest = state.pipes;

    // got a match.
    state.pipes = null;
    state.pipesCount = 0;
    state.flowing = false;
    if (dest) dest.emit('unpipe', this);
    return this;
  }

  // slow case. multiple pipe destinations.

  if (!dest) {
    // remove all.
    var dests = state.pipes;
    var len = state.pipesCount;
    state.pipes = null;
    state.pipesCount = 0;
    state.flowing = false;

    for (var _i = 0; _i < len; _i++) {
      dests[_i].emit('unpipe', this);
    }return this;
  }

  // try to find the right one.
  var i = indexOf(state.pipes, dest);
  if (i === -1) return this;

  state.pipes.splice(i, 1);
  state.pipesCount -= 1;
  if (state.pipesCount === 1) state.pipes = state.pipes[0];

  dest.emit('unpipe', this);

  return this;
};

// set up data events if they are asked for
// Ensure readable listeners eventually get something
Readable.prototype.on = function (ev, fn) {
  var res = EventEmitter.prototype.on.call(this, ev, fn);

  if (ev === 'data') {
    // Start flowing on next tick if stream isn't explicitly paused
    if (this._readableState.flowing !== false) this.resume();
  } else if (ev === 'readable') {
    var state = this._readableState;
    if (!state.endEmitted && !state.readableListening) {
      state.readableListening = state.needReadable = true;
      state.emittedReadable = false;
      if (!state.reading) {
        nextTick(nReadingNextTick, this);
      } else if (state.length) {
        emitReadable(this);
      }
    }
  }

  return res;
};
Readable.prototype.addListener = Readable.prototype.on;

function nReadingNextTick(self) {
  debug('readable nexttick read 0');
  self.read(0);
}

// pause() and resume() are remnants of the legacy readable stream API
// If the user uses them, then switch into old mode.
Readable.prototype.resume = function () {
  var state = this._readableState;
  if (!state.flowing) {
    debug('resume');
    state.flowing = true;
    resume(this, state);
  }
  return this;
};

function resume(stream, state) {
  if (!state.resumeScheduled) {
    state.resumeScheduled = true;
    nextTick(resume_, stream, state);
  }
}

function resume_(stream, state) {
  if (!state.reading) {
    debug('resume read 0');
    stream.read(0);
  }

  state.resumeScheduled = false;
  state.awaitDrain = 0;
  stream.emit('resume');
  flow(stream);
  if (state.flowing && !state.reading) stream.read(0);
}

Readable.prototype.pause = function () {
  debug('call pause flowing=%j', this._readableState.flowing);
  if (false !== this._readableState.flowing) {
    debug('pause');
    this._readableState.flowing = false;
    this.emit('pause');
  }
  return this;
};

function flow(stream) {
  var state = stream._readableState;
  debug('flow', state.flowing);
  while (state.flowing && stream.read() !== null) {}
}

// wrap an old-style stream as the async data source.
// This is *not* part of the readable stream interface.
// It is an ugly unfortunate mess of history.
Readable.prototype.wrap = function (stream) {
  var state = this._readableState;
  var paused = false;

  var self = this;
  stream.on('end', function () {
    debug('wrapped end');
    if (state.decoder && !state.ended) {
      var chunk = state.decoder.end();
      if (chunk && chunk.length) self.push(chunk);
    }

    self.push(null);
  });

  stream.on('data', function (chunk) {
    debug('wrapped data');
    if (state.decoder) chunk = state.decoder.write(chunk);

    // don't skip over falsy values in objectMode
    if (state.objectMode && (chunk === null || chunk === undefined)) return;else if (!state.objectMode && (!chunk || !chunk.length)) return;

    var ret = self.push(chunk);
    if (!ret) {
      paused = true;
      stream.pause();
    }
  });

  // proxy all the other methods.
  // important when wrapping filters and duplexes.
  for (var i in stream) {
    if (this[i] === undefined && typeof stream[i] === 'function') {
      this[i] = function (method) {
        return function () {
          return stream[method].apply(stream, arguments);
        };
      }(i);
    }
  }

  // proxy certain important events.
  var events = ['error', 'close', 'destroy', 'pause', 'resume'];
  forEach(events, function (ev) {
    stream.on(ev, self.emit.bind(self, ev));
  });

  // when we try to consume some more bytes, simply unpause the
  // underlying stream.
  self._read = function (n) {
    debug('wrapped _read', n);
    if (paused) {
      paused = false;
      stream.resume();
    }
  };

  return self;
};

// exposed for testing purposes only.
Readable._fromList = fromList;

// Pluck off n bytes from an array of buffers.
// Length is the combined lengths of all the buffers in the list.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function fromList(n, state) {
  // nothing buffered
  if (state.length === 0) return null;

  var ret;
  if (state.objectMode) ret = state.buffer.shift();else if (!n || n >= state.length) {
    // read it all, truncate the list
    if (state.decoder) ret = state.buffer.join('');else if (state.buffer.length === 1) ret = state.buffer.head.data;else ret = state.buffer.concat(state.length);
    state.buffer.clear();
  } else {
    // read part of list
    ret = fromListPartial(n, state.buffer, state.decoder);
  }

  return ret;
}

// Extracts only enough buffered data to satisfy the amount requested.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function fromListPartial(n, list, hasStrings) {
  var ret;
  if (n < list.head.data.length) {
    // slice is the same for buffers and strings
    ret = list.head.data.slice(0, n);
    list.head.data = list.head.data.slice(n);
  } else if (n === list.head.data.length) {
    // first chunk is a perfect match
    ret = list.shift();
  } else {
    // result spans more than one buffer
    ret = hasStrings ? copyFromBufferString(n, list) : copyFromBuffer(n, list);
  }
  return ret;
}

// Copies a specified amount of characters from the list of buffered data
// chunks.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function copyFromBufferString(n, list) {
  var p = list.head;
  var c = 1;
  var ret = p.data;
  n -= ret.length;
  while (p = p.next) {
    var str = p.data;
    var nb = n > str.length ? str.length : n;
    if (nb === str.length) ret += str;else ret += str.slice(0, n);
    n -= nb;
    if (n === 0) {
      if (nb === str.length) {
        ++c;
        if (p.next) list.head = p.next;else list.head = list.tail = null;
      } else {
        list.head = p;
        p.data = str.slice(nb);
      }
      break;
    }
    ++c;
  }
  list.length -= c;
  return ret;
}

// Copies a specified amount of bytes from the list of buffered data chunks.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function copyFromBuffer(n, list) {
  var ret = Buffer.allocUnsafe(n);
  var p = list.head;
  var c = 1;
  p.data.copy(ret);
  n -= p.data.length;
  while (p = p.next) {
    var buf = p.data;
    var nb = n > buf.length ? buf.length : n;
    buf.copy(ret, ret.length - n, 0, nb);
    n -= nb;
    if (n === 0) {
      if (nb === buf.length) {
        ++c;
        if (p.next) list.head = p.next;else list.head = list.tail = null;
      } else {
        list.head = p;
        p.data = buf.slice(nb);
      }
      break;
    }
    ++c;
  }
  list.length -= c;
  return ret;
}

function endReadable(stream) {
  var state = stream._readableState;

  // If we get here before consuming all the bytes, then that is a
  // bug in node.  Should never happen.
  if (state.length > 0) throw new Error('"endReadable()" called on non-empty stream');

  if (!state.endEmitted) {
    state.ended = true;
    nextTick(endReadableNT, state, stream);
  }
}

function endReadableNT(state, stream) {
  // Check that we didn't get one last unshift.
  if (!state.endEmitted && state.length === 0) {
    state.endEmitted = true;
    stream.readable = false;
    stream.emit('end');
  }
}

function forEach(xs, f) {
  for (var i = 0, l = xs.length; i < l; i++) {
    f(xs[i], i);
  }
}

function indexOf(xs, x) {
  for (var i = 0, l = xs.length; i < l; i++) {
    if (xs[i] === x) return i;
  }
  return -1;
}

// A bit simpler than readable streams.
Writable.WritableState = WritableState;
inherits$1(Writable, EventEmitter);

function nop() {}

function WriteReq(chunk, encoding, cb) {
  this.chunk = chunk;
  this.encoding = encoding;
  this.callback = cb;
  this.next = null;
}

function WritableState(options, stream) {
  Object.defineProperty(this, 'buffer', {
    get: deprecate(function () {
      return this.getBuffer();
    }, '_writableState.buffer is deprecated. Use _writableState.getBuffer ' + 'instead.')
  });
  options = options || {};

  // object stream flag to indicate whether or not this stream
  // contains buffers or objects.
  this.objectMode = !!options.objectMode;

  if (stream instanceof Duplex) this.objectMode = this.objectMode || !!options.writableObjectMode;

  // the point at which write() starts returning false
  // Note: 0 is a valid value, means that we always return false if
  // the entire buffer is not flushed immediately on write()
  var hwm = options.highWaterMark;
  var defaultHwm = this.objectMode ? 16 : 16 * 1024;
  this.highWaterMark = hwm || hwm === 0 ? hwm : defaultHwm;

  // cast to ints.
  this.highWaterMark = ~ ~this.highWaterMark;

  this.needDrain = false;
  // at the start of calling end()
  this.ending = false;
  // when end() has been called, and returned
  this.ended = false;
  // when 'finish' is emitted
  this.finished = false;

  // should we decode strings into buffers before passing to _write?
  // this is here so that some node-core streams can optimize string
  // handling at a lower level.
  var noDecode = options.decodeStrings === false;
  this.decodeStrings = !noDecode;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // not an actual buffer we keep track of, but a measurement
  // of how much we're waiting to get pushed to some underlying
  // socket or file.
  this.length = 0;

  // a flag to see when we're in the middle of a write.
  this.writing = false;

  // when true all writes will be buffered until .uncork() call
  this.corked = 0;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, because any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // a flag to know if we're processing previously buffered items, which
  // may call the _write() callback in the same tick, so that we don't
  // end up in an overlapped onwrite situation.
  this.bufferProcessing = false;

  // the callback that's passed to _write(chunk,cb)
  this.onwrite = function (er) {
    onwrite(stream, er);
  };

  // the callback that the user supplies to write(chunk,encoding,cb)
  this.writecb = null;

  // the amount that is being written when _write is called.
  this.writelen = 0;

  this.bufferedRequest = null;
  this.lastBufferedRequest = null;

  // number of pending user-supplied write callbacks
  // this must be 0 before 'finish' can be emitted
  this.pendingcb = 0;

  // emit prefinish if the only thing we're waiting for is _write cbs
  // This is relevant for synchronous Transform streams
  this.prefinished = false;

  // True if the error was already emitted and should not be thrown again
  this.errorEmitted = false;

  // count buffered requests
  this.bufferedRequestCount = 0;

  // allocate the first CorkedRequest, there is always
  // one allocated and free to use, and we maintain at most two
  this.corkedRequestsFree = new CorkedRequest(this);
}

WritableState.prototype.getBuffer = function writableStateGetBuffer() {
  var current = this.bufferedRequest;
  var out = [];
  while (current) {
    out.push(current);
    current = current.next;
  }
  return out;
};
function Writable(options) {

  // Writable ctor is applied to Duplexes, though they're not
  // instanceof Writable, they're instanceof Readable.
  if (!(this instanceof Writable) && !(this instanceof Duplex)) return new Writable(options);

  this._writableState = new WritableState(options, this);

  // legacy.
  this.writable = true;

  if (options) {
    if (typeof options.write === 'function') this._write = options.write;

    if (typeof options.writev === 'function') this._writev = options.writev;
  }

  EventEmitter.call(this);
}

// Otherwise people can pipe Writable streams, which is just wrong.
Writable.prototype.pipe = function () {
  this.emit('error', new Error('Cannot pipe, not readable'));
};

function writeAfterEnd(stream, cb) {
  var er = new Error('write after end');
  // TODO: defer error events consistently everywhere, not just the cb
  stream.emit('error', er);
  nextTick(cb, er);
}

// If we get something that is not a buffer, string, null, or undefined,
// and we're not in objectMode, then that's an error.
// Otherwise stream chunks are all considered to be of length=1, and the
// watermarks determine how many objects to keep in the buffer, rather than
// how many bytes or characters.
function validChunk(stream, state, chunk, cb) {
  var valid = true;
  var er = false;
  // Always throw error if a null is written
  // if we are not in object mode then throw
  // if it is not a buffer, string, or undefined.
  if (chunk === null) {
    er = new TypeError('May not write null values to stream');
  } else if (!Buffer.isBuffer(chunk) && typeof chunk !== 'string' && chunk !== undefined && !state.objectMode) {
    er = new TypeError('Invalid non-string/buffer chunk');
  }
  if (er) {
    stream.emit('error', er);
    nextTick(cb, er);
    valid = false;
  }
  return valid;
}

Writable.prototype.write = function (chunk, encoding, cb) {
  var state = this._writableState;
  var ret = false;

  if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (Buffer.isBuffer(chunk)) encoding = 'buffer';else if (!encoding) encoding = state.defaultEncoding;

  if (typeof cb !== 'function') cb = nop;

  if (state.ended) writeAfterEnd(this, cb);else if (validChunk(this, state, chunk, cb)) {
    state.pendingcb++;
    ret = writeOrBuffer(this, state, chunk, encoding, cb);
  }

  return ret;
};

Writable.prototype.cork = function () {
  var state = this._writableState;

  state.corked++;
};

Writable.prototype.uncork = function () {
  var state = this._writableState;

  if (state.corked) {
    state.corked--;

    if (!state.writing && !state.corked && !state.finished && !state.bufferProcessing && state.bufferedRequest) clearBuffer(this, state);
  }
};

Writable.prototype.setDefaultEncoding = function setDefaultEncoding(encoding) {
  // node::ParseEncoding() requires lower case.
  if (typeof encoding === 'string') encoding = encoding.toLowerCase();
  if (!(['hex', 'utf8', 'utf-8', 'ascii', 'binary', 'base64', 'ucs2', 'ucs-2', 'utf16le', 'utf-16le', 'raw'].indexOf((encoding + '').toLowerCase()) > -1)) throw new TypeError('Unknown encoding: ' + encoding);
  this._writableState.defaultEncoding = encoding;
  return this;
};

function decodeChunk(state, chunk, encoding) {
  if (!state.objectMode && state.decodeStrings !== false && typeof chunk === 'string') {
    chunk = Buffer.from(chunk, encoding);
  }
  return chunk;
}

// if we're already writing something, then just put this
// in the queue, and wait our turn.  Otherwise, call _write
// If we return false, then we need a drain event, so set that flag.
function writeOrBuffer(stream, state, chunk, encoding, cb) {
  chunk = decodeChunk(state, chunk, encoding);

  if (Buffer.isBuffer(chunk)) encoding = 'buffer';
  var len = state.objectMode ? 1 : chunk.length;

  state.length += len;

  var ret = state.length < state.highWaterMark;
  // we must ensure that previous needDrain will not be reset to false.
  if (!ret) state.needDrain = true;

  if (state.writing || state.corked) {
    var last = state.lastBufferedRequest;
    state.lastBufferedRequest = new WriteReq(chunk, encoding, cb);
    if (last) {
      last.next = state.lastBufferedRequest;
    } else {
      state.bufferedRequest = state.lastBufferedRequest;
    }
    state.bufferedRequestCount += 1;
  } else {
    doWrite(stream, state, false, len, chunk, encoding, cb);
  }

  return ret;
}

function doWrite(stream, state, writev, len, chunk, encoding, cb) {
  state.writelen = len;
  state.writecb = cb;
  state.writing = true;
  state.sync = true;
  if (writev) stream._writev(chunk, state.onwrite);else stream._write(chunk, encoding, state.onwrite);
  state.sync = false;
}

function onwriteError(stream, state, sync, er, cb) {
  --state.pendingcb;
  if (sync) nextTick(cb, er);else cb(er);

  stream._writableState.errorEmitted = true;
  stream.emit('error', er);
}

function onwriteStateUpdate(state) {
  state.writing = false;
  state.writecb = null;
  state.length -= state.writelen;
  state.writelen = 0;
}

function onwrite(stream, er) {
  var state = stream._writableState;
  var sync = state.sync;
  var cb = state.writecb;

  onwriteStateUpdate(state);

  if (er) onwriteError(stream, state, sync, er, cb);else {
    // Check if we're actually ready to finish, but don't emit yet
    var finished = needFinish(state);

    if (!finished && !state.corked && !state.bufferProcessing && state.bufferedRequest) {
      clearBuffer(stream, state);
    }

    if (sync) {
      /*<replacement>*/
        nextTick(afterWrite, stream, state, finished, cb);
      /*</replacement>*/
    } else {
        afterWrite(stream, state, finished, cb);
      }
  }
}

function afterWrite(stream, state, finished, cb) {
  if (!finished) onwriteDrain(stream, state);
  state.pendingcb--;
  cb();
  finishMaybe(stream, state);
}

// Must force callback to be called on nextTick, so that we don't
// emit 'drain' before the write() consumer gets the 'false' return
// value, and has a chance to attach a 'drain' listener.
function onwriteDrain(stream, state) {
  if (state.length === 0 && state.needDrain) {
    state.needDrain = false;
    stream.emit('drain');
  }
}

// if there's something in the buffer waiting, then process it
function clearBuffer(stream, state) {
  state.bufferProcessing = true;
  var entry = state.bufferedRequest;

  if (stream._writev && entry && entry.next) {
    // Fast case, write everything using _writev()
    var l = state.bufferedRequestCount;
    var buffer = new Array(l);
    var holder = state.corkedRequestsFree;
    holder.entry = entry;

    var count = 0;
    while (entry) {
      buffer[count] = entry;
      entry = entry.next;
      count += 1;
    }

    doWrite(stream, state, true, state.length, buffer, '', holder.finish);

    // doWrite is almost always async, defer these to save a bit of time
    // as the hot path ends with doWrite
    state.pendingcb++;
    state.lastBufferedRequest = null;
    if (holder.next) {
      state.corkedRequestsFree = holder.next;
      holder.next = null;
    } else {
      state.corkedRequestsFree = new CorkedRequest(state);
    }
  } else {
    // Slow case, write chunks one-by-one
    while (entry) {
      var chunk = entry.chunk;
      var encoding = entry.encoding;
      var cb = entry.callback;
      var len = state.objectMode ? 1 : chunk.length;

      doWrite(stream, state, false, len, chunk, encoding, cb);
      entry = entry.next;
      // if we didn't call the onwrite immediately, then
      // it means that we need to wait until it does.
      // also, that means that the chunk and cb are currently
      // being processed, so move the buffer counter past them.
      if (state.writing) {
        break;
      }
    }

    if (entry === null) state.lastBufferedRequest = null;
  }

  state.bufferedRequestCount = 0;
  state.bufferedRequest = entry;
  state.bufferProcessing = false;
}

Writable.prototype._write = function (chunk, encoding, cb) {
  cb(new Error('not implemented'));
};

Writable.prototype._writev = null;

Writable.prototype.end = function (chunk, encoding, cb) {
  var state = this._writableState;

  if (typeof chunk === 'function') {
    cb = chunk;
    chunk = null;
    encoding = null;
  } else if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (chunk !== null && chunk !== undefined) this.write(chunk, encoding);

  // .end() fully uncorks
  if (state.corked) {
    state.corked = 1;
    this.uncork();
  }

  // ignore unnecessary end() calls.
  if (!state.ending && !state.finished) endWritable(this, state, cb);
};

function needFinish(state) {
  return state.ending && state.length === 0 && state.bufferedRequest === null && !state.finished && !state.writing;
}

function prefinish(stream, state) {
  if (!state.prefinished) {
    state.prefinished = true;
    stream.emit('prefinish');
  }
}

function finishMaybe(stream, state) {
  var need = needFinish(state);
  if (need) {
    if (state.pendingcb === 0) {
      prefinish(stream, state);
      state.finished = true;
      stream.emit('finish');
    } else {
      prefinish(stream, state);
    }
  }
  return need;
}

function endWritable(stream, state, cb) {
  state.ending = true;
  finishMaybe(stream, state);
  if (cb) {
    if (state.finished) nextTick(cb);else stream.once('finish', cb);
  }
  state.ended = true;
  stream.writable = false;
}

// It seems a linked list but it is not
// there will be only 2 of these for each stream
function CorkedRequest(state) {
  var _this = this;

  this.next = null;
  this.entry = null;

  this.finish = function (err) {
    var entry = _this.entry;
    _this.entry = null;
    while (entry) {
      var cb = entry.callback;
      state.pendingcb--;
      cb(err);
      entry = entry.next;
    }
    if (state.corkedRequestsFree) {
      state.corkedRequestsFree.next = _this;
    } else {
      state.corkedRequestsFree = _this;
    }
  };
}

inherits$1(Duplex, Readable);

var keys = Object.keys(Writable.prototype);
for (var v = 0; v < keys.length; v++) {
  var method = keys[v];
  if (!Duplex.prototype[method]) Duplex.prototype[method] = Writable.prototype[method];
}
function Duplex(options) {
  if (!(this instanceof Duplex)) return new Duplex(options);

  Readable.call(this, options);
  Writable.call(this, options);

  if (options && options.readable === false) this.readable = false;

  if (options && options.writable === false) this.writable = false;

  this.allowHalfOpen = true;
  if (options && options.allowHalfOpen === false) this.allowHalfOpen = false;

  this.once('end', onend);
}

// the no-half-open enforcer
function onend() {
  // if we allow half-open state, or if the writable side ended,
  // then we're ok.
  if (this.allowHalfOpen || this._writableState.ended) return;

  // no more data can be written.
  // But allow more writes to happen in this tick.
  nextTick(onEndNT, this);
}

function onEndNT(self) {
  self.end();
}

// a transform stream is a readable/writable stream where you do
inherits$1(Transform, Duplex);

function TransformState(stream) {
  this.afterTransform = function (er, data) {
    return afterTransform(stream, er, data);
  };

  this.needTransform = false;
  this.transforming = false;
  this.writecb = null;
  this.writechunk = null;
  this.writeencoding = null;
}

function afterTransform(stream, er, data) {
  var ts = stream._transformState;
  ts.transforming = false;

  var cb = ts.writecb;

  if (!cb) return stream.emit('error', new Error('no writecb in Transform class'));

  ts.writechunk = null;
  ts.writecb = null;

  if (data !== null && data !== undefined) stream.push(data);

  cb(er);

  var rs = stream._readableState;
  rs.reading = false;
  if (rs.needReadable || rs.length < rs.highWaterMark) {
    stream._read(rs.highWaterMark);
  }
}
function Transform(options) {
  if (!(this instanceof Transform)) return new Transform(options);

  Duplex.call(this, options);

  this._transformState = new TransformState(this);

  // when the writable side finishes, then flush out anything remaining.
  var stream = this;

  // start out asking for a readable event once data is transformed.
  this._readableState.needReadable = true;

  // we have implemented the _read method, and done the other things
  // that Readable wants before the first _read call, so unset the
  // sync guard flag.
  this._readableState.sync = false;

  if (options) {
    if (typeof options.transform === 'function') this._transform = options.transform;

    if (typeof options.flush === 'function') this._flush = options.flush;
  }

  this.once('prefinish', function () {
    if (typeof this._flush === 'function') this._flush(function (er) {
      done(stream, er);
    });else done(stream);
  });
}

Transform.prototype.push = function (chunk, encoding) {
  this._transformState.needTransform = false;
  return Duplex.prototype.push.call(this, chunk, encoding);
};

// This is the part where you do stuff!
// override this function in implementation classes.
// 'chunk' is an input chunk.
//
// Call `push(newChunk)` to pass along transformed output
// to the readable side.  You may call 'push' zero or more times.
//
// Call `cb(err)` when you are done with this chunk.  If you pass
// an error, then that'll put the hurt on the whole operation.  If you
// never call cb(), then you'll never get another chunk.
Transform.prototype._transform = function (chunk, encoding, cb) {
  throw new Error('Not implemented');
};

Transform.prototype._write = function (chunk, encoding, cb) {
  var ts = this._transformState;
  ts.writecb = cb;
  ts.writechunk = chunk;
  ts.writeencoding = encoding;
  if (!ts.transforming) {
    var rs = this._readableState;
    if (ts.needTransform || rs.needReadable || rs.length < rs.highWaterMark) this._read(rs.highWaterMark);
  }
};

// Doesn't matter what the args are here.
// _transform does all the work.
// That we got here means that the readable side wants more data.
Transform.prototype._read = function (n) {
  var ts = this._transformState;

  if (ts.writechunk !== null && ts.writecb && !ts.transforming) {
    ts.transforming = true;
    this._transform(ts.writechunk, ts.writeencoding, ts.afterTransform);
  } else {
    // mark that we need a transform, so that any data that comes in
    // will get processed, now that we've asked for it.
    ts.needTransform = true;
  }
};

function done(stream, er) {
  if (er) return stream.emit('error', er);

  // if there's nothing in the write buffer, then that means
  // that nothing more will ever be provided
  var ws = stream._writableState;
  var ts = stream._transformState;

  if (ws.length) throw new Error('Calling transform done when ws.length != 0');

  if (ts.transforming) throw new Error('Calling transform done when still transforming');

  return stream.push(null);
}

inherits$1(PassThrough, Transform);
function PassThrough(options) {
  if (!(this instanceof PassThrough)) return new PassThrough(options);

  Transform.call(this, options);
}

PassThrough.prototype._transform = function (chunk, encoding, cb) {
  cb(null, chunk);
};

inherits$1(Stream, EventEmitter);
Stream.Readable = Readable;
Stream.Writable = Writable;
Stream.Duplex = Duplex;
Stream.Transform = Transform;
Stream.PassThrough = PassThrough;

// Backwards-compat with node 0.4.x
Stream.Stream = Stream;

// old-style streams.  Note that the pipe method (the only relevant
// part of this class) is overridden in the Readable class.

function Stream() {
  EventEmitter.call(this);
}

Stream.prototype.pipe = function(dest, options) {
  var source = this;

  function ondata(chunk) {
    if (dest.writable) {
      if (false === dest.write(chunk) && source.pause) {
        source.pause();
      }
    }
  }

  source.on('data', ondata);

  function ondrain() {
    if (source.readable && source.resume) {
      source.resume();
    }
  }

  dest.on('drain', ondrain);

  // If the 'end' option is not supplied, dest.end() will be called when
  // source gets the 'end' or 'close' events.  Only dest.end() once.
  if (!dest._isStdio && (!options || options.end !== false)) {
    source.on('end', onend);
    source.on('close', onclose);
  }

  var didOnEnd = false;
  function onend() {
    if (didOnEnd) return;
    didOnEnd = true;

    dest.end();
  }


  function onclose() {
    if (didOnEnd) return;
    didOnEnd = true;

    if (typeof dest.destroy === 'function') dest.destroy();
  }

  // don't leave dangling pipes when there are errors.
  function onerror(er) {
    cleanup();
    if (EventEmitter.listenerCount(this, 'error') === 0) {
      throw er; // Unhandled stream error in pipe.
    }
  }

  source.on('error', onerror);
  dest.on('error', onerror);

  // remove all the event listeners that were added.
  function cleanup() {
    source.removeListener('data', ondata);
    dest.removeListener('drain', ondrain);

    source.removeListener('end', onend);
    source.removeListener('close', onclose);

    source.removeListener('error', onerror);
    dest.removeListener('error', onerror);

    source.removeListener('end', cleanup);
    source.removeListener('close', cleanup);

    dest.removeListener('close', cleanup);
  }

  source.on('end', cleanup);
  source.on('close', cleanup);

  dest.on('close', cleanup);

  dest.emit('pipe', source);

  // Allow for unix-like usage: A.pipe(B).pipe(C)
  return dest;
};

var stream = Stream;

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

var Buffer$1 = bufferEs6.Buffer;

var inspect$1 = debugUtil.inspect;

var custom = inspect$1 && inspect$1.custom || 'inspect';

function copyBuffer(src, target, offset) {
  Buffer$1.prototype.copy.call(src, target, offset);
}

var buffer_list =
/*#__PURE__*/
function () {
  function BufferList() {
    _classCallCheck(this, BufferList);

    this.head = null;
    this.tail = null;
    this.length = 0;
  }

  _createClass(BufferList, [{
    key: "push",
    value: function push(v) {
      var entry = {
        data: v,
        next: null
      };
      if (this.length > 0) this.tail.next = entry;else this.head = entry;
      this.tail = entry;
      ++this.length;
    }
  }, {
    key: "unshift",
    value: function unshift(v) {
      var entry = {
        data: v,
        next: this.head
      };
      if (this.length === 0) this.tail = entry;
      this.head = entry;
      ++this.length;
    }
  }, {
    key: "shift",
    value: function shift() {
      if (this.length === 0) return;
      var ret = this.head.data;
      if (this.length === 1) this.head = this.tail = null;else this.head = this.head.next;
      --this.length;
      return ret;
    }
  }, {
    key: "clear",
    value: function clear() {
      this.head = this.tail = null;
      this.length = 0;
    }
  }, {
    key: "join",
    value: function join(s) {
      if (this.length === 0) return '';
      var p = this.head;
      var ret = '' + p.data;

      while (p = p.next) {
        ret += s + p.data;
      }

      return ret;
    }
  }, {
    key: "concat",
    value: function concat(n) {
      if (this.length === 0) return Buffer$1.alloc(0);
      var ret = Buffer$1.allocUnsafe(n >>> 0);
      var p = this.head;
      var i = 0;

      while (p) {
        copyBuffer(p.data, ret, i);
        i += p.data.length;
        p = p.next;
      }

      return ret;
    } // Consumes a specified amount of bytes or characters from the buffered data.

  }, {
    key: "consume",
    value: function consume(n, hasStrings) {
      var ret;

      if (n < this.head.data.length) {
        // `slice` is the same for buffers and strings.
        ret = this.head.data.slice(0, n);
        this.head.data = this.head.data.slice(n);
      } else if (n === this.head.data.length) {
        // First chunk is a perfect match.
        ret = this.shift();
      } else {
        // Result spans more than one buffer.
        ret = hasStrings ? this._getString(n) : this._getBuffer(n);
      }

      return ret;
    }
  }, {
    key: "first",
    value: function first() {
      return this.head.data;
    } // Consumes a specified amount of characters from the buffered data.

  }, {
    key: "_getString",
    value: function _getString(n) {
      var p = this.head;
      var c = 1;
      var ret = p.data;
      n -= ret.length;

      while (p = p.next) {
        var str = p.data;
        var nb = n > str.length ? str.length : n;
        if (nb === str.length) ret += str;else ret += str.slice(0, n);
        n -= nb;

        if (n === 0) {
          if (nb === str.length) {
            ++c;
            if (p.next) this.head = p.next;else this.head = this.tail = null;
          } else {
            this.head = p;
            p.data = str.slice(nb);
          }

          break;
        }

        ++c;
      }

      this.length -= c;
      return ret;
    } // Consumes a specified amount of bytes from the buffered data.

  }, {
    key: "_getBuffer",
    value: function _getBuffer(n) {
      var ret = Buffer$1.allocUnsafe(n);
      var p = this.head;
      var c = 1;
      p.data.copy(ret);
      n -= p.data.length;

      while (p = p.next) {
        var buf = p.data;
        var nb = n > buf.length ? buf.length : n;
        buf.copy(ret, ret.length - n, 0, nb);
        n -= nb;

        if (n === 0) {
          if (nb === buf.length) {
            ++c;
            if (p.next) this.head = p.next;else this.head = this.tail = null;
          } else {
            this.head = p;
            p.data = buf.slice(nb);
          }

          break;
        }

        ++c;
      }

      this.length -= c;
      return ret;
    } // Make sure the linked list only shows the minimal necessary information.

  }, {
    key: custom,
    value: function value(_, options) {
      return inspect$1(this, _objectSpread({}, options, {
        // Only inspect one level.
        depth: 0,
        // It should not recurse.
        customInspect: false
      }));
    }
  }]);

  return BufferList;
}();

function destroy(err, cb) {
  var _this = this;

  var readableDestroyed = this._readableState && this._readableState.destroyed;
  var writableDestroyed = this._writableState && this._writableState.destroyed;

  if (readableDestroyed || writableDestroyed) {
    if (cb) {
      cb(err);
    } else if (err) {
      if (!this._writableState) {
        nextTick(emitErrorNT, this, err);
      } else if (!this._writableState.errorEmitted) {
        this._writableState.errorEmitted = true;
        nextTick(emitErrorNT, this, err);
      }
    }

    return this;
  } // we set destroyed to true before firing error callbacks in order
  // to make it re-entrance safe in case destroy() is called within callbacks


  if (this._readableState) {
    this._readableState.destroyed = true;
  } // if this is a duplex stream mark the writable part as destroyed as well


  if (this._writableState) {
    this._writableState.destroyed = true;
  }

  this._destroy(err || null, function (err) {
    if (!cb && err) {
      if (!_this._writableState) {
        nextTick(emitErrorAndCloseNT, _this, err);
      } else if (!_this._writableState.errorEmitted) {
        _this._writableState.errorEmitted = true;
        nextTick(emitErrorAndCloseNT, _this, err);
      } else {
        nextTick(emitCloseNT, _this);
      }
    } else if (cb) {
      nextTick(emitCloseNT, _this);
      cb(err);
    } else {
      nextTick(emitCloseNT, _this);
    }
  });

  return this;
}

function emitErrorAndCloseNT(self, err) {
  emitErrorNT(self, err);
  emitCloseNT(self);
}

function emitCloseNT(self) {
  if (self._writableState && !self._writableState.emitClose) return;
  if (self._readableState && !self._readableState.emitClose) return;
  self.emit('close');
}

function undestroy() {
  if (this._readableState) {
    this._readableState.destroyed = false;
    this._readableState.reading = false;
    this._readableState.ended = false;
    this._readableState.endEmitted = false;
  }

  if (this._writableState) {
    this._writableState.destroyed = false;
    this._writableState.ended = false;
    this._writableState.ending = false;
    this._writableState.finalCalled = false;
    this._writableState.prefinished = false;
    this._writableState.finished = false;
    this._writableState.errorEmitted = false;
  }
}

function emitErrorNT(self, err) {
  self.emit('error', err);
}

function errorOrDestroy(stream, err) {
  // We have tests that rely on errors being emitted
  // in the same tick, so changing this is semver major.
  // For now when you opt-in to autoDestroy we allow
  // the error to be emitted nextTick. In a future
  // semver major update we should change the default to this.
  var rState = stream._readableState;
  var wState = stream._writableState;
  if (rState && rState.autoDestroy || wState && wState.autoDestroy) stream.destroy(err);else stream.emit('error', err);
}

var destroy_1 = {
  destroy: destroy,
  undestroy: undestroy,
  errorOrDestroy: errorOrDestroy
};

const codes = {};

function createErrorType(code, message, Base) {
  if (!Base) {
    Base = Error;
  }

  function getMessage (arg1, arg2, arg3) {
    if (typeof message === 'string') {
      return message
    } else {
      return message(arg1, arg2, arg3)
    }
  }

  class NodeError extends Base {
    constructor (arg1, arg2, arg3) {
      super(getMessage(arg1, arg2, arg3));
    }
  }

  NodeError.prototype.name = Base.name;
  NodeError.prototype.code = code;

  codes[code] = NodeError;
}

// https://github.com/nodejs/node/blob/v10.8.0/lib/internal/errors.js
function oneOf(expected, thing) {
  if (Array.isArray(expected)) {
    const len = expected.length;
    expected = expected.map((i) => String(i));
    if (len > 2) {
      return `one of ${thing} ${expected.slice(0, len - 1).join(', ')}, or ` +
             expected[len - 1];
    } else if (len === 2) {
      return `one of ${thing} ${expected[0]} or ${expected[1]}`;
    } else {
      return `of ${thing} ${expected[0]}`;
    }
  } else {
    return `of ${thing} ${String(expected)}`;
  }
}

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/startsWith
function startsWith(str, search, pos) {
	return str.substr(!pos || pos < 0 ? 0 : +pos, search.length) === search;
}

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/endsWith
function endsWith(str, search, this_len) {
	if (this_len === undefined || this_len > str.length) {
		this_len = str.length;
	}
	return str.substring(this_len - search.length, this_len) === search;
}

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/includes
function includes(str, search, start) {
  if (typeof start !== 'number') {
    start = 0;
  }

  if (start + search.length > str.length) {
    return false;
  } else {
    return str.indexOf(search, start) !== -1;
  }
}

createErrorType('ERR_INVALID_OPT_VALUE', function (name, value) {
  return 'The value "' + value + '" is invalid for option "' + name + '"'
}, TypeError);
createErrorType('ERR_INVALID_ARG_TYPE', function (name, expected, actual) {
  // determiner: 'must be' or 'must not be'
  let determiner;
  if (typeof expected === 'string' && startsWith(expected, 'not ')) {
    determiner = 'must not be';
    expected = expected.replace(/^not /, '');
  } else {
    determiner = 'must be';
  }

  let msg;
  if (endsWith(name, ' argument')) {
    // For cases like 'first argument'
    msg = `The ${name} ${determiner} ${oneOf(expected, 'type')}`;
  } else {
    const type = includes(name, '.') ? 'property' : 'argument';
    msg = `The "${name}" ${type} ${determiner} ${oneOf(expected, 'type')}`;
  }

  msg += `. Received type ${typeof actual}`;
  return msg;
}, TypeError);
createErrorType('ERR_STREAM_PUSH_AFTER_EOF', 'stream.push() after EOF');
createErrorType('ERR_METHOD_NOT_IMPLEMENTED', function (name) {
  return 'The ' + name + ' method is not implemented'
});
createErrorType('ERR_STREAM_PREMATURE_CLOSE', 'Premature close');
createErrorType('ERR_STREAM_DESTROYED', function (name) {
  return 'Cannot call ' + name + ' after a stream was destroyed';
});
createErrorType('ERR_MULTIPLE_CALLBACK', 'Callback called multiple times');
createErrorType('ERR_STREAM_CANNOT_PIPE', 'Cannot pipe, not readable');
createErrorType('ERR_STREAM_WRITE_AFTER_END', 'write after end');
createErrorType('ERR_STREAM_NULL_VALUES', 'May not write null values to stream', TypeError);
createErrorType('ERR_UNKNOWN_ENCODING', function (arg) {
  return 'Unknown encoding: ' + arg
}, TypeError);
createErrorType('ERR_STREAM_UNSHIFT_AFTER_END_EVENT', 'stream.unshift() after end event');

var codes_1 = codes;

var errors = {
	codes: codes_1
};

var ERR_INVALID_OPT_VALUE = errors.codes.ERR_INVALID_OPT_VALUE;

function highWaterMarkFrom(options, isDuplex, duplexKey) {
  return options.highWaterMark != null ? options.highWaterMark : isDuplex ? options[duplexKey] : null;
}

function getHighWaterMark(state, options, duplexKey, isDuplex) {
  var hwm = highWaterMarkFrom(options, isDuplex, duplexKey);

  if (hwm != null) {
    if (!(isFinite(hwm) && Math.floor(hwm) === hwm) || hwm < 0) {
      var name = isDuplex ? duplexKey : 'highWaterMark';
      throw new ERR_INVALID_OPT_VALUE(name, hwm);
    }

    return Math.floor(hwm);
  } // Default value


  return state.objectMode ? 16 : 16 * 1024;
}

var state = {
  getHighWaterMark: getHighWaterMark
};

var inherits_browser = createCommonjsModule(function (module) {
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    if (superCtor) {
      ctor.super_ = superCtor;
      ctor.prototype = Object.create(superCtor.prototype, {
        constructor: {
          value: ctor,
          enumerable: false,
          writable: true,
          configurable: true
        }
      });
    }
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    if (superCtor) {
      ctor.super_ = superCtor;
      var TempCtor = function () {};
      TempCtor.prototype = superCtor.prototype;
      ctor.prototype = new TempCtor();
      ctor.prototype.constructor = ctor;
    }
  };
}
});

var inherits$2 = createCommonjsModule(function (module) {
try {
  var util = debugUtil;
  /* istanbul ignore next */
  if (typeof util.inherits !== 'function') throw '';
  module.exports = util.inherits;
} catch (e) {
  /* istanbul ignore next */
  module.exports = inherits_browser;
}
});

/**
 * For Node.js, simply re-export the core `util.deprecate` function.
 */

var node$1 = debugUtil.deprecate;

var _stream_writable = Writable$1;
// there will be only 2 of these for each stream


function CorkedRequest$1(state) {
  var _this = this;

  this.next = null;
  this.entry = null;

  this.finish = function () {
    onCorkedFinish(_this, state);
  };
}
/* </replacement> */

/*<replacement>*/


var Duplex$1;
/*</replacement>*/

Writable$1.WritableState = WritableState$1;
/*<replacement>*/

var internalUtil = {
  deprecate: node$1
};
/*</replacement>*/

/*<replacement>*/


/*</replacement>*/


var Buffer$2 = bufferEs6.Buffer;

var OurUint8Array = commonjsGlobal.Uint8Array || function () {};

function _uint8ArrayToBuffer(chunk) {
  return Buffer$2.from(chunk);
}

function _isUint8Array(obj) {
  return Buffer$2.isBuffer(obj) || obj instanceof OurUint8Array;
}



var getHighWaterMark$1 = state.getHighWaterMark;

var _require$codes = errors.codes,
    ERR_INVALID_ARG_TYPE = _require$codes.ERR_INVALID_ARG_TYPE,
    ERR_METHOD_NOT_IMPLEMENTED = _require$codes.ERR_METHOD_NOT_IMPLEMENTED,
    ERR_MULTIPLE_CALLBACK = _require$codes.ERR_MULTIPLE_CALLBACK,
    ERR_STREAM_CANNOT_PIPE = _require$codes.ERR_STREAM_CANNOT_PIPE,
    ERR_STREAM_DESTROYED = _require$codes.ERR_STREAM_DESTROYED,
    ERR_STREAM_NULL_VALUES = _require$codes.ERR_STREAM_NULL_VALUES,
    ERR_STREAM_WRITE_AFTER_END = _require$codes.ERR_STREAM_WRITE_AFTER_END,
    ERR_UNKNOWN_ENCODING = _require$codes.ERR_UNKNOWN_ENCODING;

var errorOrDestroy$1 = destroy_1.errorOrDestroy;

inherits$2(Writable$1, stream);

function nop$1() {}

function WritableState$1(options, stream, isDuplex) {
  Duplex$1 = Duplex$1 || _stream_duplex;
  options = options || {}; // Duplex streams are both readable and writable, but share
  // the same options object.
  // However, some cases require setting options to different
  // values for the readable and the writable sides of the duplex stream,
  // e.g. options.readableObjectMode vs. options.writableObjectMode, etc.

  if (typeof isDuplex !== 'boolean') isDuplex = stream instanceof Duplex$1; // object stream flag to indicate whether or not this stream
  // contains buffers or objects.

  this.objectMode = !!options.objectMode;
  if (isDuplex) this.objectMode = this.objectMode || !!options.writableObjectMode; // the point at which write() starts returning false
  // Note: 0 is a valid value, means that we always return false if
  // the entire buffer is not flushed immediately on write()

  this.highWaterMark = getHighWaterMark$1(this, options, 'writableHighWaterMark', isDuplex); // if _final has been called

  this.finalCalled = false; // drain event flag.

  this.needDrain = false; // at the start of calling end()

  this.ending = false; // when end() has been called, and returned

  this.ended = false; // when 'finish' is emitted

  this.finished = false; // has it been destroyed

  this.destroyed = false; // should we decode strings into buffers before passing to _write?
  // this is here so that some node-core streams can optimize string
  // handling at a lower level.

  var noDecode = options.decodeStrings === false;
  this.decodeStrings = !noDecode; // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.

  this.defaultEncoding = options.defaultEncoding || 'utf8'; // not an actual buffer we keep track of, but a measurement
  // of how much we're waiting to get pushed to some underlying
  // socket or file.

  this.length = 0; // a flag to see when we're in the middle of a write.

  this.writing = false; // when true all writes will be buffered until .uncork() call

  this.corked = 0; // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, because any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.

  this.sync = true; // a flag to know if we're processing previously buffered items, which
  // may call the _write() callback in the same tick, so that we don't
  // end up in an overlapped onwrite situation.

  this.bufferProcessing = false; // the callback that's passed to _write(chunk,cb)

  this.onwrite = function (er) {
    onwrite$1(stream, er);
  }; // the callback that the user supplies to write(chunk,encoding,cb)


  this.writecb = null; // the amount that is being written when _write is called.

  this.writelen = 0;
  this.bufferedRequest = null;
  this.lastBufferedRequest = null; // number of pending user-supplied write callbacks
  // this must be 0 before 'finish' can be emitted

  this.pendingcb = 0; // emit prefinish if the only thing we're waiting for is _write cbs
  // This is relevant for synchronous Transform streams

  this.prefinished = false; // True if the error was already emitted and should not be thrown again

  this.errorEmitted = false; // Should close be emitted on destroy. Defaults to true.

  this.emitClose = options.emitClose !== false; // Should .destroy() be called after 'finish' (and potentially 'end')

  this.autoDestroy = !!options.autoDestroy; // count buffered requests

  this.bufferedRequestCount = 0; // allocate the first CorkedRequest, there is always
  // one allocated and free to use, and we maintain at most two

  this.corkedRequestsFree = new CorkedRequest$1(this);
}

WritableState$1.prototype.getBuffer = function getBuffer() {
  var current = this.bufferedRequest;
  var out = [];

  while (current) {
    out.push(current);
    current = current.next;
  }

  return out;
};

(function () {
  try {
    Object.defineProperty(WritableState$1.prototype, 'buffer', {
      get: internalUtil.deprecate(function writableStateBufferGetter() {
        return this.getBuffer();
      }, '_writableState.buffer is deprecated. Use _writableState.getBuffer ' + 'instead.', 'DEP0003')
    });
  } catch (_) {}
})(); // Test _writableState for inheritance to account for Duplex streams,
// whose prototype chain only points to Readable.


var realHasInstance;

if (typeof Symbol === 'function' && Symbol.hasInstance && typeof Function.prototype[Symbol.hasInstance] === 'function') {
  realHasInstance = Function.prototype[Symbol.hasInstance];
  Object.defineProperty(Writable$1, Symbol.hasInstance, {
    value: function value(object) {
      if (realHasInstance.call(this, object)) return true;
      if (this !== Writable$1) return false;
      return object && object._writableState instanceof WritableState$1;
    }
  });
} else {
  realHasInstance = function realHasInstance(object) {
    return object instanceof this;
  };
}

function Writable$1(options) {
  Duplex$1 = Duplex$1 || _stream_duplex; // Writable ctor is applied to Duplexes, too.
  // `realHasInstance` is necessary because using plain `instanceof`
  // would return false, as no `_writableState` property is attached.
  // Trying to use the custom `instanceof` for Writable here will also break the
  // Node.js LazyTransform implementation, which has a non-trivial getter for
  // `_writableState` that would lead to infinite recursion.
  // Checking for a Stream.Duplex instance is faster here instead of inside
  // the WritableState constructor, at least with V8 6.5

  var isDuplex = this instanceof Duplex$1;
  if (!isDuplex && !realHasInstance.call(Writable$1, this)) return new Writable$1(options);
  this._writableState = new WritableState$1(options, this, isDuplex); // legacy.

  this.writable = true;

  if (options) {
    if (typeof options.write === 'function') this._write = options.write;
    if (typeof options.writev === 'function') this._writev = options.writev;
    if (typeof options.destroy === 'function') this._destroy = options.destroy;
    if (typeof options.final === 'function') this._final = options.final;
  }

  stream.call(this);
} // Otherwise people can pipe Writable streams, which is just wrong.


Writable$1.prototype.pipe = function () {
  errorOrDestroy$1(this, new ERR_STREAM_CANNOT_PIPE());
};

function writeAfterEnd$1(stream, cb) {
  var er = new ERR_STREAM_WRITE_AFTER_END(); // TODO: defer error events consistently everywhere, not just the cb

  errorOrDestroy$1(stream, er);
  nextTick(cb, er);
} // Checks that a user-supplied chunk is valid, especially for the particular
// mode the stream is in. Currently this means that `null` is never accepted
// and undefined/non-string values are only allowed in object mode.


function validChunk$1(stream, state, chunk, cb) {
  var er;

  if (chunk === null) {
    er = new ERR_STREAM_NULL_VALUES();
  } else if (typeof chunk !== 'string' && !state.objectMode) {
    er = new ERR_INVALID_ARG_TYPE('chunk', ['string', 'Buffer'], chunk);
  }

  if (er) {
    errorOrDestroy$1(stream, er);
    nextTick(cb, er);
    return false;
  }

  return true;
}

Writable$1.prototype.write = function (chunk, encoding, cb) {
  var state = this._writableState;
  var ret = false;

  var isBuf = !state.objectMode && _isUint8Array(chunk);

  if (isBuf && !Buffer$2.isBuffer(chunk)) {
    chunk = _uint8ArrayToBuffer(chunk);
  }

  if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (isBuf) encoding = 'buffer';else if (!encoding) encoding = state.defaultEncoding;
  if (typeof cb !== 'function') cb = nop$1;
  if (state.ending) writeAfterEnd$1(this, cb);else if (isBuf || validChunk$1(this, state, chunk, cb)) {
    state.pendingcb++;
    ret = writeOrBuffer$1(this, state, isBuf, chunk, encoding, cb);
  }
  return ret;
};

Writable$1.prototype.cork = function () {
  this._writableState.corked++;
};

Writable$1.prototype.uncork = function () {
  var state = this._writableState;

  if (state.corked) {
    state.corked--;
    if (!state.writing && !state.corked && !state.bufferProcessing && state.bufferedRequest) clearBuffer$1(this, state);
  }
};

Writable$1.prototype.setDefaultEncoding = function setDefaultEncoding(encoding) {
  // node::ParseEncoding() requires lower case.
  if (typeof encoding === 'string') encoding = encoding.toLowerCase();
  if (!(['hex', 'utf8', 'utf-8', 'ascii', 'binary', 'base64', 'ucs2', 'ucs-2', 'utf16le', 'utf-16le', 'raw'].indexOf((encoding + '').toLowerCase()) > -1)) throw new ERR_UNKNOWN_ENCODING(encoding);
  this._writableState.defaultEncoding = encoding;
  return this;
};

Object.defineProperty(Writable$1.prototype, 'writableBuffer', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._writableState && this._writableState.getBuffer();
  }
});

function decodeChunk$1(state, chunk, encoding) {
  if (!state.objectMode && state.decodeStrings !== false && typeof chunk === 'string') {
    chunk = Buffer$2.from(chunk, encoding);
  }

  return chunk;
}

Object.defineProperty(Writable$1.prototype, 'writableHighWaterMark', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._writableState.highWaterMark;
  }
}); // if we're already writing something, then just put this
// in the queue, and wait our turn.  Otherwise, call _write
// If we return false, then we need a drain event, so set that flag.

function writeOrBuffer$1(stream, state, isBuf, chunk, encoding, cb) {
  if (!isBuf) {
    var newChunk = decodeChunk$1(state, chunk, encoding);

    if (chunk !== newChunk) {
      isBuf = true;
      encoding = 'buffer';
      chunk = newChunk;
    }
  }

  var len = state.objectMode ? 1 : chunk.length;
  state.length += len;
  var ret = state.length < state.highWaterMark; // we must ensure that previous needDrain will not be reset to false.

  if (!ret) state.needDrain = true;

  if (state.writing || state.corked) {
    var last = state.lastBufferedRequest;
    state.lastBufferedRequest = {
      chunk: chunk,
      encoding: encoding,
      isBuf: isBuf,
      callback: cb,
      next: null
    };

    if (last) {
      last.next = state.lastBufferedRequest;
    } else {
      state.bufferedRequest = state.lastBufferedRequest;
    }

    state.bufferedRequestCount += 1;
  } else {
    doWrite$1(stream, state, false, len, chunk, encoding, cb);
  }

  return ret;
}

function doWrite$1(stream, state, writev, len, chunk, encoding, cb) {
  state.writelen = len;
  state.writecb = cb;
  state.writing = true;
  state.sync = true;
  if (state.destroyed) state.onwrite(new ERR_STREAM_DESTROYED('write'));else if (writev) stream._writev(chunk, state.onwrite);else stream._write(chunk, encoding, state.onwrite);
  state.sync = false;
}

function onwriteError$1(stream, state, sync, er, cb) {
  --state.pendingcb;

  if (sync) {
    // defer the callback if we are being called synchronously
    // to avoid piling up things on the stack
    nextTick(cb, er); // this can emit finish, and it will always happen
    // after error

    nextTick(finishMaybe$1, stream, state);
    stream._writableState.errorEmitted = true;
    errorOrDestroy$1(stream, er);
  } else {
    // the caller expect this to happen before if
    // it is async
    cb(er);
    stream._writableState.errorEmitted = true;
    errorOrDestroy$1(stream, er); // this can emit finish, but finish must
    // always follow error

    finishMaybe$1(stream, state);
  }
}

function onwriteStateUpdate$1(state) {
  state.writing = false;
  state.writecb = null;
  state.length -= state.writelen;
  state.writelen = 0;
}

function onwrite$1(stream, er) {
  var state = stream._writableState;
  var sync = state.sync;
  var cb = state.writecb;
  if (typeof cb !== 'function') throw new ERR_MULTIPLE_CALLBACK();
  onwriteStateUpdate$1(state);
  if (er) onwriteError$1(stream, state, sync, er, cb);else {
    // Check if we're actually ready to finish, but don't emit yet
    var finished = needFinish$1(state) || stream.destroyed;

    if (!finished && !state.corked && !state.bufferProcessing && state.bufferedRequest) {
      clearBuffer$1(stream, state);
    }

    if (sync) {
      nextTick(afterWrite$1, stream, state, finished, cb);
    } else {
      afterWrite$1(stream, state, finished, cb);
    }
  }
}

function afterWrite$1(stream, state, finished, cb) {
  if (!finished) onwriteDrain$1(stream, state);
  state.pendingcb--;
  cb();
  finishMaybe$1(stream, state);
} // Must force callback to be called on nextTick, so that we don't
// emit 'drain' before the write() consumer gets the 'false' return
// value, and has a chance to attach a 'drain' listener.


function onwriteDrain$1(stream, state) {
  if (state.length === 0 && state.needDrain) {
    state.needDrain = false;
    stream.emit('drain');
  }
} // if there's something in the buffer waiting, then process it


function clearBuffer$1(stream, state) {
  state.bufferProcessing = true;
  var entry = state.bufferedRequest;

  if (stream._writev && entry && entry.next) {
    // Fast case, write everything using _writev()
    var l = state.bufferedRequestCount;
    var buffer = new Array(l);
    var holder = state.corkedRequestsFree;
    holder.entry = entry;
    var count = 0;
    var allBuffers = true;

    while (entry) {
      buffer[count] = entry;
      if (!entry.isBuf) allBuffers = false;
      entry = entry.next;
      count += 1;
    }

    buffer.allBuffers = allBuffers;
    doWrite$1(stream, state, true, state.length, buffer, '', holder.finish); // doWrite is almost always async, defer these to save a bit of time
    // as the hot path ends with doWrite

    state.pendingcb++;
    state.lastBufferedRequest = null;

    if (holder.next) {
      state.corkedRequestsFree = holder.next;
      holder.next = null;
    } else {
      state.corkedRequestsFree = new CorkedRequest$1(state);
    }

    state.bufferedRequestCount = 0;
  } else {
    // Slow case, write chunks one-by-one
    while (entry) {
      var chunk = entry.chunk;
      var encoding = entry.encoding;
      var cb = entry.callback;
      var len = state.objectMode ? 1 : chunk.length;
      doWrite$1(stream, state, false, len, chunk, encoding, cb);
      entry = entry.next;
      state.bufferedRequestCount--; // if we didn't call the onwrite immediately, then
      // it means that we need to wait until it does.
      // also, that means that the chunk and cb are currently
      // being processed, so move the buffer counter past them.

      if (state.writing) {
        break;
      }
    }

    if (entry === null) state.lastBufferedRequest = null;
  }

  state.bufferedRequest = entry;
  state.bufferProcessing = false;
}

Writable$1.prototype._write = function (chunk, encoding, cb) {
  cb(new ERR_METHOD_NOT_IMPLEMENTED('_write()'));
};

Writable$1.prototype._writev = null;

Writable$1.prototype.end = function (chunk, encoding, cb) {
  var state = this._writableState;

  if (typeof chunk === 'function') {
    cb = chunk;
    chunk = null;
    encoding = null;
  } else if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (chunk !== null && chunk !== undefined) this.write(chunk, encoding); // .end() fully uncorks

  if (state.corked) {
    state.corked = 1;
    this.uncork();
  } // ignore unnecessary end() calls.


  if (!state.ending) endWritable$1(this, state, cb);
  return this;
};

Object.defineProperty(Writable$1.prototype, 'writableLength', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._writableState.length;
  }
});

function needFinish$1(state) {
  return state.ending && state.length === 0 && state.bufferedRequest === null && !state.finished && !state.writing;
}

function callFinal(stream, state) {
  stream._final(function (err) {
    state.pendingcb--;

    if (err) {
      errorOrDestroy$1(stream, err);
    }

    state.prefinished = true;
    stream.emit('prefinish');
    finishMaybe$1(stream, state);
  });
}

function prefinish$1(stream, state) {
  if (!state.prefinished && !state.finalCalled) {
    if (typeof stream._final === 'function' && !state.destroyed) {
      state.pendingcb++;
      state.finalCalled = true;
      nextTick(callFinal, stream, state);
    } else {
      state.prefinished = true;
      stream.emit('prefinish');
    }
  }
}

function finishMaybe$1(stream, state) {
  var need = needFinish$1(state);

  if (need) {
    prefinish$1(stream, state);

    if (state.pendingcb === 0) {
      state.finished = true;
      stream.emit('finish');

      if (state.autoDestroy) {
        // In case of duplex streams we need a way to detect
        // if the readable side is ready for autoDestroy as well
        var rState = stream._readableState;

        if (!rState || rState.autoDestroy && rState.endEmitted) {
          stream.destroy();
        }
      }
    }
  }

  return need;
}

function endWritable$1(stream, state, cb) {
  state.ending = true;
  finishMaybe$1(stream, state);

  if (cb) {
    if (state.finished) nextTick(cb);else stream.once('finish', cb);
  }

  state.ended = true;
  stream.writable = false;
}

function onCorkedFinish(corkReq, state, err) {
  var entry = corkReq.entry;
  corkReq.entry = null;

  while (entry) {
    var cb = entry.callback;
    state.pendingcb--;
    cb(err);
    entry = entry.next;
  } // reuse the free corkReq.


  state.corkedRequestsFree.next = corkReq;
}

Object.defineProperty(Writable$1.prototype, 'destroyed', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    if (this._writableState === undefined) {
      return false;
    }

    return this._writableState.destroyed;
  },
  set: function set(value) {
    // we ignore the value if the stream
    // has not been initialized yet
    if (!this._writableState) {
      return;
    } // backward compatibility, the user is explicitly
    // managing destroyed


    this._writableState.destroyed = value;
  }
});
Writable$1.prototype.destroy = destroy_1.destroy;
Writable$1.prototype._undestroy = destroy_1.undestroy;

Writable$1.prototype._destroy = function (err, cb) {
  cb(err);
};

/*<replacement>*/

var objectKeys = Object.keys || function (obj) {
  var keys = [];

  for (var key in obj) {
    keys.push(key);
  }

  return keys;
};
/*</replacement>*/


var _stream_duplex = Duplex$2;





inherits$2(Duplex$2, _stream_readable);

{
  // Allow the keys array to be GC'ed.
  var keys$1 = objectKeys(_stream_writable.prototype);

  for (var v$1 = 0; v$1 < keys$1.length; v$1++) {
    var method$1 = keys$1[v$1];
    if (!Duplex$2.prototype[method$1]) Duplex$2.prototype[method$1] = _stream_writable.prototype[method$1];
  }
}

function Duplex$2(options) {
  if (!(this instanceof Duplex$2)) return new Duplex$2(options);
  _stream_readable.call(this, options);
  _stream_writable.call(this, options);
  this.allowHalfOpen = true;

  if (options) {
    if (options.readable === false) this.readable = false;
    if (options.writable === false) this.writable = false;

    if (options.allowHalfOpen === false) {
      this.allowHalfOpen = false;
      this.once('end', onend$1);
    }
  }
}

Object.defineProperty(Duplex$2.prototype, 'writableHighWaterMark', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._writableState.highWaterMark;
  }
});
Object.defineProperty(Duplex$2.prototype, 'writableBuffer', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._writableState && this._writableState.getBuffer();
  }
});
Object.defineProperty(Duplex$2.prototype, 'writableLength', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._writableState.length;
  }
}); // the no-half-open enforcer

function onend$1() {
  // If the writable side ended, then we're ok.
  if (this._writableState.ended) return; // no more data can be written.
  // But allow more writes to happen in this tick.

  nextTick(onEndNT$1, this);
}

function onEndNT$1(self) {
  self.end();
}

Object.defineProperty(Duplex$2.prototype, 'destroyed', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    if (this._readableState === undefined || this._writableState === undefined) {
      return false;
    }

    return this._readableState.destroyed && this._writableState.destroyed;
  },
  set: function set(value) {
    // we ignore the value if the stream
    // has not been initialized yet
    if (this._readableState === undefined || this._writableState === undefined) {
      return;
    } // backward compatibility, the user is explicitly
    // managing destroyed


    this._readableState.destroyed = value;
    this._writableState.destroyed = value;
  }
});

var safeBuffer = createCommonjsModule(function (module, exports) {
/* eslint-disable node/no-deprecated-api */

var Buffer = bufferEs6.Buffer;

// alternative to using Object.keys for old browsers
function copyProps (src, dst) {
  for (var key in src) {
    dst[key] = src[key];
  }
}
if (Buffer.from && Buffer.alloc && Buffer.allocUnsafe && Buffer.allocUnsafeSlow) {
  module.exports = bufferEs6;
} else {
  // Copy properties from require('buffer')
  copyProps(bufferEs6, exports);
  exports.Buffer = SafeBuffer;
}

function SafeBuffer (arg, encodingOrOffset, length) {
  return Buffer(arg, encodingOrOffset, length)
}

SafeBuffer.prototype = Object.create(Buffer.prototype);

// Copy static methods from Buffer
copyProps(Buffer, SafeBuffer);

SafeBuffer.from = function (arg, encodingOrOffset, length) {
  if (typeof arg === 'number') {
    throw new TypeError('Argument must not be a number')
  }
  return Buffer(arg, encodingOrOffset, length)
};

SafeBuffer.alloc = function (size, fill, encoding) {
  if (typeof size !== 'number') {
    throw new TypeError('Argument must be a number')
  }
  var buf = Buffer(size);
  if (fill !== undefined) {
    if (typeof encoding === 'string') {
      buf.fill(fill, encoding);
    } else {
      buf.fill(fill);
    }
  } else {
    buf.fill(0);
  }
  return buf
};

SafeBuffer.allocUnsafe = function (size) {
  if (typeof size !== 'number') {
    throw new TypeError('Argument must be a number')
  }
  return Buffer(size)
};

SafeBuffer.allocUnsafeSlow = function (size) {
  if (typeof size !== 'number') {
    throw new TypeError('Argument must be a number')
  }
  return bufferEs6.SlowBuffer(size)
};
});
var safeBuffer_1 = safeBuffer.Buffer;

/*<replacement>*/

var Buffer$3 = safeBuffer.Buffer;
/*</replacement>*/

var isEncoding = Buffer$3.isEncoding || function (encoding) {
  encoding = '' + encoding;
  switch (encoding && encoding.toLowerCase()) {
    case 'hex':case 'utf8':case 'utf-8':case 'ascii':case 'binary':case 'base64':case 'ucs2':case 'ucs-2':case 'utf16le':case 'utf-16le':case 'raw':
      return true;
    default:
      return false;
  }
};

function _normalizeEncoding(enc) {
  if (!enc) return 'utf8';
  var retried;
  while (true) {
    switch (enc) {
      case 'utf8':
      case 'utf-8':
        return 'utf8';
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return 'utf16le';
      case 'latin1':
      case 'binary':
        return 'latin1';
      case 'base64':
      case 'ascii':
      case 'hex':
        return enc;
      default:
        if (retried) return; // undefined
        enc = ('' + enc).toLowerCase();
        retried = true;
    }
  }
}
// Do not cache `Buffer.isEncoding` when checking encoding names as some
// modules monkey-patch it to support additional encodings
function normalizeEncoding(enc) {
  var nenc = _normalizeEncoding(enc);
  if (typeof nenc !== 'string' && (Buffer$3.isEncoding === isEncoding || !isEncoding(enc))) throw new Error('Unknown encoding: ' + enc);
  return nenc || enc;
}

// StringDecoder provides an interface for efficiently splitting a series of
// buffers into a series of JS strings without breaking apart multi-byte
// characters.
var StringDecoder_1 = StringDecoder$1;
function StringDecoder$1(encoding) {
  this.encoding = normalizeEncoding(encoding);
  var nb;
  switch (this.encoding) {
    case 'utf16le':
      this.text = utf16Text;
      this.end = utf16End;
      nb = 4;
      break;
    case 'utf8':
      this.fillLast = utf8FillLast;
      nb = 4;
      break;
    case 'base64':
      this.text = base64Text;
      this.end = base64End;
      nb = 3;
      break;
    default:
      this.write = simpleWrite;
      this.end = simpleEnd;
      return;
  }
  this.lastNeed = 0;
  this.lastTotal = 0;
  this.lastChar = Buffer$3.allocUnsafe(nb);
}

StringDecoder$1.prototype.write = function (buf) {
  if (buf.length === 0) return '';
  var r;
  var i;
  if (this.lastNeed) {
    r = this.fillLast(buf);
    if (r === undefined) return '';
    i = this.lastNeed;
    this.lastNeed = 0;
  } else {
    i = 0;
  }
  if (i < buf.length) return r ? r + this.text(buf, i) : this.text(buf, i);
  return r || '';
};

StringDecoder$1.prototype.end = utf8End;

// Returns only complete characters in a Buffer
StringDecoder$1.prototype.text = utf8Text;

// Attempts to complete a partial non-UTF-8 character using bytes from a Buffer
StringDecoder$1.prototype.fillLast = function (buf) {
  if (this.lastNeed <= buf.length) {
    buf.copy(this.lastChar, this.lastTotal - this.lastNeed, 0, this.lastNeed);
    return this.lastChar.toString(this.encoding, 0, this.lastTotal);
  }
  buf.copy(this.lastChar, this.lastTotal - this.lastNeed, 0, buf.length);
  this.lastNeed -= buf.length;
};

// Checks the type of a UTF-8 byte, whether it's ASCII, a leading byte, or a
// continuation byte. If an invalid byte is detected, -2 is returned.
function utf8CheckByte(byte) {
  if (byte <= 0x7F) return 0;else if (byte >> 5 === 0x06) return 2;else if (byte >> 4 === 0x0E) return 3;else if (byte >> 3 === 0x1E) return 4;
  return byte >> 6 === 0x02 ? -1 : -2;
}

// Checks at most 3 bytes at the end of a Buffer in order to detect an
// incomplete multi-byte UTF-8 character. The total number of bytes (2, 3, or 4)
// needed to complete the UTF-8 character (if applicable) are returned.
function utf8CheckIncomplete(self, buf, i) {
  var j = buf.length - 1;
  if (j < i) return 0;
  var nb = utf8CheckByte(buf[j]);
  if (nb >= 0) {
    if (nb > 0) self.lastNeed = nb - 1;
    return nb;
  }
  if (--j < i || nb === -2) return 0;
  nb = utf8CheckByte(buf[j]);
  if (nb >= 0) {
    if (nb > 0) self.lastNeed = nb - 2;
    return nb;
  }
  if (--j < i || nb === -2) return 0;
  nb = utf8CheckByte(buf[j]);
  if (nb >= 0) {
    if (nb > 0) {
      if (nb === 2) nb = 0;else self.lastNeed = nb - 3;
    }
    return nb;
  }
  return 0;
}

// Validates as many continuation bytes for a multi-byte UTF-8 character as
// needed or are available. If we see a non-continuation byte where we expect
// one, we "replace" the validated continuation bytes we've seen so far with
// a single UTF-8 replacement character ('\ufffd'), to match v8's UTF-8 decoding
// behavior. The continuation byte check is included three times in the case
// where all of the continuation bytes for a character exist in the same buffer.
// It is also done this way as a slight performance increase instead of using a
// loop.
function utf8CheckExtraBytes(self, buf, p) {
  if ((buf[0] & 0xC0) !== 0x80) {
    self.lastNeed = 0;
    return '\ufffd';
  }
  if (self.lastNeed > 1 && buf.length > 1) {
    if ((buf[1] & 0xC0) !== 0x80) {
      self.lastNeed = 1;
      return '\ufffd';
    }
    if (self.lastNeed > 2 && buf.length > 2) {
      if ((buf[2] & 0xC0) !== 0x80) {
        self.lastNeed = 2;
        return '\ufffd';
      }
    }
  }
}

// Attempts to complete a multi-byte UTF-8 character using bytes from a Buffer.
function utf8FillLast(buf) {
  var p = this.lastTotal - this.lastNeed;
  var r = utf8CheckExtraBytes(this, buf);
  if (r !== undefined) return r;
  if (this.lastNeed <= buf.length) {
    buf.copy(this.lastChar, p, 0, this.lastNeed);
    return this.lastChar.toString(this.encoding, 0, this.lastTotal);
  }
  buf.copy(this.lastChar, p, 0, buf.length);
  this.lastNeed -= buf.length;
}

// Returns all complete UTF-8 characters in a Buffer. If the Buffer ended on a
// partial character, the character's bytes are buffered until the required
// number of bytes are available.
function utf8Text(buf, i) {
  var total = utf8CheckIncomplete(this, buf, i);
  if (!this.lastNeed) return buf.toString('utf8', i);
  this.lastTotal = total;
  var end = buf.length - (total - this.lastNeed);
  buf.copy(this.lastChar, 0, end);
  return buf.toString('utf8', i, end);
}

// For UTF-8, a replacement character is added when ending on a partial
// character.
function utf8End(buf) {
  var r = buf && buf.length ? this.write(buf) : '';
  if (this.lastNeed) return r + '\ufffd';
  return r;
}

// UTF-16LE typically needs two bytes per character, but even if we have an even
// number of bytes available, we need to check if we end on a leading/high
// surrogate. In that case, we need to wait for the next two bytes in order to
// decode the last character properly.
function utf16Text(buf, i) {
  if ((buf.length - i) % 2 === 0) {
    var r = buf.toString('utf16le', i);
    if (r) {
      var c = r.charCodeAt(r.length - 1);
      if (c >= 0xD800 && c <= 0xDBFF) {
        this.lastNeed = 2;
        this.lastTotal = 4;
        this.lastChar[0] = buf[buf.length - 2];
        this.lastChar[1] = buf[buf.length - 1];
        return r.slice(0, -1);
      }
    }
    return r;
  }
  this.lastNeed = 1;
  this.lastTotal = 2;
  this.lastChar[0] = buf[buf.length - 1];
  return buf.toString('utf16le', i, buf.length - 1);
}

// For UTF-16LE we do not explicitly append special replacement characters if we
// end on a partial character, we simply let v8 handle that.
function utf16End(buf) {
  var r = buf && buf.length ? this.write(buf) : '';
  if (this.lastNeed) {
    var end = this.lastTotal - this.lastNeed;
    return r + this.lastChar.toString('utf16le', 0, end);
  }
  return r;
}

function base64Text(buf, i) {
  var n = (buf.length - i) % 3;
  if (n === 0) return buf.toString('base64', i);
  this.lastNeed = 3 - n;
  this.lastTotal = 3;
  if (n === 1) {
    this.lastChar[0] = buf[buf.length - 1];
  } else {
    this.lastChar[0] = buf[buf.length - 2];
    this.lastChar[1] = buf[buf.length - 1];
  }
  return buf.toString('base64', i, buf.length - n);
}

function base64End(buf) {
  var r = buf && buf.length ? this.write(buf) : '';
  if (this.lastNeed) return r + this.lastChar.toString('base64', 0, 3 - this.lastNeed);
  return r;
}

// Pass bytes on through for single-byte encodings (e.g. ascii, latin1, hex)
function simpleWrite(buf) {
  return buf.toString(this.encoding);
}

function simpleEnd(buf) {
  return buf && buf.length ? this.write(buf) : '';
}

var string_decoder = {
	StringDecoder: StringDecoder_1
};

var ERR_STREAM_PREMATURE_CLOSE = errors.codes.ERR_STREAM_PREMATURE_CLOSE;

function once$1(callback) {
  var called = false;
  return function () {
    if (called) return;
    called = true;

    for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    callback.apply(this, args);
  };
}

function noop$1() {}

function isRequest(stream) {
  return stream.setHeader && typeof stream.abort === 'function';
}

function eos(stream, opts, callback) {
  if (typeof opts === 'function') return eos(stream, null, opts);
  if (!opts) opts = {};
  callback = once$1(callback || noop$1);
  var readable = opts.readable || opts.readable !== false && stream.readable;
  var writable = opts.writable || opts.writable !== false && stream.writable;

  var onlegacyfinish = function onlegacyfinish() {
    if (!stream.writable) onfinish();
  };

  var writableEnded = stream._writableState && stream._writableState.finished;

  var onfinish = function onfinish() {
    writable = false;
    writableEnded = true;
    if (!readable) callback.call(stream);
  };

  var readableEnded = stream._readableState && stream._readableState.endEmitted;

  var onend = function onend() {
    readable = false;
    readableEnded = true;
    if (!writable) callback.call(stream);
  };

  var onerror = function onerror(err) {
    callback.call(stream, err);
  };

  var onclose = function onclose() {
    var err;

    if (readable && !readableEnded) {
      if (!stream._readableState || !stream._readableState.ended) err = new ERR_STREAM_PREMATURE_CLOSE();
      return callback.call(stream, err);
    }

    if (writable && !writableEnded) {
      if (!stream._writableState || !stream._writableState.ended) err = new ERR_STREAM_PREMATURE_CLOSE();
      return callback.call(stream, err);
    }
  };

  var onrequest = function onrequest() {
    stream.req.on('finish', onfinish);
  };

  if (isRequest(stream)) {
    stream.on('complete', onfinish);
    stream.on('abort', onclose);
    if (stream.req) onrequest();else stream.on('request', onrequest);
  } else if (writable && !stream._writableState) {
    // legacy streams
    stream.on('end', onlegacyfinish);
    stream.on('close', onlegacyfinish);
  }

  stream.on('end', onend);
  stream.on('finish', onfinish);
  if (opts.error !== false) stream.on('error', onerror);
  stream.on('close', onclose);
  return function () {
    stream.removeListener('complete', onfinish);
    stream.removeListener('abort', onclose);
    stream.removeListener('request', onrequest);
    if (stream.req) stream.req.removeListener('finish', onfinish);
    stream.removeListener('end', onlegacyfinish);
    stream.removeListener('close', onlegacyfinish);
    stream.removeListener('finish', onfinish);
    stream.removeListener('end', onend);
    stream.removeListener('error', onerror);
    stream.removeListener('close', onclose);
  };
}

var endOfStream = eos;

var _Object$setPrototypeO;

function _defineProperty$1(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }



var kLastResolve = Symbol('lastResolve');
var kLastReject = Symbol('lastReject');
var kError = Symbol('error');
var kEnded = Symbol('ended');
var kLastPromise = Symbol('lastPromise');
var kHandlePromise = Symbol('handlePromise');
var kStream = Symbol('stream');

function createIterResult(value, done) {
  return {
    value: value,
    done: done
  };
}

function readAndResolve(iter) {
  var resolve = iter[kLastResolve];

  if (resolve !== null) {
    var data = iter[kStream].read(); // we defer if data is null
    // we can be expecting either 'end' or
    // 'error'

    if (data !== null) {
      iter[kLastPromise] = null;
      iter[kLastResolve] = null;
      iter[kLastReject] = null;
      resolve(createIterResult(data, false));
    }
  }
}

function onReadable(iter) {
  // we wait for the next tick, because it might
  // emit an error with process.nextTick
  nextTick(readAndResolve, iter);
}

function wrapForNext(lastPromise, iter) {
  return function (resolve, reject) {
    lastPromise.then(function () {
      if (iter[kEnded]) {
        resolve(createIterResult(undefined, true));
        return;
      }

      iter[kHandlePromise](resolve, reject);
    }, reject);
  };
}

var AsyncIteratorPrototype = Object.getPrototypeOf(function () {});
var ReadableStreamAsyncIteratorPrototype = Object.setPrototypeOf((_Object$setPrototypeO = {
  get stream() {
    return this[kStream];
  },

  next: function next() {
    var _this = this;

    // if we have detected an error in the meanwhile
    // reject straight away
    var error = this[kError];

    if (error !== null) {
      return Promise.reject(error);
    }

    if (this[kEnded]) {
      return Promise.resolve(createIterResult(undefined, true));
    }

    if (this[kStream].destroyed) {
      // We need to defer via nextTick because if .destroy(err) is
      // called, the error will be emitted via nextTick, and
      // we cannot guarantee that there is no error lingering around
      // waiting to be emitted.
      return new Promise(function (resolve, reject) {
        nextTick(function () {
          if (_this[kError]) {
            reject(_this[kError]);
          } else {
            resolve(createIterResult(undefined, true));
          }
        });
      });
    } // if we have multiple next() calls
    // we will wait for the previous Promise to finish
    // this logic is optimized to support for await loops,
    // where next() is only called once at a time


    var lastPromise = this[kLastPromise];
    var promise;

    if (lastPromise) {
      promise = new Promise(wrapForNext(lastPromise, this));
    } else {
      // fast path needed to support multiple this.push()
      // without triggering the next() queue
      var data = this[kStream].read();

      if (data !== null) {
        return Promise.resolve(createIterResult(data, false));
      }

      promise = new Promise(this[kHandlePromise]);
    }

    this[kLastPromise] = promise;
    return promise;
  }
}, _defineProperty$1(_Object$setPrototypeO, Symbol.asyncIterator, function () {
  return this;
}), _defineProperty$1(_Object$setPrototypeO, "return", function _return() {
  var _this2 = this;

  // destroy(err, cb) is a private API
  // we can guarantee we have that here, because we control the
  // Readable class this is attached to
  return new Promise(function (resolve, reject) {
    _this2[kStream].destroy(null, function (err) {
      if (err) {
        reject(err);
        return;
      }

      resolve(createIterResult(undefined, true));
    });
  });
}), _Object$setPrototypeO), AsyncIteratorPrototype);

var createReadableStreamAsyncIterator = function createReadableStreamAsyncIterator(stream) {
  var _Object$create;

  var iterator = Object.create(ReadableStreamAsyncIteratorPrototype, (_Object$create = {}, _defineProperty$1(_Object$create, kStream, {
    value: stream,
    writable: true
  }), _defineProperty$1(_Object$create, kLastResolve, {
    value: null,
    writable: true
  }), _defineProperty$1(_Object$create, kLastReject, {
    value: null,
    writable: true
  }), _defineProperty$1(_Object$create, kError, {
    value: null,
    writable: true
  }), _defineProperty$1(_Object$create, kEnded, {
    value: stream._readableState.endEmitted,
    writable: true
  }), _defineProperty$1(_Object$create, kHandlePromise, {
    value: function value(resolve, reject) {
      var data = iterator[kStream].read();

      if (data) {
        iterator[kLastPromise] = null;
        iterator[kLastResolve] = null;
        iterator[kLastReject] = null;
        resolve(createIterResult(data, false));
      } else {
        iterator[kLastResolve] = resolve;
        iterator[kLastReject] = reject;
      }
    },
    writable: true
  }), _Object$create));
  iterator[kLastPromise] = null;
  endOfStream(stream, function (err) {
    if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
      var reject = iterator[kLastReject]; // reject if we are waiting for data in the Promise
      // returned by next() and store the error

      if (reject !== null) {
        iterator[kLastPromise] = null;
        iterator[kLastResolve] = null;
        iterator[kLastReject] = null;
        reject(err);
      }

      iterator[kError] = err;
      return;
    }

    var resolve = iterator[kLastResolve];

    if (resolve !== null) {
      iterator[kLastPromise] = null;
      iterator[kLastResolve] = null;
      iterator[kLastReject] = null;
      resolve(createIterResult(undefined, true));
    }

    iterator[kEnded] = true;
  });
  stream.on('readable', onReadable.bind(null, iterator));
  return iterator;
};

var async_iterator = createReadableStreamAsyncIterator;

function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }

function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }

function ownKeys$1(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread$1(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys$1(Object(source), true).forEach(function (key) { _defineProperty$2(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys$1(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty$2(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

var ERR_INVALID_ARG_TYPE$1 = errors.codes.ERR_INVALID_ARG_TYPE;

function from$1(Readable, iterable, opts) {
  var iterator;

  if (iterable && typeof iterable.next === 'function') {
    iterator = iterable;
  } else if (iterable && iterable[Symbol.asyncIterator]) iterator = iterable[Symbol.asyncIterator]();else if (iterable && iterable[Symbol.iterator]) iterator = iterable[Symbol.iterator]();else throw new ERR_INVALID_ARG_TYPE$1('iterable', ['Iterable'], iterable);

  var readable = new Readable(_objectSpread$1({
    objectMode: true
  }, opts)); // Reading boolean to protect against _read
  // being called before last iteration completion.

  var reading = false;

  readable._read = function () {
    if (!reading) {
      reading = true;
      next();
    }
  };

  function next() {
    return _next2.apply(this, arguments);
  }

  function _next2() {
    _next2 = _asyncToGenerator(function* () {
      try {
        var _ref = yield iterator.next(),
            value = _ref.value,
            done = _ref.done;

        if (done) {
          readable.push(null);
        } else if (readable.push((yield value))) {
          next();
        } else {
          reading = false;
        }
      } catch (err) {
        readable.destroy(err);
      }
    });
    return _next2.apply(this, arguments);
  }

  return readable;
}

var from_1 = from$1;

var _stream_readable = Readable$1;
/*<replacement>*/

var Duplex$3;
/*</replacement>*/

Readable$1.ReadableState = ReadableState$1;

var EElistenerCount = function EElistenerCount(emitter, type) {
  return emitter.listeners(type).length;
};
/*</replacement>*/

/*<replacement>*/



/*</replacement>*/


var Buffer$4 = bufferEs6.Buffer;

var OurUint8Array$1 = commonjsGlobal.Uint8Array || function () {};

function _uint8ArrayToBuffer$1(chunk) {
  return Buffer$4.from(chunk);
}

function _isUint8Array$1(obj) {
  return Buffer$4.isBuffer(obj) || obj instanceof OurUint8Array$1;
}
/*<replacement>*/




var debug$1;

if (debugUtil && debugUtil.debuglog) {
  debug$1 = debugUtil.debuglog('stream');
} else {
  debug$1 = function debug() {};
}
/*</replacement>*/






var getHighWaterMark$2 = state.getHighWaterMark;

var _require$codes$1 = errors.codes,
    ERR_INVALID_ARG_TYPE$2 = _require$codes$1.ERR_INVALID_ARG_TYPE,
    ERR_STREAM_PUSH_AFTER_EOF = _require$codes$1.ERR_STREAM_PUSH_AFTER_EOF,
    ERR_METHOD_NOT_IMPLEMENTED$1 = _require$codes$1.ERR_METHOD_NOT_IMPLEMENTED,
    ERR_STREAM_UNSHIFT_AFTER_END_EVENT = _require$codes$1.ERR_STREAM_UNSHIFT_AFTER_END_EVENT; // Lazy loaded to improve the startup performance.


var StringDecoder$2;
var createReadableStreamAsyncIterator$1;
var from$2;

inherits$2(Readable$1, stream);

var errorOrDestroy$2 = destroy_1.errorOrDestroy;
var kProxyEvents = ['error', 'close', 'destroy', 'pause', 'resume'];

function prependListener$1(emitter, event, fn) {
  // Sadly this is not cacheable as some libraries bundle their own
  // event emitter implementation with them.
  if (typeof emitter.prependListener === 'function') return emitter.prependListener(event, fn); // This is a hack to make sure that our error handler is attached before any
  // userland ones.  NEVER DO THIS. This is here only because this code needs
  // to continue to work with older versions of Node.js that do not include
  // the prependListener() method. The goal is to eventually remove this hack.

  if (!emitter._events || !emitter._events[event]) emitter.on(event, fn);else if (Array.isArray(emitter._events[event])) emitter._events[event].unshift(fn);else emitter._events[event] = [fn, emitter._events[event]];
}

function ReadableState$1(options, stream, isDuplex) {
  Duplex$3 = Duplex$3 || _stream_duplex;
  options = options || {}; // Duplex streams are both readable and writable, but share
  // the same options object.
  // However, some cases require setting options to different
  // values for the readable and the writable sides of the duplex stream.
  // These options can be provided separately as readableXXX and writableXXX.

  if (typeof isDuplex !== 'boolean') isDuplex = stream instanceof Duplex$3; // object stream flag. Used to make read(n) ignore n and to
  // make all the buffer merging and length checks go away

  this.objectMode = !!options.objectMode;
  if (isDuplex) this.objectMode = this.objectMode || !!options.readableObjectMode; // the point at which it stops calling _read() to fill the buffer
  // Note: 0 is a valid value, means "don't call _read preemptively ever"

  this.highWaterMark = getHighWaterMark$2(this, options, 'readableHighWaterMark', isDuplex); // A linked list is used to store data chunks instead of an array because the
  // linked list can remove elements from the beginning faster than
  // array.shift()

  this.buffer = new buffer_list();
  this.length = 0;
  this.pipes = null;
  this.pipesCount = 0;
  this.flowing = null;
  this.ended = false;
  this.endEmitted = false;
  this.reading = false; // a flag to be able to tell if the event 'readable'/'data' is emitted
  // immediately, or on a later tick.  We set this to true at first, because
  // any actions that shouldn't happen until "later" should generally also
  // not happen before the first read call.

  this.sync = true; // whenever we return null, then we set a flag to say
  // that we're awaiting a 'readable' event emission.

  this.needReadable = false;
  this.emittedReadable = false;
  this.readableListening = false;
  this.resumeScheduled = false;
  this.paused = true; // Should close be emitted on destroy. Defaults to true.

  this.emitClose = options.emitClose !== false; // Should .destroy() be called after 'end' (and potentially 'finish')

  this.autoDestroy = !!options.autoDestroy; // has it been destroyed

  this.destroyed = false; // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.

  this.defaultEncoding = options.defaultEncoding || 'utf8'; // the number of writers that are awaiting a drain event in .pipe()s

  this.awaitDrain = 0; // if true, a maybeReadMore has been scheduled

  this.readingMore = false;
  this.decoder = null;
  this.encoding = null;

  if (options.encoding) {
    if (!StringDecoder$2) StringDecoder$2 = string_decoder.StringDecoder;
    this.decoder = new StringDecoder$2(options.encoding);
    this.encoding = options.encoding;
  }
}

function Readable$1(options) {
  Duplex$3 = Duplex$3 || _stream_duplex;
  if (!(this instanceof Readable$1)) return new Readable$1(options); // Checking for a Stream.Duplex instance is faster here instead of inside
  // the ReadableState constructor, at least with V8 6.5

  var isDuplex = this instanceof Duplex$3;
  this._readableState = new ReadableState$1(options, this, isDuplex); // legacy

  this.readable = true;

  if (options) {
    if (typeof options.read === 'function') this._read = options.read;
    if (typeof options.destroy === 'function') this._destroy = options.destroy;
  }

  stream.call(this);
}

Object.defineProperty(Readable$1.prototype, 'destroyed', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    if (this._readableState === undefined) {
      return false;
    }

    return this._readableState.destroyed;
  },
  set: function set(value) {
    // we ignore the value if the stream
    // has not been initialized yet
    if (!this._readableState) {
      return;
    } // backward compatibility, the user is explicitly
    // managing destroyed


    this._readableState.destroyed = value;
  }
});
Readable$1.prototype.destroy = destroy_1.destroy;
Readable$1.prototype._undestroy = destroy_1.undestroy;

Readable$1.prototype._destroy = function (err, cb) {
  cb(err);
}; // Manually shove something into the read() buffer.
// This returns true if the highWaterMark has not been hit yet,
// similar to how Writable.write() returns true if you should
// write() some more.


Readable$1.prototype.push = function (chunk, encoding) {
  var state = this._readableState;
  var skipChunkCheck;

  if (!state.objectMode) {
    if (typeof chunk === 'string') {
      encoding = encoding || state.defaultEncoding;

      if (encoding !== state.encoding) {
        chunk = Buffer$4.from(chunk, encoding);
        encoding = '';
      }

      skipChunkCheck = true;
    }
  } else {
    skipChunkCheck = true;
  }

  return readableAddChunk$1(this, chunk, encoding, false, skipChunkCheck);
}; // Unshift should *always* be something directly out of read()


Readable$1.prototype.unshift = function (chunk) {
  return readableAddChunk$1(this, chunk, null, true, false);
};

function readableAddChunk$1(stream, chunk, encoding, addToFront, skipChunkCheck) {
  debug$1('readableAddChunk', chunk);
  var state = stream._readableState;

  if (chunk === null) {
    state.reading = false;
    onEofChunk$1(stream, state);
  } else {
    var er;
    if (!skipChunkCheck) er = chunkInvalid$1(state, chunk);

    if (er) {
      errorOrDestroy$2(stream, er);
    } else if (state.objectMode || chunk && chunk.length > 0) {
      if (typeof chunk !== 'string' && !state.objectMode && Object.getPrototypeOf(chunk) !== Buffer$4.prototype) {
        chunk = _uint8ArrayToBuffer$1(chunk);
      }

      if (addToFront) {
        if (state.endEmitted) errorOrDestroy$2(stream, new ERR_STREAM_UNSHIFT_AFTER_END_EVENT());else addChunk(stream, state, chunk, true);
      } else if (state.ended) {
        errorOrDestroy$2(stream, new ERR_STREAM_PUSH_AFTER_EOF());
      } else if (state.destroyed) {
        return false;
      } else {
        state.reading = false;

        if (state.decoder && !encoding) {
          chunk = state.decoder.write(chunk);
          if (state.objectMode || chunk.length !== 0) addChunk(stream, state, chunk, false);else maybeReadMore$1(stream, state);
        } else {
          addChunk(stream, state, chunk, false);
        }
      }
    } else if (!addToFront) {
      state.reading = false;
      maybeReadMore$1(stream, state);
    }
  } // We can push more data if we are below the highWaterMark.
  // Also, if we have no data yet, we can stand some more bytes.
  // This is to work around cases where hwm=0, such as the repl.


  return !state.ended && (state.length < state.highWaterMark || state.length === 0);
}

function addChunk(stream, state, chunk, addToFront) {
  if (state.flowing && state.length === 0 && !state.sync) {
    state.awaitDrain = 0;
    stream.emit('data', chunk);
  } else {
    // update the buffer info.
    state.length += state.objectMode ? 1 : chunk.length;
    if (addToFront) state.buffer.unshift(chunk);else state.buffer.push(chunk);
    if (state.needReadable) emitReadable$1(stream);
  }

  maybeReadMore$1(stream, state);
}

function chunkInvalid$1(state, chunk) {
  var er;

  if (!_isUint8Array$1(chunk) && typeof chunk !== 'string' && chunk !== undefined && !state.objectMode) {
    er = new ERR_INVALID_ARG_TYPE$2('chunk', ['string', 'Buffer', 'Uint8Array'], chunk);
  }

  return er;
}

Readable$1.prototype.isPaused = function () {
  return this._readableState.flowing === false;
}; // backwards compatibility.


Readable$1.prototype.setEncoding = function (enc) {
  if (!StringDecoder$2) StringDecoder$2 = string_decoder.StringDecoder;
  var decoder = new StringDecoder$2(enc);
  this._readableState.decoder = decoder; // If setEncoding(null), decoder.encoding equals utf8

  this._readableState.encoding = this._readableState.decoder.encoding; // Iterate over current buffer to convert already stored Buffers:

  var p = this._readableState.buffer.head;
  var content = '';

  while (p !== null) {
    content += decoder.write(p.data);
    p = p.next;
  }

  this._readableState.buffer.clear();

  if (content !== '') this._readableState.buffer.push(content);
  this._readableState.length = content.length;
  return this;
}; // Don't raise the hwm > 1GB


var MAX_HWM$1 = 0x40000000;

function computeNewHighWaterMark$1(n) {
  if (n >= MAX_HWM$1) {
    // TODO(ronag): Throw ERR_VALUE_OUT_OF_RANGE.
    n = MAX_HWM$1;
  } else {
    // Get the next highest power of 2 to prevent increasing hwm excessively in
    // tiny amounts
    n--;
    n |= n >>> 1;
    n |= n >>> 2;
    n |= n >>> 4;
    n |= n >>> 8;
    n |= n >>> 16;
    n++;
  }

  return n;
} // This function is designed to be inlinable, so please take care when making
// changes to the function body.


function howMuchToRead$1(n, state) {
  if (n <= 0 || state.length === 0 && state.ended) return 0;
  if (state.objectMode) return 1;

  if (n !== n) {
    // Only flow one buffer at a time
    if (state.flowing && state.length) return state.buffer.head.data.length;else return state.length;
  } // If we're asking for more than the current hwm, then raise the hwm.


  if (n > state.highWaterMark) state.highWaterMark = computeNewHighWaterMark$1(n);
  if (n <= state.length) return n; // Don't have enough

  if (!state.ended) {
    state.needReadable = true;
    return 0;
  }

  return state.length;
} // you can override either this method, or the async _read(n) below.


Readable$1.prototype.read = function (n) {
  debug$1('read', n);
  n = parseInt(n, 10);
  var state = this._readableState;
  var nOrig = n;
  if (n !== 0) state.emittedReadable = false; // if we're doing read(0) to trigger a readable event, but we
  // already have a bunch of data in the buffer, then just trigger
  // the 'readable' event and move on.

  if (n === 0 && state.needReadable && ((state.highWaterMark !== 0 ? state.length >= state.highWaterMark : state.length > 0) || state.ended)) {
    debug$1('read: emitReadable', state.length, state.ended);
    if (state.length === 0 && state.ended) endReadable$1(this);else emitReadable$1(this);
    return null;
  }

  n = howMuchToRead$1(n, state); // if we've ended, and we're now clear, then finish it up.

  if (n === 0 && state.ended) {
    if (state.length === 0) endReadable$1(this);
    return null;
  } // All the actual chunk generation logic needs to be
  // *below* the call to _read.  The reason is that in certain
  // synthetic stream cases, such as passthrough streams, _read
  // may be a completely synchronous operation which may change
  // the state of the read buffer, providing enough data when
  // before there was *not* enough.
  //
  // So, the steps are:
  // 1. Figure out what the state of things will be after we do
  // a read from the buffer.
  //
  // 2. If that resulting state will trigger a _read, then call _read.
  // Note that this may be asynchronous, or synchronous.  Yes, it is
  // deeply ugly to write APIs this way, but that still doesn't mean
  // that the Readable class should behave improperly, as streams are
  // designed to be sync/async agnostic.
  // Take note if the _read call is sync or async (ie, if the read call
  // has returned yet), so that we know whether or not it's safe to emit
  // 'readable' etc.
  //
  // 3. Actually pull the requested chunks out of the buffer and return.
  // if we need a readable event, then we need to do some reading.


  var doRead = state.needReadable;
  debug$1('need readable', doRead); // if we currently have less than the highWaterMark, then also read some

  if (state.length === 0 || state.length - n < state.highWaterMark) {
    doRead = true;
    debug$1('length less than watermark', doRead);
  } // however, if we've ended, then there's no point, and if we're already
  // reading, then it's unnecessary.


  if (state.ended || state.reading) {
    doRead = false;
    debug$1('reading or ended', doRead);
  } else if (doRead) {
    debug$1('do read');
    state.reading = true;
    state.sync = true; // if the length is currently zero, then we *need* a readable event.

    if (state.length === 0) state.needReadable = true; // call internal read method

    this._read(state.highWaterMark);

    state.sync = false; // If _read pushed data synchronously, then `reading` will be false,
    // and we need to re-evaluate how much data we can return to the user.

    if (!state.reading) n = howMuchToRead$1(nOrig, state);
  }

  var ret;
  if (n > 0) ret = fromList$1(n, state);else ret = null;

  if (ret === null) {
    state.needReadable = state.length <= state.highWaterMark;
    n = 0;
  } else {
    state.length -= n;
    state.awaitDrain = 0;
  }

  if (state.length === 0) {
    // If we have nothing in the buffer, then we want to know
    // as soon as we *do* get something into the buffer.
    if (!state.ended) state.needReadable = true; // If we tried to read() past the EOF, then emit end on the next tick.

    if (nOrig !== n && state.ended) endReadable$1(this);
  }

  if (ret !== null) this.emit('data', ret);
  return ret;
};

function onEofChunk$1(stream, state) {
  debug$1('onEofChunk');
  if (state.ended) return;

  if (state.decoder) {
    var chunk = state.decoder.end();

    if (chunk && chunk.length) {
      state.buffer.push(chunk);
      state.length += state.objectMode ? 1 : chunk.length;
    }
  }

  state.ended = true;

  if (state.sync) {
    // if we are sync, wait until next tick to emit the data.
    // Otherwise we risk emitting data in the flow()
    // the readable code triggers during a read() call
    emitReadable$1(stream);
  } else {
    // emit 'readable' now to make sure it gets picked up.
    state.needReadable = false;

    if (!state.emittedReadable) {
      state.emittedReadable = true;
      emitReadable_$1(stream);
    }
  }
} // Don't emit readable right away in sync mode, because this can trigger
// another read() call => stack overflow.  This way, it might trigger
// a nextTick recursion warning, but that's not so bad.


function emitReadable$1(stream) {
  var state = stream._readableState;
  debug$1('emitReadable', state.needReadable, state.emittedReadable);
  state.needReadable = false;

  if (!state.emittedReadable) {
    debug$1('emitReadable', state.flowing);
    state.emittedReadable = true;
    nextTick(emitReadable_$1, stream);
  }
}

function emitReadable_$1(stream) {
  var state = stream._readableState;
  debug$1('emitReadable_', state.destroyed, state.length, state.ended);

  if (!state.destroyed && (state.length || state.ended)) {
    stream.emit('readable');
    state.emittedReadable = false;
  } // The stream needs another readable event if
  // 1. It is not flowing, as the flow mechanism will take
  //    care of it.
  // 2. It is not ended.
  // 3. It is below the highWaterMark, so we can schedule
  //    another readable later.


  state.needReadable = !state.flowing && !state.ended && state.length <= state.highWaterMark;
  flow$1(stream);
} // at this point, the user has presumably seen the 'readable' event,
// and called read() to consume some data.  that may have triggered
// in turn another _read(n) call, in which case reading = true if
// it's in progress.
// However, if we're not ended, or reading, and the length < hwm,
// then go ahead and try to read some more preemptively.


function maybeReadMore$1(stream, state) {
  if (!state.readingMore) {
    state.readingMore = true;
    nextTick(maybeReadMore_$1, stream, state);
  }
}

function maybeReadMore_$1(stream, state) {
  // Attempt to read more data if we should.
  //
  // The conditions for reading more data are (one of):
  // - Not enough data buffered (state.length < state.highWaterMark). The loop
  //   is responsible for filling the buffer with enough data if such data
  //   is available. If highWaterMark is 0 and we are not in the flowing mode
  //   we should _not_ attempt to buffer any extra data. We'll get more data
  //   when the stream consumer calls read() instead.
  // - No data in the buffer, and the stream is in flowing mode. In this mode
  //   the loop below is responsible for ensuring read() is called. Failing to
  //   call read here would abort the flow and there's no other mechanism for
  //   continuing the flow if the stream consumer has just subscribed to the
  //   'data' event.
  //
  // In addition to the above conditions to keep reading data, the following
  // conditions prevent the data from being read:
  // - The stream has ended (state.ended).
  // - There is already a pending 'read' operation (state.reading). This is a
  //   case where the the stream has called the implementation defined _read()
  //   method, but they are processing the call asynchronously and have _not_
  //   called push() with new data. In this case we skip performing more
  //   read()s. The execution ends in this method again after the _read() ends
  //   up calling push() with more data.
  while (!state.reading && !state.ended && (state.length < state.highWaterMark || state.flowing && state.length === 0)) {
    var len = state.length;
    debug$1('maybeReadMore read 0');
    stream.read(0);
    if (len === state.length) // didn't get any data, stop spinning.
      break;
  }

  state.readingMore = false;
} // abstract method.  to be overridden in specific implementation classes.
// call cb(er, data) where data is <= n in length.
// for virtual (non-string, non-buffer) streams, "length" is somewhat
// arbitrary, and perhaps not very meaningful.


Readable$1.prototype._read = function (n) {
  errorOrDestroy$2(this, new ERR_METHOD_NOT_IMPLEMENTED$1('_read()'));
};

Readable$1.prototype.pipe = function (dest, pipeOpts) {
  var src = this;
  var state = this._readableState;

  switch (state.pipesCount) {
    case 0:
      state.pipes = dest;
      break;

    case 1:
      state.pipes = [state.pipes, dest];
      break;

    default:
      state.pipes.push(dest);
      break;
  }

  state.pipesCount += 1;
  debug$1('pipe count=%d opts=%j', state.pipesCount, pipeOpts);
  var doEnd = (!pipeOpts || pipeOpts.end !== false) && dest !== process.stdout && dest !== process.stderr;
  var endFn = doEnd ? onend : unpipe;
  if (state.endEmitted) nextTick(endFn);else src.once('end', endFn);
  dest.on('unpipe', onunpipe);

  function onunpipe(readable, unpipeInfo) {
    debug$1('onunpipe');

    if (readable === src) {
      if (unpipeInfo && unpipeInfo.hasUnpiped === false) {
        unpipeInfo.hasUnpiped = true;
        cleanup();
      }
    }
  }

  function onend() {
    debug$1('onend');
    dest.end();
  } // when the dest drains, it reduces the awaitDrain counter
  // on the source.  This would be more elegant with a .once()
  // handler in flow(), but adding and removing repeatedly is
  // too slow.


  var ondrain = pipeOnDrain$1(src);
  dest.on('drain', ondrain);
  var cleanedUp = false;

  function cleanup() {
    debug$1('cleanup'); // cleanup event handlers once the pipe is broken

    dest.removeListener('close', onclose);
    dest.removeListener('finish', onfinish);
    dest.removeListener('drain', ondrain);
    dest.removeListener('error', onerror);
    dest.removeListener('unpipe', onunpipe);
    src.removeListener('end', onend);
    src.removeListener('end', unpipe);
    src.removeListener('data', ondata);
    cleanedUp = true; // if the reader is waiting for a drain event from this
    // specific writer, then it would cause it to never start
    // flowing again.
    // So, if this is awaiting a drain, then we just call it now.
    // If we don't know, then assume that we are waiting for one.

    if (state.awaitDrain && (!dest._writableState || dest._writableState.needDrain)) ondrain();
  }

  src.on('data', ondata);

  function ondata(chunk) {
    debug$1('ondata');
    var ret = dest.write(chunk);
    debug$1('dest.write', ret);

    if (ret === false) {
      // If the user unpiped during `dest.write()`, it is possible
      // to get stuck in a permanently paused state if that write
      // also returned false.
      // => Check whether `dest` is still a piping destination.
      if ((state.pipesCount === 1 && state.pipes === dest || state.pipesCount > 1 && indexOf$1(state.pipes, dest) !== -1) && !cleanedUp) {
        debug$1('false write response, pause', state.awaitDrain);
        state.awaitDrain++;
      }

      src.pause();
    }
  } // if the dest has an error, then stop piping into it.
  // however, don't suppress the throwing behavior for this.


  function onerror(er) {
    debug$1('onerror', er);
    unpipe();
    dest.removeListener('error', onerror);
    if (EElistenerCount(dest, 'error') === 0) errorOrDestroy$2(dest, er);
  } // Make sure our error handler is attached before userland ones.


  prependListener$1(dest, 'error', onerror); // Both close and finish should trigger unpipe, but only once.

  function onclose() {
    dest.removeListener('finish', onfinish);
    unpipe();
  }

  dest.once('close', onclose);

  function onfinish() {
    debug$1('onfinish');
    dest.removeListener('close', onclose);
    unpipe();
  }

  dest.once('finish', onfinish);

  function unpipe() {
    debug$1('unpipe');
    src.unpipe(dest);
  } // tell the dest that it's being piped to


  dest.emit('pipe', src); // start the flow if it hasn't been started already.

  if (!state.flowing) {
    debug$1('pipe resume');
    src.resume();
  }

  return dest;
};

function pipeOnDrain$1(src) {
  return function pipeOnDrainFunctionResult() {
    var state = src._readableState;
    debug$1('pipeOnDrain', state.awaitDrain);
    if (state.awaitDrain) state.awaitDrain--;

    if (state.awaitDrain === 0 && EElistenerCount(src, 'data')) {
      state.flowing = true;
      flow$1(src);
    }
  };
}

Readable$1.prototype.unpipe = function (dest) {
  var state = this._readableState;
  var unpipeInfo = {
    hasUnpiped: false
  }; // if we're not piping anywhere, then do nothing.

  if (state.pipesCount === 0) return this; // just one destination.  most common case.

  if (state.pipesCount === 1) {
    // passed in one, but it's not the right one.
    if (dest && dest !== state.pipes) return this;
    if (!dest) dest = state.pipes; // got a match.

    state.pipes = null;
    state.pipesCount = 0;
    state.flowing = false;
    if (dest) dest.emit('unpipe', this, unpipeInfo);
    return this;
  } // slow case. multiple pipe destinations.


  if (!dest) {
    // remove all.
    var dests = state.pipes;
    var len = state.pipesCount;
    state.pipes = null;
    state.pipesCount = 0;
    state.flowing = false;

    for (var i = 0; i < len; i++) {
      dests[i].emit('unpipe', this, {
        hasUnpiped: false
      });
    }

    return this;
  } // try to find the right one.


  var index = indexOf$1(state.pipes, dest);
  if (index === -1) return this;
  state.pipes.splice(index, 1);
  state.pipesCount -= 1;
  if (state.pipesCount === 1) state.pipes = state.pipes[0];
  dest.emit('unpipe', this, unpipeInfo);
  return this;
}; // set up data events if they are asked for
// Ensure readable listeners eventually get something


Readable$1.prototype.on = function (ev, fn) {
  var res = stream.prototype.on.call(this, ev, fn);
  var state = this._readableState;

  if (ev === 'data') {
    // update readableListening so that resume() may be a no-op
    // a few lines down. This is needed to support once('readable').
    state.readableListening = this.listenerCount('readable') > 0; // Try start flowing on next tick if stream isn't explicitly paused

    if (state.flowing !== false) this.resume();
  } else if (ev === 'readable') {
    if (!state.endEmitted && !state.readableListening) {
      state.readableListening = state.needReadable = true;
      state.flowing = false;
      state.emittedReadable = false;
      debug$1('on readable', state.length, state.reading);

      if (state.length) {
        emitReadable$1(this);
      } else if (!state.reading) {
        nextTick(nReadingNextTick$1, this);
      }
    }
  }

  return res;
};

Readable$1.prototype.addListener = Readable$1.prototype.on;

Readable$1.prototype.removeListener = function (ev, fn) {
  var res = stream.prototype.removeListener.call(this, ev, fn);

  if (ev === 'readable') {
    // We need to check if there is someone still listening to
    // readable and reset the state. However this needs to happen
    // after readable has been emitted but before I/O (nextTick) to
    // support once('readable', fn) cycles. This means that calling
    // resume within the same tick will have no
    // effect.
    nextTick(updateReadableListening, this);
  }

  return res;
};

Readable$1.prototype.removeAllListeners = function (ev) {
  var res = stream.prototype.removeAllListeners.apply(this, arguments);

  if (ev === 'readable' || ev === undefined) {
    // We need to check if there is someone still listening to
    // readable and reset the state. However this needs to happen
    // after readable has been emitted but before I/O (nextTick) to
    // support once('readable', fn) cycles. This means that calling
    // resume within the same tick will have no
    // effect.
    nextTick(updateReadableListening, this);
  }

  return res;
};

function updateReadableListening(self) {
  var state = self._readableState;
  state.readableListening = self.listenerCount('readable') > 0;

  if (state.resumeScheduled && !state.paused) {
    // flowing needs to be set to true now, otherwise
    // the upcoming resume will not flow.
    state.flowing = true; // crude way to check if we should resume
  } else if (self.listenerCount('data') > 0) {
    self.resume();
  }
}

function nReadingNextTick$1(self) {
  debug$1('readable nexttick read 0');
  self.read(0);
} // pause() and resume() are remnants of the legacy readable stream API
// If the user uses them, then switch into old mode.


Readable$1.prototype.resume = function () {
  var state = this._readableState;

  if (!state.flowing) {
    debug$1('resume'); // we flow only if there is no one listening
    // for readable, but we still have to call
    // resume()

    state.flowing = !state.readableListening;
    resume$1(this, state);
  }

  state.paused = false;
  return this;
};

function resume$1(stream, state) {
  if (!state.resumeScheduled) {
    state.resumeScheduled = true;
    nextTick(resume_$1, stream, state);
  }
}

function resume_$1(stream, state) {
  debug$1('resume', state.reading);

  if (!state.reading) {
    stream.read(0);
  }

  state.resumeScheduled = false;
  stream.emit('resume');
  flow$1(stream);
  if (state.flowing && !state.reading) stream.read(0);
}

Readable$1.prototype.pause = function () {
  debug$1('call pause flowing=%j', this._readableState.flowing);

  if (this._readableState.flowing !== false) {
    debug$1('pause');
    this._readableState.flowing = false;
    this.emit('pause');
  }

  this._readableState.paused = true;
  return this;
};

function flow$1(stream) {
  var state = stream._readableState;
  debug$1('flow', state.flowing);

  while (state.flowing && stream.read() !== null) {
  }
} // wrap an old-style stream as the async data source.
// This is *not* part of the readable stream interface.
// It is an ugly unfortunate mess of history.


Readable$1.prototype.wrap = function (stream) {
  var _this = this;

  var state = this._readableState;
  var paused = false;
  stream.on('end', function () {
    debug$1('wrapped end');

    if (state.decoder && !state.ended) {
      var chunk = state.decoder.end();
      if (chunk && chunk.length) _this.push(chunk);
    }

    _this.push(null);
  });
  stream.on('data', function (chunk) {
    debug$1('wrapped data');
    if (state.decoder) chunk = state.decoder.write(chunk); // don't skip over falsy values in objectMode

    if (state.objectMode && (chunk === null || chunk === undefined)) return;else if (!state.objectMode && (!chunk || !chunk.length)) return;

    var ret = _this.push(chunk);

    if (!ret) {
      paused = true;
      stream.pause();
    }
  }); // proxy all the other methods.
  // important when wrapping filters and duplexes.

  for (var i in stream) {
    if (this[i] === undefined && typeof stream[i] === 'function') {
      this[i] = function methodWrap(method) {
        return function methodWrapReturnFunction() {
          return stream[method].apply(stream, arguments);
        };
      }(i);
    }
  } // proxy certain important events.


  for (var n = 0; n < kProxyEvents.length; n++) {
    stream.on(kProxyEvents[n], this.emit.bind(this, kProxyEvents[n]));
  } // when we try to consume some more bytes, simply unpause the
  // underlying stream.


  this._read = function (n) {
    debug$1('wrapped _read', n);

    if (paused) {
      paused = false;
      stream.resume();
    }
  };

  return this;
};

if (typeof Symbol === 'function') {
  Readable$1.prototype[Symbol.asyncIterator] = function () {
    if (createReadableStreamAsyncIterator$1 === undefined) {
      createReadableStreamAsyncIterator$1 = async_iterator;
    }

    return createReadableStreamAsyncIterator$1(this);
  };
}

Object.defineProperty(Readable$1.prototype, 'readableHighWaterMark', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._readableState.highWaterMark;
  }
});
Object.defineProperty(Readable$1.prototype, 'readableBuffer', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._readableState && this._readableState.buffer;
  }
});
Object.defineProperty(Readable$1.prototype, 'readableFlowing', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._readableState.flowing;
  },
  set: function set(state) {
    if (this._readableState) {
      this._readableState.flowing = state;
    }
  }
}); // exposed for testing purposes only.

Readable$1._fromList = fromList$1;
Object.defineProperty(Readable$1.prototype, 'readableLength', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._readableState.length;
  }
}); // Pluck off n bytes from an array of buffers.
// Length is the combined lengths of all the buffers in the list.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.

function fromList$1(n, state) {
  // nothing buffered
  if (state.length === 0) return null;
  var ret;
  if (state.objectMode) ret = state.buffer.shift();else if (!n || n >= state.length) {
    // read it all, truncate the list
    if (state.decoder) ret = state.buffer.join('');else if (state.buffer.length === 1) ret = state.buffer.first();else ret = state.buffer.concat(state.length);
    state.buffer.clear();
  } else {
    // read part of list
    ret = state.buffer.consume(n, state.decoder);
  }
  return ret;
}

function endReadable$1(stream) {
  var state = stream._readableState;
  debug$1('endReadable', state.endEmitted);

  if (!state.endEmitted) {
    state.ended = true;
    nextTick(endReadableNT$1, state, stream);
  }
}

function endReadableNT$1(state, stream) {
  debug$1('endReadableNT', state.endEmitted, state.length); // Check that we didn't get one last unshift.

  if (!state.endEmitted && state.length === 0) {
    state.endEmitted = true;
    stream.readable = false;
    stream.emit('end');

    if (state.autoDestroy) {
      // In case of duplex streams we need a way to detect
      // if the writable side is ready for autoDestroy as well
      var wState = stream._writableState;

      if (!wState || wState.autoDestroy && wState.finished) {
        stream.destroy();
      }
    }
  }
}

if (typeof Symbol === 'function') {
  Readable$1.from = function (iterable, opts) {
    if (from$2 === undefined) {
      from$2 = from_1;
    }

    return from$2(Readable$1, iterable, opts);
  };
}

function indexOf$1(xs, x) {
  for (var i = 0, l = xs.length; i < l; i++) {
    if (xs[i] === x) return i;
  }

  return -1;
}

var _stream_transform = Transform$1;

var _require$codes$2 = errors.codes,
    ERR_METHOD_NOT_IMPLEMENTED$2 = _require$codes$2.ERR_METHOD_NOT_IMPLEMENTED,
    ERR_MULTIPLE_CALLBACK$1 = _require$codes$2.ERR_MULTIPLE_CALLBACK,
    ERR_TRANSFORM_ALREADY_TRANSFORMING = _require$codes$2.ERR_TRANSFORM_ALREADY_TRANSFORMING,
    ERR_TRANSFORM_WITH_LENGTH_0 = _require$codes$2.ERR_TRANSFORM_WITH_LENGTH_0;



inherits$2(Transform$1, _stream_duplex);

function afterTransform$1(er, data) {
  var ts = this._transformState;
  ts.transforming = false;
  var cb = ts.writecb;

  if (cb === null) {
    return this.emit('error', new ERR_MULTIPLE_CALLBACK$1());
  }

  ts.writechunk = null;
  ts.writecb = null;
  if (data != null) // single equals check for both `null` and `undefined`
    this.push(data);
  cb(er);
  var rs = this._readableState;
  rs.reading = false;

  if (rs.needReadable || rs.length < rs.highWaterMark) {
    this._read(rs.highWaterMark);
  }
}

function Transform$1(options) {
  if (!(this instanceof Transform$1)) return new Transform$1(options);
  _stream_duplex.call(this, options);
  this._transformState = {
    afterTransform: afterTransform$1.bind(this),
    needTransform: false,
    transforming: false,
    writecb: null,
    writechunk: null,
    writeencoding: null
  }; // start out asking for a readable event once data is transformed.

  this._readableState.needReadable = true; // we have implemented the _read method, and done the other things
  // that Readable wants before the first _read call, so unset the
  // sync guard flag.

  this._readableState.sync = false;

  if (options) {
    if (typeof options.transform === 'function') this._transform = options.transform;
    if (typeof options.flush === 'function') this._flush = options.flush;
  } // When the writable side finishes, then flush out anything remaining.


  this.on('prefinish', prefinish$2);
}

function prefinish$2() {
  var _this = this;

  if (typeof this._flush === 'function' && !this._readableState.destroyed) {
    this._flush(function (er, data) {
      done$1(_this, er, data);
    });
  } else {
    done$1(this, null, null);
  }
}

Transform$1.prototype.push = function (chunk, encoding) {
  this._transformState.needTransform = false;
  return _stream_duplex.prototype.push.call(this, chunk, encoding);
}; // This is the part where you do stuff!
// override this function in implementation classes.
// 'chunk' is an input chunk.
//
// Call `push(newChunk)` to pass along transformed output
// to the readable side.  You may call 'push' zero or more times.
//
// Call `cb(err)` when you are done with this chunk.  If you pass
// an error, then that'll put the hurt on the whole operation.  If you
// never call cb(), then you'll never get another chunk.


Transform$1.prototype._transform = function (chunk, encoding, cb) {
  cb(new ERR_METHOD_NOT_IMPLEMENTED$2('_transform()'));
};

Transform$1.prototype._write = function (chunk, encoding, cb) {
  var ts = this._transformState;
  ts.writecb = cb;
  ts.writechunk = chunk;
  ts.writeencoding = encoding;

  if (!ts.transforming) {
    var rs = this._readableState;
    if (ts.needTransform || rs.needReadable || rs.length < rs.highWaterMark) this._read(rs.highWaterMark);
  }
}; // Doesn't matter what the args are here.
// _transform does all the work.
// That we got here means that the readable side wants more data.


Transform$1.prototype._read = function (n) {
  var ts = this._transformState;

  if (ts.writechunk !== null && !ts.transforming) {
    ts.transforming = true;

    this._transform(ts.writechunk, ts.writeencoding, ts.afterTransform);
  } else {
    // mark that we need a transform, so that any data that comes in
    // will get processed, now that we've asked for it.
    ts.needTransform = true;
  }
};

Transform$1.prototype._destroy = function (err, cb) {
  _stream_duplex.prototype._destroy.call(this, err, function (err2) {
    cb(err2);
  });
};

function done$1(stream, er, data) {
  if (er) return stream.emit('error', er);
  if (data != null) // single equals check for both `null` and `undefined`
    stream.push(data); // TODO(BridgeAR): Write a test for these two error cases
  // if there's nothing in the write buffer, then that means
  // that nothing more will ever be provided

  if (stream._writableState.length) throw new ERR_TRANSFORM_WITH_LENGTH_0();
  if (stream._transformState.transforming) throw new ERR_TRANSFORM_ALREADY_TRANSFORMING();
  return stream.push(null);
}

var _stream_passthrough = PassThrough$1;



inherits$2(PassThrough$1, _stream_transform);

function PassThrough$1(options) {
  if (!(this instanceof PassThrough$1)) return new PassThrough$1(options);
  _stream_transform.call(this, options);
}

PassThrough$1.prototype._transform = function (chunk, encoding, cb) {
  cb(null, chunk);
};

var eos$1;

function once$2(callback) {
  var called = false;
  return function () {
    if (called) return;
    called = true;
    callback.apply(void 0, arguments);
  };
}

var _require$codes$3 = errors.codes,
    ERR_MISSING_ARGS = _require$codes$3.ERR_MISSING_ARGS,
    ERR_STREAM_DESTROYED$1 = _require$codes$3.ERR_STREAM_DESTROYED;

function noop$2(err) {
  // Rethrow the error if it exists to avoid swallowing it
  if (err) throw err;
}

function isRequest$1(stream) {
  return stream.setHeader && typeof stream.abort === 'function';
}

function destroyer(stream, reading, writing, callback) {
  callback = once$2(callback);
  var closed = false;
  stream.on('close', function () {
    closed = true;
  });
  if (eos$1 === undefined) eos$1 = endOfStream;
  eos$1(stream, {
    readable: reading,
    writable: writing
  }, function (err) {
    if (err) return callback(err);
    closed = true;
    callback();
  });
  var destroyed = false;
  return function (err) {
    if (closed) return;
    if (destroyed) return;
    destroyed = true; // request.destroy just do .end - .abort is what we want

    if (isRequest$1(stream)) return stream.abort();
    if (typeof stream.destroy === 'function') return stream.destroy();
    callback(err || new ERR_STREAM_DESTROYED$1('pipe'));
  };
}

function call(fn) {
  fn();
}

function pipe(from, to) {
  return from.pipe(to);
}

function popCallback(streams) {
  if (!streams.length) return noop$2;
  if (typeof streams[streams.length - 1] !== 'function') return noop$2;
  return streams.pop();
}

function pipeline() {
  for (var _len = arguments.length, streams = new Array(_len), _key = 0; _key < _len; _key++) {
    streams[_key] = arguments[_key];
  }

  var callback = popCallback(streams);
  if (Array.isArray(streams[0])) streams = streams[0];

  if (streams.length < 2) {
    throw new ERR_MISSING_ARGS('streams');
  }

  var error;
  var destroys = streams.map(function (stream, i) {
    var reading = i < streams.length - 1;
    var writing = i > 0;
    return destroyer(stream, reading, writing, function (err) {
      if (!error) error = err;
      if (err) destroys.forEach(call);
      if (reading) return;
      destroys.forEach(call);
      callback(error);
    });
  });
  return streams.reduce(pipe);
}

var pipeline_1 = pipeline;

var readable = createCommonjsModule(function (module, exports) {
if (process.env.READABLE_STREAM === 'disable' && Stream) {
  module.exports = Stream.Readable;
  Object.assign(module.exports, Stream);
  module.exports.Stream = Stream;
} else {
  exports = module.exports = _stream_readable;
  exports.Stream = Stream || exports;
  exports.Readable = exports;
  exports.Writable = _stream_writable;
  exports.Duplex = _stream_duplex;
  exports.Transform = _stream_transform;
  exports.PassThrough = _stream_passthrough;
  exports.finished = endOfStream;
  exports.pipeline = pipeline_1;
}
});
var readable_1 = readable.Stream;
var readable_2 = readable.Readable;
var readable_3 = readable.Writable;
var readable_4 = readable.Duplex;
var readable_5 = readable.Transform;
var readable_6 = readable.PassThrough;
var readable_7 = readable.finished;
var readable_8 = readable.pipeline;

let promise;

var queueMicrotask_1 = typeof queueMicrotask === 'function'
  ? queueMicrotask
  // reuse resolved promise, and allocate it lazily
  : cb => (promise || (promise = Promise.resolve()))
    .then(cb)
    .catch(err => setTimeout(() => { throw err }, 0));

var debug$2 = src('simple-peer');



 // TODO: remove when Node 10 is not supported

var MAX_BUFFERED_AMOUNT = 64 * 1024;
var ICECOMPLETE_TIMEOUT = 5 * 1000;
var CHANNEL_CLOSING_TIMEOUT = 5 * 1000;

// HACK: Filter trickle lines when trickle is disabled #354
function filterTrickle (sdp) {
  return sdp.replace(/a=ice-options:trickle\s\n/g, '')
}

function makeError (err, code) {
  if (!(err instanceof Error)) err = new Error(err);
  err.code = code;
  return err
}

function warn (message) {
  console.warn(message);
}

/**
 * WebRTC peer connection. Same API as node core `net.Socket`, plus a few extra methods.
 * Duplex stream.
 * @param {Object} opts
 */
class Peer extends readable.Duplex {
  constructor (opts) {
    opts = Object.assign({
      allowHalfOpen: false
    }, opts);

    super(opts);

    this._id = randombytes(4).toString('hex').slice(0, 7);
    this._debug('new peer %o', opts);

    this.channelName = opts.initiator
      ? opts.channelName || randombytes(20).toString('hex')
      : null;

    this.initiator = opts.initiator || false;
    this.channelConfig = opts.channelConfig || Peer.channelConfig;
    this.negotiated = this.channelConfig.negotiated;
    this.config = Object.assign({}, Peer.config, opts.config);
    this.offerOptions = opts.offerOptions || {};
    this.answerOptions = opts.answerOptions || {};
    this.sdpTransform = opts.sdpTransform || (sdp => sdp);
    this.streams = opts.streams || (opts.stream ? [opts.stream] : []); // support old "stream" option
    this.trickle = opts.trickle !== undefined ? opts.trickle : true;
    this.allowHalfTrickle = opts.allowHalfTrickle !== undefined ? opts.allowHalfTrickle : false;
    this.iceCompleteTimeout = opts.iceCompleteTimeout || ICECOMPLETE_TIMEOUT;

    this.destroyed = false;
    this._connected = false;

    this.remoteAddress = undefined;
    this.remoteFamily = undefined;
    this.remotePort = undefined;
    this.localAddress = undefined;
    this.localFamily = undefined;
    this.localPort = undefined;

    this._wrtc = (opts.wrtc && typeof opts.wrtc === 'object')
      ? opts.wrtc
      : getBrowserRtc();

    if (!this._wrtc) {
      if (typeof window === 'undefined') {
        throw makeError('No WebRTC support: Specify `opts.wrtc` option in this environment', 'ERR_WEBRTC_SUPPORT')
      } else {
        throw makeError('No WebRTC support: Not a supported browser', 'ERR_WEBRTC_SUPPORT')
      }
    }

    this._pcReady = false;
    this._channelReady = false;
    this._iceComplete = false; // ice candidate trickle done (got null candidate)
    this._iceCompleteTimer = null; // send an offer/answer anyway after some timeout
    this._channel = null;
    this._pendingCandidates = [];

    this._isNegotiating = this.negotiated ? false : !this.initiator; // is this peer waiting for negotiation to complete?
    this._batchedNegotiation = false; // batch synchronous negotiations
    this._queuedNegotiation = false; // is there a queued negotiation request?
    this._sendersAwaitingStable = [];
    this._senderMap = new Map();
    this._firstStable = true;
    this._closingInterval = null;

    this._remoteTracks = [];
    this._remoteStreams = [];

    this._chunk = null;
    this._cb = null;
    this._interval = null;

    try {
      this._pc = new (this._wrtc.RTCPeerConnection)(this.config);
    } catch (err) {
      queueMicrotask_1(() => this.destroy(makeError(err, 'ERR_PC_CONSTRUCTOR')));
      return
    }

    // We prefer feature detection whenever possible, but sometimes that's not
    // possible for certain implementations.
    this._isReactNativeWebrtc = typeof this._pc._peerConnectionId === 'number';

    this._pc.oniceconnectionstatechange = () => {
      this._onIceStateChange();
    };
    this._pc.onicegatheringstatechange = () => {
      this._onIceStateChange();
    };
    this._pc.onconnectionstatechange = () => {
      this._onConnectionStateChange();
    };
    this._pc.onsignalingstatechange = () => {
      this._onSignalingStateChange();
    };
    this._pc.onicecandidate = event => {
      this._onIceCandidate(event);
    };

    // Other spec events, unused by this implementation:
    // - onconnectionstatechange
    // - onicecandidateerror
    // - onfingerprintfailure
    // - onnegotiationneeded

    if (this.initiator || this.negotiated) {
      this._setupData({
        channel: this._pc.createDataChannel(this.channelName, this.channelConfig)
      });
    } else {
      this._pc.ondatachannel = event => {
        this._setupData(event);
      };
    }

    if (this.streams) {
      this.streams.forEach(stream => {
        this.addStream(stream);
      });
    }
    this._pc.ontrack = event => {
      this._onTrack(event);
    };

    if (this.initiator) {
      this._needsNegotiation();
    }

    this._onFinishBound = () => {
      this._onFinish();
    };
    this.once('finish', this._onFinishBound);
  }

  get bufferSize () {
    return (this._channel && this._channel.bufferedAmount) || 0
  }

  // HACK: it's possible channel.readyState is "closing" before peer.destroy() fires
  // https://bugs.chromium.org/p/chromium/issues/detail?id=882743
  get connected () {
    return (this._connected && this._channel.readyState === 'open')
  }

  address () {
    return { port: this.localPort, family: this.localFamily, address: this.localAddress }
  }

  signal (data) {
    if (this.destroyed) throw makeError('cannot signal after peer is destroyed', 'ERR_SIGNALING')
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (err) {
        data = {};
      }
    }
    this._debug('signal()');

    if (data.renegotiate && this.initiator) {
      this._debug('got request to renegotiate');
      this._needsNegotiation();
    }
    if (data.transceiverRequest && this.initiator) {
      this._debug('got request for transceiver');
      this.addTransceiver(data.transceiverRequest.kind, data.transceiverRequest.init);
    }
    if (data.candidate) {
      if (this._pc.remoteDescription && this._pc.remoteDescription.type) {
        this._addIceCandidate(data.candidate);
      } else {
        this._pendingCandidates.push(data.candidate);
      }
    }
    if (data.sdp) {
      this._pc.setRemoteDescription(new (this._wrtc.RTCSessionDescription)(data))
        .then(() => {
          if (this.destroyed) return

          this._pendingCandidates.forEach(candidate => {
            this._addIceCandidate(candidate);
          });
          this._pendingCandidates = [];

          if (this._pc.remoteDescription.type === 'offer') this._createAnswer();
        })
        .catch(err => {
          this.destroy(makeError(err, 'ERR_SET_REMOTE_DESCRIPTION'));
        });
    }
    if (!data.sdp && !data.candidate && !data.renegotiate && !data.transceiverRequest) {
      this.destroy(makeError('signal() called with invalid signal data', 'ERR_SIGNALING'));
    }
  }

  _addIceCandidate (candidate) {
    var iceCandidateObj = new this._wrtc.RTCIceCandidate(candidate);
    this._pc.addIceCandidate(iceCandidateObj)
      .catch(err => {
        if (!iceCandidateObj.address || iceCandidateObj.address.endsWith('.local')) {
          warn('Ignoring unsupported ICE candidate.');
        } else {
          this.destroy(makeError(err, 'ERR_ADD_ICE_CANDIDATE'));
        }
      });
  }

  /**
   * Send text/binary data to the remote peer.
   * @param {ArrayBufferView|ArrayBuffer|Buffer|string|Blob} chunk
   */
  send (chunk) {
    this._channel.send(chunk);
  }

  /**
   * Add a Transceiver to the connection.
   * @param {String} kind
   * @param {Object} init
   */
  addTransceiver (kind, init) {
    this._debug('addTransceiver()');

    if (this.initiator) {
      try {
        this._pc.addTransceiver(kind, init);
        this._needsNegotiation();
      } catch (err) {
        this.destroy(makeError(err, 'ERR_ADD_TRANSCEIVER'));
      }
    } else {
      this.emit('signal', { // request initiator to renegotiate
        transceiverRequest: { kind, init }
      });
    }
  }

  /**
   * Add a MediaStream to the connection.
   * @param {MediaStream} stream
   */
  addStream (stream) {
    this._debug('addStream()');

    stream.getTracks().forEach(track => {
      this.addTrack(track, stream);
    });
  }

  /**
   * Add a MediaStreamTrack to the connection.
   * @param {MediaStreamTrack} track
   * @param {MediaStream} stream
   */
  addTrack (track, stream) {
    this._debug('addTrack()');

    var submap = this._senderMap.get(track) || new Map(); // nested Maps map [track, stream] to sender
    var sender = submap.get(stream);
    if (!sender) {
      sender = this._pc.addTrack(track, stream);
      submap.set(stream, sender);
      this._senderMap.set(track, submap);
      this._needsNegotiation();
    } else if (sender.removed) {
      throw makeError('Track has been removed. You should enable/disable tracks that you want to re-add.', 'ERR_SENDER_REMOVED')
    } else {
      throw makeError('Track has already been added to that stream.', 'ERR_SENDER_ALREADY_ADDED')
    }
  }

  /**
   * Replace a MediaStreamTrack by another in the connection.
   * @param {MediaStreamTrack} oldTrack
   * @param {MediaStreamTrack} newTrack
   * @param {MediaStream} stream
   */
  replaceTrack (oldTrack, newTrack, stream) {
    this._debug('replaceTrack()');

    var submap = this._senderMap.get(oldTrack);
    var sender = submap ? submap.get(stream) : null;
    if (!sender) {
      throw makeError('Cannot replace track that was never added.', 'ERR_TRACK_NOT_ADDED')
    }
    if (newTrack) this._senderMap.set(newTrack, submap);

    if (sender.replaceTrack != null) {
      sender.replaceTrack(newTrack);
    } else {
      this.destroy(makeError('replaceTrack is not supported in this browser', 'ERR_UNSUPPORTED_REPLACETRACK'));
    }
  }

  /**
   * Remove a MediaStreamTrack from the connection.
   * @param {MediaStreamTrack} track
   * @param {MediaStream} stream
   */
  removeTrack (track, stream) {
    this._debug('removeSender()');

    var submap = this._senderMap.get(track);
    var sender = submap ? submap.get(stream) : null;
    if (!sender) {
      throw makeError('Cannot remove track that was never added.', 'ERR_TRACK_NOT_ADDED')
    }
    try {
      sender.removed = true;
      this._pc.removeTrack(sender);
    } catch (err) {
      if (err.name === 'NS_ERROR_UNEXPECTED') {
        this._sendersAwaitingStable.push(sender); // HACK: Firefox must wait until (signalingState === stable) https://bugzilla.mozilla.org/show_bug.cgi?id=1133874
      } else {
        this.destroy(makeError(err, 'ERR_REMOVE_TRACK'));
      }
    }
    this._needsNegotiation();
  }

  /**
   * Remove a MediaStream from the connection.
   * @param {MediaStream} stream
   */
  removeStream (stream) {
    this._debug('removeSenders()');

    stream.getTracks().forEach(track => {
      this.removeTrack(track, stream);
    });
  }

  _needsNegotiation () {
    this._debug('_needsNegotiation');
    if (this._batchedNegotiation) return // batch synchronous renegotiations
    this._batchedNegotiation = true;
    queueMicrotask_1(() => {
      this._batchedNegotiation = false;
      this._debug('starting batched negotiation');
      this.negotiate();
    });
  }

  negotiate () {
    if (this.initiator) {
      if (this._isNegotiating) {
        this._queuedNegotiation = true;
        this._debug('already negotiating, queueing');
      } else {
        this._debug('start negotiation');
        setTimeout(() => { // HACK: Chrome crashes if we immediately call createOffer
          this._createOffer();
        }, 0);
      }
    } else {
      if (this._isNegotiating) {
        this._queuedNegotiation = true;
        this._debug('already negotiating, queueing');
      } else {
        this._debug('requesting negotiation from initiator');
        this.emit('signal', { // request initiator to renegotiate
          renegotiate: true
        });
      }
    }
    this._isNegotiating = true;
  }

  // TODO: Delete this method once readable-stream is updated to contain a default
  // implementation of destroy() that automatically calls _destroy()
  // See: https://github.com/nodejs/readable-stream/issues/283
  destroy (err) {
    this._destroy(err, () => {});
  }

  _destroy (err, cb) {
    if (this.destroyed) return

    this._debug('destroy (error: %s)', err && (err.message || err));

    this.readable = this.writable = false;

    if (!this._readableState.ended) this.push(null);
    if (!this._writableState.finished) this.end();

    this.destroyed = true;
    this._connected = false;
    this._pcReady = false;
    this._channelReady = false;
    this._remoteTracks = null;
    this._remoteStreams = null;
    this._senderMap = null;

    clearInterval(this._closingInterval);
    this._closingInterval = null;

    clearInterval(this._interval);
    this._interval = null;
    this._chunk = null;
    this._cb = null;

    if (this._onFinishBound) this.removeListener('finish', this._onFinishBound);
    this._onFinishBound = null;

    if (this._channel) {
      try {
        this._channel.close();
      } catch (err) {}

      this._channel.onmessage = null;
      this._channel.onopen = null;
      this._channel.onclose = null;
      this._channel.onerror = null;
    }
    if (this._pc) {
      try {
        this._pc.close();
      } catch (err) {}

      this._pc.oniceconnectionstatechange = null;
      this._pc.onicegatheringstatechange = null;
      this._pc.onsignalingstatechange = null;
      this._pc.onicecandidate = null;
      this._pc.ontrack = null;
      this._pc.ondatachannel = null;
    }
    this._pc = null;
    this._channel = null;

    if (err) this.emit('error', err);
    this.emit('close');
    cb();
  }

  _setupData (event) {
    if (!event.channel) {
      // In some situations `pc.createDataChannel()` returns `undefined` (in wrtc),
      // which is invalid behavior. Handle it gracefully.
      // See: https://github.com/feross/simple-peer/issues/163
      return this.destroy(makeError('Data channel event is missing `channel` property', 'ERR_DATA_CHANNEL'))
    }

    this._channel = event.channel;
    this._channel.binaryType = 'arraybuffer';

    if (typeof this._channel.bufferedAmountLowThreshold === 'number') {
      this._channel.bufferedAmountLowThreshold = MAX_BUFFERED_AMOUNT;
    }

    this.channelName = this._channel.label;

    this._channel.onmessage = event => {
      this._onChannelMessage(event);
    };
    this._channel.onbufferedamountlow = () => {
      this._onChannelBufferedAmountLow();
    };
    this._channel.onopen = () => {
      this._onChannelOpen();
    };
    this._channel.onclose = () => {
      this._onChannelClose();
    };
    this._channel.onerror = err => {
      this.destroy(makeError(err, 'ERR_DATA_CHANNEL'));
    };

    // HACK: Chrome will sometimes get stuck in readyState "closing", let's check for this condition
    // https://bugs.chromium.org/p/chromium/issues/detail?id=882743
    var isClosing = false;
    this._closingInterval = setInterval(() => { // No "onclosing" event
      if (this._channel && this._channel.readyState === 'closing') {
        if (isClosing) this._onChannelClose(); // closing timed out: equivalent to onclose firing
        isClosing = true;
      } else {
        isClosing = false;
      }
    }, CHANNEL_CLOSING_TIMEOUT);
  }

  _read () {}

  _write (chunk, encoding, cb) {
    if (this.destroyed) return cb(makeError('cannot write after peer is destroyed', 'ERR_DATA_CHANNEL'))

    if (this._connected) {
      try {
        this.send(chunk);
      } catch (err) {
        return this.destroy(makeError(err, 'ERR_DATA_CHANNEL'))
      }
      if (this._channel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
        this._debug('start backpressure: bufferedAmount %d', this._channel.bufferedAmount);
        this._cb = cb;
      } else {
        cb(null);
      }
    } else {
      this._debug('write before connect');
      this._chunk = chunk;
      this._cb = cb;
    }
  }

  // When stream finishes writing, close socket. Half open connections are not
  // supported.
  _onFinish () {
    if (this.destroyed) return

    // Wait a bit before destroying so the socket flushes.
    // TODO: is there a more reliable way to accomplish this?
    const destroySoon = () => {
      setTimeout(() => this.destroy(), 1000);
    };

    if (this._connected) {
      destroySoon();
    } else {
      this.once('connect', destroySoon);
    }
  }

  _startIceCompleteTimeout () {
    if (this.destroyed) return
    if (this._iceCompleteTimer) return
    this._debug('started iceComplete timeout');
    this._iceCompleteTimer = setTimeout(() => {
      if (!this._iceComplete) {
        this._iceComplete = true;
        this._debug('iceComplete timeout completed');
        this.emit('iceTimeout');
        this.emit('_iceComplete');
      }
    }, this.iceCompleteTimeout);
  }

  _createOffer () {
    if (this.destroyed) return

    this._pc.createOffer(this.offerOptions)
      .then(offer => {
        if (this.destroyed) return
        if (!this.trickle && !this.allowHalfTrickle) offer.sdp = filterTrickle(offer.sdp);
        offer.sdp = this.sdpTransform(offer.sdp);

        const sendOffer = () => {
          if (this.destroyed) return
          var signal = this._pc.localDescription || offer;
          this._debug('signal');
          this.emit('signal', {
            type: signal.type,
            sdp: signal.sdp
          });
        };

        const onSuccess = () => {
          this._debug('createOffer success');
          if (this.destroyed) return
          if (this.trickle || this._iceComplete) sendOffer();
          else this.once('_iceComplete', sendOffer); // wait for candidates
        };

        const onError = err => {
          this.destroy(makeError(err, 'ERR_SET_LOCAL_DESCRIPTION'));
        };

        this._pc.setLocalDescription(offer)
          .then(onSuccess)
          .catch(onError);
      })
      .catch(err => {
        this.destroy(makeError(err, 'ERR_CREATE_OFFER'));
      });
  }

  _requestMissingTransceivers () {
    if (this._pc.getTransceivers) {
      this._pc.getTransceivers().forEach(transceiver => {
        if (!transceiver.mid && transceiver.sender.track && !transceiver.requested) {
          transceiver.requested = true; // HACK: Safari returns negotiated transceivers with a null mid
          this.addTransceiver(transceiver.sender.track.kind);
        }
      });
    }
  }

  _createAnswer () {
    if (this.destroyed) return

    this._pc.createAnswer(this.answerOptions)
      .then(answer => {
        if (this.destroyed) return
        if (!this.trickle && !this.allowHalfTrickle) answer.sdp = filterTrickle(answer.sdp);
        answer.sdp = this.sdpTransform(answer.sdp);

        const sendAnswer = () => {
          if (this.destroyed) return
          var signal = this._pc.localDescription || answer;
          this._debug('signal');
          this.emit('signal', {
            type: signal.type,
            sdp: signal.sdp
          });
          if (!this.initiator) this._requestMissingTransceivers();
        };

        const onSuccess = () => {
          if (this.destroyed) return
          if (this.trickle || this._iceComplete) sendAnswer();
          else this.once('_iceComplete', sendAnswer);
        };

        const onError = err => {
          this.destroy(makeError(err, 'ERR_SET_LOCAL_DESCRIPTION'));
        };

        this._pc.setLocalDescription(answer)
          .then(onSuccess)
          .catch(onError);
      })
      .catch(err => {
        this.destroy(makeError(err, 'ERR_CREATE_ANSWER'));
      });
  }

  _onConnectionStateChange () {
    if (this.destroyed) return
    if (this._pc.connectionState === 'failed') {
      this.destroy(makeError('Connection failed.', 'ERR_CONNECTION_FAILURE'));
    }
  }

  _onIceStateChange () {
    if (this.destroyed) return
    var iceConnectionState = this._pc.iceConnectionState;
    var iceGatheringState = this._pc.iceGatheringState;

    this._debug(
      'iceStateChange (connection: %s) (gathering: %s)',
      iceConnectionState,
      iceGatheringState
    );
    this.emit('iceStateChange', iceConnectionState, iceGatheringState);

    if (iceConnectionState === 'connected' || iceConnectionState === 'completed') {
      this._pcReady = true;
      this._maybeReady();
    }
    if (iceConnectionState === 'failed') {
      this.destroy(makeError('Ice connection failed.', 'ERR_ICE_CONNECTION_FAILURE'));
    }
    if (iceConnectionState === 'closed') {
      this.destroy(makeError('Ice connection closed.', 'ERR_ICE_CONNECTION_CLOSED'));
    }
  }

  getStats (cb) {
    // statreports can come with a value array instead of properties
    const flattenValues = report => {
      if (Object.prototype.toString.call(report.values) === '[object Array]') {
        report.values.forEach(value => {
          Object.assign(report, value);
        });
      }
      return report
    };

    // Promise-based getStats() (standard)
    if (this._pc.getStats.length === 0 || this._isReactNativeWebrtc) {
      this._pc.getStats()
        .then(res => {
          var reports = [];
          res.forEach(report => {
            reports.push(flattenValues(report));
          });
          cb(null, reports);
        }, err => cb(err));

    // Single-parameter callback-based getStats() (non-standard)
    } else if (this._pc.getStats.length > 0) {
      this._pc.getStats(res => {
        // If we destroy connection in `connect` callback this code might happen to run when actual connection is already closed
        if (this.destroyed) return

        var reports = [];
        res.result().forEach(result => {
          var report = {};
          result.names().forEach(name => {
            report[name] = result.stat(name);
          });
          report.id = result.id;
          report.type = result.type;
          report.timestamp = result.timestamp;
          reports.push(flattenValues(report));
        });
        cb(null, reports);
      }, err => cb(err));

    // Unknown browser, skip getStats() since it's anyone's guess which style of
    // getStats() they implement.
    } else {
      cb(null, []);
    }
  }

  _maybeReady () {
    this._debug('maybeReady pc %s channel %s', this._pcReady, this._channelReady);
    if (this._connected || this._connecting || !this._pcReady || !this._channelReady) return

    this._connecting = true;

    // HACK: We can't rely on order here, for details see https://github.com/js-platform/node-webrtc/issues/339
    const findCandidatePair = () => {
      if (this.destroyed) return

      this.getStats((err, items) => {
        if (this.destroyed) return

        // Treat getStats error as non-fatal. It's not essential.
        if (err) items = [];

        var remoteCandidates = {};
        var localCandidates = {};
        var candidatePairs = {};
        var foundSelectedCandidatePair = false;

        items.forEach(item => {
          // TODO: Once all browsers support the hyphenated stats report types, remove
          // the non-hypenated ones
          if (item.type === 'remotecandidate' || item.type === 'remote-candidate') {
            remoteCandidates[item.id] = item;
          }
          if (item.type === 'localcandidate' || item.type === 'local-candidate') {
            localCandidates[item.id] = item;
          }
          if (item.type === 'candidatepair' || item.type === 'candidate-pair') {
            candidatePairs[item.id] = item;
          }
        });

        const setSelectedCandidatePair = selectedCandidatePair => {
          foundSelectedCandidatePair = true;

          var local = localCandidates[selectedCandidatePair.localCandidateId];

          if (local && (local.ip || local.address)) {
            // Spec
            this.localAddress = local.ip || local.address;
            this.localPort = Number(local.port);
          } else if (local && local.ipAddress) {
            // Firefox
            this.localAddress = local.ipAddress;
            this.localPort = Number(local.portNumber);
          } else if (typeof selectedCandidatePair.googLocalAddress === 'string') {
            // TODO: remove this once Chrome 58 is released
            local = selectedCandidatePair.googLocalAddress.split(':');
            this.localAddress = local[0];
            this.localPort = Number(local[1]);
          }
          if (this.localAddress) {
            this.localFamily = this.localAddress.includes(':') ? 'IPv6' : 'IPv4';
          }

          var remote = remoteCandidates[selectedCandidatePair.remoteCandidateId];

          if (remote && (remote.ip || remote.address)) {
            // Spec
            this.remoteAddress = remote.ip || remote.address;
            this.remotePort = Number(remote.port);
          } else if (remote && remote.ipAddress) {
            // Firefox
            this.remoteAddress = remote.ipAddress;
            this.remotePort = Number(remote.portNumber);
          } else if (typeof selectedCandidatePair.googRemoteAddress === 'string') {
            // TODO: remove this once Chrome 58 is released
            remote = selectedCandidatePair.googRemoteAddress.split(':');
            this.remoteAddress = remote[0];
            this.remotePort = Number(remote[1]);
          }
          if (this.remoteAddress) {
            this.remoteFamily = this.remoteAddress.includes(':') ? 'IPv6' : 'IPv4';
          }

          this._debug(
            'connect local: %s:%s remote: %s:%s',
            this.localAddress, this.localPort, this.remoteAddress, this.remotePort
          );
        };

        items.forEach(item => {
          // Spec-compliant
          if (item.type === 'transport' && item.selectedCandidatePairId) {
            setSelectedCandidatePair(candidatePairs[item.selectedCandidatePairId]);
          }

          // Old implementations
          if (
            (item.type === 'googCandidatePair' && item.googActiveConnection === 'true') ||
            ((item.type === 'candidatepair' || item.type === 'candidate-pair') && item.selected)
          ) {
            setSelectedCandidatePair(item);
          }
        });

        // Ignore candidate pair selection in browsers like Safari 11 that do not have any local or remote candidates
        // But wait until at least 1 candidate pair is available
        if (!foundSelectedCandidatePair && (!Object.keys(candidatePairs).length || Object.keys(localCandidates).length)) {
          setTimeout(findCandidatePair, 100);
          return
        } else {
          this._connecting = false;
          this._connected = true;
        }

        if (this._chunk) {
          try {
            this.send(this._chunk);
          } catch (err) {
            return this.destroy(makeError(err, 'ERR_DATA_CHANNEL'))
          }
          this._chunk = null;
          this._debug('sent chunk from "write before connect"');

          var cb = this._cb;
          this._cb = null;
          cb(null);
        }

        // If `bufferedAmountLowThreshold` and 'onbufferedamountlow' are unsupported,
        // fallback to using setInterval to implement backpressure.
        if (typeof this._channel.bufferedAmountLowThreshold !== 'number') {
          this._interval = setInterval(() => this._onInterval(), 150);
          if (this._interval.unref) this._interval.unref();
        }

        this._debug('connect');
        this.emit('connect');
      });
    };
    findCandidatePair();
  }

  _onInterval () {
    if (!this._cb || !this._channel || this._channel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
      return
    }
    this._onChannelBufferedAmountLow();
  }

  _onSignalingStateChange () {
    if (this.destroyed) return

    if (this._pc.signalingState === 'stable' && !this._firstStable) {
      this._isNegotiating = false;

      // HACK: Firefox doesn't yet support removing tracks when signalingState !== 'stable'
      this._debug('flushing sender queue', this._sendersAwaitingStable);
      this._sendersAwaitingStable.forEach(sender => {
        this._pc.removeTrack(sender);
        this._queuedNegotiation = true;
      });
      this._sendersAwaitingStable = [];

      if (this._queuedNegotiation) {
        this._debug('flushing negotiation queue');
        this._queuedNegotiation = false;
        this._needsNegotiation(); // negotiate again
      }

      this._debug('negotiate');
      this.emit('negotiate');
    }
    this._firstStable = false;

    this._debug('signalingStateChange %s', this._pc.signalingState);
    this.emit('signalingStateChange', this._pc.signalingState);
  }

  _onIceCandidate (event) {
    if (this.destroyed) return
    if (event.candidate && this.trickle) {
      this.emit('signal', {
        candidate: {
          candidate: event.candidate.candidate,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          sdpMid: event.candidate.sdpMid
        }
      });
    } else if (!event.candidate && !this._iceComplete) {
      this._iceComplete = true;
      this.emit('_iceComplete');
    }
    // as soon as we've received one valid candidate start timeout
    if (event.candidate) {
      this._startIceCompleteTimeout();
    }
  }

  _onChannelMessage (event) {
    if (this.destroyed) return
    var data = event.data;
    if (data instanceof ArrayBuffer) data = Buffer.from(data);
    this.push(data);
  }

  _onChannelBufferedAmountLow () {
    if (this.destroyed || !this._cb) return
    this._debug('ending backpressure: bufferedAmount %d', this._channel.bufferedAmount);
    var cb = this._cb;
    this._cb = null;
    cb(null);
  }

  _onChannelOpen () {
    if (this._connected || this.destroyed) return
    this._debug('on channel open');
    this._channelReady = true;
    this._maybeReady();
  }

  _onChannelClose () {
    if (this.destroyed) return
    this._debug('on channel close');
    this.destroy();
  }

  _onTrack (event) {
    if (this.destroyed) return

    event.streams.forEach(eventStream => {
      this._debug('on track');
      this.emit('track', event.track, eventStream);

      this._remoteTracks.push({
        track: event.track,
        stream: eventStream
      });

      if (this._remoteStreams.some(remoteStream => {
        return remoteStream.id === eventStream.id
      })) return // Only fire one 'stream' event, even though there may be multiple tracks per stream

      this._remoteStreams.push(eventStream);
      queueMicrotask_1(() => {
        this.emit('stream', eventStream); // ensure all tracks have been added
      });
    });
  }

  _debug () {
    var args = [].slice.call(arguments);
    args[0] = '[' + this._id + '] ' + args[0];
    debug$2.apply(null, args);
  }
}

Peer.WEBRTC_SUPPORT = !!getBrowserRtc();

/**
 * Expose peer and data channel config for overriding all Peer
 * instances. Otherwise, just set opts.config or opts.channelConfig
 * when constructing a Peer.
 */
Peer.config = {
  iceServers: [
    {
      urls: 'stun:stun.l.google.com:19302'
    },
    {
      urls: 'stun:global.stun.twilio.com:3478?transport=udp'
    }
  ],
  sdpSemantics: 'unified-plan'
};

Peer.channelConfig = {};

var simplePeer = Peer;

const ownId = Math.random().toString();
const roomId = 'some-unique-room-id';

var ablyCommonjs_noencryption = createCommonjsModule(function (module) {
/**
 * @license Copyright 2020, Ably
 *
 * Ably JavaScript Library v1.1.24
 * https://github.com/ably/ably-js
 *
 * Ably Realtime Messaging
 * https://www.ably.io
 *
 * Released under the Apache Licence v2.0
 */

var Ably = {};

var global = (typeof window === 'object' && window) || (typeof self === 'object' && self);

/**
 * CryptoJS core components.
 */
var CryptoJS = CryptoJS || (function (Math, undefined$1) {
    /**
     * CryptoJS namespace.
     */
    var C = {};

    /**
     * Library namespace.
     */
    var C_lib = C.lib = {};

    /**
     * Base object for prototypal inheritance.
     */
    var Base = C_lib.Base = (function () {
        function F() {}

        return {
            /**
             * Creates a new object that inherits from this object.
             *
             * @param {Object} overrides Properties to copy into the new object.
             *
             * @return {Object} The new object.
             *
             * @static
             *
             * @example
             *
             *     var MyType = CryptoJS.lib.Base.extend({
             *         field: 'value',
             *
             *         method: function () {
             *         }
             *     });
             */
            extend: function (overrides) {
                // Spawn
                F.prototype = this;
                var subtype = new F();

                // Augment
                if (overrides) {
                    subtype.mixIn(overrides);
                }

                // Create default initializer
                if (!subtype.hasOwnProperty('init')) {
                    subtype.init = function () {
                        subtype.$super.init.apply(this, arguments);
                    };
                }

                // Initializer's prototype is the subtype object
                subtype.init.prototype = subtype;

                // Reference supertype
                subtype.$super = this;

                return subtype;
            },

            /**
             * Extends this object and runs the init method.
             * Arguments to create() will be passed to init().
             *
             * @return {Object} The new object.
             *
             * @static
             *
             * @example
             *
             *     var instance = MyType.create();
             */
            create: function () {
                var instance = this.extend();
                instance.init.apply(instance, arguments);

                return instance;
            },

            /**
             * Initializes a newly created object.
             * Override this method to add some logic when your objects are created.
             *
             * @example
             *
             *     var MyType = CryptoJS.lib.Base.extend({
             *         init: function () {
             *             // ...
             *         }
             *     });
             */
            init: function () {
            },

            /**
             * Copies properties into this object.
             *
             * @param {Object} properties The properties to mix in.
             *
             * @example
             *
             *     MyType.mixIn({
             *         field: 'value'
             *     });
             */
            mixIn: function (properties) {
                for (var propertyName in properties) {
                    if (properties.hasOwnProperty(propertyName)) {
                        this[propertyName] = properties[propertyName];
                    }
                }

                // IE won't copy toString using the loop above
                if (properties.hasOwnProperty('toString')) {
                    this.toString = properties.toString;
                }
            },

            /**
             * Creates a copy of this object.
             *
             * @return {Object} The clone.
             *
             * @example
             *
             *     var clone = instance.clone();
             */
            clone: function () {
                return this.init.prototype.extend(this);
            }
        };
    }());

    /**
     * An array of 32-bit words.
     *
     * @property {Array} words The array of 32-bit words.
     * @property {number} sigBytes The number of significant bytes in this word array.
     */
    var WordArray = C_lib.WordArray = Base.extend({
        /**
         * Initializes a newly created word array.
         *
         * @param {Array} words (Optional) An array of 32-bit words.
         * @param {number} sigBytes (Optional) The number of significant bytes in the words.
         *
         * @example
         *
         *     var wordArray = CryptoJS.lib.WordArray.create();
         *     var wordArray = CryptoJS.lib.WordArray.create([0x00010203, 0x04050607]);
         *     var wordArray = CryptoJS.lib.WordArray.create([0x00010203, 0x04050607], 6);
         */
        init: function (words, sigBytes) {
            words = this.words = words || [];

            if (sigBytes != undefined$1) {
                this.sigBytes = sigBytes;
            } else {
                this.sigBytes = words.length * 4;
            }
        },

        /**
         * Converts this word array to a string.
         *
         * @param {Encoder} encoder (Optional) The encoding strategy to use. Default: CryptoJS.enc.Hex
         *
         * @return {string} The stringified word array.
         *
         * @example
         *
         *     var string = wordArray + '';
         *     var string = wordArray.toString();
         *     var string = wordArray.toString(CryptoJS.enc.Utf8);
         */
        toString: function (encoder) {
            return (encoder || Hex).stringify(this);
        },

        /**
         * Concatenates a word array to this word array.
         *
         * @param {WordArray} wordArray The word array to append.
         *
         * @return {WordArray} This word array.
         *
         * @example
         *
         *     wordArray1.concat(wordArray2);
         */
        concat: function (wordArray) {
            // Shortcuts
            var thisWords = this.words;
            var thatWords = wordArray.words;
            var thisSigBytes = this.sigBytes;
            var thatSigBytes = wordArray.sigBytes;

            // Clamp excess bits
            this.clamp();

            // Concat
            if (thisSigBytes % 4) {
                // Copy one byte at a time
                for (var i = 0; i < thatSigBytes; i++) {
                    var thatByte = (thatWords[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
                    thisWords[(thisSigBytes + i) >>> 2] |= thatByte << (24 - ((thisSigBytes + i) % 4) * 8);
                }
            } else if (thatWords.length > 0xffff) {
                // Copy one word at a time
                for (var i = 0; i < thatSigBytes; i += 4) {
                    thisWords[(thisSigBytes + i) >>> 2] = thatWords[i >>> 2];
                }
            } else {
                // Copy all words at once
                thisWords.push.apply(thisWords, thatWords);
            }
            this.sigBytes += thatSigBytes;

            // Chainable
            return this;
        },

        /**
         * Removes insignificant bits.
         *
         * @example
         *
         *     wordArray.clamp();
         */
        clamp: function () {
            // Shortcuts
            var words = this.words;
            var sigBytes = this.sigBytes;

            // Clamp
            words[sigBytes >>> 2] &= 0xffffffff << (32 - (sigBytes % 4) * 8);
            words.length = Math.ceil(sigBytes / 4);
        },

        /**
         * Creates a copy of this word array.
         *
         * @return {WordArray} The clone.
         *
         * @example
         *
         *     var clone = wordArray.clone();
         */
        clone: function () {
            var clone = Base.clone.call(this);
            clone.words = this.words.slice(0);

            return clone;
        },

        /**
         * Creates a word array filled with random bytes.
         *
         * @param {number} nBytes The number of random bytes to generate.
         *
         * @return {WordArray} The random word array.
         *
         * @static
         *
         * @example
         *
         *     var wordArray = CryptoJS.lib.WordArray.random(16);
         */
        random: function (nBytes) {
            var words = [];

            var r = (function (m_w) {
                var m_w = m_w;
                var m_z = 0x3ade68b1;
                var mask = 0xffffffff;

                return function () {
                    m_z = (0x9069 * (m_z & 0xFFFF) + (m_z >> 0x10)) & mask;
                    m_w = (0x4650 * (m_w & 0xFFFF) + (m_w >> 0x10)) & mask;
                    var result = ((m_z << 0x10) + m_w) & mask;
                    result /= 0x100000000;
                    result += 0.5;
                    return result * (Math.random() > .5 ? 1 : -1);
                }
            });

            for (var i = 0, rcache; i < nBytes; i += 4) {
                var _r = r((rcache || Math.random()) * 0x100000000);

                rcache = _r() * 0x3ade67b7;
                words.push((_r() * 0x100000000) | 0);
            }

            return new WordArray.init(words, nBytes);
        }
    });

    /**
     * Encoder namespace.
     */
    var C_enc = C.enc = {};

    /**
     * Hex encoding strategy.
     */
    var Hex = C_enc.Hex = {
        /**
         * Converts a word array to a hex string.
         *
         * @param {WordArray} wordArray The word array.
         *
         * @return {string} The hex string.
         *
         * @static
         *
         * @example
         *
         *     var hexString = CryptoJS.enc.Hex.stringify(wordArray);
         */
        stringify: function (wordArray) {
            // Shortcuts
            var words = wordArray.words;
            var sigBytes = wordArray.sigBytes;

            // Convert
            var hexChars = [];
            for (var i = 0; i < sigBytes; i++) {
                var bite = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
                hexChars.push((bite >>> 4).toString(16));
                hexChars.push((bite & 0x0f).toString(16));
            }

            return hexChars.join('');
        },

        /**
         * Converts a hex string to a word array.
         *
         * @param {string} hexStr The hex string.
         *
         * @return {WordArray} The word array.
         *
         * @static
         *
         * @example
         *
         *     var wordArray = CryptoJS.enc.Hex.parse(hexString);
         */
        parse: function (hexStr) {
            // Shortcut
            var hexStrLength = hexStr.length;

            // Convert
            var words = [];
            for (var i = 0; i < hexStrLength; i += 2) {
                words[i >>> 3] |= parseInt(hexStr.substr(i, 2), 16) << (24 - (i % 8) * 4);
            }

            return new WordArray.init(words, hexStrLength / 2);
        }
    };

    /**
     * Latin1 encoding strategy.
     */
    var Latin1 = C_enc.Latin1 = {
        /**
         * Converts a word array to a Latin1 string.
         *
         * @param {WordArray} wordArray The word array.
         *
         * @return {string} The Latin1 string.
         *
         * @static
         *
         * @example
         *
         *     var latin1String = CryptoJS.enc.Latin1.stringify(wordArray);
         */
        stringify: function (wordArray) {
            // Shortcuts
            var words = wordArray.words;
            var sigBytes = wordArray.sigBytes;

            // Convert
            var latin1Chars = [];
            for (var i = 0; i < sigBytes; i++) {
                var bite = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
                latin1Chars.push(String.fromCharCode(bite));
            }

            return latin1Chars.join('');
        },

        /**
         * Converts a Latin1 string to a word array.
         *
         * @param {string} latin1Str The Latin1 string.
         *
         * @return {WordArray} The word array.
         *
         * @static
         *
         * @example
         *
         *     var wordArray = CryptoJS.enc.Latin1.parse(latin1String);
         */
        parse: function (latin1Str) {
            // Shortcut
            var latin1StrLength = latin1Str.length;

            // Convert
            var words = [];
            for (var i = 0; i < latin1StrLength; i++) {
                words[i >>> 2] |= (latin1Str.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8);
            }

            return new WordArray.init(words, latin1StrLength);
        }
    };

    /**
     * UTF-8 encoding strategy.
     */
    var Utf8 = C_enc.Utf8 = {
        /**
         * Converts a word array to a UTF-8 string.
         *
         * @param {WordArray} wordArray The word array.
         *
         * @return {string} The UTF-8 string.
         *
         * @static
         *
         * @example
         *
         *     var utf8String = CryptoJS.enc.Utf8.stringify(wordArray);
         */
        stringify: function (wordArray) {
            try {
                return decodeURIComponent(escape(Latin1.stringify(wordArray)));
            } catch (e) {
                throw new Error('Malformed UTF-8 data');
            }
        },

        /**
         * Converts a UTF-8 string to a word array.
         *
         * @param {string} utf8Str The UTF-8 string.
         *
         * @return {WordArray} The word array.
         *
         * @static
         *
         * @example
         *
         *     var wordArray = CryptoJS.enc.Utf8.parse(utf8String);
         */
        parse: function (utf8Str) {
            return Latin1.parse(unescape(encodeURIComponent(utf8Str)));
        }
    };

    /**
     * Abstract buffered block algorithm template.
     *
     * The property blockSize must be implemented in a concrete subtype.
     *
     * @property {number} _minBufferSize The number of blocks that should be kept unprocessed in the buffer. Default: 0
     */
    var BufferedBlockAlgorithm = C_lib.BufferedBlockAlgorithm = Base.extend({
        /**
         * Resets this block algorithm's data buffer to its initial state.
         *
         * @example
         *
         *     bufferedBlockAlgorithm.reset();
         */
        reset: function () {
            // Initial values
            this._data = new WordArray.init();
            this._nDataBytes = 0;
        },

        /**
         * Adds new data to this block algorithm's buffer.
         *
         * @param {WordArray|string} data The data to append. Strings are converted to a WordArray using UTF-8.
         *
         * @example
         *
         *     bufferedBlockAlgorithm._append('data');
         *     bufferedBlockAlgorithm._append(wordArray);
         */
        _append: function (data) {
            // Convert string to WordArray, else assume WordArray already
            if (typeof data == 'string') {
                data = Utf8.parse(data);
            }

            // Append
            this._data.concat(data);
            this._nDataBytes += data.sigBytes;
        },

        /**
         * Processes available data blocks.
         *
         * This method invokes _doProcessBlock(offset), which must be implemented by a concrete subtype.
         *
         * @param {boolean} doFlush Whether all blocks and partial blocks should be processed.
         *
         * @return {WordArray} The processed data.
         *
         * @example
         *
         *     var processedData = bufferedBlockAlgorithm._process();
         *     var processedData = bufferedBlockAlgorithm._process(!!'flush');
         */
        _process: function (doFlush) {
            // Shortcuts
            var data = this._data;
            var dataWords = data.words;
            var dataSigBytes = data.sigBytes;
            var blockSize = this.blockSize;
            var blockSizeBytes = blockSize * 4;

            // Count blocks ready
            var nBlocksReady = dataSigBytes / blockSizeBytes;
            if (doFlush) {
                // Round up to include partial blocks
                nBlocksReady = Math.ceil(nBlocksReady);
            } else {
                // Round down to include only full blocks,
                // less the number of blocks that must remain in the buffer
                nBlocksReady = Math.max((nBlocksReady | 0) - this._minBufferSize, 0);
            }

            // Count words ready
            var nWordsReady = nBlocksReady * blockSize;

            // Count bytes ready
            var nBytesReady = Math.min(nWordsReady * 4, dataSigBytes);

            // Process blocks
            if (nWordsReady) {
                for (var offset = 0; offset < nWordsReady; offset += blockSize) {
                    // Perform concrete-algorithm logic
                    this._doProcessBlock(dataWords, offset);
                }

                // Remove processed words
                var processedWords = dataWords.splice(0, nWordsReady);
                data.sigBytes -= nBytesReady;
            }

            // Return processed words
            return new WordArray.init(processedWords, nBytesReady);
        },

        /**
         * Creates a copy of this object.
         *
         * @return {Object} The clone.
         *
         * @example
         *
         *     var clone = bufferedBlockAlgorithm.clone();
         */
        clone: function () {
            var clone = Base.clone.call(this);
            clone._data = this._data.clone();

            return clone;
        },

        _minBufferSize: 0
    });

    /**
     * Abstract hasher template.
     *
     * @property {number} blockSize The number of 32-bit words this hasher operates on. Default: 16 (512 bits)
     */
    var Hasher = C_lib.Hasher = BufferedBlockAlgorithm.extend({
        /**
         * Configuration options.
         */
        cfg: Base.extend(),

        /**
         * Initializes a newly created hasher.
         *
         * @param {Object} cfg (Optional) The configuration options to use for this hash computation.
         *
         * @example
         *
         *     var hasher = CryptoJS.algo.SHA256.create();
         */
        init: function (cfg) {
            // Apply config defaults
            this.cfg = this.cfg.extend(cfg);

            // Set initial values
            this.reset();
        },

        /**
         * Resets this hasher to its initial state.
         *
         * @example
         *
         *     hasher.reset();
         */
        reset: function () {
            // Reset data buffer
            BufferedBlockAlgorithm.reset.call(this);

            // Perform concrete-hasher logic
            this._doReset();
        },

        /**
         * Updates this hasher with a message.
         *
         * @param {WordArray|string} messageUpdate The message to append.
         *
         * @return {Hasher} This hasher.
         *
         * @example
         *
         *     hasher.update('message');
         *     hasher.update(wordArray);
         */
        update: function (messageUpdate) {
            // Append
            this._append(messageUpdate);

            // Update the hash
            this._process();

            // Chainable
            return this;
        },

        /**
         * Finalizes the hash computation.
         * Note that the finalize operation is effectively a destructive, read-once operation.
         *
         * @param {WordArray|string} messageUpdate (Optional) A final message update.
         *
         * @return {WordArray} The hash.
         *
         * @example
         *
         *     var hash = hasher.finalize();
         *     var hash = hasher.finalize('message');
         *     var hash = hasher.finalize(wordArray);
         */
        finalize: function (messageUpdate) {
            // Final message update
            if (messageUpdate) {
                this._append(messageUpdate);
            }

            // Perform concrete-hasher logic
            var hash = this._doFinalize();

            return hash;
        },

        blockSize: 512/32,

        /**
         * Creates a shortcut function to a hasher's object interface.
         *
         * @param {Hasher} hasher The hasher to create a helper for.
         *
         * @return {Function} The shortcut function.
         *
         * @static
         *
         * @example
         *
         *     var SHA256 = CryptoJS.lib.Hasher._createHelper(CryptoJS.algo.SHA256);
         */
        _createHelper: function (hasher) {
            return function (message, cfg) {
                return new hasher.init(cfg).finalize(message);
            };
        },

        /**
         * Creates a shortcut function to the HMAC's object interface.
         *
         * @param {Hasher} hasher The hasher to use in this HMAC helper.
         *
         * @return {Function} The shortcut function.
         *
         * @static
         *
         * @example
         *
         *     var HmacSHA256 = CryptoJS.lib.Hasher._createHmacHelper(CryptoJS.algo.SHA256);
         */
        _createHmacHelper: function (hasher) {
            return function (message, key) {
                return new C_algo.HMAC.init(hasher, key).finalize(message);
            };
        }
    });

    /**
     * Algorithm namespace.
     */
    var C_algo = C.algo = {};

    return C;
}(Math));

(function (Math) {
    // Shortcuts
    var C = CryptoJS;
    var C_lib = C.lib;
    var WordArray = C_lib.WordArray;
    var Hasher = C_lib.Hasher;
    var C_algo = C.algo;

    // Initialization and round constants tables
    var H = [];
    var K = [];

    // Compute constants
    (function () {
        function isPrime(n) {
            var sqrtN = Math.sqrt(n);
            for (var factor = 2; factor <= sqrtN; factor++) {
                if (!(n % factor)) {
                    return false;
                }
            }

            return true;
        }

        function getFractionalBits(n) {
            return ((n - (n | 0)) * 0x100000000) | 0;
        }

        var n = 2;
        var nPrime = 0;
        while (nPrime < 64) {
            if (isPrime(n)) {
                if (nPrime < 8) {
                    H[nPrime] = getFractionalBits(Math.pow(n, 1 / 2));
                }
                K[nPrime] = getFractionalBits(Math.pow(n, 1 / 3));

                nPrime++;
            }

            n++;
        }
    }());

    // Reusable object
    var W = [];

    /**
     * SHA-256 hash algorithm.
     */
    var SHA256 = C_algo.SHA256 = Hasher.extend({
        _doReset: function () {
            this._hash = new WordArray.init(H.slice(0));
        },

        _doProcessBlock: function (M, offset) {
            // Shortcut
            var H = this._hash.words;

            // Working variables
            var a = H[0];
            var b = H[1];
            var c = H[2];
            var d = H[3];
            var e = H[4];
            var f = H[5];
            var g = H[6];
            var h = H[7];

            // Computation
            for (var i = 0; i < 64; i++) {
                if (i < 16) {
                    W[i] = M[offset + i] | 0;
                } else {
                    var gamma0x = W[i - 15];
                    var gamma0  = ((gamma0x << 25) | (gamma0x >>> 7))  ^
                                  ((gamma0x << 14) | (gamma0x >>> 18)) ^
                                   (gamma0x >>> 3);

                    var gamma1x = W[i - 2];
                    var gamma1  = ((gamma1x << 15) | (gamma1x >>> 17)) ^
                                  ((gamma1x << 13) | (gamma1x >>> 19)) ^
                                   (gamma1x >>> 10);

                    W[i] = gamma0 + W[i - 7] + gamma1 + W[i - 16];
                }

                var ch  = (e & f) ^ (~e & g);
                var maj = (a & b) ^ (a & c) ^ (b & c);

                var sigma0 = ((a << 30) | (a >>> 2)) ^ ((a << 19) | (a >>> 13)) ^ ((a << 10) | (a >>> 22));
                var sigma1 = ((e << 26) | (e >>> 6)) ^ ((e << 21) | (e >>> 11)) ^ ((e << 7)  | (e >>> 25));

                var t1 = h + sigma1 + ch + K[i] + W[i];
                var t2 = sigma0 + maj;

                h = g;
                g = f;
                f = e;
                e = (d + t1) | 0;
                d = c;
                c = b;
                b = a;
                a = (t1 + t2) | 0;
            }

            // Intermediate hash value
            H[0] = (H[0] + a) | 0;
            H[1] = (H[1] + b) | 0;
            H[2] = (H[2] + c) | 0;
            H[3] = (H[3] + d) | 0;
            H[4] = (H[4] + e) | 0;
            H[5] = (H[5] + f) | 0;
            H[6] = (H[6] + g) | 0;
            H[7] = (H[7] + h) | 0;
        },

        _doFinalize: function () {
            // Shortcuts
            var data = this._data;
            var dataWords = data.words;

            var nBitsTotal = this._nDataBytes * 8;
            var nBitsLeft = data.sigBytes * 8;

            // Add padding
            dataWords[nBitsLeft >>> 5] |= 0x80 << (24 - nBitsLeft % 32);
            dataWords[(((nBitsLeft + 64) >>> 9) << 4) + 14] = Math.floor(nBitsTotal / 0x100000000);
            dataWords[(((nBitsLeft + 64) >>> 9) << 4) + 15] = nBitsTotal;
            data.sigBytes = dataWords.length * 4;

            // Hash final blocks
            this._process();

            // Return final computed hash
            return this._hash;
        },

        clone: function () {
            var clone = Hasher.clone.call(this);
            clone._hash = this._hash.clone();

            return clone;
        }
    });

    /**
     * Shortcut function to the hasher's object interface.
     *
     * @param {WordArray|string} message The message to hash.
     *
     * @return {WordArray} The hash.
     *
     * @static
     *
     * @example
     *
     *     var hash = CryptoJS.SHA256('message');
     *     var hash = CryptoJS.SHA256(wordArray);
     */
    C.SHA256 = Hasher._createHelper(SHA256);

    /**
     * Shortcut function to the HMAC's object interface.
     *
     * @param {WordArray|string} message The message to hash.
     * @param {WordArray|string} key The secret key.
     *
     * @return {WordArray} The HMAC.
     *
     * @static
     *
     * @example
     *
     *     var hmac = CryptoJS.HmacSHA256(message, key);
     */
    C.HmacSHA256 = Hasher._createHmacHelper(SHA256);
}(Math));

(function () {
    // Shortcuts
    var C = CryptoJS;
    var C_lib = C.lib;
    var Base = C_lib.Base;
    var C_enc = C.enc;
    var Utf8 = C_enc.Utf8;
    var C_algo = C.algo;

    /**
     * HMAC algorithm.
     */
    var HMAC = C_algo.HMAC = Base.extend({
        /**
         * Initializes a newly created HMAC.
         *
         * @param {Hasher} hasher The hash algorithm to use.
         * @param {WordArray|string} key The secret key.
         *
         * @example
         *
         *     var hmacHasher = CryptoJS.algo.HMAC.create(CryptoJS.algo.SHA256, key);
         */
        init: function (hasher, key) {
            // Init hasher
            hasher = this._hasher = new hasher.init();

            // Convert string to WordArray, else assume WordArray already
            if (typeof key == 'string') {
                key = Utf8.parse(key);
            }

            // Shortcuts
            var hasherBlockSize = hasher.blockSize;
            var hasherBlockSizeBytes = hasherBlockSize * 4;

            // Allow arbitrary length keys
            if (key.sigBytes > hasherBlockSizeBytes) {
                key = hasher.finalize(key);
            }

            // Clamp excess bits
            key.clamp();

            // Clone key for inner and outer pads
            var oKey = this._oKey = key.clone();
            var iKey = this._iKey = key.clone();

            // Shortcuts
            var oKeyWords = oKey.words;
            var iKeyWords = iKey.words;

            // XOR keys with pad constants
            for (var i = 0; i < hasherBlockSize; i++) {
                oKeyWords[i] ^= 0x5c5c5c5c;
                iKeyWords[i] ^= 0x36363636;
            }
            oKey.sigBytes = iKey.sigBytes = hasherBlockSizeBytes;

            // Set initial values
            this.reset();
        },

        /**
         * Resets this HMAC to its initial state.
         *
         * @example
         *
         *     hmacHasher.reset();
         */
        reset: function () {
            // Shortcut
            var hasher = this._hasher;

            // Reset
            hasher.reset();
            hasher.update(this._iKey);
        },

        /**
         * Updates this HMAC with a message.
         *
         * @param {WordArray|string} messageUpdate The message to append.
         *
         * @return {HMAC} This HMAC instance.
         *
         * @example
         *
         *     hmacHasher.update('message');
         *     hmacHasher.update(wordArray);
         */
        update: function (messageUpdate) {
            this._hasher.update(messageUpdate);

            // Chainable
            return this;
        },

        /**
         * Finalizes the HMAC computation.
         * Note that the finalize operation is effectively a destructive, read-once operation.
         *
         * @param {WordArray|string} messageUpdate (Optional) A final message update.
         *
         * @return {WordArray} The HMAC.
         *
         * @example
         *
         *     var hmac = hmacHasher.finalize();
         *     var hmac = hmacHasher.finalize('message');
         *     var hmac = hmacHasher.finalize(wordArray);
         */
        finalize: function (messageUpdate) {
            // Shortcut
            var hasher = this._hasher;

            // Compute HMAC
            var innerHash = hasher.finalize(messageUpdate);
            hasher.reset();
            var hmac = hasher.finalize(this._oKey.clone().concat(innerHash));

            return hmac;
        }
    });
}());

(function () {
    // Shortcuts
    var C = CryptoJS;
    var C_lib = C.lib;
    var WordArray = C_lib.WordArray;
    var C_enc = C.enc;

    /**
     * Base64 encoding strategy.
     */
    var Base64 = C_enc.Base64 = {
        /**
         * Converts a word array to a Base64 string.
         *
         * @param {WordArray} wordArray The word array.
         *
         * @return {string} The Base64 string.
         *
         * @static
         *
         * @example
         *
         *     var base64String = CryptoJS.enc.Base64.stringify(wordArray);
         */
        stringify: function (wordArray) {
            // Shortcuts
            var words = wordArray.words;
            var sigBytes = wordArray.sigBytes;
            var map = this._map;

            // Clamp excess bits
            wordArray.clamp();

            // Convert
            var base64Chars = [];
            for (var i = 0; i < sigBytes; i += 3) {
                var byte1 = (words[i >>> 2]       >>> (24 - (i % 4) * 8))       & 0xff;
                var byte2 = (words[(i + 1) >>> 2] >>> (24 - ((i + 1) % 4) * 8)) & 0xff;
                var byte3 = (words[(i + 2) >>> 2] >>> (24 - ((i + 2) % 4) * 8)) & 0xff;

                var triplet = (byte1 << 16) | (byte2 << 8) | byte3;

                for (var j = 0; (j < 4) && (i + j * 0.75 < sigBytes); j++) {
                    base64Chars.push(map.charAt((triplet >>> (6 * (3 - j))) & 0x3f));
                }
            }

            // Add padding
            var paddingChar = map.charAt(64);
            if (paddingChar) {
                while (base64Chars.length % 4) {
                    base64Chars.push(paddingChar);
                }
            }

            return base64Chars.join('');
        },

        /**
         * Converts a Base64 string to a word array.
         *
         * @param {string} base64Str The Base64 string.
         *
         * @return {WordArray} The word array.
         *
         * @static
         *
         * @example
         *
         *     var wordArray = CryptoJS.enc.Base64.parse(base64String);
         */
        parse: function (base64Str) {
            // Shortcuts
            var base64StrLength = base64Str.length;
            var map = this._map;

            // Ignore padding
            var paddingChar = map.charAt(64);
            if (paddingChar) {
                var paddingIndex = base64Str.indexOf(paddingChar);
                if (paddingIndex != -1) {
                    base64StrLength = paddingIndex;
                }
            }

            // Convert
            var words = [];
            var nBytes = 0;
            for (var i = 0; i < base64StrLength; i++) {
                if (i % 4) {
                    var bits1 = map.indexOf(base64Str.charAt(i - 1)) << ((i % 4) * 2);
                    var bits2 = map.indexOf(base64Str.charAt(i)) >>> (6 - (i % 4) * 2);
                    words[nBytes >>> 2] |= (bits1 | bits2) << (24 - (nBytes % 4) * 8);
                    nBytes++;
                }
            }

            return WordArray.create(words, nBytes);
        },

        _map: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
    };
}());

var DomEvent = (function() {
	function DomEvent() {}

	DomEvent.addListener = function(target, event, listener) {
		if(target.addEventListener) {
			target.addEventListener(event, listener, false);
		} else {
			target.attachEvent('on'+event, function() { listener.apply(target, arguments); });
		}
	};

	DomEvent.removeListener = function(target, event, listener) {
		if(target.removeEventListener) {
			target.removeEventListener(event, listener, false);
		} else {
			target.detachEvent('on'+event, function() { listener.apply(target, arguments); });
		}
	};

	DomEvent.addMessageListener = function(target, listener) {
		DomEvent.addListener(target, 'message', listener);
	};

	DomEvent.removeMessageListener = function(target, listener) {
		DomEvent.removeListener(target, 'message', listener);
	};

	DomEvent.addUnloadListener = function(listener) {
		DomEvent.addListener(global, 'unload', listener);
	};

	return DomEvent;
})();

var msgpack = (function() {

	var exports = {};

	exports.inspect = inspect;
	function inspect(buffer) {
		if (buffer === undefined)
			return "undefined";
		var view;
		var type;
		if ( buffer instanceof ArrayBuffer) {
			type = "ArrayBuffer";
			view = new DataView(buffer);
		} else if ( buffer instanceof DataView) {
			type = "DataView";
			view = buffer;
		}
		if (!view)
			return JSON.stringify(buffer);
		var bytes = [];
		for (var i = 0; i < buffer.byteLength; i++) {
			if (i > 20) {
				bytes.push("...");
				break;
			}
			var byte_ = view.getUint8(i).toString(16);
			if (byte_.length === 1)
				byte_ = "0" + byte_;
			bytes.push(byte_);
		}
		return "<" + type + " " + bytes.join(" ") + ">";
	}

	// Encode string as utf8 into dataview at offset
	exports.utf8Write = utf8Write;
	function utf8Write(view, offset, string) {
		var byteLength = view.byteLength;
		for (var i = 0, l = string.length; i < l; i++) {
			var codePoint = string.charCodeAt(i);

			// One byte of UTF-8
			if (codePoint < 0x80) {
				view.setUint8(offset++, codePoint >>> 0 & 0x7f | 0x00);
				continue;
			}

			// Two bytes of UTF-8
			if (codePoint < 0x800) {
				view.setUint8(offset++, codePoint >>> 6 & 0x1f | 0xc0);
				view.setUint8(offset++, codePoint >>> 0 & 0x3f | 0x80);
				continue;
			}

			// Three bytes of UTF-8.
			if (codePoint < 0x10000) {
				view.setUint8(offset++, codePoint >>> 12 & 0x0f | 0xe0);
				view.setUint8(offset++, codePoint >>> 6 & 0x3f | 0x80);
				view.setUint8(offset++, codePoint >>> 0 & 0x3f | 0x80);
				continue;
			}

			// Four bytes of UTF-8
			if (codePoint < 0x110000) {
				view.setUint8(offset++, codePoint >>> 18 & 0x07 | 0xf0);
				view.setUint8(offset++, codePoint >>> 12 & 0x3f | 0x80);
				view.setUint8(offset++, codePoint >>> 6 & 0x3f | 0x80);
				view.setUint8(offset++, codePoint >>> 0 & 0x3f | 0x80);
				continue;
			}
			throw new Error("bad codepoint " + codePoint);
		}
	}


	exports.utf8Read = utf8Read;
	function utf8Read(view, offset, length) {
		var string = "";
		for (var i = offset, end = offset + length; i < end; i++) {
			var byte_ = view.getUint8(i);
			// One byte character
			if ((byte_ & 0x80) === 0x00) {
				string += String.fromCharCode(byte_);
				continue;
			}
			// Two byte character
			if ((byte_ & 0xe0) === 0xc0) {
				string += String.fromCharCode(((byte_ & 0x0f) << 6) | (view.getUint8(++i) & 0x3f));
				continue;
			}
			// Three byte character
			if ((byte_ & 0xf0) === 0xe0) {
				string += String.fromCharCode(((byte_ & 0x0f) << 12) | ((view.getUint8(++i) & 0x3f) << 6) | ((view.getUint8(++i) & 0x3f) << 0));
				continue;
			}
			// Four byte character
			if ((byte_ & 0xf8) === 0xf0) {
				string += String.fromCharCode(((byte_ & 0x07) << 18) | ((view.getUint8(++i) & 0x3f) << 12) | ((view.getUint8(++i) & 0x3f) << 6) | ((view.getUint8(++i) & 0x3f) << 0));
				continue;
			}
			throw new Error("Invalid byte " + byte_.toString(16));
		}
		return string;
	}


	exports.utf8ByteCount = utf8ByteCount;
	function utf8ByteCount(string) {
		var count = 0;
		for (var i = 0, l = string.length; i < l; i++) {
			var codePoint = string.charCodeAt(i);
			if (codePoint < 0x80) {
				count += 1;
				continue;
			}
			if (codePoint < 0x800) {
				count += 2;
				continue;
			}
			if (codePoint < 0x10000) {
				count += 3;
				continue;
			}
			if (codePoint < 0x110000) {
				count += 4;
				continue;
			}
			throw new Error("bad codepoint " + codePoint);
		}
		return count;
	}


	exports.encode = function(value, sparse) {
		var size = sizeof(value, sparse);
		if(size == 0)
			return undefined;
		var buffer = new ArrayBuffer(size);
		var view = new DataView(buffer);
		encode(value, view, 0, sparse);
		return buffer;
	};

	exports.decode = decode;

	var SH_L_32 = (1 << 16) * (1 << 16), SH_R_32 = 1 / SH_L_32;
	function getInt64(view, offset) {
		offset = offset || 0;
		return view.getInt32(offset) * SH_L_32 + view.getUint32(offset + 4);
	}

	function getUint64(view, offset) {
		offset = offset || 0;
		return view.getUint32(offset) * SH_L_32 + view.getUint32(offset + 4);
	}

	function setInt64(view, offset, val) {
		if (val < 0x8000000000000000) {
			view.setInt32(offset, Math.floor(val * SH_R_32));
			view.setInt32(offset + 4, val & -1);
		} else {
			view.setUint32(offset, 0x7fffffff);
			view.setUint32(offset + 4, 0x7fffffff);
		}
	}

	function setUint64(view, offset, val) {
		if (val < 0x10000000000000000) {
			view.setUint32(offset, Math.floor(val * SH_R_32));
			view.setInt32(offset + 4, val & -1);
		} else {
			view.setUint32(offset, 0xffffffff);
			view.setUint32(offset + 4, 0xffffffff);
		}
	}

// https://gist.github.com/frsyuki/5432559 - v5 spec
//
// I've used one extension point from `fixext 1` to store `undefined`. On the wire this
// should translate to exactly 0xd40000
//
// +--------+--------+--------+
// |  0xd4  |  0x00  |  0x00  |
// +--------+--------+--------+
//    ^ fixext |        ^ value part unused (fixed to be 0)
//             ^ indicates undefined value
//

	function Decoder(view, offset) {
		this.offset = offset || 0;
		this.view = view;
	}


	Decoder.prototype.map = function(length) {
		var value = {};
		for (var i = 0; i < length; i++) {
			var key = this.parse();
			value[key] = this.parse();
		}
		return value;
	};

	Decoder.prototype.bin = Decoder.prototype.buf = function(length) {
		var value = new ArrayBuffer(length);
		(new Uint8Array(value)).set(new Uint8Array(this.view.buffer, this.offset, length), 0);
		this.offset += length;
		return value;
	};

	Decoder.prototype.str = function(length) {
		var value = utf8Read(this.view, this.offset, length);
		this.offset += length;
		return value;
	};

	Decoder.prototype.array = function(length) {
		var value = new Array(length);
		for (var i = 0; i < length; i++) {
			value[i] = this.parse();
		}
		return value;
	};

	Decoder.prototype.ext = function(length) {
		var value = {};
		// Get the type byte
		value['type'] = this.view.getInt8(this.offset);
		this.offset++;
		// Get the data array (length)
		value['data'] = this.buf(length);
		this.offset += length;
		return value;
	};

	Decoder.prototype.parse = function() {
		var type = this.view.getUint8(this.offset);
		var value, length;

		// Positive FixInt - 0xxxxxxx
		if ((type & 0x80) === 0x00) {
			this.offset++;
			return type;
		}

		// FixMap - 1000xxxx
		if ((type & 0xf0) === 0x80) {
			length = type & 0x0f;
			this.offset++;
			return this.map(length);
		}

		// FixArray - 1001xxxx
		if ((type & 0xf0) === 0x90) {
			length = type & 0x0f;
			this.offset++;
			return this.array(length);
		}

		// FixStr - 101xxxxx
		if ((type & 0xe0) === 0xa0) {
			length = type & 0x1f;
			this.offset++;
			return this.str(length);
		}

		// Negative FixInt - 111xxxxx
		if ((type & 0xe0) === 0xe0) {
			value = this.view.getInt8(this.offset);
			this.offset++;
			return value;
		}

		switch (type) {

			// nil
			case 0xc0:
				this.offset++;
				return null;

			// 0xc1 never used - use for undefined (NON-STANDARD)
			case 0xc1:
				this.offset++;
				return undefined;

			// false
			case 0xc2:
				this.offset++;
				return false;

			// true
			case 0xc3:
				this.offset++;
				return true;

			// bin 8
			case 0xc4:
				length = this.view.getUint8(this.offset + 1);
				this.offset += 2;
				return this.bin(length);

			// bin 16
			case 0xc5:
				length = this.view.getUint16(this.offset + 1);
				this.offset += 3;
				return this.bin(length);

			// bin 32
			case 0xc6:
				length = this.view.getUint32(this.offset + 1);
				this.offset += 5;
				return this.bin(length);

			// ext 8
			case 0xc7:
				length = this.view.getUint8(this.offset + 1);
				this.offset += 2;
				return this.ext(length);

			// ext 16
			case 0xc8:
				length = this.view.getUint16(this.offset + 1);
				this.offset += 3;
				return this.ext(length);

			// ext 32
			case 0xc9:
				length = this.view.getUint32(this.offset + 1);
				this.offset += 5;
				return this.ext(length);

			// float 32
			case 0xca:
				value = this.view.getFloat32(this.offset + 1);
				this.offset += 5;
				return value;

			// float 64
			case 0xcb:
				value = this.view.getFloat64(this.offset + 1);
				this.offset += 9;
				return value;

			// uint8
			case 0xcc:
				value = this.view.getUint8(this.offset + 1);
				this.offset += 2;
				return value;

			// uint 16
			case 0xcd:
				value = this.view.getUint16(this.offset + 1);
				this.offset += 3;
				return value;

			// uint 32
			case 0xce:
				value = this.view.getUint32(this.offset + 1);
				this.offset += 5;
				return value;

			// uint 64
			case 0xcf:
				value = getUint64(this.view, this.offset + 1);
				this.offset += 9;
				return value;

			// int 8
			case 0xd0:
				value = this.view.getInt8(this.offset + 1);
				this.offset += 2;
				return value;

			// int 16
			case 0xd1:
				value = this.view.getInt16(this.offset + 1);
				this.offset += 3;
				return value;

			// int 32
			case 0xd2:
				value = this.view.getInt32(this.offset + 1);
				this.offset += 5;
				return value;

			// int 64
			case 0xd3:
				value = getInt64(this.view, this.offset + 1);
				this.offset += 9;
				return value;

			// fixext 1
			case 0xd4:
				length = 1;
				this.offset++;
				return this.ext(length);

			// fixext 2
			case 0xd5:
				length = 2;
				this.offset++;
				return this.ext(length);

			// fixext 4
			case 0xd6:
				length = 4;
				this.offset++;
				return this.ext(length);

			// fixext 8
			case 0xd7:
				length = 8;
				this.offset++;
				return this.ext(length);

			// fixext 16
			case 0xd8:
				length = 16;
				this.offset++;
				return this.ext(length);

			// str8
			case 0xd9:
				length = this.view.getUint8(this.offset + 1);
				this.offset += 2;
				return this.str(length);

			// str 16
			case 0xda:
				length = this.view.getUint16(this.offset + 1);
				this.offset += 3;
				return this.str(length);

			// str 32
			case 0xdb:
				length = this.view.getUint32(this.offset + 1);
				this.offset += 5;
				return this.str(length);

			// array 16
			case 0xdc:
				length = this.view.getUint16(this.offset + 1);
				this.offset += 3;
				return this.array(length);

			// array 32
			case 0xdd:
				length = this.view.getUint32(this.offset + 1);
				this.offset += 5;
				return this.array(length);

			// map 16
			case 0xde:
				length = this.view.getUint16(this.offset + 1);
				this.offset += 3;
				return this.map(length);

			// map 32
			case 0xdf:
				length = this.view.getUint32(this.offset + 1);
				this.offset += 5;
				return this.map(length);
		}
		throw new Error("Unknown type 0x" + type.toString(16));
	};

	function decode(buffer) {
		var view = new DataView(buffer);
		var decoder = new Decoder(view);
		var value = decoder.parse();
		if (decoder.offset !== buffer.byteLength)
			throw new Error((buffer.byteLength - decoder.offset) + " trailing bytes");
		return value;
	}

	function encodeableKeys(value, sparse) {
		return Utils.keysArray(value, true).filter(function (e) {
			var val = value[e], type = typeof(val);
			return (!sparse || (val !== undefined && val !== null)) && ('function' !== type || !!val.toJSON);
		})
	}

	function encode(value, view, offset, sparse) {
		var type = typeof value;

		// Strings Bytes
		// There are four string types: fixstr/str8/str16/str32
		if (type === "string") {
			var length = utf8ByteCount(value);

			// fixstr
			if (length < 0x20) {
				view.setUint8(offset, length | 0xa0);
				utf8Write(view, offset + 1, value);
				return 1 + length;
			}

			// str8
			if (length < 0x100) {
				view.setUint8(offset, 0xd9);
				view.setUint8(offset + 1, length);
				utf8Write(view, offset + 2, value);
				return 2 + length;
			}

			// str16
			if (length < 0x10000) {
				view.setUint8(offset, 0xda);
				view.setUint16(offset + 1, length);
				utf8Write(view, offset + 3, value);
				return 3 + length;
			}
			// str32
			if (length < 0x100000000) {
				view.setUint8(offset, 0xdb);
				view.setUint32(offset + 1, length);
				utf8Write(view, offset + 5, value);
				return 5 + length;
			}
		}

		if(ArrayBuffer.isView && ArrayBuffer.isView(value)) {
			// extract the arraybuffer and fallthrough
			value = value.buffer;
		}

		// There are three bin types: bin8/bin16/bin32
		if (value instanceof ArrayBuffer) {
			var length = value.byteLength;

			// bin8
			if (length < 0x100) {
				view.setUint8(offset, 0xc4);
				view.setUint8(offset + 1, length);
				(new Uint8Array(view.buffer)).set(new Uint8Array(value), offset + 2);
				return 2 + length;
			}

			// bin16
			if (length < 0x10000) {
				view.setUint8(offset, 0xc5);
				view.setUint16(offset + 1, length);
				(new Uint8Array(view.buffer)).set(new Uint8Array(value), offset + 3);
				return 3 + length;
			}

			// bin 32
			if (length < 0x100000000) {
				view.setUint8(offset, 0xc6);
				view.setUint32(offset + 1, length);
				(new Uint8Array(view.buffer)).set(new Uint8Array(value), offset + 5);
				return 5 + length;
			}
		}

		if (type === "number") {

			// Floating Point
			// NOTE: We're always using float64
			if (Math.floor(value) !== value) {
				view.setUint8(offset, 0xcb);
				view.setFloat64(offset + 1, value);
				return 9;
			}

			// Integers
			if (value >= 0) {
				// positive fixnum
				if (value < 0x80) {
					view.setUint8(offset, value);
					return 1;
				}
				// uint 8
				if (value < 0x100) {
					view.setUint8(offset, 0xcc);
					view.setUint8(offset + 1, value);
					return 2;
				}
				// uint 16
				if (value < 0x10000) {
					view.setUint8(offset, 0xcd);
					view.setUint16(offset + 1, value);
					return 3;
				}
				// uint 32
				if (value < 0x100000000) {
					view.setUint8(offset, 0xce);
					view.setUint32(offset + 1, value);
					return 5;
				}
				// uint 64
				if (value < 0x10000000000000000) {
					view.setUint8(offset, 0xcf);
					setUint64(view, offset + 1, value);
					return 9;
				}
				throw new Error("Number too big 0x" + value.toString(16));
			}

			// negative fixnum
			if (value >= -0x20) {
				view.setInt8(offset, value);
				return 1;
			}
			// int 8
			if (value >= -0x80) {
				view.setUint8(offset, 0xd0);
				view.setInt8(offset + 1, value);
				return 2;
			}
			// int 16
			if (value >= -0x8000) {
				view.setUint8(offset, 0xd1);
				view.setInt16(offset + 1, value);
				return 3;
			}
			// int 32
			if (value >= -0x80000000) {
				view.setUint8(offset, 0xd2);
				view.setInt32(offset + 1, value);
				return 5;
			}
			// int 64
			if (value >= -0x8000000000000000) {
				view.setUint8(offset, 0xd3);
				setInt64(view, offset + 1, value);
				return 9;
			}
			throw new Error("Number too small -0x" + (-value).toString(16).substr(1));
		}

		// undefined - use d4 (NON-STANDARD)
		if (type === "undefined") {
			if(sparse) return 0;
			view.setUint8(offset, 0xd4);
			view.setUint8(offset + 1, 0x00);
			view.setUint8(offset + 2, 0x00);
			return 3;
		}

		// null
		if (value === null) {
			if(sparse) return 0;
			view.setUint8(offset, 0xc0);
			return 1;
		}

		// Boolean
		if (type === "boolean") {
			view.setUint8(offset, value ? 0xc3 : 0xc2);
			return 1;
		}

		if('function' === typeof value.toJSON)
			return encode(value.toJSON(), view, offset, sparse);

		// Container Types
		if (type === "object") {
			var length, size = 0;
			var isArray = Array.isArray(value);

			if (isArray) {
				length = value.length;
			} else {
				var keys = encodeableKeys(value, sparse);
				length = keys.length;
			}

			var size;
			if (length < 0x10) {
				view.setUint8(offset, length | ( isArray ? 0x90 : 0x80));
				size = 1;
			} else if (length < 0x10000) {
				view.setUint8(offset, isArray ? 0xdc : 0xde);
				view.setUint16(offset + 1, length);
				size = 3;
			} else if (length < 0x100000000) {
				view.setUint8(offset, isArray ? 0xdd : 0xdf);
				view.setUint32(offset + 1, length);
				size = 5;
			}

			if (isArray) {
				for (var i = 0; i < length; i++) {
					size += encode(value[i], view, offset + size, sparse);
				}
			} else {
				for (var i = 0; i < length; i++) {
					var key = keys[i];
					size += encode(key, view, offset + size);
					size += encode(value[key], view, offset + size, sparse);
				}
			}

			return size;
		}
		if(type === "function")
			return 0;

		throw new Error("Unknown type " + type);
	}

	function sizeof(value, sparse) {
		var type = typeof value;

		// fixstr or str8 or str16 or str32
		if (type === "string") {
			var length = utf8ByteCount(value);
			if (length < 0x20) {
				return 1 + length;
			}
			if (length < 0x100) {
				return 2 + length;
			}
			if (length < 0x10000) {
				return 3 + length;
			}
			if (length < 0x100000000) {
				return 5 + length;
			}
		}

		if(ArrayBuffer.isView && ArrayBuffer.isView(value)) {
			// extract the arraybuffer and fallthrough
			value = value.buffer;
		}

		// bin8 or bin16 or bin32
		if (value instanceof ArrayBuffer) {
			var length = value.byteLength;
			if (length < 0x100) {
				return 2 + length;
			}
			if (length < 0x10000) {
				return 3 + length;
			}
			if (length < 0x100000000) {
				return 5 + length;
			}
		}

		if (type === "number") {
			// Floating Point (32 bits)
			// double
			if (Math.floor(value) !== value)
				return 9;

			// Integers
			if (value >= 0) {
				// positive fixint
				if (value < 0x80)
					return 1;
				// uint 8
				if (value < 0x100)
					return 2;
				// uint 16
				if (value < 0x10000)
					return 3;
				// uint 32
				if (value < 0x100000000)
					return 5;
				// uint 64
				if (value < 0x10000000000000000)
					return 9;
				// Too big
				throw new Error("Number too big 0x" + value.toString(16));
			}
			// negative fixint
			if (value >= -0x20)
				return 1;
			// int 8
			if (value >= -0x80)
				return 2;
			// int 16
			if (value >= -0x8000)
				return 3;
			// int 32
			if (value >= -0x80000000)
				return 5;
			// int 64
			if (value >= -0x8000000000000000)
				return 9;
			// Too small
			throw new Error("Number too small -0x" + value.toString(16).substr(1));
		}

		// Boolean
		if (type === "boolean") return 1;

		// undefined, null
		if (value === null) return sparse ? 0 : 1;
		if (value === undefined) return sparse ? 0 : 3;

		if('function' === typeof value.toJSON)
			return sizeof(value.toJSON(), sparse);

		// Container Types
		if (type === "object") {
			var length, size = 0;
			if (Array.isArray(value)) {
				length = value.length;
				for (var i = 0; i < length; i++) {
					size += sizeof(value[i], sparse);
				}
			} else {
				var keys = encodeableKeys(value, sparse);
				length = keys.length;
				for (var i = 0; i < length; i++) {
					var key = keys[i];
					size += sizeof(key) + sizeof(value[key], sparse);
				}
			}
			if (length < 0x10) {
				return 1 + size;
			}
			if (length < 0x10000) {
				return 3 + size;
			}
			if (length < 0x100000000) {
				return 5 + size;
			}
			throw new Error("Array or object too long 0x" + length.toString(16));
		}
		if(type === "function")
			return 0;

		throw new Error("Unknown type " + type);
	}

	return exports;
})();

if(typeof Window === 'undefined' && typeof WorkerGlobalScope === 'undefined') {
	console.log("Warning: this distribution of Ably is intended for browsers. On nodejs, please use the 'ably' package on npm");
}

function allowComet() {
	/* xhr requests from local files are unreliable in some browsers, such as Chrome 65 and higher -- see eg
	 * https://stackoverflow.com/questions/49256429/chrome-65-unable-to-make-post-requests-from-local-files-to-flask
	 * So if websockets are supported, then just forget about comet transports and use that */
	var loc = global.location;
	return (!global.WebSocket || !loc || !loc.origin || loc.origin.indexOf("http") > -1);
}

var userAgent = global.navigator && global.navigator.userAgent.toString();
var currentUrl = global.location && global.location.href;

var Platform = {
	libver: 'js-web',
	logTimestamps: true,
	userAgent: userAgent,
	currentUrl: currentUrl,
	noUpgrade: userAgent && userAgent.match(/MSIE\s8\.0/),
	binaryType: 'arraybuffer',
	WebSocket: global.WebSocket || global.MozWebSocket,
	xhrSupported: global.XMLHttpRequest && 'withCredentials' in new XMLHttpRequest(),
	jsonpSupported: typeof(document) !== 'undefined',
	allowComet: allowComet(),
	streamingSupported: true,
	useProtocolHeartbeats: true,
	createHmac: null,
	msgpack: msgpack,
	supportsBinary: !!global.TextDecoder,
	preferBinary: false,
	ArrayBuffer: global.ArrayBuffer,
	atob: global.atob,
	nextTick: function(f) { setTimeout(f, 0); },
	addEventListener: global.addEventListener,
	inspect: JSON.stringify,
	stringByteSize: function(str) {
		/* str.length will be an underestimate for non-ascii strings. But if we're
		 * in a browser too old to support TextDecoder, not much we can do. Better
		 * to underestimate, so if we do go over-size, the server will reject the
		 * message */
		return global.TextDecoder &&
			(new global.TextEncoder().encode(str)).length ||
			str.length;
	},
	TextEncoder: global.TextEncoder,
	TextDecoder: global.TextDecoder,
	Promise: global.Promise,
	getRandomValues: (function(crypto) {
		if (crypto === undefined) {
			return undefined;
		}
		return function(arr, callback) {
			crypto.getRandomValues(arr);
			if(callback) {
				callback(null);
			}
		};
	})(global.crypto || global.msCrypto) // mscrypto for IE11
};

var WebStorage = (function() {
	var sessionSupported,
		localSupported,
		test = 'ablyjs-storage-test';

	/* Even just accessing the session/localStorage object can throw a
	 * security exception in some circumstances with some browsers. In
	 * others, calling setItem will throw. So have to check in this
	 * somewhat roundabout way. (If unsupported or no global object,
	 * will throw on accessing a property of undefined) */
	try {
		global.sessionStorage.setItem(test, test);
		global.sessionStorage.removeItem(test);
		sessionSupported = true;
	} catch(e) {
		sessionSupported = false;
	}

	try {
		global.localStorage.setItem(test, test);
		global.localStorage.removeItem(test);
		localSupported = true;
	} catch(e) {
		localSupported = false;
	}

	function WebStorage() {}

	function storageInterface(session) {
		return session ? global.sessionStorage : global.localStorage;
	}

	function set(name, value, ttl, session) {
		var wrappedValue = {value: value};
		if(ttl) {
			wrappedValue.expires = Utils.now() + ttl;
		}
		return storageInterface(session).setItem(name, JSON.stringify(wrappedValue));
	}

	function get(name, session) {
		var rawItem = storageInterface(session).getItem(name);
		if(!rawItem) return null;
		var wrappedValue = JSON.parse(rawItem);
		if(wrappedValue.expires && (wrappedValue.expires < Utils.now())) {
			storageInterface(session).removeItem(name);
			return null;
		}
		return wrappedValue.value;
	}

	function remove(name, session) {
		return storageInterface(session).removeItem(name);
	}

	if(localSupported) {
		WebStorage.set    = function(name, value, ttl) { return set(name, value, ttl, false); };
		WebStorage.get    = function(name) { return get(name, false); };
		WebStorage.remove = function(name) { return remove(name, false); };
	}

	if(sessionSupported) {
		WebStorage.setSession    = function(name, value, ttl) { return set(name, value, ttl, true); };
		WebStorage.getSession    = function(name) { return get(name, true); };
		WebStorage.removeSession = function(name) { return remove(name, true); };
	}

	return WebStorage;
})();

var Defaults = {
	internetUpUrl: 'https://internet-up.ably-realtime.com/is-the-internet-up.txt',
	jsonpInternetUpUrl: 'https://internet-up.ably-realtime.com/is-the-internet-up-0-9.js',
	/* Order matters here: the base transport is the leftmost one in the
	 * intersection of baseTransportOrder and the transports clientOption that's
	 * supported.  This is not quite the same as the preference order -- e.g.
	 * xhr_polling is preferred to jsonp, but for browsers that support it we want
	 * the base transport to be xhr_polling, not jsonp */
	defaultTransports: ['xhr_polling', 'xhr_streaming', 'jsonp', 'web_socket'],
	baseTransportOrder: ['xhr_polling', 'xhr_streaming', 'jsonp', 'web_socket'],
	transportPreferenceOrder: ['jsonp', 'xhr_polling', 'xhr_streaming', 'web_socket'],
	upgradeTransports: ['xhr_streaming', 'web_socket']
};

/* If using IE8, don't attempt to upgrade from xhr_polling to xhr_streaming -
* while it can do streaming, the low max http-connections-per-host limit means
* that the polling transport is crippled during the upgrade process. So just
* leave it at the base transport */
if(Platform.noUpgrade) {
	Defaults.upgradeTransports = [];
}


var BufferUtils = (function() {
	var WordArray = CryptoJS.lib.WordArray;
	var ArrayBuffer = Platform.ArrayBuffer;
	var atob = Platform.atob;
	var TextEncoder = Platform.TextEncoder;
	var TextDecoder = Platform.TextDecoder;
	var base64CharSet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
	var hexCharSet = '0123456789abcdef';

	function isWordArray(ob) { return ob !== null && ob !== undefined && ob.sigBytes !== undefined; }
	function isArrayBuffer(ob) { return ob !== null && ob !== undefined && ob.constructor === ArrayBuffer; }
	function isTypedArray(ob) { return ArrayBuffer && ArrayBuffer.isView && ArrayBuffer.isView(ob); }

	// https://gist.githubusercontent.com/jonleighton/958841/raw/f200e30dfe95212c0165ccf1ae000ca51e9de803/gistfile1.js
	function uint8ViewToBase64(bytes) {
		var base64    = '';
		var encodings = base64CharSet;

		var byteLength    = bytes.byteLength;
		var byteRemainder = byteLength % 3;
		var mainLength    = byteLength - byteRemainder;

		var a, b, c, d;
		var chunk;

		// Main loop deals with bytes in chunks of 3
		for (var i = 0; i < mainLength; i = i + 3) {
			// Combine the three bytes into a single integer
			chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];

			// Use bitmasks to extract 6-bit segments from the triplet
			a = (chunk & 16515072) >> 18; // 16515072 = (2^6 - 1) << 18
			b = (chunk & 258048)   >> 12; // 258048   = (2^6 - 1) << 12
			c = (chunk & 4032)     >>  6; // 4032     = (2^6 - 1) << 6
			d = chunk & 63;               // 63       = 2^6 - 1

			// Convert the raw binary segments to the appropriate ASCII encoding
			base64 += encodings[a] + encodings[b] + encodings[c] + encodings[d];
		}

		// Deal with the remaining bytes and padding
		if (byteRemainder == 1) {
			chunk = bytes[mainLength];

			a = (chunk & 252) >> 2; // 252 = (2^6 - 1) << 2

			// Set the 4 least significant bits to zero
			b = (chunk & 3)   << 4; // 3   = 2^2 - 1

			base64 += encodings[a] + encodings[b] + '==';
		} else if (byteRemainder == 2) {
			chunk = (bytes[mainLength] << 8) | bytes[mainLength + 1];

			a = (chunk & 64512) >> 10; // 64512 = (2^6 - 1) << 10
			b = (chunk & 1008)  >>  4; // 1008  = (2^6 - 1) << 4

			// Set the 2 least significant bits to zero
			c = (chunk & 15)    <<  2; // 15    = 2^4 - 1

			base64 += encodings[a] + encodings[b] + encodings[c] + '=';
		}

		return base64
	}

	function base64ToArrayBuffer(base64) {
		var binary_string =  atob(base64);
		var len = binary_string.length;
		var bytes = new Uint8Array( len );
		for (var i = 0; i < len; i++)        {
			var ascii = binary_string.charCodeAt(i);
			bytes[i] = ascii;
		}
		return bytes.buffer;
	}

	/* Most BufferUtils methods that return a binary object return an ArrayBuffer
	 * if supported, else a CryptoJS WordArray. The exception is toBuffer, which
	 * returns a Uint8Array (and won't work on browsers too old to support it) */
	function BufferUtils() {}

	BufferUtils.base64CharSet = base64CharSet;
	BufferUtils.hexCharSet = hexCharSet;

	var isBuffer = BufferUtils.isBuffer = function(buf) { return isArrayBuffer(buf) || isWordArray(buf) || isTypedArray(buf); };

	/* In browsers, returns a Uint8Array */
	var toBuffer = BufferUtils.toBuffer = function(buf) {
		if(!ArrayBuffer) {
			throw new Error("Can't convert to Buffer: browser does not support the necessary types");
		}

		if(isArrayBuffer(buf)) {
			return new Uint8Array(buf);
		}

		if(isTypedArray(buf)) {
			return new Uint8Array(buf.buffer);
		}

		if(isWordArray(buf)) {
			/* Backported from unreleased CryptoJS
			* https://code.google.com/p/crypto-js/source/browse/branches/3.x/src/lib-typedarrays.js?r=661 */
			var arrayBuffer = new ArrayBuffer(buf.sigBytes);
			var uint8View = new Uint8Array(arrayBuffer);

			for (var i = 0; i < buf.sigBytes; i++) {
				uint8View[i] = (buf.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
			}

			return uint8View;
		}
		throw new Error("BufferUtils.toBuffer expected an arraybuffer, typed array, or CryptoJS wordarray");
	};

	BufferUtils.toArrayBuffer = function(buf) {
		if(isArrayBuffer(buf)) {
			return buf;
		}
		return toBuffer(buf).buffer;
	};

	BufferUtils.toWordArray = function(buf) {
		if(isTypedArray(buf)) {
			buf = buf.buffer;
		}
		return isWordArray(buf) ? buf : WordArray.create(buf);
	};

	BufferUtils.base64Encode = function(buf) {
		if(isWordArray(buf)) {
			return CryptoJS.enc.Base64.stringify(buf);
		}
		return uint8ViewToBase64(toBuffer(buf));
	};

	BufferUtils.base64Decode = function(str) {
		if(ArrayBuffer && atob) {
			return base64ToArrayBuffer(str);
		}
		return CryptoJS.enc.Base64.parse(str);
	};

	BufferUtils.hexEncode = function(buf) {
		buf = BufferUtils.toWordArray(buf);
		return CryptoJS.enc.Hex.stringify(buf);
	};

	BufferUtils.hexDecode = function(string) {
		var wordArray = CryptoJS.enc.Hex.parse(string);
		return ArrayBuffer ? BufferUtils.toArrayBuffer(wordArray) : wordArray;
	};

	BufferUtils.utf8Encode = function(string) {
		if(TextEncoder) {
			return (new TextEncoder()).encode(string).buffer;
		}
		return CryptoJS.enc.Utf8.parse(string);
	};

	/* For utf8 decoding we apply slightly stricter input validation than to
	 * hexEncode/base64Encode/etc: in those we accept anything that Buffer.from
	 * can take (in particular allowing strings, which are just interpreted as
	 * binary); here we ensure that the input is actually a buffer since trying
	 * to utf8-decode a string to another string is almost certainly a mistake */
	BufferUtils.utf8Decode = function(buf) {
		if(!isBuffer(buf)) {
			throw new Error("Expected input of utf8decode to be an arraybuffer, typed array, or CryptoJS wordarray");
		}
		if(TextDecoder && !isWordArray(buf)) {
			return (new TextDecoder()).decode(buf);
		}
		buf = BufferUtils.toWordArray(buf);
		return CryptoJS.enc.Utf8.stringify(buf);
	};

	BufferUtils.bufferCompare = function(buf1, buf2) {
		if(!buf1) return -1;
		if(!buf2) return 1;
		buf1 = BufferUtils.toWordArray(buf1);
		buf2 = BufferUtils.toWordArray(buf2);
		buf1.clamp(); buf2.clamp();

		var cmp = buf1.sigBytes - buf2.sigBytes;
		if(cmp != 0) return cmp;
		buf1 = buf1.words; buf2 = buf2.words;
		for(var i = 0; i < buf1.length; i++) {
			cmp = buf1[i] - buf2[i];
			if(cmp != 0) return cmp;
		}
		return 0;
	};

	BufferUtils.byteLength = function(buf) {
		if(isArrayBuffer(buf) || isTypedArray(buf)) {
			return buf.byteLength
		} else if(isWordArray(buf)) {
			return buf.sigBytes;
		}
	};

	return BufferUtils;
})();

var Utils = (function() {
	var msgpack = Platform.msgpack;

	function Utils() {}

	function randomPosn(arrOrStr) {
		return Math.floor(Math.random() * arrOrStr.length);
	}

	/*
	 * Add a set of properties to a target object
	 * target: the target object
	 * props:  an object whose enumerable properties are
	 *         added, by reference only
	 */
	Utils.mixin = function(target) {
		for(var i = 1; i < arguments.length; i++) {
			var source = arguments[i];
			if(!source) { break; }
			var hasOwnProperty = source.hasOwnProperty;
			for(var key in source) {
				if(!hasOwnProperty || hasOwnProperty.call(source, key)) {
					target[key] = source[key];
				}
			}
		}
		return target;
	};

	/*
	 * Add a set of properties to a target object
	 * target: the target object
	 * props:  an object whose enumerable properties are
	 *         added, by reference only
	 */
	Utils.copy = function(src) {
		return Utils.mixin({}, src);
	};

	/*
	 * Determine whether or not a given object is
	 * an array.
	 */
	Utils.isArray = Array.isArray || function(ob) {
		return Object.prototype.toString.call(ob) == '[object Array]';
	};

	/*
	 * Ensures that an Array object is always returned
	 * returning the original Array of obj is an Array
	 * else wrapping the obj in a single element Array
	 */
	Utils.ensureArray = function(obj) {
		if(Utils.isEmptyArg(obj)) {
			return [];
		}
		if(Utils.isArray(obj)) {
			return obj;
		}
		return [obj];
	};

	/* ...Or an Object (in the narrow sense) */
	Utils.isObject = function(ob) {
		return Object.prototype.toString.call(ob) == '[object Object]';
	};

	/*
	 * Determine whether or not an object contains
	 * any enumerable properties.
	 * ob: the object
	 */
	Utils.isEmpty = function(ob) {
		for(var prop in ob)
			return false;
		return true;
	};

	Utils.isOnlyPropIn = function(ob, property) {
		for(var prop in ob) {
			if(prop !== property) {
				return false;
			}
		}
		return true;
	};

	/*
	 * Determine whether or not an argument to an overloaded function is
	 * undefined (missing) or null.
	 * This method is useful when constructing functions such as (WebIDL terminology):
	 *   off([TreatUndefinedAs=Null] DOMString? event)
	 * as you can then confirm the argument using:
	 *   Utils.isEmptyArg(event)
	 */

	Utils.isEmptyArg = function(arg) {
		return arg === null || arg === undefined;
	};

	/*
	 * Perform a simple shallow clone of an object.
	 * Result is an object irrespective of whether
	 * the input is an object or array. All
	 * enumerable properties are copied.
	 * ob: the object
	 */
	Utils.shallowClone = function(ob) {
		var result = new Object();
		for(var prop in ob)
			result[prop] = ob[prop];
		return result;
	};

	/*
	 * Clone an object by creating a new object with the
	 * given object as its prototype. Optionally
	 * a set of additional own properties can be
	 * supplied to be added to the newly created clone.
	 * ob:            the object to be cloned
	 * ownProperties: optional object with additional
	 *                properties to add
	 */
	Utils.prototypicalClone = function(ob, ownProperties) {
		function F() {}
		F.prototype = ob;
		var result = new F();
		if(ownProperties)
			Utils.mixin(result, ownProperties);
		return result;
	};

	/*
	 * Declare a constructor to represent a subclass
	 * of another constructor
	 * If platform has a built-in version we use that from Platform, else we
	 * define here (so can make use of other Utils fns)
	 * See node.js util.inherits
	 */
	Utils.inherits = Platform.inherits || function(ctor, superCtor) {
		ctor.super_ = superCtor;
		ctor.prototype = Utils.prototypicalClone(superCtor.prototype, { constructor: ctor });
	};

	/*
	 * Determine whether or not an object has an enumerable
	 * property whose value equals a given value.
	 * ob:  the object
	 * val: the value to find
	 */
	Utils.containsValue = function(ob, val) {
		for(var i in ob) {
			if(ob[i] == val)
				return true;
		}
		return false;
	};

	Utils.intersect = function(arr, ob) { return Utils.isArray(ob) ? Utils.arrIntersect(arr, ob) : Utils.arrIntersectOb(arr, ob); };

	Utils.arrIntersect = function(arr1, arr2) {
		var result = [];
		for(var i = 0; i < arr1.length; i++) {
			var member = arr1[i];
			if(Utils.arrIndexOf(arr2, member) != -1)
				result.push(member);
		}
		return result;
	};

	Utils.arrIntersectOb = function(arr, ob) {
		var result = [];
		for(var i = 0; i < arr.length; i++) {
			var member = arr[i];
			if(member in ob)
				result.push(member);
		}
		return result;
	};

	Utils.arrSubtract = function(arr1, arr2) {
		var result = [];
		for(var i = 0; i < arr1.length; i++) {
			var element = arr1[i];
			if(Utils.arrIndexOf(arr2, element) == -1)
				result.push(element);
		}
		return result;
	};

	Utils.arrIndexOf = Array.prototype.indexOf
		? function(arr, elem, fromIndex) {
			return arr.indexOf(elem,  fromIndex);
		}
		: function(arr, elem, fromIndex) {
			fromIndex = fromIndex || 0;
			var len = arr.length;
			for(;fromIndex < len; fromIndex++) {
				if(arr[fromIndex] === elem) {
					return fromIndex;
				}
			}
			return -1;
		};

	Utils.arrIn = function(arr, val) {
		return Utils.arrIndexOf(arr, val) !== -1;
	};

	Utils.arrDeleteValue = function(arr, val) {
		var idx = Utils.arrIndexOf(arr, val);
		var res = (idx != -1);
		if(res)
			arr.splice(idx, 1);
		return res;
	};

	Utils.arrWithoutValue = function(arr, val) {
		var newArr = arr.slice();
		Utils.arrDeleteValue(newArr, val);
		return newArr;
	};

	/*
	 * Construct an array of the keys of the enumerable
	 * properties of a given object, optionally limited
	 * to only the own properties.
	 * ob:      the object
	 * ownOnly: boolean, get own properties only
	 */
	Utils.keysArray = function(ob, ownOnly) {
		var result = [];
		for(var prop in ob) {
			if(ownOnly && !ob.hasOwnProperty(prop)) continue;
			result.push(prop);
		}
		return result;
	};

	/*
	 * Construct an array of the values of the enumerable
	 * properties of a given object, optionally limited
	 * to only the own properties.
	 * ob:      the object
	 * ownOnly: boolean, get own properties only
	 */
	Utils.valuesArray = function(ob, ownOnly) {
		var result = [];
		for(var prop in ob) {
			if(ownOnly && !ob.hasOwnProperty(prop)) continue;
			result.push(ob[prop]);
		}
		return result;
	};

	Utils.arrForEach = Array.prototype.forEach ?
		function(arr, fn) {
			arr.forEach(fn);
		} :
		function(arr, fn) {
			var len = arr.length;
			for(var i = 0; i < len; i++) {
				fn(arr[i], i, arr);
			}
		};

	/* Useful when the function may mutate the array */
	Utils.safeArrForEach = function(arr, fn) {
		return Utils.arrForEach(arr.slice(), fn);
	};

	Utils.arrMap = Array.prototype.map ?
		function(arr, fn) {
			return arr.map(fn);
		} :
		function(arr, fn)	{
			var result = [],
				len = arr.length;
			for(var i = 0; i < len; i++) {
				result.push(fn(arr[i], i, arr));
			}
			return result;
		};

	Utils.arrFilter = Array.prototype.filter ?
		function(arr, fn) {
			return arr.filter(fn);
		} :
		function(arr, fn)	{
			var result = [],
				len = arr.length;
			for(var i = 0; i < len; i++) {
				if(fn(arr[i])) {
					result.push(arr[i]);
				}
			}
			return result;
		};

	Utils.arrEvery = Array.prototype.every ?
		function(arr, fn) {
			return arr.every(fn);
		} : function(arr, fn) {
			var len = arr.length;
			for(var i = 0; i < len; i++) {
				if(!fn(arr[i], i, arr)) {
					return false;
				}			}
			return true;
		};

	Utils.allSame = function(arr, prop) {
		if(arr.length === 0) {
			return true;
		}
		var first = arr[0][prop];
		return Utils.arrEvery(arr, function(item) {
			return item[prop] === first;
		});
	};

	Utils.nextTick = Platform.nextTick;

	var contentTypes = {
		json:   'application/json',
		jsonp:  'application/javascript',
		xml:    'application/xml',
		html:   'text/html',
		msgpack: 'application/x-msgpack'
	};

	Utils.defaultGetHeaders = function(format) {
		var accept = contentTypes[format || 'json'];
		return {
			accept: accept,
			'X-Ably-Version': Defaults.apiVersion,
			'X-Ably-Lib': Defaults.libstring
		};
	};

	Utils.defaultPostHeaders = function(format) {
		var accept, contentType;
		accept = contentType = contentTypes[format || 'json'];

		return {
			accept: accept,
			'content-type': contentType,
			'X-Ably-Version': Defaults.apiVersion,
			'X-Ably-Lib': Defaults.libstring
		};
	};

	Utils.arrPopRandomElement = function(arr) {
		return arr.splice(randomPosn(arr), 1)[0];
	};

	Utils.toQueryString = function(params) {
		var parts = [];
		if(params) {
			for(var key in params)
				parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
		}
		return parts.length ? '?' + parts.join('&') : '';
	};

	Utils.parseQueryString = function(query) {
		var match,
			search = /([^?&=]+)=?([^&]*)/g,
			result = {};

		while (match = search.exec(query))
			result[decodeURIComponent(match[1])] = decodeURIComponent(match[2]);

 		return result;
	};

	Utils.now = Date.now || function() {
		/* IE 8 */
		return new Date().getTime();
	};

	Utils.inspect = Platform.inspect;

	Utils.isErrorInfo = function(err) {
		return err.constructor.name == 'ErrorInfo'
	};

	Utils.inspectError = function(x) {
		/* redundant, but node vmcontext issue makes instanceof unreliable, and
		 * can't use just constructor test as could be a TypeError constructor etc. */
		return (x && (Utils.isErrorInfo(x) ||
			x.constructor.name == 'Error' ||
			x instanceof Error)) ?
			x.toString() :
			Utils.inspect(x);
	};

	Utils.inspectBody = function(body) {
		if(BufferUtils.isBuffer(body)) {
			return body.toString();
		} else if(typeof body === 'string') {
			return body;
		} else {
			return Platform.inspect(body);
		}
	};

	/* Data is assumed to be either a string or a buffer. */
	Utils.dataSizeBytes = function(data) {
		if(BufferUtils.isBuffer(data)) {
			return BufferUtils.byteLength(data);
		}
		if(typeof data === 'string') {
			return Platform.stringByteSize(data);
		}
		throw new Error("Expected input of Utils.dataSizeBytes to be a buffer or string, but was: " + (typeof data));
	};

	Utils.cheapRandStr = function() {
		return String(Math.random()).substr(2);
	};

	/* Takes param the minimum number of bytes of entropy the string must
	 * include, not the length of the string. String length produced is not
	 * guaranteed. */
	Utils.randomString = (Platform.getRandomValues && typeof Uint8Array !== 'undefined') ?
		function(numBytes) {
			var uIntArr = new Uint8Array(numBytes);
			Platform.getRandomValues(uIntArr);
			return BufferUtils.base64Encode(uIntArr);
		} : function(numBytes) {
			/* Old browser; fall back to Math.random. Could just use a
			 * CryptoJS version of the above, but want this to still work in nocrypto
			 * versions of the library */
			var charset = BufferUtils.base64CharSet;
			/* base64 has 33% overhead; round length up */
			var length = Math.round(numBytes * 4/3);
			var result = '';
			for(var i=0; i<length; i++) {
				result += charset[randomPosn(charset)];
			}
			return result;
		};

	Utils.randomHexString = (Platform.getRandomValues && typeof Uint8Array !== 'undefined') ?
		function(numBytes) {
			var uIntArr = new Uint8Array(numBytes);
			Platform.getRandomValues(uIntArr);
			return BufferUtils.hexEncode(uIntArr);
		} : function(numBytes) {
			var charset = BufferUtils.hexCharSet;
			var length = numBytes * 2;
			var result = '';
			for(var i=0; i<length; i++) {
				result += charset[randomPosn(charset)];
			}
			return result;
		};

	/* Pick n elements at random without replacement from an array */
	Utils.arrChooseN = function(arr, n) {
		var numItems = Math.min(n, arr.length),
			mutableArr = arr.slice(),
			result = [];
		for(var i = 0; i < numItems; i++) {
			result.push(Utils.arrPopRandomElement(mutableArr));
		}
		return result;
	};

	Utils.trim = String.prototype.trim ? function(str) {
		return str.trim();
	} : function(str) {
		return str.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '');
	};

	Utils.promisify = function(ob, fnName, args) {
		return new Promise(function(resolve, reject) {
			ob[fnName].apply(ob, Array.prototype.slice.call(args).concat(function(err, res) {
				err ? reject(err) : resolve(res);
			}));
		});
	};

	Utils.decodeBody = function(body, format) {
		return (format == 'msgpack') ? msgpack.decode(body) : JSON.parse(String(body));
	};

	Utils.encodeBody = function(body, format) {
		return (format == 'msgpack') ? msgpack.encode(body, true) : JSON.stringify(body);
	};

	return Utils;
})();

var Http = (function() {
	var noop = function() {};

	function Http() {}

	var now = Date.now || function() {
		/* IE 8 */
		return new Date().getTime();
	};

	function shouldFallback(err) {
		var statusCode = err.statusCode;
		/* 400 + no code = a generic xhr onerror. Browser doesn't give us enough
		 * detail to know whether it's fallback-fixable, but it may be (eg if a
		 * network issue), so try just in case */
		return (statusCode === 408 && !err.code) ||
			(statusCode === 400 && !err.code)      ||
			(statusCode >= 500 && statusCode <= 504);
	}

	function getHosts(client) {
		/* If we're a connected realtime client, try the endpoint we're connected
		 * to first -- but still have fallbacks, being connected is not an absolute
		 * guarantee that a datacenter has free capacity to service REST requests. */
		var connection = client.connection,
			connectionHost = connection && connection.connectionManager.host;

		if(connectionHost) {
			return [connectionHost].concat(Defaults.getFallbackHosts(client.options));
		}

		return Defaults.getHosts(client.options);
	}
	Http._getHosts = getHosts;

	Http.methods = ['get', 'delete', 'post', 'put', 'patch'];
	Http.methodsWithoutBody = ['get', 'delete'];
	Http.methodsWithBody = Utils.arrSubtract(Http.methods, Http.methodsWithoutBody);

	/* - Http.get, Http.post, Http.put, ...
	 * Perform an HTTP request for a given path against prime and fallback Ably hosts
	 * @param rest
	 * @param path the full path
	 * @param headers optional hash of headers
	 * [only for methods with body: @param body object or buffer containing request body]
	 * @param params optional hash of params
	 * @param callback (err, response)
	 *
	 * - Http.getUri, Http.postUri, Http.putUri, ...
	 * Perform an HTTP request for a given full URI
	 * @param rest
	 * @param uri the full URI
	 * @param headers optional hash of headers
	 * [only for methods with body: @param body object or buffer containing request body]
	 * @param params optional hash of params
	 * @param callback (err, response)
	 */
	Utils.arrForEach(Http.methodsWithoutBody, function(method) {
		Http[method] = function(rest, path, headers, params, callback) {
			Http['do'](method, rest, path, headers, null, params, callback);
		};
		Http[method + 'Uri'] = function(rest, uri, headers, params, callback) {
			Http.doUri(method, rest, uri, headers, null, params, callback);
		};
	});

	Utils.arrForEach(Http.methodsWithBody, function(method) {
		Http[method] = function(rest, path, headers, body, params, callback) {
			Http['do'](method, rest, path, headers, body, params, callback);
		};
		Http[method + 'Uri'] = function(rest, uri, headers, body, params, callback) {
			Http.doUri(method, rest, uri, headers, body, params, callback);
		};
	});

	/* Unlike for doUri, the 'rest' param here is mandatory, as it's used to generate the hosts */
	Http['do'] = function(method, rest, path, headers, body, params, callback) {
		callback = callback || noop;
		var uriFromHost = (typeof(path) == 'function') ? path : function(host) { return rest.baseUri(host) + path; };
		var binary = (headers && headers.accept != 'application/json');
		var doArgs = arguments;

		var currentFallback = rest._currentFallback;
		if(currentFallback) {
			if(currentFallback.validUntil > now()) {
				/* Use stored fallback */
				Http.Request(method, rest, uriFromHost(currentFallback.host), headers, params, body, function(err) {
					if(err && shouldFallback(err)) {
						/* unstore the fallback and start from the top with the default sequence */
						rest._currentFallback = null;
						Http['do'].apply(Http, doArgs);
						return;
					}
					callback.apply(null, arguments);
				});
				return;
			} else {
				/* Fallback expired; remove it and fallthrough to normal sequence */
				rest._currentFallback = null;
			}
		}

		var hosts = getHosts(rest);

		/* if there is only one host do it */
		if(hosts.length == 1) {
			Http.doUri(method, rest, uriFromHost(hosts[0]), headers, body, params, callback);
			return;
		}

		/* hosts is an array with preferred host plus at least one fallback */
		var tryAHost = function(candidateHosts, persistOnSuccess) {
			var host = candidateHosts.shift();
			Http.doUri(method, rest, uriFromHost(host), headers, body, params, function(err) {
				if(err && shouldFallback(err) && candidateHosts.length) {
					tryAHost(candidateHosts, true);
					return;
				}
				if(persistOnSuccess) {
					/* RSC15f */
					rest._currentFallback = {
						host: host,
						validUntil: now() + rest.options.timeouts.fallbackRetryTimeout
					};
				}
				callback.apply(null, arguments);
			});
		};
		tryAHost(hosts);
	};

	Http.doUri = function(method, rest, uri, headers, body, params, callback) {
		Http.Request(method, rest, uri, headers, params, body, callback);
	};

	Http.supportsAuthHeaders = false;
	Http.supportsLinkHeaders = false;
	return Http;
})();

/*
 Copyright (c) 2008 Fred Palmer fred.palmer_at_gmail.com

 Permission is hereby granted, free of charge, to any person
 obtaining a copy of this software and associated documentation
 files (the "Software"), to deal in the Software without
 restriction, including without limitation the rights to use,
 copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the
 Software is furnished to do so, subject to the following
 conditions:

 The above copyright notice and this permission notice shall be
 included in all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
 OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
 OTHER DEALINGS IN THE SOFTWARE.
 */
var Base64 = (function() {
	function StringBuffer()
	{
		this.buffer = [];
	}

	StringBuffer.prototype.append = function append(string)
	{
		this.buffer.push(string);
		return this;
	};

	StringBuffer.prototype.toString = function toString()
	{
		return this.buffer.join("");
	};

	var Base64 =
	{
		codex : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",

		encode : function (input)
		{
			var output = new StringBuffer();
			var codex = Base64.codex;

			var enumerator = new Utf8EncodeEnumerator(input);
			while (enumerator.moveNext())
			{
				var chr1 = enumerator.current;

				enumerator.moveNext();
				var chr2 = enumerator.current;

				enumerator.moveNext();
				var chr3 = enumerator.current;

				var enc1 = chr1 >> 2;
				var enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
				var enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
				var enc4 = chr3 & 63;

				if (isNaN(chr2))
				{
					enc3 = enc4 = 64;
				}
				else if (isNaN(chr3))
				{
					enc4 = 64;
				}

				output.append(codex.charAt(enc1) + codex.charAt(enc2) + codex.charAt(enc3) + codex.charAt(enc4));
			}

			return output.toString();
		},

		decode : function (input)
		{
			var output = new StringBuffer();

			var enumerator = new Base64DecodeEnumerator(input);
			while (enumerator.moveNext())
			{
				var charCode = enumerator.current;

				if (charCode < 128)
					output.append(String.fromCharCode(charCode));
				else if ((charCode > 191) && (charCode < 224))
				{
					enumerator.moveNext();
					var charCode2 = enumerator.current;

					output.append(String.fromCharCode(((charCode & 31) << 6) | (charCode2 & 63)));
				}
				else
				{
					enumerator.moveNext();
					var charCode2 = enumerator.current;

					enumerator.moveNext();
					var charCode3 = enumerator.current;

					output.append(String.fromCharCode(((charCode & 15) << 12) | ((charCode2 & 63) << 6) | (charCode3 & 63)));
				}
			}

			return output.toString();
		}
	};

	function Utf8EncodeEnumerator(input)
	{
		this._input = input;
		this._index = -1;
		this._buffer = [];
	}

	Utf8EncodeEnumerator.prototype =
	{
		current: Number.NaN,

		moveNext: function()
		{
			if (this._buffer.length > 0)
			{
				this.current = this._buffer.shift();
				return true;
			}
			else if (this._index >= (this._input.length - 1))
			{
				this.current = Number.NaN;
				return false;
			}
			else
			{
				var charCode = this._input.charCodeAt(++this._index);

				// "\r\n" -> "\n"
				//
				if ((charCode == 13) && (this._input.charCodeAt(this._index + 1) == 10))
				{
					charCode = 10;
					this._index += 2;
				}

				if (charCode < 128)
				{
					this.current = charCode;
				}
				else if ((charCode > 127) && (charCode < 2048))
				{
					this.current = (charCode >> 6) | 192;
					this._buffer.push((charCode & 63) | 128);
				}
				else
				{
					this.current = (charCode >> 12) | 224;
					this._buffer.push(((charCode >> 6) & 63) | 128);
					this._buffer.push((charCode & 63) | 128);
				}

				return true;
			}
		}
	};

	function Base64DecodeEnumerator(input)
	{
		this._input = input;
		this._index = -1;
		this._buffer = [];
	}

	Base64DecodeEnumerator.prototype =
	{
		current: 64,

		moveNext: function()
		{
			if (this._buffer.length > 0)
			{
				this.current = this._buffer.shift();
				return true;
			}
			else if (this._index >= (this._input.length - 1))
			{
				this.current = 64;
				return false;
			}
			else
			{
				var enc1 = Base64.codex.indexOf(this._input.charAt(++this._index));
				var enc2 = Base64.codex.indexOf(this._input.charAt(++this._index));
				var enc3 = Base64.codex.indexOf(this._input.charAt(++this._index));
				var enc4 = Base64.codex.indexOf(this._input.charAt(++this._index));

				var chr1 = (enc1 << 2) | (enc2 >> 4);
				var chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
				var chr3 = ((enc3 & 3) << 6) | enc4;

				this.current = chr1;

				if (enc3 != 64)
					this._buffer.push(chr2);

				if (enc4 != 64)
					this._buffer.push(chr3);

				return true;
			}
		}
	};

	return Base64;
})();

Defaults.ENVIRONMENT              = '';
Defaults.REST_HOST                = 'rest.ably.io';
Defaults.REALTIME_HOST            = 'realtime.ably.io';
Defaults.FALLBACK_HOSTS           = ['A.ably-realtime.com', 'B.ably-realtime.com', 'C.ably-realtime.com', 'D.ably-realtime.com', 'E.ably-realtime.com'];
Defaults.PORT                     = 80;
Defaults.TLS_PORT                 = 443;
Defaults.TIMEOUTS = {
	/* Documented as options params: */
	disconnectedRetryTimeout   : 15000,
	suspendedRetryTimeout      : 30000,
	/* Undocumented, but part of the api and can be used by customers: */
	httpRequestTimeout         : 15000,
	channelRetryTimeout        : 15000,
	fallbackRetryTimeout       : 600000,
	/* For internal / test use only: */
	connectionStateTtl         : 120000,
	realtimeRequestTimeout     : 10000,
	recvTimeout                : 90000,
	preferenceConnectTimeout   : 6000,
	parallelUpgradeDelay       : 6000
};
Defaults.httpMaxRetryCount = 3;
Defaults.maxMessageSize    = 65536;

Defaults.errorReportingUrl = 'https://errors.ably.io/api/15/store/';
Defaults.errorReportingHeaders = {
	"X-Sentry-Auth": "Sentry sentry_version=7, sentry_key=a04e33c8674c451f8a310fbec029acf5, sentry_client=ably-js/0.1",
	"Content-Type": "application/json"
};

Defaults.version          = '1.1.24';
Defaults.libstring        = Platform.libver + '-' + Defaults.version;
Defaults.apiVersion       = '1.1';

Defaults.getHost = function(options, host, ws) {
	if(ws)
		host = ((host == options.restHost) && options.realtimeHost) || host || options.realtimeHost;
	else
		host = host || options.restHost;

	return host;
};

Defaults.getPort = function(options, tls) {
	return (tls || options.tls) ? options.tlsPort : options.port;
};

Defaults.getHttpScheme = function(options) {
	return options.tls ? 'https://' : 'http://';
};

Defaults.getFallbackHosts = function(options) {
	var fallbackHosts = options.fallbackHosts,
		httpMaxRetryCount = typeof(options.httpMaxRetryCount) !== 'undefined' ? options.httpMaxRetryCount : Defaults.httpMaxRetryCount;

	return fallbackHosts ? Utils.arrChooseN(fallbackHosts, httpMaxRetryCount) : [];
};

Defaults.getHosts = function(options) {
	return [options.restHost].concat(Defaults.getFallbackHosts(options));
};

function checkHost(host) {
	if(typeof host !== 'string') {
		throw new ErrorInfo('host must be a string; was a ' + typeof host, 40000, 400);
	}	if(!host.length) {
		throw new ErrorInfo('host must not be zero-length', 40000, 400);
	}}

Defaults.objectifyOptions = function(options) {
	if(typeof options == 'string') {
		return (options.indexOf(':') == -1) ? {token: options} : {key: options};
	}
	return options;
};

Defaults.normaliseOptions = function(options) {
	/* Deprecated options */
	if(options.host) {
		Logger.deprecated('host', 'restHost');
		options.restHost = options.host;
	}
	if(options.wsHost) {
		Logger.deprecated('wsHost', 'realtimeHost');
		options.realtimeHost = options.wsHost;
	}
	if(options.queueEvents) {
		Logger.deprecated('queueEvents', 'queueMessages');
		options.queueMessages = options.queueEvents;
	}

	if(options.recover === true) {
		Logger.deprecated('{recover: true}', '{recover: function(lastConnectionDetails, cb) { cb(true); }}');
		options.recover = function(lastConnectionDetails, cb) { cb(true); };
	}

	if(typeof options.recover === 'function' && options.closeOnUnload === true) {
		Logger.logAction(Logger.LOG_ERROR, 'Defaults.normaliseOptions', 'closeOnUnload was true and a session recovery function was set - these are mutually exclusive, so unsetting the latter');
		options.recover = null;
	}

	if(!('closeOnUnload' in options)) {
		/* Have closeOnUnload default to true unless we have any indication that
		 * the user may want to recover the connection */
		options.closeOnUnload = !options.recover;
	}

	if(options.transports && Utils.arrIn(options.transports, 'xhr')) {
		Logger.deprecated('transports: ["xhr"]', 'transports: ["xhr_streaming"]');
		Utils.arrDeleteValue(options.transports, 'xhr');
		options.transports.push('xhr_streaming');
	}

	if(!('queueMessages' in options))
		options.queueMessages = true;

	var production = false;
	if(options.restHost) {
		options.realtimeHost = options.realtimeHost || options.restHost;
	} else {
		var environment = (options.environment && String(options.environment).toLowerCase()) || Defaults.ENVIRONMENT;
		production = !environment || (environment === 'production');
		options.restHost = production ? Defaults.REST_HOST : environment + '-' + Defaults.REST_HOST;
		options.realtimeHost = production ? Defaults.REALTIME_HOST : environment + '-' + Defaults.REALTIME_HOST;
	}
	options.fallbackHosts = (production || options.fallbackHostsUseDefault) ? Defaults.FALLBACK_HOSTS : options.fallbackHosts;
	Utils.arrForEach((options.fallbackHosts || []).concat(options.restHost, options.realtimeHost), checkHost);

	options.port = options.port || Defaults.PORT;
	options.tlsPort = options.tlsPort || Defaults.TLS_PORT;
	options.maxMessageSize = options.maxMessageSize || Defaults.maxMessageSize;
	if(!('tls' in options)) options.tls = true;

	/* Allow values passed in options to override default timeouts */
	options.timeouts = {};
	for(var prop in Defaults.TIMEOUTS) {
		options.timeouts[prop] = options[prop] || Defaults.TIMEOUTS[prop];
	}
	if('useBinaryProtocol' in options) {
		options.useBinaryProtocol = Platform.supportsBinary && options.useBinaryProtocol;
	} else {
		options.useBinaryProtocol = Platform.preferBinary;
	}

	if(options.clientId) {
		var headers = options.headers = options.headers || {};
		headers['X-Ably-ClientId'] = BufferUtils.base64Encode(BufferUtils.utf8Encode(options.clientId));
	}

	if(!('idempotentRestPublishing' in options)) {
		options.idempotentRestPublishing = false;
	}

	if(options.promises && !Platform.Promise) {
		Logger.logAction(Logger.LOG_ERROR, 'Defaults.normaliseOptions', '{promises: true} was specified, but no Promise constructor found; disabling promises');
		options.promises = false;
	}

	return options;
};

var EventEmitter = (function() {

	/* public constructor */
	function EventEmitter() {
		this.any = [];
		this.events = {};
		this.anyOnce = [];
		this.eventsOnce = {};
	}

	/* Call the listener, catch any exceptions and log, but continue operation*/
	function callListener(eventThis, listener, args) {
		try {
			listener.apply(eventThis, args);
		} catch(e) {
			Logger.logAction(Logger.LOG_ERROR, 'EventEmitter.emit()', 'Unexpected listener exception: ' + e + '; stack = ' + (e && e.stack));
		}
	}

	/**
	 * Remove listeners that match listener
	 * @param targetListeners is an array of listener arrays or event objects with arrays of listeners
	 * @param listener the listener callback to remove
	 * @param eventFilter (optional) event name instructing the function to only remove listeners for the specified event
	 */
	function removeListener(targetListeners, listener, eventFilter) {
		var listeners, idx, eventName, targetListenersIndex;

		for (targetListenersIndex = 0; targetListenersIndex < targetListeners.length; targetListenersIndex++) {
			listeners = targetListeners[targetListenersIndex];
			if (eventFilter) { listeners = listeners[eventFilter]; }

			if (Utils.isArray(listeners)) {
				while ((idx = Utils.arrIndexOf(listeners, listener)) !== -1) {
					listeners.splice(idx, 1);
				}
				/* If events object has an event name key with no listeners then
				   remove the key to stop the list growing indefinitely */
				if (eventFilter && (listeners.length === 0)) {
					delete targetListeners[targetListenersIndex][eventFilter];
				}
			} else if (Utils.isObject(listeners)) {
				/* events */
				for (eventName in listeners) {
					if (listeners.hasOwnProperty(eventName) && Utils.isArray(listeners[eventName])) {
						removeListener([listeners], listener, eventName);
					}
				}
			}
		}
	}

	/**
	 * Add an event listener
	 * @param event (optional) the name of the event to listen to
	 *        if not supplied, all events trigger a call to the listener
	 * @param listener the listener to be called
	 */
	EventEmitter.prototype.on = function(event, listener) {
		if(arguments.length == 1 && typeof(event) == 'function') {
			this.any.push(event);
		} else if(Utils.isEmptyArg(event)) {
			this.any.push(listener);
		} else if(Utils.isArray(event)) {
			var self = this;
			Utils.arrForEach(event, function(ev) {
				self.on(ev, listener);
			});
		} else {
			var listeners = (this.events[event] || (this.events[event] = []));
			listeners.push(listener);
		}
	};

	/**
	 * Remove one or more event listeners
	 * @param event (optional) the name of the event whose listener
	 *        is to be removed. If not supplied, the listener is
	 *        treated as an 'any' listener
	 * @param listener (optional) the listener to remove. If not
	 *        supplied, all listeners are removed.
	 */
	EventEmitter.prototype.off = function(event, listener) {
		if(arguments.length == 0 || (Utils.isEmptyArg(event) && Utils.isEmptyArg(listener))) {
			this.any = [];
			this.events = {};
			this.anyOnce = [];
			this.eventsOnce = {};
			return;
		}
		if(arguments.length == 1) {
			if(typeof(event) == 'function') {
				/* we take this to be the listener and treat the event as "any" .. */
				listener = event;
				event = null;
			}
			/* ... or we take event to be the actual event name and listener to be all */
		}

		if(listener && Utils.isEmptyArg(event)) {
			removeListener([this.any, this.events, this.anyOnce, this.eventsOnce], listener);
			return;
		}

		if(Utils.isArray(event)) {
			var self = this;
			Utils.arrForEach(event, function(ev) {
				self.off(ev, listener);
			});
		}

		/* "normal" case where event is an actual event */
		if(listener) {
			removeListener([this.events, this.eventsOnce], listener, event);
		} else {
			delete this.events[event];
			delete this.eventsOnce[event];
		}
	};

	/**
	 * Get the array of listeners for a given event; excludes once events
	 * @param event (optional) the name of the event, or none for 'any'
	 * @return array of events, or null if none
	 */
	EventEmitter.prototype.listeners = function(event) {
		if(event) {
			var listeners = (this.events[event] || []);
			if(this.eventsOnce[event])
				Array.prototype.push.apply(listeners, this.eventsOnce[event]);
			return listeners.length ? listeners : null;
		}
		return this.any.length ? this.any : null;
	};

	/**
	 * Emit an event
	 * @param event the event name
	 * @param args the arguments to pass to the listener
	 */
	EventEmitter.prototype.emit = function(event  /* , args... */) {
		var args = Array.prototype.slice.call(arguments, 1);
		var eventThis = {event:event};
		var listeners = [];

		if(this.anyOnce.length) {
			Array.prototype.push.apply(listeners, this.anyOnce);
			this.anyOnce = [];
		}
		if(this.any.length) {
			Array.prototype.push.apply(listeners, this.any);
		}
		var eventsOnceListeners = this.eventsOnce[event];
		if(eventsOnceListeners) {
			Array.prototype.push.apply(listeners, eventsOnceListeners);
			delete this.eventsOnce[event];
		}
		var eventsListeners = this.events[event];
		if(eventsListeners) {
			Array.prototype.push.apply(listeners, eventsListeners);
		}

		Utils.arrForEach(listeners, function(listener) {
			callListener(eventThis, listener, args);
		});
	};

	/**
	 * Listen for a single occurrence of an event
	 * @param event the name of the event to listen to
	 * @param listener the listener to be called
	 */
	EventEmitter.prototype.once = function(event, listener) {
		var argCount = arguments.length, self = this;
		if((argCount === 0 || (argCount === 1 && typeof event !== 'function')) && Platform.Promise) {
			return new Platform.Promise(function(resolve) {
				self.once(event, resolve);
			});
		}
		if(arguments.length == 1 && typeof(event) == 'function') {
			this.anyOnce.push(event);
		} else if(Utils.isEmptyArg(event)) {
			this.anyOnce.push(listener);
		} else if(Utils.isArray(event)){
			throw("Arrays of events can only be used with on(), not once()");
		} else {
			var listeners = (this.eventsOnce[event] || (this.eventsOnce[event] = []));
			listeners.push(listener);
		}
	};

	/**
	 * Private API
	 *
	 * Listen for a single occurrence of a state event and fire immediately if currentState matches targetState
	 * @param targetState the name of the state event to listen to
	 * @param currentState the name of the current state of this object
	 * @param listener the listener to be called
	 */
	EventEmitter.prototype.whenState = function(targetState, currentState, listener /* ...listenerArgs */) {
		var eventThis = {event:targetState},
			self = this,
			listenerArgs = Array.prototype.slice.call(arguments, 3);

		if((typeof(targetState) !== 'string') || (typeof(currentState) !== 'string')) {
			throw("whenState requires a valid event String argument");
		}
		if(typeof listener !== 'function' && Platform.Promise) {
			return new Platform.Promise(function(resolve) {
				self.whenState.bind(self, targetState, currentState, resolve).apply(self, listenerArgs);
			});
		}
		if(targetState === currentState) {
			callListener(eventThis, listener, listenerArgs);
		} else {
			this.once(targetState, listener);
		}
	};

	return EventEmitter;
})();

var Logger = (function() {
	var consoleLogger, errorLogger;

	/* Can't just check for console && console.log; fails in IE <=9 */
	if((typeof Window === 'undefined' && typeof WorkerGlobalScope === 'undefined') /* node */ ||
		 (global.console && global.console.log && (typeof global.console.log.apply === 'function')) /* sensible browsers */) {
		consoleLogger = function() { console.log.apply(console, arguments); };
		errorLogger = console.warn ? function() { console.warn.apply(console, arguments); } : consoleLogger;
	} else if(global.console && global.console.log) {
		/* IE <= 9 with the console open -- console.log does not
		 * inherit from Function, so has no apply method */
		consoleLogger = errorLogger = function() { Function.prototype.apply.call(console.log, console, arguments); };
	} else {
		/* IE <= 9 when dev tools are closed - window.console not even defined */
		consoleLogger = errorLogger = function() {};
	}

	function pad(str, three) {
		return ('000' + str).slice(-2-(three || 0));
	}

	var LOG_NONE  = 0,
	LOG_ERROR = 1,
	LOG_MAJOR = 2,
	LOG_MINOR = 3,
	LOG_MICRO = 4;

	var LOG_DEFAULT = LOG_ERROR,
	LOG_DEBUG   = LOG_MICRO;

	var logLevel = LOG_DEFAULT;

	function getHandler(logger) {
		return Platform.logTimestamps ?
			function(msg) {
				var time = new Date();
				logger(pad(time.getHours()) + ':' + pad(time.getMinutes()) + ':' + pad(time.getSeconds()) + '.' + pad(time.getMilliseconds(), true) + ' ' + msg);
			} : logger;
	}

	var logHandler = getHandler(consoleLogger),
		logErrorHandler = getHandler(errorLogger);

	/* public constructor */
	function Logger(args) {}

	/* public constants */
	Logger.LOG_NONE    = LOG_NONE,
	Logger.LOG_ERROR   = LOG_ERROR,
	Logger.LOG_MAJOR   = LOG_MAJOR,
	Logger.LOG_MINOR   = LOG_MINOR,
	Logger.LOG_MICRO   = LOG_MICRO;

	Logger.LOG_DEFAULT = LOG_DEFAULT,
	Logger.LOG_DEBUG   = LOG_DEBUG;

	/* public static functions */
	Logger.logAction = function(level, action, message) {
		if (Logger.shouldLog(level)) {
			(level === LOG_ERROR ? logErrorHandler : logHandler)('Ably: ' + action + ': ' + message);
		}
	};

	Logger.deprecated = function(original, replacement) {
		if (Logger.shouldLog(LOG_ERROR)) {
			logErrorHandler("Ably: Deprecation warning - '" + original + "' is deprecated and will be removed from a future version. Please use '" + replacement + "' instead.");
		}
	};

	/* Where a logging operation is expensive, such as serialisation of data, use shouldLog will prevent
	   the object being serialised if the log level will not output the message */
	Logger.shouldLog = function(level) {
		return level <= logLevel;
	};

	Logger.setLog = function(level, handler) {
		if(level !== undefined) logLevel = level;
		if(handler !== undefined) logHandler = logErrorHandler = handler;
	};

	return Logger;
})();

var Multicaster = (function() {

	function Multicaster(members) {
		members = members || [];

		var handler = function() {
			for(var i = 0; i < members.length; i++) {
				var member = members[i];
				if(member) {
					try {
						member.apply(null, arguments);
					} catch(e){
						Logger.logAction(Logger.LOG_ERROR, 'Multicaster multiple callback handler', 'Unexpected exception: ' + e + '; stack = ' + e.stack);
					}
				}
			}
		};

		handler.push = function() {
			Array.prototype.push.apply(members, arguments);
		};
		return handler;
	}

	return Multicaster;
})();

var ErrorReporter = (function() {
	function ErrorReporter() {}

	var levels = ErrorReporter.levels = [
		'fatal',
		'error',
		'warning',
		'info',
		'debug'
	];

	/* (level: typeof ErrorReporter.levels[number], message: string, fingerprint?: string, tags?: {[key: string]: string}): void */
	ErrorReporter.report = function(level, message, fingerprint, tags) {
		var eventId = Utils.randomHexString(16);

		var event = {
			event_id: eventId,
			tags: Utils.mixin({
				lib: Platform.libver
			}, tags),
			platform: 'javascript',
			level: level,
			release: Defaults.version,
			fingerprint: fingerprint && [ fingerprint ],
			message: message,
			request: {
				headers: {
					'User-Agent': Platform.userAgent
				},
				url: Platform.currentUrl
			}
		};

		Logger.logAction(Logger.LOG_MICRO, 'ErrorReporter', 'POSTing to error reporter: ' + message);
		Http.postUri(null, Defaults.errorReportingUrl, Defaults.errorReportingHeaders, JSON.stringify(event), {}, function(err, res) {
			Logger.logAction(Logger.LOG_MICRO, 'ErrorReporter', 'POSTing to error reporter resulted in: ' +
				(err ? Utils.inspectError(err) : Utils.inspectBody(res))
			);
		});
	};

	return ErrorReporter;
})();

var ErrorInfo = (function() {

	function ErrorInfo(message, code, statusCode, cause) {
		this.message = message;
		this.code = code;
		this.statusCode = statusCode;
		this.cause = cause;
		this.href = undefined;
	}

	ErrorInfo.prototype.toString = function() {
		var result = '[' + this.constructor.name;
		if(this.message) result += ': ' + this.message;
		if(this.statusCode) result += '; statusCode=' + this.statusCode;
		if(this.code) result += '; code=' + this.code;
		if(this.cause) result += '; cause=' + Utils.inspectError(this.cause);
		if(this.href && !(this.message && this.message.indexOf('help.ably.io') > -1)) result += '; see ' + this.href + ' ';
		result += ']';
		return result;
	};

	ErrorInfo.fromValues = function(values) {
		var result = Utils.mixin(new ErrorInfo(), values);
		if (values instanceof Error) {
			/* Error.message is not enumerable, so mixin loses the message */
			result.message = values.message;
		}
		if(result.code && !result.href) {
			result.href = 'https://help.ably.io/error/' + result.code;
		}
		return result;
	};

	return ErrorInfo;
})();

var Message = (function() {

	function Message() {
		this.name = undefined;
		this.id = undefined;
		this.timestamp = undefined;
		this.clientId = undefined;
		this.connectionId = undefined;
		this.connectionKey = undefined;
		this.data = undefined;
		this.encoding = undefined;
		this.extras = undefined;
		this.size = undefined;
	}

	/**
	 * Overload toJSON() to intercept JSON.stringify()
	 * @return {*}
	 */
	Message.prototype.toJSON = function() {
		var result = {
			name: this.name,
			id: this.id,
			clientId: this.clientId,
			connectionId: this.connectionId,
			connectionKey: this.connectionKey,
			encoding: this.encoding,
			extras: this.extras
		};

		/* encode data to base64 if present and we're returning real JSON;
		 * although msgpack calls toJSON(), we know it is a stringify()
		 * call if it has a non-empty arguments list */
		var data = this.data;
		if(data && BufferUtils.isBuffer(data)) {
			if(arguments.length > 0) {
				/* stringify call */
				var encoding = this.encoding;
				result.encoding = encoding ? (encoding + '/base64') : 'base64';
				data = BufferUtils.base64Encode(data);
			} else {
				/* Called by msgpack. toBuffer returns a datatype understandable by
				 * that platform's msgpack implementation (Buffer in node, Uint8Array
				 * in browsers) */
				data = BufferUtils.toBuffer(data);
			}
		}
		result.data = data;
		return result;
	};

	Message.prototype.toString = function() {
		var result = '[Message';
		if(this.name)
			result += '; name=' + this.name;
		if(this.id)
			result += '; id=' + this.id;
		if(this.timestamp)
			result += '; timestamp=' + this.timestamp;
		if(this.clientId)
			result += '; clientId=' + this.clientId;
		if(this.connectionId)
			result += '; connectionId=' + this.connectionId;
		if(this.encoding)
			result += '; encoding=' + this.encoding;
		if(this.extras)
			result += '; extras =' + JSON.stringify(this.extras);
		if(this.data) {
			if (typeof(this.data) == 'string')
				result += '; data=' + this.data;
			else if (BufferUtils.isBuffer(this.data))
				result += '; data (buffer)=' + BufferUtils.base64Encode(this.data);
			else
				result += '; data (json)=' + JSON.stringify(this.data);
		}
		if(this.extras)
			result += '; extras=' + JSON.stringify(this.extras);
		result += ']';
		return result;
	};

	Message.encrypt = function(msg, options, callback) {
		var data = msg.data,
			encoding = msg.encoding,
			cipher = options.channelCipher;

		encoding = encoding ? (encoding + '/') : '';
		if(!BufferUtils.isBuffer(data)) {
			data = BufferUtils.utf8Encode(String(data));
			encoding = encoding + 'utf-8/';
		}
		cipher.encrypt(data, function(err, data) {
			if (err) {
				callback(err);
				return;
			}
			msg.data = data;
			msg.encoding = encoding + 'cipher+' + cipher.algorithm;
			callback(null, msg);
		});
	};

	Message.encode = function(msg, options, callback) {
		var data = msg.data, encoding,
			nativeDataType = typeof(data) == 'string' || BufferUtils.isBuffer(data) || data === null || data === undefined;

		if (!nativeDataType) {
			if (Utils.isObject(data) || Utils.isArray(data)) {
				msg.data = JSON.stringify(data);
				msg.encoding = (encoding = msg.encoding) ? (encoding + '/json') : 'json';
			} else {
				throw new ErrorInfo('Data type is unsupported', 40013, 400);
			}
		}

		if(options != null && options.cipher) {
			Message.encrypt(msg, options, callback);
		} else {
			callback(null, msg);
		}
	};

	Message.encodeArray = function(messages, options, callback) {
		var processed = 0;
		for (var i = 0; i < messages.length; i++) {
			Message.encode(messages[i], options, function(err, msg) {
				if (err) {
					callback(err);
					return;
				}
				processed++;
				if (processed == messages.length) {
					callback(null, messages);
				}
			});
		}
	};

	Message.serialize = Utils.encodeBody;

	Message.decode = function(message, options) {
		var encoding = message.encoding;
		if(encoding) {
			var xforms = encoding.split('/'),
				i, j = xforms.length,
				data = message.data;

			try {
				while((i = j) > 0) {
					var match = xforms[--j].match(/([\-\w]+)(\+([\w\-]+))?/);
					if(!match) break;
					var xform = match[1];
					switch(xform) {
						case 'base64':
							data = BufferUtils.base64Decode(String(data));
							continue;
						case 'utf-8':
							data = BufferUtils.utf8Decode(data);
							continue;
						case 'json':
							data = JSON.parse(data);
							continue;
						case 'cipher':
							if(options != null && options.cipher) {
								var xformAlgorithm = match[3], cipher = options.channelCipher;
								/* don't attempt to decrypt unless the cipher params are compatible */
								if(xformAlgorithm != cipher.algorithm) {
									throw new Error('Unable to decrypt message with given cipher; incompatible cipher params');
								}
								data = cipher.decrypt(data);
								continue;
							} else {
								throw new Error('Unable to decrypt message; not an encrypted channel');
							}
						default:
							throw new Error("Unknown encoding");
					}
					break;
				}
			} catch(e) {
				throw new ErrorInfo('Error processing the ' + xform + ' encoding, decoder returned ‘' + e.message + '’', 40013, 400);
			} finally {
				message.encoding = (i <= 0) ? null : xforms.slice(0, i).join('/');
				message.data = data;
			}
		}
	};

	Message.fromResponseBody = function(body, options, format) {
		if(format) {
			body = Utils.decodeBody(body, format);
		}

		for(var i = 0; i < body.length; i++) {
			var msg = body[i] = Message.fromValues(body[i]);
			try {
				Message.decode(msg, options);
			} catch (e) {
				Logger.logAction(Logger.LOG_ERROR, 'Message.fromResponseBody()', e.toString());
			}
		}
		return body;
	};

	Message.fromValues = function(values) {
		return Utils.mixin(new Message(), values);
	};

	Message.fromValuesArray = function(values) {
		var count = values.length, result = new Array(count);
		for(var i = 0; i < count; i++) result[i] = Message.fromValues(values[i]);
		return result;
	};

	function normalizeCipherOptions(options) {
		if(options && options.cipher && !options.cipher.channelCipher) {
			if(!Crypto) throw new Error('Encryption not enabled; use ably.encryption.js instead');
			var cipher = Crypto.getCipher(options.cipher);
			options.cipher = cipher.cipherParams;
			options.channelCipher = cipher.cipher;
		}
	}

	Message.fromEncoded = function(encoded, options) {
		var msg = Message.fromValues(encoded);
		normalizeCipherOptions(options);
		/* if decoding fails at any point, catch and return the message decoded to
		 * the fullest extent possible */
		try {
			Message.decode(msg, options);
		} catch(e) {
			Logger.logAction(Logger.LOG_ERROR, 'Message.fromEncoded()', e.toString());
		}
		return msg;
	};

	Message.fromEncodedArray = function(encodedArray, options) {
		normalizeCipherOptions(options);
		return Utils.arrMap(encodedArray, function(encoded) {
			return Message.fromEncoded(encoded, options);
		});
	};

	function getMessageSize(msg) {
		var size = 0;
		if(msg.name) {
			size += msg.name.length;
		}
		if(msg.clientId) {
			size += msg.clientId.length;
		}
		if(msg.extras) {
			size += JSON.stringify(msg.extras).length;
		}
		if(msg.data) {
			size += Utils.dataSizeBytes(msg.data);
		}
		return size;
	}
	/* This should be called on encode()d (and encrypt()d) Messages (as it
	 * assumes the data is a string or buffer) */
	Message.getMessagesSize = function(messages) {
		var msg, total = 0;
		for(var i=0; i<messages.length; i++) {
			msg = messages[i];
			total += (msg.size || (msg.size = getMessageSize(msg)));
		}
		return total;
	};

	return Message;
})();

var PresenceMessage = (function() {

	function toActionValue(actionString) {
		return Utils.arrIndexOf(PresenceMessage.Actions, actionString)
	}

	function PresenceMessage() {
		this.action = undefined;
		this.id = undefined;
		this.timestamp = undefined;
		this.clientId = undefined;
		this.connectionId = undefined;
		this.data = undefined;
		this.encoding = undefined;
		this.size = undefined;
	}

	PresenceMessage.Actions = [
		'absent',
		'present',
		'enter',
		'leave',
		'update'
	];

	/* Returns whether this presenceMessage is synthesized, i.e. was not actually
	 * sent by the connection (usually means a leave event sent 15s after a
	 * disconnection). This is useful because synthesized messages cannot be
	 * compared for newness by id lexicographically - RTP2b1
	 */
	PresenceMessage.prototype.isSynthesized = function() {
		return this.id.substring(this.connectionId.length, 0) !== this.connectionId;
	};

	/* RTP2b2 */
	PresenceMessage.prototype.parseId = function() {
		var parts = this.id.split(':');
		return {
			connectionId: parts[0],
			msgSerial: parseInt(parts[1], 10),
			index: parseInt(parts[2], 10)
		};
	};

	/**
	 * Overload toJSON() to intercept JSON.stringify()
	 * @return {*}
	 */
	PresenceMessage.prototype.toJSON = function() {
		var result = {
			clientId: this.clientId,
			/* Convert presence action back to an int for sending to Ably */
			action: toActionValue(this.action),
			encoding: this.encoding
		};

		/* encode data to base64 if present and we're returning real JSON;
		 * although msgpack calls toJSON(), we know it is a stringify()
		 * call if it has a non-empty arguments list */
		var data = this.data;
		if(data && BufferUtils.isBuffer(data)) {
			if(arguments.length > 0) {
				/* stringify call */
				var encoding = this.encoding;
				result.encoding = encoding ? (encoding + '/base64') : 'base64';
				data = BufferUtils.base64Encode(data);
			} else {
				/* Called by msgpack. toBuffer returns a datatype understandable by
				 * that platform's msgpack implementation (Buffer in node, Uint8Array
				 * in browsers) */
				data = BufferUtils.toBuffer(data);
			}
		}
		result.data = data;
		return result;
	};

	PresenceMessage.prototype.toString = function() {
		var result = '[PresenceMessage';
		result += '; action=' + this.action;
		if(this.id)
			result += '; id=' + this.id;
		if(this.timestamp)
			result += '; timestamp=' + this.timestamp;
		if(this.clientId)
			result += '; clientId=' + this.clientId;
		if(this.connectionId)
			result += '; connectionId=' + this.connectionId;
		if(this.encoding)
			result += '; encoding=' + this.encoding;
		if(this.data) {
			if (typeof(this.data) == 'string')
				result += '; data=' + this.data;
			else if (BufferUtils.isBuffer(this.data))
				result += '; data (buffer)=' + BufferUtils.base64Encode(this.data);
			else
				result += '; data (json)=' + JSON.stringify(this.data);
		}
		result += ']';
		return result;
	};
	PresenceMessage.encode = Message.encode;
	PresenceMessage.decode = Message.decode;

	PresenceMessage.fromResponseBody = function(body, options, format) {
		if(format) {
			body = Utils.decodeBody(body, format);
		}

		for(var i = 0; i < body.length; i++) {
			var msg = body[i] = PresenceMessage.fromValues(body[i], true);
			try {
				PresenceMessage.decode(msg, options);
			} catch (e) {
				Logger.logAction(Logger.LOG_ERROR, 'PresenceMessage.fromResponseBody()', e.toString());
			}
		}
		return body;
	};

	/* Creates a PresenceMessage from specified values, with a string presence action */
	PresenceMessage.fromValues = function(values, stringifyAction) {
		if(stringifyAction) {
			values.action = PresenceMessage.Actions[values.action];
		}
		return Utils.mixin(new PresenceMessage(), values);
	};

	PresenceMessage.fromValuesArray = function(values) {
		var count = values.length, result = new Array(count);
		for(var i = 0; i < count; i++) result[i] = PresenceMessage.fromValues(values[i]);
		return result;
	};

	PresenceMessage.fromEncoded = function(encoded, options) {
		var msg = PresenceMessage.fromValues(encoded, true);
		/* if decoding fails at any point, catch and return the message decoded to
		 * the fullest extent possible */
		try {
			PresenceMessage.decode(msg, options);
		} catch(e) {
			Logger.logAction(Logger.LOG_ERROR, 'PresenceMessage.fromEncoded()', e.toString());
		}
		return msg;
	};

	PresenceMessage.fromEncodedArray = function(encodedArray, options) {
		return Utils.arrMap(encodedArray, function(encoded) {
			return PresenceMessage.fromEncoded(encoded, options);
		});
	};

	PresenceMessage.getMessagesSize = Message.getMessagesSize;

	return PresenceMessage;
})();

var ProtocolMessage = (function() {

	function ProtocolMessage() {
		this.action = undefined;
		this.flags = undefined;
		this.id = undefined;
		this.timestamp = undefined;
		this.count = undefined;
		this.error = undefined;
		this.connectionId = undefined;
		this.connectionKey = undefined;
		this.connectionSerial = undefined;
		this.channel = undefined;
		this.channelSerial = undefined;
		this.msgSerial = undefined;
		this.messages = undefined;
		this.presence = undefined;
		this.auth = undefined;
	}

	var actions = ProtocolMessage.Action = {
		'HEARTBEAT' : 0,
		'ACK' : 1,
		'NACK' : 2,
		'CONNECT' : 3,
		'CONNECTED' : 4,
		'DISCONNECT' : 5,
		'DISCONNECTED' : 6,
		'CLOSE' : 7,
		'CLOSED' : 8,
		'ERROR' : 9,
		'ATTACH' : 10,
		'ATTACHED' : 11,
		'DETACH' : 12,
		'DETACHED' : 13,
		'PRESENCE' : 14,
		'MESSAGE' : 15,
		'SYNC' : 16,
		'AUTH' : 17
	};

	ProtocolMessage.ActionName = [];
	Utils.arrForEach(Utils.keysArray(ProtocolMessage.Action, true), function(name) {
		ProtocolMessage.ActionName[actions[name]] = name;
	});

	var flags = {
		/* Channel attach state flags */
		'HAS_PRESENCE':       1 << 0,
		'HAS_BACKLOG':        1 << 1,
		'RESUMED':            1 << 2,
		'TRANSIENT':          1 << 4,
		/* Channel mode flags */
		'PRESENCE':           1 << 16,
		'PUBLISH':            1 << 17,
		'SUBSCRIBE':          1 << 18,
		'PRESENCE_SUBSCRIBE': 1 << 19
	};
	var flagNames = Utils.keysArray(flags);
	flags.MODE_ALL = flags.PRESENCE | flags.PUBLISH | flags.SUBSCRIBE | flags.PRESENCE_SUBSCRIBE;

	ProtocolMessage.prototype.hasFlag = function(flag) {
		return ((this.flags & flags[flag]) > 0);
	};

	ProtocolMessage.prototype.setFlag = function(flag) {
		return this.flags = this.flags | flags[flag];
	};

	ProtocolMessage.prototype.getMode = function() {
		return this.flags && (this.flags & flags.MODE_ALL);
	};

	ProtocolMessage.serialize = Utils.encodeBody;

	ProtocolMessage.deserialize = function(serialized, format) {
		var deserialized = Utils.decodeBody(serialized, format);
		return ProtocolMessage.fromDeserialized(deserialized);
	};

	ProtocolMessage.fromDeserialized = function(deserialized) {
		var error = deserialized.error;
		if(error) deserialized.error = ErrorInfo.fromValues(error);
		var messages = deserialized.messages;
		if(messages) for(var i = 0; i < messages.length; i++) messages[i] = Message.fromValues(messages[i]);
		var presence = deserialized.presence;
		if(presence) for(var i = 0; i < presence.length; i++) presence[i] = PresenceMessage.fromValues(presence[i], true);
		return Utils.mixin(new ProtocolMessage(), deserialized);
	};

	ProtocolMessage.fromValues = function(values) {
		return Utils.mixin(new ProtocolMessage(), values);
	};

	function toStringArray(array) {
		var result = [];
		if (array) {
			for (var i = 0; i < array.length; i++) {
				result.push(array[i].toString());
			}
		}
		return '[ ' + result.join(', ') + ' ]';
	}

	var simpleAttributes = 'id channel channelSerial connectionId connectionKey connectionSerial count msgSerial timestamp'.split(' ');

	ProtocolMessage.stringify = function(msg) {
		var result = '[ProtocolMessage';
		if(msg.action !== undefined)
			result += '; action=' + ProtocolMessage.ActionName[msg.action] || msg.action;

		var attribute;
		for (var attribIndex = 0; attribIndex < simpleAttributes.length; attribIndex++) {
			attribute = simpleAttributes[attribIndex];
			if(msg[attribute] !== undefined)
				result += '; ' + attribute + '=' + msg[attribute];
		}

		if(msg.messages)
			result += '; messages=' + toStringArray(Message.fromValuesArray(msg.messages));
		if(msg.presence)
			result += '; presence=' + toStringArray(PresenceMessage.fromValuesArray(msg.presence));
		if(msg.error)
			result += '; error=' + ErrorInfo.fromValues(msg.error).toString();
		if(msg.auth && msg.auth.accessToken)
			result += '; token=' + msg.auth.accessToken;
		if(msg.flags)
			result += '; flags=' + Utils.arrFilter(flagNames, function(flag) {
				return msg.hasFlag(flag);
			}).join(',');

		result += ']';
		return result;
	};

	/* Only valid for channel messages */
	ProtocolMessage.isDuplicate = function(a, b) {
		return a && b &&
			(a.action === actions.MESSAGE || a.action === actions.PRESENCE) &&
			(a.action === b.action) &&
			(a.channel === b.channel) &&
			(a.id === b.id);
	};

	return ProtocolMessage;
})();

var Stats = (function() {

	function MessageCount(values) {
		this.count = (values && values.count) || 0;
		this.data = (values && values.data) || 0;
		this.uncompressedData = (values && values.uncompressedData) || 0;
		this.failed = (values && values.failed) || 0;
		this.refused = (values && values.refused) || 0;
	}

	function MessageCategory(values) {
		MessageCount.call(this, values);
		this.category = undefined;
		if (values && values.category) {
			this.category = { };
			for (var key in values.category) {
				var value = values.category[key];
				if (Object.prototype.hasOwnProperty.call(values.category, key) && value) {
					this.category[key] = new MessageCount(value);
				}
			}
		}
	}

	function ResourceCount(values) {
		this.peak = (values && values.peak) || 0;
		this.min = (values && values.min) || 0;
		this.mean = (values && values.mean) || 0;
		this.opened = (values && values.opened) || 0;
		this.refused = (values && values.refused) || 0;
	}

	function RequestCount(values) {
		this.succeeded = (values && values.succeeded) || 0;
		this.failed = (values && values.failed) || 0;
		this.refused = (values && values.refused) || 0;
	}

	function ConnectionTypes(values) {
		this.plain = new ResourceCount(values && values.plain);
		this.tls = new ResourceCount(values && values.tls);
		this.all = new ResourceCount(values && values.all);
	}

	function MessageTypes(values) {
		this.messages = new MessageCategory(values && values.messages);
		this.presence = new MessageCategory(values && values.presence);
		this.all = new MessageCategory(values && values.all);
	}

	function MessageTraffic(values) {
		this.realtime = new MessageTypes(values && values.realtime);
		this.rest = new MessageTypes(values && values.rest);
		this.webhook = new MessageTypes(values && values.webhook);
		this.sharedQueue = new MessageTypes(values && values.sharedQueue);
		this.externalQueue = new MessageTypes(values && values.externalQueue);
		this.httpEvent = new MessageTypes(values && values.httpEvent);
		this.push = new MessageTypes(values && values.push);
		this.all = new MessageTypes(values && values.all);
	}

	function MessageDirections(values) {
		this.all           = new MessageTypes(values && values.all);
		this.inbound       = new MessageTraffic(values && values.inbound);
		this.outbound      = new MessageTraffic(values && values.outbound);
	}

	function XchgMessages(values) {
		this.all           = new MessageTypes(values && values.all);
		this.producerPaid  = new MessageDirections(values && values.producerPaid);
		this.consumerPaid  = new MessageDirections(values && values.consumerPaid);
	}

	function PushStats(values) {
		this.messages = (values && values.messages) || 0;
		var notifications = values && values.notifications;
		this.notifications = {
			invalid: notifications && notifications.invalid || 0,
			attempted: notifications && notifications.attempted || 0,
			successful: notifications && notifications.successful || 0,
			failed: notifications && notifications.failed || 0
		};
		this.directPublishes = (values && values.directPublishes) || 0;
	}

	function ProcessedCount(values) {
		this.succeeded = (values && values.succeeded) || 0;
		this.skipped = (values && values.skipped) || 0;
		this.failed = (values && values.failed) || 0;
	}

	function ProcessedMessages(values) {
		this.delta = undefined;
		if (values && values.delta) {
			this.delta = { };
			for (var key in values.delta) {
				var value = values.delta[key];
				if (Object.prototype.hasOwnProperty.call(values.delta, key) && value) {
					this.delta[key] = new ProcessedCount(value);
				}
			}
		}
	}

	function Stats(values) {
		MessageDirections.call(this, values);
		this.persisted     = new MessageTypes(values && values.persisted);
		this.connections   = new ConnectionTypes(values && values.connections);
		this.channels      = new ResourceCount(values && values.channels);
		this.apiRequests   = new RequestCount(values && values.apiRequests);
		this.tokenRequests = new RequestCount(values && values.tokenRequests);
		this.xchgProducer  = new XchgMessages(values && values.xchgProducer);
		this.xchgConsumer  = new XchgMessages(values && values.xchgConsumer);
		this.push          = new PushStats(values && values.pushStats);
		this.processed     = new ProcessedMessages(values && values.processed);
		this.inProgress    = (values && values.inProgress) || undefined;
		this.unit          = (values && values.unit) || undefined;
		this.intervalId    = (values && values.intervalId) || undefined;
	}

	Stats.fromValues = function(values) {
		return new Stats(values);
	};

	return Stats;
})();

var DeviceDetails = (function() {

	function DeviceDetails() {
		this.id = undefined;
		this.deviceSecret = undefined;
		this.platform = undefined;
		this.formFactor = undefined;
		this.clientId = undefined;
		this.metadata = undefined;
		this.deviceIdentityToken = undefined;
		this.push = {
			recipient: undefined,
			state: undefined,
			errorReason: undefined
		};
	}

	/**
	 * Overload toJSON() to intercept JSON.stringify()
	 * @return {*}
	 */
	DeviceDetails.prototype.toJSON = function() {
		return {
			id: this.id,
			deviceSecret: this.deviceSecret,
			platform: this.platform,
			formFactor: this.formFactor,
			clientId: this.clientId,
			metadata: this.metadata,
			deviceIdentityToken: this.deviceIdentityToken,
			push: {
				recipient: this.push.recipient,
				state: this.push.state,
				errorReason: this.push.errorReason
			}
		};
	};

	DeviceDetails.prototype.toString = function() {
		var result = '[DeviceDetails';
		if(this.id)
			result += '; id=' + this.id;
		if(this.platform)
			result += '; platform=' + this.platform;
		if(this.formFactor)
			result += '; formFactor=' + this.formFactor;
		if(this.clientId)
			result += '; clientId=' + this.clientId;
		if(this.metadata)
			result += '; metadata=' + this.metadata;
		if(this.deviceIdentityToken)
			result += '; deviceIdentityToken=' + JSON.stringify(this.deviceIdentityToken);
		if(this.push.recipient)
			result += '; push.recipient=' + JSON.stringify(this.push.recipient);
		if(this.push.state)
			result += '; push.state=' + this.push.state;
		if(this.push.errorReason)
			result += '; push.errorReason=' + this.push.errorReason;
		if(this.push.metadata)
			result += '; push.metadata=' + this.push.metadata;
		result += ']';
		return result;
	};

	DeviceDetails.toRequestBody = Utils.encodeBody;

	DeviceDetails.fromResponseBody = function(body, format) {
		if(format) {
			body = Utils.decodeBody(body, format);
		}

		if(Utils.isArray(body)) {
			return DeviceDetails.fromValuesArray(body);
		} else {
			return DeviceDetails.fromValues(body);
		}
	};

	DeviceDetails.fromValues = function(values) {
		return Utils.mixin(new DeviceDetails(), values);
	};

	DeviceDetails.fromValuesArray = function(values) {
		var count = values.length, result = new Array(count);
		for(var i = 0; i < count; i++) result[i] = DeviceDetails.fromValues(values[i]);
		return result;
	};

	return DeviceDetails;
})();

var PushChannelSubscription = (function() {

	function PushChannelSubscription() {
		this.channel = undefined;
		this.deviceId = undefined;
		this.clientId = undefined;
	}

	/**
	 * Overload toJSON() to intercept JSON.stringify()
	 * @return {*}
	 */
	PushChannelSubscription.prototype.toJSON = function() {
		return {
			channel: this.channel,
			deviceId: this.deviceId,
			clientId: this.clientId
		};
	};

	PushChannelSubscription.prototype.toString = function() {
		var result = '[PushChannelSubscription';
		if(this.channel)
			result += '; channel=' + this.channel;
		if(this.deviceId)
			result += '; deviceId=' + this.deviceId;
		if(this.clientId)
			result += '; clientId=' + this.clientId;
		result += ']';
		return result;
	};

	PushChannelSubscription.toRequestBody = Utils.encodeBody;

	PushChannelSubscription.fromResponseBody = function(body, format) {
		if(format) {
			body = Utils.decodeBody(body, format);
		}

		if(Utils.isArray(body)) {
			return PushChannelSubscription.fromValuesArray(body);
		} else {
			return PushChannelSubscription.fromValues(body);
		}
	};

	PushChannelSubscription.fromValues = function(values) {
		return Utils.mixin(new PushChannelSubscription(), values);
	};

	PushChannelSubscription.fromValuesArray = function(values) {
		var count = values.length, result = new Array(count);
		for(var i = 0; i < count; i++) result[i] = PushChannelSubscription.fromValues(values[i]);
		return result;
	};

	return PushChannelSubscription;
})();

var ConnectionError = {
	disconnected: ErrorInfo.fromValues({
		statusCode: 400,
		code: 80003,
		message: 'Connection to server temporarily unavailable'
	}),
	suspended: ErrorInfo.fromValues({
		statusCode: 400,
		code: 80002,
		message: 'Connection to server unavailable'
	}),
	failed: ErrorInfo.fromValues({
		statusCode: 400,
		code: 80000,
		message: 'Connection failed or disconnected by server'
	}),
	closing: ErrorInfo.fromValues({
		statusCode: 400,
		code: 80017,
		message: 'Connection closing'
	}),
	closed: ErrorInfo.fromValues({
		statusCode: 400,
		code: 80017,
		message: 'Connection closed'
	}),
	unknownConnectionErr: ErrorInfo.fromValues({
		statusCode: 500,
		code: 50002,
		message: 'Internal connection error'
	}),
	unknownChannelErr: ErrorInfo.fromValues({
		statusCode: 500,
		code: 50001,
		message: 'Internal channel error'
	})
};

var MessageQueue = (function() {
	function MessageQueue() {
		EventEmitter.call(this);
		this.messages = [];
	}
	Utils.inherits(MessageQueue, EventEmitter);

	MessageQueue.prototype.count = function() {
		return this.messages.length;
	};

	MessageQueue.prototype.push = function(message) {
		this.messages.push(message);
	};

	MessageQueue.prototype.shift = function() {
		return this.messages.shift();
	};

	MessageQueue.prototype.last = function() {
		return this.messages[this.messages.length - 1];
	};

	MessageQueue.prototype.copyAll = function() {
		return this.messages.slice();
	};

	MessageQueue.prototype.append = function(messages) {
		this.messages.push.apply(this.messages, messages);
	};

	MessageQueue.prototype.prepend = function(messages) {
		this.messages.unshift.apply(this.messages, messages);
	};

	MessageQueue.prototype.completeMessages = function(serial, count, err) {
		Logger.logAction(Logger.LOG_MICRO, 'MessageQueue.completeMessages()', 'serial = ' + serial + '; count = ' + count);
		err = err || null;
		var messages = this.messages;
		var first = messages[0];
		if(first) {
			var startSerial = first.message.msgSerial;
			var endSerial = serial + count; /* the serial of the first message that is *not* the subject of this call */
			if(endSerial > startSerial) {
				var completeMessages = messages.splice(0, (endSerial - startSerial));
				for(var i = 0; i < completeMessages.length; i++) {
					completeMessages[i].callback(err);
				}
			}
			if(messages.length == 0)
				this.emit('idle');
		}
	};

	MessageQueue.prototype.completeAllMessages = function(err) {
		this.completeMessages(0, Number.MAX_SAFE_INTEGER || Number.MAX_VALUE, err);
	};

	MessageQueue.prototype.clear = function() {
		Logger.logAction(Logger.LOG_MICRO, 'MessageQueue.clear()', 'clearing ' + this.messages.length + ' messages');
		this.messages = [];
		this.emit('idle');
	};

	return MessageQueue;
})();

var Protocol = (function() {
	var actions = ProtocolMessage.Action;

	function Protocol(transport) {
		EventEmitter.call(this);
		this.transport = transport;
		this.messageQueue = new MessageQueue();
		var self = this;
		transport.on('ack', function(serial, count) { self.onAck(serial, count); });
		transport.on('nack', function(serial, count, err) { self.onNack(serial, count, err); });
	}
	Utils.inherits(Protocol, EventEmitter);

	Protocol.prototype.onAck = function(serial, count) {
		Logger.logAction(Logger.LOG_MICRO, 'Protocol.onAck()', 'serial = ' + serial + '; count = ' + count);
		this.messageQueue.completeMessages(serial, count);
	};

	Protocol.prototype.onNack = function(serial, count, err) {
		Logger.logAction(Logger.LOG_ERROR, 'Protocol.onNack()', 'serial = ' + serial + '; count = ' + count + '; err = ' + Utils.inspectError(err));
		if(!err) {
			err = new ErrorInfo('Unable to send message; channel not responding', 50001, 500);
		}
		this.messageQueue.completeMessages(serial, count, err);
	};

	Protocol.prototype.onceIdle = function(listener) {
		var messageQueue = this.messageQueue;
		if(messageQueue.count() === 0) {
			listener();
			return;
		}
		messageQueue.once('idle', listener);
	};

	Protocol.prototype.send = function(pendingMessage) {
		if(pendingMessage.ackRequired) {
			this.messageQueue.push(pendingMessage);
		}
		if (Logger.shouldLog(Logger.LOG_MICRO)) {
			Logger.logAction(Logger.LOG_MICRO, 'Protocol.send()', 'sending msg; ' + ProtocolMessage.stringify(pendingMessage.message));
		}
		pendingMessage.sendAttempted = true;
		this.transport.send(pendingMessage.message);
	};

	Protocol.prototype.getTransport = function() {
		return this.transport;
	};

	Protocol.prototype.getPendingMessages = function() {
		return this.messageQueue.copyAll();
	};

	Protocol.prototype.clearPendingMessages = function() {
		return this.messageQueue.clear();
	};

	Protocol.prototype.finish = function() {
		var transport = this.transport;
		this.onceIdle(function() {
			transport.disconnect();
		});
	};

	function PendingMessage(message, callback) {
		this.message = message;
		this.callback = callback;
		this.merged = false;
		var action = message.action;
		this.sendAttempted = false;
		this.ackRequired = (action == actions.MESSAGE || action == actions.PRESENCE);
	}
	Protocol.PendingMessage = PendingMessage;

	return Protocol;
})();

var ConnectionManager = (function() {
	var haveWebStorage = !!(typeof(WebStorage) !== 'undefined' && WebStorage.get);
	var haveSessionStorage = !!(typeof(WebStorage) !== 'undefined' && WebStorage.getSession);
	var actions = ProtocolMessage.Action;
	var PendingMessage = Protocol.PendingMessage;
	var noop = function() {};
	var transportPreferenceOrder = Defaults.transportPreferenceOrder;
	var optimalTransport = transportPreferenceOrder[transportPreferenceOrder.length - 1];
	var transportPreferenceName = 'ably-transport-preference';

	var sessionRecoveryName = 'ably-connection-recovery';
	function getSessionRecoverData() {
		return haveSessionStorage && WebStorage.getSession(sessionRecoveryName);
	}
	function setSessionRecoverData(value) {
		return haveSessionStorage && WebStorage.setSession(sessionRecoveryName, value);
	}
	function clearSessionRecoverData() {
		return haveSessionStorage && WebStorage.removeSession(sessionRecoveryName);
	}

	function betterTransportThan(a, b) {
		return Utils.arrIndexOf(transportPreferenceOrder, a.shortName) >
		   Utils.arrIndexOf(transportPreferenceOrder, b.shortName);
	}

	function TransportParams(options, host, mode, connectionKey) {
		this.options = options;
		this.host = host;
		this.mode = mode;
		this.connectionKey = connectionKey;
		this.format = options.useBinaryProtocol ? 'msgpack' : 'json';

		this.connectionSerial = undefined;
		this.timeSerial = undefined;
	}

	TransportParams.prototype.getConnectParams = function(authParams) {
		var params = authParams ? Utils.copy(authParams) : {};
		var options = this.options;
		switch(this.mode) {
			case 'upgrade':
				params.upgrade = this.connectionKey;
				break;
			case 'resume':
				params.resume = this.connectionKey;
				if(this.timeSerial !== undefined) {
					params.timeSerial = this.timeSerial;
				} else if(this.connectionSerial !== undefined) {
					params.connectionSerial = this.connectionSerial;
				}
				break;
			case 'recover':
				var match = options.recover.split(':');
				if(match) {
					params.recover = match[0];
					var recoverSerial = match[1];
					if(isNaN(recoverSerial)) {
						params.timeSerial = recoverSerial;
					} else {
						params.connectionSerial = recoverSerial;
					}
				}
				break;
		}
		if(options.clientId !== undefined) {
			params.clientId = options.clientId;
		}
		if(options.echoMessages === false) {
			params.echo = 'false';
		}
		if(this.format !== undefined) {
			params.format = this.format;
		}
		if(this.stream !== undefined) {
			params.stream = this.stream;
		}
		if(this.heartbeats !== undefined) {
			params.heartbeats = this.heartbeats;
		}
		params.v = Defaults.apiVersion;
		params.lib = Defaults.libstring;
		if(options.transportParams !== undefined) {
			Utils.mixin(params, options.transportParams);
		}
		return params;
	};

	TransportParams.prototype.toString = function() {
		var result = '[mode=' + this.mode;
		if(this.host) { result += (',host=' + this.host); }
		if(this.connectionKey) { result += (',connectionKey=' + this.connectionKey); }
		if(this.connectionSerial !== undefined) { result += (',connectionSerial=' + this.connectionSerial); }
		if(this.timeSerial) { result += (',timeSerial=' + this.timeSerial); }
		if(this.format) { result += (',format=' + this.format); }
		result += ']';

		return result;
	};

	/* public constructor */
	function ConnectionManager(realtime, options) {
		EventEmitter.call(this);
		this.realtime = realtime;
		this.options = options;
		var timeouts = options.timeouts;
		var self = this;
		/* connectingTimeout: leave preferenceConnectTimeout (~6s) to try the
		 * preference transport, then realtimeRequestTimeout (~10s) to establish
		 * the base transport in case that fails */
		var connectingTimeout = timeouts.preferenceConnectTimeout + timeouts.realtimeRequestTimeout;
		this.states = {
			initialized:   {state: 'initialized',   terminal: false, queueEvents: true,  sendEvents: false, failState: 'disconnected'},
			connecting:    {state: 'connecting',    terminal: false, queueEvents: true,  sendEvents: false, retryDelay: connectingTimeout, failState: 'disconnected'},
			connected:     {state: 'connected',     terminal: false, queueEvents: false, sendEvents: true,  failState: 'disconnected'},
			synchronizing: {state: 'connected',     terminal: false, queueEvents: true,  sendEvents: false, forceQueueEvents: true, failState: 'disconnected'},
			disconnected:  {state: 'disconnected',  terminal: false, queueEvents: true,  sendEvents: false, retryDelay: timeouts.disconnectedRetryTimeout, failState: 'disconnected'},
			suspended:     {state: 'suspended',     terminal: false, queueEvents: false, sendEvents: false, retryDelay: timeouts.suspendedRetryTimeout, failState: 'suspended'},
			closing:       {state: 'closing',       terminal: false, queueEvents: false, sendEvents: false, retryDelay: timeouts.realtimeRequestTimeout, failState: 'closed'},
			closed:        {state: 'closed',        terminal: true,  queueEvents: false, sendEvents: false, failState: 'closed'},
			failed:        {state: 'failed',        terminal: true,  queueEvents: false, sendEvents: false, failState: 'failed'}
		};
		this.state = this.states.initialized;
		this.errorReason = null;

		this.queuedMessages = new MessageQueue();
		this.msgSerial = 0;
		this.connectionDetails = undefined;
		this.connectionId = undefined;
		this.connectionKey = undefined;
		this.timeSerial = undefined;
		this.connectionSerial = undefined;
		this.connectionStateTtl = timeouts.connectionStateTtl;
		this.maxIdleInterval = null;

		this.transports = Utils.intersect((options.transports || Defaults.defaultTransports), ConnectionManager.supportedTransports);
		/* baseTransports selects the leftmost transport in the Defaults.baseTransportOrder list
		* that's both requested and supported. Normally this will be xhr_polling;
		* if xhr isn't supported it will be jsonp. If the user has forced a
		* transport, it'll just be that one. */
		this.baseTransport = Utils.intersect(Defaults.baseTransportOrder, this.transports)[0];
		this.upgradeTransports = Utils.intersect(this.transports, Defaults.upgradeTransports);
		this.transportPreference = null;

		this.httpHosts = Defaults.getHosts(options);
		this.activeProtocol = null;
		this.proposedTransports = [];
		this.pendingTransports = [];
		this.host = null;
		this.lastAutoReconnectAttempt = null;
		this.lastActivity = null;
		this.mostRecentMsg = null;
		this.forceFallbackHost = false;
		this.connectCounter = 0;

		Logger.logAction(Logger.LOG_MINOR, 'Realtime.ConnectionManager()', 'started');
		Logger.logAction(Logger.LOG_MICRO, 'Realtime.ConnectionManager()', 'requested transports = [' + (options.transports || Defaults.defaultTransports) + ']');
		Logger.logAction(Logger.LOG_MICRO, 'Realtime.ConnectionManager()', 'available transports = [' + this.transports + ']');
		Logger.logAction(Logger.LOG_MICRO, 'Realtime.ConnectionManager()', 'http hosts = [' + this.httpHosts + ']');

		if(!this.transports.length) {
			var msg = 'no requested transports available';
			Logger.logAction(Logger.LOG_ERROR, 'realtime.ConnectionManager()', msg);
			throw new Error(msg);
		}

		var addEventListener = Platform.addEventListener;
		if(addEventListener) {
			/* intercept close event in browser to persist connection id if requested */
			if(haveSessionStorage && typeof options.recover === 'function') {
				/* Usually can't use bind as not supported in IE8, but IE doesn't support sessionStorage, so... */
				addEventListener('beforeunload', this.persistConnection.bind(this));
			}

			if(options.closeOnUnload === true) {
				addEventListener('beforeunload', function() {
					Logger.logAction(Logger.LOG_MAJOR, 'Realtime.ConnectionManager()', 'beforeunload event has triggered the connection to close as closeOnUnload is true');
					self.requestState({state: 'closing'});
				});
			}

			/* Listen for online and offline events */
			addEventListener('online', function() {
				if(self.state == self.states.disconnected || self.state == self.states.suspended) {
					Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager caught browser ‘online’ event', 'reattempting connection');
					self.requestState({state: 'connecting'});
				}
			});
			addEventListener('offline', function() {
				if(self.state == self.states.connected) {
					Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager caught browser ‘offline’ event', 'disconnecting active transport');
					// Not sufficient to just go to the 'disconnected' state, want to
					// force all transports to reattempt the connection. Will immediately
					// retry.
					self.disconnectAllTransports();
				}
			});
		}
	}
	Utils.inherits(ConnectionManager, EventEmitter);

	/*********************
	 * transport management
	 *********************/

	ConnectionManager.supportedTransports = {};

	ConnectionManager.prototype.createTransportParams = function(host, mode) {
		var params = new TransportParams(this.options, host, mode, this.connectionKey);
		if(this.timeSerial) {
			params.timeSerial = this.timeSerial;
		} else if(this.connectionSerial !== undefined) {
			params.connectionSerial = this.connectionSerial;
		}
		return params;
	};

	ConnectionManager.prototype.getTransportParams = function(callback) {
		var self = this;

		function decideMode(modeCb) {
			if(self.connectionKey) {
				modeCb('resume');
				return;
			}

			if(typeof self.options.recover === 'string') {
				modeCb('recover');
				return;
			}

			var recoverFn = self.options.recover,
				lastSessionData = getSessionRecoverData();
			if(lastSessionData && typeof(recoverFn) === 'function') {
				Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.getTransportParams()', 'Calling clientOptions-provided recover function with last session data');
				recoverFn(lastSessionData, function(shouldRecover) {
					if(shouldRecover) {
						self.options.recover = lastSessionData.recoveryKey;
						modeCb('recover');
					} else {
						modeCb('clean');
					}
				});
				return;
			}
			modeCb('clean');
		}

		decideMode(function(mode) {
			var transportParams = self.createTransportParams(null, mode);
			if(mode === 'recover') {
				Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.getTransportParams()', 'Transport recovery mode = recover; recoveryKey = ' + self.options.recover);
				var match = self.options.recover.split(':');
				if(match && match[2]) {
					self.msgSerial = match[2];
				}
			} else {
				Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.getTransportParams()', 'Transport params = ' + transportParams.toString());
			}
			callback(transportParams);
		});
	};

	/**
	 * Attempt to connect using a given transport
	 * @param transportParams
	 * @param candidate, the transport to try
	 * @param callback
	 */
	ConnectionManager.prototype.tryATransport = function(transportParams, candidate, callback) {
		var self = this, host = transportParams.host;
		Logger.logAction(Logger.LOG_MICRO, 'ConnectionManager.tryATransport()', 'trying ' + candidate);
		(ConnectionManager.supportedTransports[candidate]).tryConnect(this, this.realtime.auth, transportParams, function(wrappedErr, transport) {
			var state = self.state;
			if(state == self.states.closing || state == self.states.closed || state == self.states.failed) {
				if(transport) {
					Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.tryATransport()', 'connection ' + state.state + ' while we were attempting the transport; closing ' + transport);
					transport.close();
				}
				callback(true);
				return;
			}

			if(wrappedErr) {
				Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.tryATransport()', 'transport ' + candidate + ' ' + wrappedErr.event + ', err: ' + wrappedErr.error.toString());

				/* Comet transport onconnect token errors can be dealt with here.
				* Websocket ones only happen after the transport claims to be viable,
				* so are dealt with as non-onconnect token errors */
				if(Auth.isTokenErr(wrappedErr.error)) {
					/* re-get a token and try again */
					self.realtime.auth._forceNewToken(null, null, function(err) {
						if(err) {
							self.actOnErrorFromAuthorize(err);
							return;
						}
						self.tryATransport(transportParams, candidate, callback);
					});
				} else if(wrappedErr.event === 'failed') {
					/* Error that's fatal to the connection */
					self.notifyState({state: 'failed', error: wrappedErr.error});
					callback(true);
				} else if(wrappedErr.event === 'disconnected') {
					/* Error with that transport only */
					callback(false);
				}
				return;
			}

			Logger.logAction(Logger.LOG_MICRO, 'ConnectionManager.tryATransport()', 'viable transport ' + candidate + '; setting pending');
			self.setTransportPending(transport, transportParams);
			callback(null, transport);
		});
	};


	/**
	 * Called when a transport is indicated to be viable, and the connectionmanager
	 * expects to activate this transport as soon as it is connected.
	 * @param host
	 * @param transportParams
	 */
	ConnectionManager.prototype.setTransportPending = function(transport, transportParams) {
		var mode = transportParams.mode;
		Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.setTransportPending()', 'transport = ' + transport + '; mode = ' + mode);

		Utils.arrDeleteValue(this.proposedTransports, transport);
		this.pendingTransports.push(transport);

		var self = this;
		transport.once('connected', function(error, connectionId, connectionDetails, connectionPosition) {
			if(mode == 'upgrade' && self.activeProtocol) {
				/*  if ws and xhrs are connecting in parallel, delay xhrs activation to let ws go ahead */
				if(transport.shortName !== optimalTransport && Utils.arrIn(self.getUpgradePossibilities(), optimalTransport)) {
					setTimeout(function() {
						self.scheduleTransportActivation(error, transport, connectionId, connectionDetails, connectionPosition);
					}, self.options.timeouts.parallelUpgradeDelay);
				} else {
					self.scheduleTransportActivation(error, transport, connectionId, connectionDetails, connectionPosition);
				}
			} else {
				self.activateTransport(error, transport, connectionId, connectionDetails, connectionPosition);

				/* allow connectImpl to start the upgrade process if needed, but allow
				 * other event handlers, including activating the transport, to run first */
				Utils.nextTick(function() {
					self.connectImpl(transportParams);
				});
			}

			if(mode === 'recover' && self.options.recover) {
				/* After a successful recovery, we unpersist, as a recovery key cannot
				* be used more than once */
				self.options.recover = null;
				self.unpersistConnection();
			}
		});

		transport.on(['disconnected', 'closed', 'failed'], function(error) {
			self.deactivateTransport(transport, this.event, error);
		});

		this.emit('transport.pending', transport);
	};

	/**
	 * Called when an upgrade transport is connected,
	 * to schedule the activation of that transport.
	 * @param error
	 * @param transport
	 * @param connectionId
	 * @param connectionDetails
	 * @param connectedMessage
	 */
	ConnectionManager.prototype.scheduleTransportActivation = function(error, transport, connectionId, connectionDetails, upgradeConnectionPosition) {
		var self = this,
			currentTransport = this.activeProtocol && this.activeProtocol.getTransport(),
			abandon = function() {
				transport.disconnect();
				Utils.arrDeleteValue(self.pendingTransports, transport);
			};

		if(this.state !== this.states.connected && this.state !== this.states.connecting) {
			/* This is most likely to happen for the delayed xhrs, when xhrs and ws are scheduled in parallel*/
			Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.scheduleTransportActivation()', 'Current connection state (' + this.state.state + (this.state === this.states.synchronizing ? ', but with an upgrade already in progress' : '') + ') is not valid to upgrade in; abandoning upgrade to ' + transport.shortName);
			abandon();
			return;
		}

		if(currentTransport && !betterTransportThan(transport, currentTransport)) {
			Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.scheduleTransportActivation()', 'Proposed transport ' + transport.shortName + ' is no better than current active transport ' + currentTransport.shortName + ' - abandoning upgrade');
			abandon();
			return;
		}

		Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.scheduleTransportActivation()', 'Scheduling transport upgrade; transport = ' + transport);

		this.realtime.channels.onceNopending(function(err) {
			var oldProtocol;
			if(err) {
				Logger.logAction(Logger.LOG_ERROR, 'ConnectionManager.scheduleTransportActivation()', 'Unable to activate transport; transport = ' + transport + '; err = ' + err);
				return;
			}

			if(!transport.isConnected) {
				/* This is only possible if the xhr streaming transport was disconnected during the parallelUpgradeDelay */
				Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.scheduleTransportActivation()', 'Proposed transport ' + transport.shortName + 'is no longer connected; abandoning upgrade');
				abandon();
				return;
			}

			if(self.state === self.states.connected) {
				Logger.logAction(Logger.LOG_MICRO, 'ConnectionManager.scheduleTransportActivation()', 'Currently connected, so temporarily pausing events until the upgrade is complete');
				self.state = self.states.synchronizing;
				oldProtocol = self.activeProtocol;
			} else if(self.state !== self.states.connecting) {
				/* Note: upgrading from the connecting state is valid if the old active
				* transport was deactivated after the upgrade transport first connected;
				* see logic in deactivateTransport */
				Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.scheduleTransportActivation()', 'Current connection state (' + self.state.state + (self.state === self.states.synchronizing ? ', but with an upgrade already in progress' : '') + ') is not valid to upgrade in; abandoning upgrade to ' + transport.shortName);
				abandon();
				return;
			}

			/* If the connectionId has changed, the upgrade hasn't worked. But as
			* it's still an upgrade, realtime still expects a sync - it just needs to
			* be a sync with the new connection position. (And it
			* needs to be set in the library, which is done by activateTransport). */
			var connectionReset = connectionId !== self.connectionId,
				syncPosition = connectionReset ? upgradeConnectionPosition : self;

			if(connectionReset) {
				Logger.logAction(Logger.LOG_ERROR, 'ConnectionManager.scheduleTransportActivation()', 'Upgrade resulted in new connectionId; resetting library connection position from ' + (self.timeSerial || self.connectionSerial) + ' to ' + (syncPosition.timeSerial || syncPosition.connectionSerial) + '; upgrade error was ' + error);
			}

			Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.scheduleTransportActivation()', 'Syncing transport; transport = ' + transport);
			self.sync(transport, syncPosition, function(syncErr, connectionId, postSyncPosition) {
				/* If there's been some problem with syncing (and the connection hasn't
				 * closed or something in the meantime), we have a problem -- we can't
				 * just fall back on the old transport, as we don't know whether
				 * realtime got the sync -- if it did, the old transport is no longer
				 * valid. To be safe, we disconnect both and start again from scratch. */
				if(syncErr) {
					if(self.state === self.states.synchronizing) {
						Logger.logAction(Logger.LOG_ERROR, 'ConnectionManager.scheduleTransportActivation()', 'Unexpected error attempting to sync transport; transport = ' + transport + '; err = ' + syncErr);
						self.disconnectAllTransports();
					}
					return;
				}
				var finishUpgrade = function() {
					Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.scheduleTransportActivation()', 'Activating transport; transport = ' + transport);
					self.activateTransport(error, transport, connectionId, connectionDetails, postSyncPosition);
					/* Restore pre-sync state. If state has changed in the meantime,
					 * don't touch it -- since the websocket transport waits a tick before
					 * disposing itself, it's possible for it to have happily synced
					 * without err while, unknown to it, the connection has closed in the
					 * meantime and the ws transport is scheduled for death */
					if(self.state === self.states.synchronizing) {
						Logger.logAction(Logger.LOG_MICRO, 'ConnectionManager.scheduleTransportActivation()', 'Pre-upgrade protocol idle, sending queued messages on upgraded transport; transport = ' + transport);
						self.state = self.states.connected;
					} else {
						Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.scheduleTransportActivation()', 'Pre-upgrade protocol idle, but state is now ' + self.state.state + ', so leaving unchanged');
					}
					if(self.state.sendEvents) {
						self.sendQueuedMessages();
					}
				};

				/* Wait until sync is done and old transport is idle before activating new transport. This
				 * guarantees that messages arrive at realtime in the same order they are sent.
				 *
				 * If a message times out on the old transport, since it's still the active transport the
				 * message will be requeued. deactivateTransport will see the pending transport and notify
				 * the `connecting` state without starting a new connection, so the new transport can take
				 * over once deactivateTransport clears the old protocol's queue.
				 *
				 * If there is no old protocol, that meant that we weren't in the connected state at the
				 * beginning of the sync - likely the base transport died just before the sync. So can just
				 * finish the upgrade. If we're actually in closing/failed rather than connecting, that's
				 * fine, activatetransport will deal with that. */
				if(oldProtocol) {
				 /* Most of the time this will be already true: the new-transport sync will have given
				 * enough time for in-flight messages on the old transport to complete. */
					oldProtocol.onceIdle(finishUpgrade);
				} else {
					finishUpgrade();
				}
			});
		});
	};

	/**
	 * Called when a transport is connected, and the connectionmanager decides that
	 * it will now be the active transport. Returns whether or not it activated
	 * the transport (if the connection is closing/closed it will choose not to).
	 * @param transport the transport instance
	 * @param connectionId the id of the new active connection
	 * @param connectionDetails the details of the new active connection
	 * @param connectionPosition the position at the point activation; either {connectionSerial: <serial>} or {timeSerial: <serial>}
	 */
	ConnectionManager.prototype.activateTransport = function(error, transport, connectionId, connectionDetails, connectionPosition) {
		Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.activateTransport()', 'transport = ' + transport);
		if(error) {
			Logger.logAction(Logger.LOG_ERROR, 'ConnectionManager.activateTransport()', 'error = ' + error);
		}
		if(connectionId) {
			Logger.logAction(Logger.LOG_MICRO, 'ConnectionManager.activateTransport()', 'connectionId =  ' + connectionId);
		}
		if(connectionDetails) {
			Logger.logAction(Logger.LOG_MICRO, 'ConnectionManager.activateTransport()', 'connectionDetails =  ' + JSON.stringify(connectionDetails));
		}
		if(connectionPosition) {
			Logger.logAction(Logger.LOG_MICRO, 'ConnectionManager.activateTransport()', 'serial =  ' + (connectionPosition.timeSerial || connectionPosition.connectionSerial));
		}

		this.persistTransportPreference(transport);

		/* if the connectionmanager moved to the closing/closed state before this
		 * connection event, then we won't activate this transport */
		var existingState = this.state,
			connectedState = this.states.connected.state;
		Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.activateTransport()', 'current state = ' + existingState.state);
		if(existingState.state == this.states.closing.state || existingState.state == this.states.closed.state || existingState.state == this.states.failed.state) {
			Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.activateTransport()', 'Disconnecting transport and abandoning');
			transport.disconnect();
			return false;
		}

		/* remove this transport from pending transports */
		Utils.arrDeleteValue(this.pendingTransports, transport);

		/* if the transport is not connected (eg because it failed during a
		 * scheduleTransportActivation#onceNoPending wait) then don't activate it */
		if(!transport.isConnected) {
			Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.activateTransport()', 'Declining to activate transport ' + transport + ' since it appears to no longer be connected');
			return false;
		}

		/* the given transport is connected; this will immediately
		 * take over as the active transport */
		var existingActiveProtocol = this.activeProtocol;
		this.activeProtocol = new Protocol(transport);
		this.host = transport.params.host;

		var connectionKey = connectionDetails.connectionKey;
		if(connectionKey && this.connectionKey != connectionKey)  {
			this.setConnection(connectionId, connectionDetails, connectionPosition, !!error);
		}

		/* Rebroadcast any new connectionDetails from the active transport, which
		 * can come at any time (eg following a reauth), and emit an RTN24 UPDATE
		 * event. (Listener added on nextTick because we're in a transport.on('connected')
		 * callback at the moment; if we add it now we'll be adding it to the end
		 * of the listeners array and it'll be called immediately) */
		this.onConnectionDetailsUpdate(connectionDetails, transport);
		var self = this;
		Utils.nextTick(function() {
			transport.on('connected', function(connectedErr, _connectionId, connectionDetails) {
				self.onConnectionDetailsUpdate(connectionDetails, transport);
				self.emit('update', new ConnectionStateChange(connectedState, connectedState, null, connectedErr));
			});
		});

		/* If previously not connected, notify the state change (including any
		 * error). */
		if(existingState.state === this.states.connected.state) {
			if(error) {
				/* if upgrading without error, leave any existing errorReason alone */
				this.errorReason = this.realtime.connection.errorReason = error;
				/* Only bother emitting an upgrade if there's an error; otherwise it's
				 * just a transport upgrade, so auth details won't have changed */
				this.emit('update', new ConnectionStateChange(connectedState, connectedState, null, error));
			}
		} else {
			this.notifyState({state: 'connected', error: error});
			this.errorReason = this.realtime.connection.errorReason = error || null;
		}

		/* Send after the connection state update, as Channels hooks into this to
		 * resend attaches on a new transport if necessary */
		this.emit('transport.active', transport);

		/* Gracefully terminate existing protocol */
		if(existingActiveProtocol) {
			if(existingActiveProtocol.messageQueue.count() > 0) {
				/* We could just requeue pending messages on the new transport, but
				 * actually this should never happen: transports should only take over
				 * from other active transports when upgrading, and upgrading waits for
				 * the old transport to be idle. So log an error. */
				Logger.logAction(Logger.LOG_ERROR, 'ConnectionManager.activateTransport()', 'Previous active protocol (for transport ' + existingActiveProtocol.transport.shortName + ', new one is ' + transport.shortName + ') finishing with ' + existingActiveProtocol.messageQueue.count() + ' messages still pending');
			}
			if(existingActiveProtocol.transport === transport) {
				var msg = 'Assumption violated: activating a transport that was also the transport for the previous active protocol; transport = ' + transport.shortName + '; stack = ' + new Error().stack;
				Logger.logAction(Logger.LOG_ERROR, 'ConnectionManager.activateTransport()', msg);
				ErrorReporter.report('error', msg, 'transport-previously-active');
			} else {
				existingActiveProtocol.finish();
			}
		}

		/* Terminate any other pending transport(s), and
		 * abort any not-yet-pending transport attempts */
		Utils.safeArrForEach(this.pendingTransports, function(pendingTransport) {
			if(pendingTransport === transport) {
				var msg = 'Assumption violated: activating a transport that is still marked as a pending transport; transport = ' + transport.shortName + '; stack = ' + new Error().stack;
				Logger.logAction(Logger.LOG_ERROR, 'ConnectionManager.activateTransport()', msg);
				ErrorReporter.report('error', msg, 'transport-activating-pending');
				Utils.arrDeleteValue(self.pendingTransports, transport);
			} else {
				pendingTransport.disconnect();
			}
		});
		Utils.safeArrForEach(this.proposedTransports, function(proposedTransport) {
			if(proposedTransport === transport) {
				var msg = 'Assumption violated: activating a transport that is still marked as a proposed transport; transport = ' + transport.shortName + '; stack = ' + new Error().stack;
				Logger.logAction(Logger.LOG_ERROR, 'ConnectionManager.activateTransport()', msg);
				ErrorReporter.report('error', msg, 'transport-activating-proposed');
				Utils.arrDeleteValue(self.proposedTransports, transport);
			} else {
				proposedTransport.dispose();
			}
		});

		return true;
	};

	/**
	 * Called when a transport is no longer the active transport. This can occur
	 * in any transport connection state.
	 * @param transport
	 */
	ConnectionManager.prototype.deactivateTransport = function(transport, state, error) {
		var currentProtocol = this.activeProtocol,
			wasActive = currentProtocol && currentProtocol.getTransport() === transport,
			wasPending = Utils.arrDeleteValue(this.pendingTransports, transport),
			wasProposed = Utils.arrDeleteValue(this.proposedTransports, transport),
			noTransportsScheduledForActivation = this.noTransportsScheduledForActivation();

		Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.deactivateTransport()', 'transport = ' + transport);
		Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.deactivateTransport()', 'state = ' + state + (wasActive ? '; was active' : wasPending ? '; was pending' : wasProposed ? '; was proposed' : '') + (noTransportsScheduledForActivation ? '' : '; another transport is scheduled for activation'));
		if(error && error.message)
			Logger.logAction(Logger.LOG_MICRO, 'ConnectionManager.deactivateTransport()', 'reason =  ' + error.message);

		if(wasActive) {
			Logger.logAction(Logger.LOG_MICRO, 'ConnectionManager.deactivateTransport()', 'Getting, clearing, and requeuing ' + this.activeProtocol.messageQueue.count() + ' pending messages');
			this.queuePendingMessages(currentProtocol.getPendingMessages());
			/* Clear any messages we requeue to allow the protocol to become idle.
			 * In case of an upgrade, this will trigger an immediate activation of
			 * the upgrade transport, so delay a tick so this transport can finish
			 * deactivating */
			Utils.nextTick(function() {
				currentProtocol.clearPendingMessages();
			});
			this.activeProtocol = this.host = null;
			clearTimeout(this.channelResumeCheckTimer);
		}

		this.emit('transport.inactive', transport);

		/* this transport state change is a state change for the connectionmanager if
		 * - the transport was the active transport and there are no transports
		 *   which are connected and scheduled for activation, just waiting for the
		 *   active transport to finish what its doing; or
		 * - the transport was the active transport and the error was fatal (so
		 *   unhealable by another transport); or
		 * - there is no active transport, and this is the last remaining
		 *   pending transport (so we were in the connecting state)
		 */
		if((wasActive && noTransportsScheduledForActivation) ||
			(wasActive && (state === 'failed') || (state === 'closed')) ||
			(currentProtocol === null && wasPending && this.pendingTransports.length === 0)) {

			/* If we're disconnected with a 5xx we need to try fallback hosts
			 * (RTN14d), but (a) due to how the upgrade sequence works, the
			 * host/transport selection sequence only cares about getting to
			 * `preconnect` (eg establishing a websocket) getting a `disconnected`
			 * protocol message afterwards is too late; and (b) host retry only
			 * applies to connectBase unless the stored preference transport doesn't
			 * work. We solve this by unpersisting the transport preference and
			 * setting an instance variable to force fallback hosts to be used (if
			 * any) here. Bit of a kludge, but no real better alternatives without
			 * rewriting the entire thing */
			if(state === 'disconnected' && error && error.statusCode > 500 && this.httpHosts.length > 1) {
				this.unpersistTransportPreference();
				this.forceFallbackHost = true;
				/* and try to connect again to try a fallback host without waiting for the usual 15s disconnectedRetryTimeout */
				this.notifyState({state: state, error: error, retryImmediately: true});
				return;
			}

			/* TODO remove below line once realtime sends token errors as DISCONNECTEDs */
			var newConnectionState = (state === 'failed' && Auth.isTokenErr(error)) ? 'disconnected' : state;
			this.notifyState({state: newConnectionState, error: error});
			return;
		}

		if(wasActive && (state === 'disconnected') && (this.state !== this.states.synchronizing)) {
			/* If we were active but there is another transport scheduled for
			* activation, go into to the connecting state until that transport
			* activates and sets us back to connected. (manually starting the
			* transition timers in case that never happens). (If we were in the
			* synchronizing state, then that's fine, the old transport just got its
			* disconnected before the new one got the sync -- ignore it and keep
			* waiting for the sync. If it fails we have a separate sync timer that
			* will expire). */
			Logger.logAction(Logger.LOG_MICRO, 'ConnectionManager.deactivateTransport()', 'wasActive but another transport is connected and scheduled for activation, so going into the connecting state until it activates');
			this.startSuspendTimer();
			this.startTransitionTimer(this.states.connecting);
			this.notifyState({state: 'connecting', error: error});
		}
	};

	/* Helper that returns true if there are no transports which are pending,
	* have been connected, and are just waiting for onceNoPending to fire before
	* being activated */
	ConnectionManager.prototype.noTransportsScheduledForActivation = function() {
		return Utils.isEmpty(this.pendingTransports) ||
			this.pendingTransports.every(function(transport) {
				return !transport.isConnected;
			});
	};

	/**
	 * Called when activating a new transport, to ensure message delivery
	 * on the new transport synchronises with the messages already received
	 */
	ConnectionManager.prototype.sync = function(transport, requestedSyncPosition, callback) {
		var timeout = setTimeout(function () {
			transport.off('sync');
			callback(new ErrorInfo('Timeout waiting for sync response', 50000, 500));
		}, this.options.timeouts.realtimeRequestTimeout);

		/* send sync request */
		var syncMessage = ProtocolMessage.fromValues({
			action: actions.SYNC,
			connectionKey: this.connectionKey
		});

		if(requestedSyncPosition.timeSerial) {
			syncMessage.timeSerial = requestedSyncPosition.timeSerial;
		} else if(requestedSyncPosition.connectionSerial !== undefined) {
			syncMessage.connectionSerial = requestedSyncPosition.connectionSerial;
		}
		transport.send(syncMessage);

		transport.once('sync', function(connectionId, syncPosition) {
			clearTimeout(timeout);
			callback(null, connectionId, syncPosition);
		});
	};

	ConnectionManager.prototype.setConnection = function(connectionId, connectionDetails, connectionPosition, hasConnectionError) {
		/* if connectionKey changes but connectionId stays the same, then just a
		 * transport change on the same connection. If connectionId changes, we're
		 * on a new connection, with implications for msgSerial and channel state,
		 * and resetting the connectionSerial position */
		var self = this;
		/* If no previous connectionId, don't reset the msgSerial as it may have
		 * been set by recover data (unless the recover failed) */
		var prevConnId = this.connectionid,
			connIdChanged = prevConnId && (prevConnId !== connectionId),
			recoverFailure = !prevConnId && hasConnectionError;
		if(connIdChanged || recoverFailure)  {
			Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.setConnection()', 'Resetting msgSerial');
			this.msgSerial = 0;
		}
		/* but do need to reattach channels, for channels that were previously in
		 * the attached state even though the connection mode was 'clean' due to a
		 * freshness check - see https://github.com/ably/ably-js/issues/394 */
		if(this.connectionId !== connectionId)  {
			Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.setConnection()', 'New connectionId; reattaching any attached channels');
			/* Wait till next tick before reattaching channels, so that connection
			 * state will be updated and so that it will be applied after
			 * Channels#onTransportUpdate, else channels will not have an ATTACHED
			 * sent twice (once from this and once from that). */
			Utils.nextTick(function() {
				self.realtime.channels.reattach();
			});
		} else if(this.options.checkChannelsOnResume) {
			/* For attached channels, set the attached msg indicator variable to false,
			 * wait 30s, and check we got an attached for each one.
			 * 30s was chosen to be 5s longer than the transport idle timeout expire
			 * time, in an attempt to avoid false positives due to a transport
			 * silently failing immediately after a resume */
			Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.setConnection()', 'Same connectionId; checkChannelsOnResume is enabled');
			clearTimeout(this.channelResumeCheckTimer);
			this.realtime.channels.resetAttachedMsgIndicators();
			this.channelResumeCheckTimer = setTimeout(function() {
				self.realtime.channels.checkAttachedMsgIndicators(connectionId);
			}, 30000);
		}
		this.realtime.connection.id = this.connectionId = connectionId;
		this.realtime.connection.key = this.connectionKey = connectionDetails.connectionKey;
		var forceResetMessageSerial = connIdChanged || !prevConnId;
		this.setConnectionSerial(connectionPosition, forceResetMessageSerial);
	};

	ConnectionManager.prototype.clearConnection = function() {
		this.realtime.connection.id = this.connectionId = undefined;
		this.realtime.connection.key = this.connectionKey = undefined;
		this.clearConnectionSerial();
		this.msgSerial = 0;
		this.unpersistConnection();
	};

	/* force: set the connectionSerial even if it's less than the current
	 * connectionSerial. Used for new connections.
	 * Returns true iff the message was rejected as a duplicate. */
	ConnectionManager.prototype.setConnectionSerial = function(connectionPosition, force) {
		var timeSerial = connectionPosition.timeSerial,
			connectionSerial = connectionPosition.connectionSerial;
		Logger.logAction(Logger.LOG_MICRO, 'ConnectionManager.setConnectionSerial()', 'Updating connection serial; serial = ' + connectionSerial + '; timeSerial = ' + timeSerial + '; force = ' + force + '; previous = ' + this.connectionSerial);
		if(timeSerial !== undefined) {
			if(timeSerial <= this.timeSerial && !force) {
				Logger.logAction(Logger.LOG_ERROR, 'ConnectionManager.setConnectionSerial()', 'received message with timeSerial ' + timeSerial + ', but current timeSerial is ' + this.timeSerial + '; assuming message is a duplicate and discarding it');
				return true;
			}
			this.realtime.connection.timeSerial = this.timeSerial = timeSerial;
			this.setRecoveryKey();
			return;
		}
		if(connectionSerial !== undefined) {
			if(connectionSerial <= this.connectionSerial && !force) {
				Logger.logAction(Logger.LOG_ERROR, 'ConnectionManager.setConnectionSerial()', 'received message with connectionSerial ' + connectionSerial + ', but current connectionSerial is ' + this.connectionSerial + '; assuming message is a duplicate and discarding it');
				return true;
			}
			this.realtime.connection.serial = this.connectionSerial = connectionSerial;
			this.setRecoveryKey();
		}
	};

	ConnectionManager.prototype.clearConnectionSerial = function() {
		this.realtime.connection.serial = this.connectionSerial = undefined;
		this.realtime.connection.timeSerial = this.timeSerial = undefined;
		this.clearRecoveryKey();
	};

	ConnectionManager.prototype.setRecoveryKey = function() {
		this.realtime.connection.recoveryKey = this.connectionKey + ':' + (this.timeSerial || this.connectionSerial) + ':' + this.msgSerial;
	};

	ConnectionManager.prototype.clearRecoveryKey = function() {
		this.realtime.connection.recoveryKey = null;
	};

	ConnectionManager.prototype.checkConnectionStateFreshness = function() {
		if(!this.lastActivity || !this.connectionId) { return; }

		var sinceLast = Utils.now() - this.lastActivity;
		if(sinceLast > this.connectionStateTtl + this.maxIdleInterval) {
			Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.checkConnectionStateFreshness()', 'Last known activity from realtime was ' + sinceLast + 'ms ago; discarding connection state');
			this.clearConnection();
			this.states.connecting.failState = 'suspended';
			this.states.connecting.queueEvents = false;
		}
	};

	/**
	 * Called when the connectionmanager wants to persist transport
	 * state for later recovery. Only applicable in the browser context.
	 */
	ConnectionManager.prototype.persistConnection = function() {
		if(haveSessionStorage) {
			var recoveryKey = this.realtime.connection.recoveryKey;
			if(recoveryKey) {
				setSessionRecoverData({
					recoveryKey: recoveryKey,
					disconnectedAt: Utils.now(),
					location: global.location,
					clientId: this.realtime.auth.clientId
				}, this.connectionStateTtl);
			}
		}
	};

	/**
	 * Called when the connectionmanager wants to persist transport
	 * state for later recovery. Only applicable in the browser context.
	 */
	ConnectionManager.prototype.unpersistConnection = function() {
		clearSessionRecoverData();
	};

	/*********************
	 * state management
	 *********************/

	ConnectionManager.prototype.getError = function() {
		return this.errorReason || this.getStateError();
	};

	ConnectionManager.prototype.getStateError = function() {
		return ConnectionError[this.state.state];
	};

	ConnectionManager.prototype.activeState = function() {
		return this.state.queueEvents || this.state.sendEvents;
	};

	ConnectionManager.prototype.enactStateChange = function(stateChange) {
		var logLevel = stateChange.current === 'failed' ? Logger.LOG_ERROR : Logger.LOG_MAJOR;
		Logger.logAction(logLevel, 'Connection state', stateChange.current + (stateChange.reason ? ('; reason: ' + stateChange.reason) : ''));
		Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.enactStateChange', 'setting new state: ' + stateChange.current + '; reason = ' + (stateChange.reason && stateChange.reason.message));
		var newState = this.state = this.states[stateChange.current];
		if(stateChange.reason) {
			this.errorReason = stateChange.reason;
			this.realtime.connection.errorReason = stateChange.reason;
		}
		if(newState.terminal || newState.state === 'suspended') {
			/* suspended is nonterminal, but once in the suspended state, realtime
			 * will have discarded our connection state, so futher connection
			 * attempts should start from scratch */
			this.clearConnection();
		}
		this.emit('connectionstate', stateChange);
	};

	/****************************************
	 * ConnectionManager connection lifecycle
	 ****************************************/

	ConnectionManager.prototype.startTransitionTimer = function(transitionState) {
		Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.startTransitionTimer()', 'transitionState: ' + transitionState.state);

		if(this.transitionTimer) {
			Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.startTransitionTimer()', 'clearing already-running timer');
			clearTimeout(this.transitionTimer);
		}

		var self = this;
		this.transitionTimer = setTimeout(function() {
			if(self.transitionTimer) {
				self.transitionTimer = null;
				Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager ' + transitionState.state + ' timer expired', 'requesting new state: ' + transitionState.failState);
				self.notifyState({state: transitionState.failState});
			}
		}, transitionState.retryDelay);
	};

	ConnectionManager.prototype.cancelTransitionTimer = function() {
		Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.cancelTransitionTimer()', '');
		if(this.transitionTimer) {
			clearTimeout(this.transitionTimer);
			this.transitionTimer = null;
		}
	};

	ConnectionManager.prototype.startSuspendTimer = function() {
		var self = this;
		if(this.suspendTimer)
			return;
		this.suspendTimer = setTimeout(function() {
			if(self.suspendTimer) {
				self.suspendTimer = null;
				Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager suspend timer expired', 'requesting new state: suspended');
				self.states.connecting.failState = 'suspended';
				self.states.connecting.queueEvents = false;
				self.notifyState({state: 'suspended'});
			}
		}, this.connectionStateTtl);
	};

	ConnectionManager.prototype.checkSuspendTimer = function(state) {
		if(state !== 'disconnected' && state !== 'suspended' && state !== 'connecting')
			this.cancelSuspendTimer();
	};

	ConnectionManager.prototype.cancelSuspendTimer = function() {
		this.states.connecting.failState = 'disconnected';
		this.states.connecting.queueEvents = true;
		if(this.suspendTimer) {
			clearTimeout(this.suspendTimer);
			this.suspendTimer = null;
		}
	};

	ConnectionManager.prototype.startRetryTimer = function(interval) {
		var self = this;
		this.retryTimer = setTimeout(function() {
			Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager retry timer expired', 'retrying');
			self.retryTimer = null;
			self.requestState({state: 'connecting'});
		}, interval);
	};

	ConnectionManager.prototype.cancelRetryTimer = function() {
		if(this.retryTimer) {
			clearTimeout(this.retryTimer);
			this.retryTimer = null;
		}
	};

	ConnectionManager.prototype.notifyState = function(indicated) {
		var state = indicated.state,
			self = this;

		/* We retry immediately if:
		 * - something disconnects us while we're connected, or
		 * - a viable (but not yet active) transport fails due to a token error (so
		 *   this.errorReason will be set, and startConnect will do a forced
		 *   authorize). If this.errorReason is already set (to a token error),
		 *   then there has been at least one previous attempt to connect that also
		 *   failed for a token error, so by RTN14b we go to DISCONNECTED and wait
		 *   before trying again */
		var retryImmediately = (state === 'disconnected' &&
			(this.state === this.states.connected     ||
			 this.state === this.states.synchronizing ||
			 indicated.retryImmediately               ||
				(this.state === this.states.connecting &&
					indicated.error && Auth.isTokenErr(indicated.error) &&
					!(this.errorReason && Auth.isTokenErr(this.errorReason)))));

		Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.notifyState()', 'new state: ' + state + (retryImmediately ? '; will retry connection immediately' : ''));
		/* do nothing if we're already in the indicated state */
		if(state == this.state.state)
			return;

		/* kill timers (possibly excepting suspend timer depending on the notified
		* state), as these are superseded by this notification */
		this.cancelTransitionTimer();
		this.cancelRetryTimer();
		this.checkSuspendTimer(indicated.state);

		/* do nothing if we're unable to move from the current state */
		if(this.state.terminal)
			return;

		/* process new state */
		var newState = this.states[indicated.state],
			change = new ConnectionStateChange(this.state.state, newState.state, newState.retryDelay, (indicated.error || ConnectionError[newState.state]));

		if(retryImmediately) {
			var autoReconnect = function() {
				if(self.state === self.states.disconnected) {
					self.lastAutoReconnectAttempt = Utils.now();
					self.requestState({state: 'connecting'});
				}
			};
			var sinceLast = this.lastAutoReconnectAttempt && (Utils.now() - this.lastAutoReconnectAttempt + 1);
			if(sinceLast && (sinceLast < 1000)) {
				Logger.logAction(Logger.LOG_MICRO, 'ConnectionManager.notifyState()', 'Last reconnect attempt was only ' + sinceLast + 'ms ago, waiting another ' + (1000 - sinceLast) + 'ms before trying again');
				setTimeout(autoReconnect, 1000 - sinceLast);
			} else {
				Utils.nextTick(autoReconnect);
			}
		} else if(state === 'disconnected' || state === 'suspended') {
			this.startRetryTimer(newState.retryDelay);
		}

		 /* If going into disconnect/suspended (and not retrying immediately), or a
			* terminal state, ensure there are no orphaned transports hanging around. */
		if((state === 'disconnected' && !retryImmediately) ||
			 (state === 'suspended') ||
			 newState.terminal) {
				 /* Wait till the next tick so the connection state change is enacted,
				 * so aborting transports doesn't trigger redundant state changes */
				 Utils.nextTick(function() {
					 self.disconnectAllTransports();
				 });
		 }

		if(state == 'connected' && !this.activeProtocol) {
			Logger.logAction(Logger.LOG_ERROR, 'ConnectionManager.notifyState()', 'Broken invariant: attempted to go into connected state, but there is no active protocol');
		}

		/* implement the change and notify */
		this.enactStateChange(change);
		if(this.state.sendEvents) {
			this.sendQueuedMessages();
		} else if(!this.state.queueEvents) {
			this.realtime.channels.propogateConnectionInterruption(state, change.reason);
			this.failQueuedMessages(change.reason); // RTN7c
		}
	};

	ConnectionManager.prototype.requestState = function(request) {
		var state = request.state, self = this;
		Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.requestState()', 'requested state: ' + state + '; current state: ' + this.state.state);
		if(state == this.state.state)
			return; /* silently do nothing */

		/* kill running timers, as this request supersedes them */
		this.cancelTransitionTimer();
		this.cancelRetryTimer();
		/* for suspend timer check rather than cancel -- eg requesting a connecting
		* state should not reset the suspend timer */
		this.checkSuspendTimer(state);

		if(state == 'connecting' && this.state.state == 'connected') return;
		if(state == 'closing' && this.state.state == 'closed') return;

		var newState = this.states[state],
			change = new ConnectionStateChange(this.state.state, newState.state, null, (request.error || ConnectionError[newState.state]));

		this.enactStateChange(change);

		if(state == 'connecting') {
			Utils.nextTick(function() { self.startConnect(); });
		}
		if(state == 'closing') {
			this.closeImpl();
		}
	};


	ConnectionManager.prototype.startConnect = function() {
		if(this.state !== this.states.connecting) {
			Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.startConnect()', 'Must be in connecting state to connect, but was ' + this.state.state);
			return;
		}

		var auth = this.realtime.auth,
			self = this;

		/* The point of the connectCounter mechanism is to ensure that the
		 * connection procedure can be cancelled. We want disconnectAllTransports
		 * to be able to stop any in-progress connection, even before it gets to
		 * the stage of having a pending (or even a proposed) transport that it can
		 * dispose() of. So we check that it's still current after any async stage,
		 * up until the stage that is synchronous with instantiating a transport */
		var connectCount = ++this.connectCounter;

		var connect = function() {
			self.checkConnectionStateFreshness();
			self.getTransportParams(function(transportParams) {
				if(connectCount !== self.connectCounter) {
					return;
				}
				self.connectImpl(transportParams, connectCount);
			});
		};

		Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.startConnect()', 'starting connection');
		this.startSuspendTimer();
		this.startTransitionTimer(this.states.connecting);

		if(auth.method === 'basic') {
			connect();
		} else {
			var authCb = function(err) {
				if(connectCount !== self.connectCounter) {
					return;
				}
				if(err) {
					self.actOnErrorFromAuthorize(err);
				} else {
					connect();
				}
			};
			if(this.errorReason && Auth.isTokenErr(this.errorReason)) {
				/* Force a refetch of a new token */
				auth._forceNewToken(null, null, authCb);
			} else {
				auth._ensureValidAuthCredentials(false, authCb);
			}
		}
	};

	/**
	 * There are three stages in connecting:
	 * - preference: if there is a cached transport preference, we try to connect
	 *   on that. If that fails or times out we abort the attempt, remove the
	 *   preference and fall back to base. If it succeeds, we try upgrading it if
	 *   needed (will only be in the case where the preference is xhrs and the
	 *   browser supports ws).
	 * - base: we try to connect with the best transport that we think will
	 *   never fail for this browser (usually this is xhr_polling; for very old
	 *   browsers will be jsonp, for node will be comet). If it doesn't work, we
	 *   try fallback hosts.
	 * - upgrade: given a connected transport, we see if there are any better
	 *   ones, and if so, try to upgrade to them.
	 *
	 * connectImpl works out what stage you're at (which is purely a function of
	 * the current connection state and whether there are any stored preferences),
	 * and dispatches accordingly. After a transport has been set pending,
	 * tryATransport calls connectImpl to see if there's another stage to be done.
	 * */
	ConnectionManager.prototype.connectImpl = function(transportParams, connectCount) {
		var state = this.state.state;

		if(state !== this.states.connecting.state && state !== this.states.connected.state) {
			/* Only keep trying as long as in the 'connecting' state (or 'connected'
			 * for upgrading). Any operation can put us into 'disconnected' to cancel
			 * connection attempts and wait before retrying, or 'failed' to fail. */
			Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.connectImpl()', 'Must be in connecting state to connect (or connected to upgrade), but was ' + state);
		} else if(this.pendingTransports.length) {
			Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.connectImpl()', 'Transports ' + this.pendingTransports[0].toString() + ' currently pending; taking no action');
		} else if(state == this.states.connected.state) {
			this.upgradeIfNeeded(transportParams);
		} else if(this.transports.length > 1 && this.getTransportPreference()) {
			this.connectPreference(transportParams);
		} else {
			this.connectBase(transportParams, connectCount);
		}
	};


	ConnectionManager.prototype.connectPreference = function(transportParams) {
		var preference = this.getTransportPreference(),
			self = this,
			preferenceTimeoutExpired = false;

		if(!Utils.arrIn(this.transports, preference)) {
			this.unpersistTransportPreference();
			this.connectImpl(transportParams);
		}

		Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.connectPreference()', 'Trying to connect with stored transport preference ' + preference);

		var preferenceTimeout = setTimeout(function() {
			preferenceTimeoutExpired = true;
			if(!(self.state.state === self.states.connected.state)) {
				Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.connectPreference()', 'Shortcircuit connection attempt with ' + preference + ' failed; clearing preference and trying from scratch');
				/* Abort all connection attempts. (This also disconnects the active
				 * protocol, but none exists if we're not in the connected state) */
				self.disconnectAllTransports();
				/* Be quite agressive about clearing the stored preference if ever it doesn't work */
				self.unpersistTransportPreference();
			}
			self.connectImpl(transportParams);
		}, this.options.timeouts.preferenceConnectTimeout);

		/* For connectPreference, just use the main host. If host fallback is needed, do it in connectBase.
		 * The wstransport it will substitute the httphost for an appropriate wshost */
		transportParams.host = self.httpHosts[0];
		self.tryATransport(transportParams, preference, function(fatal, transport) {
			clearTimeout(preferenceTimeout);
			if(preferenceTimeoutExpired && transport) {
				/* Viable, but too late - connectImpl() will already be trying
				* connectBase, and we weren't in upgrade mode. Just remove the
				* onconnected listener and get rid of it */
				transport.off();
				transport.disconnect();
				Utils.arrDeleteValue(this.pendingTransports, transport);
			} else if(!transport && !fatal) {
				/* Preference failed in a transport-specific way. Try more */
				self.unpersistTransportPreference();
				self.connectImpl(transportParams);
			}
			/* If suceeded, or failed fatally, nothing to do */
		});
	};


	/**
	 * Try to establish a transport on the base transport (the best transport
	 * such that if it doesn't work, nothing will work) as determined through
	 * static feature detection, checking for network connectivity and trying
	 * fallback hosts if applicable.
	 * @param transportParams
	 */
	ConnectionManager.prototype.connectBase = function(transportParams, connectCount) {
		var self = this,
			giveUp = function(err) {
				self.notifyState({state: self.states.connecting.failState, error: err});
			},
			candidateHosts = this.httpHosts.slice(),
			hostAttemptCb = function(fatal, transport) {
				if(connectCount !== self.connectCounter) {
					return;
				}
				if(!transport && !fatal) {
					tryFallbackHosts();
				}
			};

		Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.connectBase()', 'Trying to connect with base transport ' + this.baseTransport);

		/* first try to establish a connection with the priority host with http transport */
		var host = candidateHosts.shift();
		if(!host) {
			giveUp(new ErrorInfo('Unable to connect (no available host)', 80003, 404));
			return;
		}
		transportParams.host = host;

		/* this is what we'll be doing if the attempt for the main host fails */
		function tryFallbackHosts() {
			/* if there aren't any fallback hosts, fail */
			if(!candidateHosts.length) {
				giveUp(new ErrorInfo('Unable to connect (and no more fallback hosts to try)', 80003, 404));
				return;
			}
			/* before trying any fallback (or any remaining fallback) we decide if
			 * there is a problem with the ably host, or there is a general connectivity
			 * problem */
			Http.checkConnectivity(function(err, connectivity) {
				if(connectCount !== self.connectCounter) {
					return;
				}
				/* we know err won't happen but handle it here anyway */
				if(err) {
					giveUp(err);
					return;
				}
				if(!connectivity) {
					/* the internet isn't reachable, so don't try the fallback hosts */
					giveUp(new ErrorInfo('Unable to connect (network unreachable)', 80003, 404));
					return;
				}
				/* the network is there, so there's a problem with the main host, or
				 * its dns. Try the fallback hosts. We could try them simultaneously but
				 * that would potentially cause a huge spike in load on the load balancer */
				transportParams.host = Utils.arrPopRandomElement(candidateHosts);
				self.tryATransport(transportParams, self.baseTransport, hostAttemptCb);
			});
		}

		if(this.forceFallbackHost && candidateHosts.length) {
			this.forceFallbackHost = false;
			tryFallbackHosts();
			return;
		}

		this.tryATransport(transportParams, this.baseTransport, hostAttemptCb);
	};


	ConnectionManager.prototype.getUpgradePossibilities = function() {
		/* returns the subset of upgradeTransports to the right of the current
		 * transport in upgradeTransports (if it's in there - if not, currentPosition
		 * will be -1, so return upgradeTransports.slice(0) == upgradeTransports */
		var current = this.activeProtocol.getTransport().shortName;
		var currentPosition = Utils.arrIndexOf(this.upgradeTransports, current);
		return this.upgradeTransports.slice(currentPosition + 1);
	};


	ConnectionManager.prototype.upgradeIfNeeded = function(transportParams) {
		var upgradePossibilities = this.getUpgradePossibilities(),
			self = this;
		Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.upgradeIfNeeded()', 'upgrade possibilities: ' + Utils.inspect(upgradePossibilities));

		if(!upgradePossibilities.length) {
			return;
		}

		Utils.arrForEach(upgradePossibilities, function(upgradeTransport) {
			/* Note: the transport may mutate the params, so give each transport a fresh one */
			var upgradeTransportParams = self.createTransportParams(transportParams.host, 'upgrade');
			self.tryATransport(upgradeTransportParams, upgradeTransport, noop);
		});
	};


	ConnectionManager.prototype.closeImpl = function() {
		Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.closeImpl()', 'closing connection');
		this.cancelSuspendTimer();
		this.startTransitionTimer(this.states.closing);

		Utils.safeArrForEach(this.pendingTransports, function(transport) {
			Logger.logAction(Logger.LOG_MICRO, 'ConnectionManager.closeImpl()', 'Closing pending transport: ' + transport);
			if(transport) transport.close();
		});

		Utils.safeArrForEach(this.proposedTransports, function(transport) {
			Logger.logAction(Logger.LOG_MICRO, 'ConnectionManager.closeImpl()', 'Disposing of proposed transport: ' + transport);
			if(transport) transport.dispose();
		});

		if(this.activeProtocol) {
			Logger.logAction(Logger.LOG_MICRO, 'ConnectionManager.closeImpl()', 'Closing active transport: ' + this.activeProtocol.getTransport());
			this.activeProtocol.getTransport().close();
		}

		/* If there was an active transport, this will probably be
		 * preempted by the notifyState call in deactivateTransport */
		this.notifyState({state: 'closed'});
	};

	ConnectionManager.prototype.onAuthUpdated = function(tokenDetails, callback) {
		var self = this;
		switch(this.state.state) {
			case 'connected':
				Logger.logAction(Logger.LOG_MICRO, 'ConnectionManager.onAuthUpdated()', 'Sending AUTH message on active transport');
				/* If there are any proposed/pending transports (eg an upgrade that
				 * isn't yet scheduled for activation) that hasn't yet started syncing,
				 * just to get rid of them & restart the upgrade with the new token, to
				 * avoid a race condition. (If it has started syncing, the AUTH will be
				 * queued until the upgrade is complete, so everything's fine) */
				if((this.pendingTransports.length || this.proposedTransports.length) &&
					self.state !== self.states.synchronizing) {
					this.disconnectAllTransports(/* exceptActive: */true);
					var transportParams = this.activeProtocol.getTransport().params;
					Utils.nextTick(function() {
						if(self.state.state === 'connected') {
							self.upgradeIfNeeded(transportParams);
						}
					});
				}

				/* Do any transport-specific new-token action */
				this.activeProtocol.getTransport().onAuthUpdated(tokenDetails);

				var authMsg = ProtocolMessage.fromValues({
					action: actions.AUTH,
					auth: {
						accessToken: tokenDetails.token
					}
				});
				this.send(authMsg);

				/* The answer will come back as either a connectiondetails event
				 * (realtime sends a CONNECTED to asknowledge the reauth) or a
				 * statechange to failed */
				var successListener = function() {
					self.off(failureListener);
					callback(null, tokenDetails);
				};
				var failureListener = function(stateChange) {
					if(stateChange.current === 'failed') {
						self.off(successListener);
						self.off(failureListener);
						callback(stateChange.reason || self.getStateError());
					}
				};
				this.once('connectiondetails', successListener);
				this.on('connectionstate', failureListener);
				break;

			case 'connecting':
				Logger.logAction(Logger.LOG_MICRO, 'ConnectionManager.onAuthUpdated()',
					'Aborting current connection attempts in order to start again with the new auth details');
				this.disconnectAllTransports();
				/* fallthrough to add statechange listener */

			default:
				Logger.logAction(Logger.LOG_MICRO, 'ConnectionManager.onAuthUpdated()',
					'Connection state is ' + this.state.state + '; waiting until either connected or failed');
				var listener = function(stateChange) {
					switch(stateChange.current) {
						case 'connected':
							self.off(listener);
							callback(null, tokenDetails);
							break;
						case 'failed':
						case 'closed':
						case 'suspended':
							self.off(listener);
							callback(stateChange.reason || self.getStateError());
							break;
					}
				};
				self.on('connectionstate', listener);
				if(this.state.state === 'connecting') {
					/* can happen if in the connecting state but no transport was pending
					 * yet, so disconnectAllTransports did not trigger a disconnected state */
					self.startConnect();
				} else {
					self.requestState({state: 'connecting'});
				}
		}
	};

	ConnectionManager.prototype.disconnectAllTransports = function(exceptActive) {
		Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.disconnectAllTransports()', 'Disconnecting all transports' + (exceptActive ? ' except the active transport' : ''));

		/* This will prevent any connection procedure in an async part of one of its early stages from continuing */
		this.connectCounter++;

		Utils.safeArrForEach(this.pendingTransports, function(transport) {
			Logger.logAction(Logger.LOG_MICRO, 'ConnectionManager.disconnectAllTransports()', 'Disconnecting pending transport: ' + transport);
			if(transport) transport.disconnect();
		});
		this.pendingTransports = [];

		Utils.safeArrForEach(this.proposedTransports, function(transport) {
			Logger.logAction(Logger.LOG_MICRO, 'ConnectionManager.disconnectAllTransports()', 'Disposing of proposed transport: ' + transport);
			if(transport) transport.dispose();
		});
		this.proposedTransports = [];

		if(this.activeProtocol && !exceptActive) {
			Logger.logAction(Logger.LOG_MICRO, 'ConnectionManager.disconnectAllTransports()', 'Disconnecting active transport: ' + this.activeProtocol.getTransport());
			this.activeProtocol.getTransport().disconnect();
		}
		/* No need to notify state disconnected; disconnecting the active transport
		 * will have that effect */
	};

	/******************
	 * event queueing
	 ******************/

	ConnectionManager.prototype.send = function(msg, queueEvent, callback) {
		callback = callback || noop;
		var state = this.state;

		if(state.sendEvents) {
			Logger.logAction(Logger.LOG_MICRO, 'ConnectionManager.send()', 'sending event');
			this.sendImpl(new PendingMessage(msg, callback));
			return;
		}
		var shouldQueue = (queueEvent && state.queueEvents) || state.forceQueueEvents;
		if(!shouldQueue) {
			var err = 'rejecting event, queueEvent was ' + queueEvent + ', state was ' + state.state;
			Logger.logAction(Logger.LOG_MICRO, 'ConnectionManager.send()', err);
			callback(this.errorReason || new ErrorInfo(err, 90000, 400));
			return;
		}
		if(Logger.shouldLog(Logger.LOG_MICRO)) {
			Logger.logAction(Logger.LOG_MICRO, 'ConnectionManager.send()', 'queueing msg; ' + ProtocolMessage.stringify(msg));
		}
		this.queue(msg, callback);
	};

	ConnectionManager.prototype.sendImpl = function(pendingMessage) {
		var msg = pendingMessage.message;
		/* If have already attempted to send this, resend with the same msgSerial,
		 * so Ably can dedup if the previous send succeeded */
		if(pendingMessage.ackRequired && !pendingMessage.sendAttempted) {
			msg.msgSerial = this.msgSerial++;
			this.setRecoveryKey();
		}
		try {
			this.activeProtocol.send(pendingMessage);
		} catch(e) {
			Logger.logAction(Logger.LOG_ERROR, 'ConnectionManager.sendImpl()', 'Unexpected exception in transport.send(): ' + e.stack);
		}
	};

	function bundleWith(dest, src, maxSize) {
		var action;
		if(dest.channel !== src.channel) {
			/* RTL6d3 */
			return false;
		}
		if((action = dest.action) !== actions.PRESENCE && action !== actions.MESSAGE) {
			/* RTL6d - can only bundle messages or presence */
			return false;
		}
		if(action !== src.action) {
			/* RTL6d4 */
			return false;
		}
		var kind = (action === actions.PRESENCE) ? 'presence' : 'messages',
			proposed = dest[kind].concat(src[kind]),
			size = Message.getMessagesSize(proposed);
		if(size > maxSize) {
			/* RTL6d1 */
			return false;
		}
		if(!Utils.allSame(proposed, 'clientId')) {
			/* RTL6d2 */
			return false;
		}
		if(!Utils.arrEvery(proposed, function(msg) {
			return !msg.id;
		})) {
			/* RTL6d7 */
			return false;
		}
		/* we're good to go! */
		dest[kind] = proposed;
		return true;
	}
	ConnectionManager.prototype.queue = function(msg, callback) {
		Logger.logAction(Logger.LOG_MICRO, 'ConnectionManager.queue()', 'queueing event');
		var lastQueued = this.queuedMessages.last();
		var maxSize = this.options.maxMessageSize;
		/* If have already attempted to send a message, don't merge more messages
		 * into it, as if the previous send actually succeeded and realtime ignores
		 * the dup, they'll be lost */
		if(lastQueued && !lastQueued.sendAttempted && bundleWith(lastQueued.message, msg, maxSize)) {
			if(!lastQueued.merged) {
				lastQueued.callback = Multicaster([lastQueued.callback]);
				lastQueued.merged = true;
			}
			lastQueued.callback.push(callback);
		} else {
			this.queuedMessages.push(new PendingMessage(msg, callback));
		}
	};

	ConnectionManager.prototype.sendQueuedMessages = function() {
		Logger.logAction(Logger.LOG_MICRO, 'ConnectionManager.sendQueuedMessages()', 'sending ' + this.queuedMessages.count() + ' queued messages');
		var pendingMessage;
		while(pendingMessage = this.queuedMessages.shift())
			this.sendImpl(pendingMessage);
	};

	ConnectionManager.prototype.queuePendingMessages = function(pendingMessages) {
		if(pendingMessages && pendingMessages.length) {
			Logger.logAction(Logger.LOG_MICRO, 'ConnectionManager.queuePendingMessages()', 'queueing ' + pendingMessages.length + ' pending messages');
			this.queuedMessages.prepend(pendingMessages);
		}
	};

	ConnectionManager.prototype.failQueuedMessages = function(err) {
		var numQueued = this.queuedMessages.count();
		if(numQueued > 0) {
			Logger.logAction(Logger.LOG_ERROR, 'ConnectionManager.failQueuedMessages()', 'failing ' + numQueued + ' queued messages, err = ' + Utils.inspectError(err));
			this.queuedMessages.completeAllMessages(err);
		}
	};

	ConnectionManager.prototype.onChannelMessage = function(message, transport) {
		var onActiveTransport = this.activeProtocol && transport === this.activeProtocol.getTransport(),
			onUpgradeTransport = Utils.arrIn(this.pendingTransports, transport) && this.state == this.states.synchronizing,
			notControlMsg = message.action === actions.MESSAGE || message.action === actions.PRESENCE;

		/* As the lib now has a period where the upgrade transport is synced but
		 * before it's become active (while waiting for the old one to become
		 * idle), message can validly arrive on it even though it isn't active */
		if(onActiveTransport || onUpgradeTransport) {
			if(notControlMsg) {
				var suppressed = this.setConnectionSerial(message);
				if(suppressed) {
					return;
				}
				if(ProtocolMessage.isDuplicate(message, this.mostRecentMsg)) {
					Logger.logAction(Logger.LOG_ERROR, 'ConnectionManager.onChannelMessage()', 'received message with different connectionSerial, but same message id as a previous; discarding; id = ' + message.id);
					return;
				}
				this.mostRecentMsg = message;
			}
			this.realtime.channels.onChannelMessage(message);
		} else {
			// Message came in on a defunct transport. Allow only acks, nacks, & errors for outstanding
			// messages,  no new messages (as sync has been sent on new transport so new messages will
			// be resent there, or connection has been closed so don't want new messages)
			if(Utils.arrIndexOf([actions.ACK, actions.NACK, actions.ERROR], message.action) > -1) {
				this.realtime.channels.onChannelMessage(message);
			} else {
				Logger.logAction(Logger.LOG_MICRO, 'ConnectionManager.onChannelMessage()', 'received message ' + JSON.stringify(message) + 'on defunct transport; discarding');
			}
		}
	};

	ConnectionManager.prototype.ping = function(transport, callback) {
		/* if transport is specified, try that */
		if(transport) {
			Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.ping()', 'transport = ' + transport);

			var onTimeout = function () {
				transport.off('heartbeat', onHeartbeat);
				callback(new ErrorInfo('Timeout waiting for heartbeat response', 50000, 500));
			};

			var pingStart = Utils.now(),
				id = Utils.cheapRandStr();

			var onHeartbeat = function (responseId) {
				if(responseId === id) {
					transport.off('heartbeat', onHeartbeat);
					clearTimeout(timer);
					var responseTime = Utils.now() - pingStart;
					callback(null, responseTime);
				}
			};

			var timer = setTimeout(onTimeout, this.options.timeouts.realtimeRequestTimeout);

			transport.on('heartbeat', onHeartbeat);
			transport.ping(id);
			return;
		}

		/* if we're not connected, don't attempt */
		if(this.state.state !== 'connected') {
			callback(new ErrorInfo('Unable to ping service; not connected', 40000, 400));
			return;
		}

		/* no transport was specified, so use the current (connected) one
		 * but ensure that we retry if the transport is superseded before we complete */
		var completed = false, self = this;

		var onPingComplete = function(err, responseTime) {
			self.off('transport.active', onTransportActive);
			if(!completed) {
				completed = true;
				callback(err, responseTime);
			}
		};

		var onTransportActive = function() {
			if(!completed) {
				/* ensure that no callback happens for the currently outstanding operation */
				completed = true;
				/* repeat but picking up the new transport */
				Utils.nextTick(function() {
					self.ping(null, callback);
				});
			}
		};

		this.on('transport.active', onTransportActive);
		this.ping(this.activeProtocol.getTransport(), onPingComplete);
	};

	ConnectionManager.prototype.abort = function(error) {
		this.activeProtocol.getTransport().fail(error);
	};

	ConnectionManager.prototype.registerProposedTransport = function(transport) {
		this.proposedTransports.push(transport);
	};

	ConnectionManager.prototype.getTransportPreference = function() {
		return this.transportPreference || (haveWebStorage && WebStorage.get(transportPreferenceName));
	};

	ConnectionManager.prototype.persistTransportPreference = function(transport) {
		if(Utils.arrIn(Defaults.upgradeTransports, transport.shortName)) {
			this.transportPreference = transport.shortName;
			if(haveWebStorage) {
				WebStorage.set(transportPreferenceName, transport.shortName);
			}
		}
	};

	ConnectionManager.prototype.unpersistTransportPreference = function() {
		this.transportPreference = null;
		if(haveWebStorage) {
			WebStorage.remove(transportPreferenceName);
		}
	};

	/* This method is only used during connection attempts, so implements RSA4c1,
	 * RSA4c2, and RSA4d. In particular it is not invoked for
	 * serverside-triggered reauths or manual reauths, so RSA4c3 does not apply */
	ConnectionManager.prototype.actOnErrorFromAuthorize = function(err) {
		if(err.code === 40171) {
			/* No way to reauth */
			this.notifyState({state: 'failed', error: err});
		} else if(err.statusCode === 403) {
			var msg = 'Client configured authentication provider returned 403; failing the connection';
			Logger.logAction(Logger.LOG_ERROR, 'ConnectionManager.actOnErrorFromAuthorize()', msg);
			this.notifyState({state: 'failed', error: new ErrorInfo(msg, 80019, 403, err)});
		} else {
			var msg = 'Client configured authentication provider request failed';
			Logger.logAction(Logger.LOG_MINOR, 'ConnectionManager.actOnErrorFromAuthorize', msg);
			this.notifyState({state: this.state.failState, error: new ErrorInfo(msg, 80019, 401, err)});
		}
	};

	ConnectionManager.prototype.onConnectionDetailsUpdate = function(connectionDetails, transport) {
		if(!connectionDetails) {
			return;
		}
		this.connectionDetails = connectionDetails;
		if(connectionDetails.maxMessageSize) {
			this.options.maxMessageSize = connectionDetails.maxMessageSize;
		}
		var clientId = connectionDetails.clientId;
		if(clientId) {
			var err = this.realtime.auth._uncheckedSetClientId(clientId);
			if(err) {
				Logger.logAction(Logger.LOG_ERROR, 'ConnectionManager.onConnectionDetailsUpdate()', err.message);
				/* Errors setting the clientId are fatal to the connection */
				transport.fail(err);
				return;
			}
		}
		var connectionStateTtl = connectionDetails.connectionStateTtl;
		if(connectionStateTtl) {
			this.connectionStateTtl = connectionStateTtl;
		}
		this.maxIdleInterval = connectionDetails.maxIdleInterval;
		this.emit('connectiondetails', connectionDetails);
	};

	return ConnectionManager;
})();

var Transport = (function() {
	var actions = ProtocolMessage.Action;
	var closeMessage = ProtocolMessage.fromValues({action: actions.CLOSE});
	var disconnectMessage = ProtocolMessage.fromValues({action: actions.DISCONNECT});

	/*
	 * EventEmitter, generates the following events:
	 *
	 * event name       data
	 * closed           error
	 * failed           error
	 * disposed
	 * connected        null error, connectionSerial, connectionId, connectionDetails
	 * sync             connectionSerial, connectionId
	 * event            channel message object
	 */

	/* public constructor */
	function Transport(connectionManager, auth, params) {
		EventEmitter.call(this);
		this.connectionManager = connectionManager;
		connectionManager.registerProposedTransport(this);
		this.auth = auth;
		this.params = params;
		this.timeouts = params.options.timeouts;
		this.format = params.format;
		this.isConnected = false;
		this.isFinished = false;
		this.isDisposed = false;
		this.maxIdleInterval = null;
		this.idleTimer = null;
		this.lastActivity = null;
	}
	Utils.inherits(Transport, EventEmitter);

	Transport.prototype.connect = function() {};

	Transport.prototype.close = function() {
		if(this.isConnected) {
			this.requestClose();
		}
		this.finish('closed', ConnectionError.closed);
	};

	Transport.prototype.disconnect = function(err) {
		/* Used for network/transport issues that need to result in the transport
		 * being disconnected, but should not affect the connection */
		if(this.isConnected) {
			this.requestDisconnect();
		}
		this.finish('disconnected', err || ConnectionError.disconnected);
	};

	Transport.prototype.fail = function(err) {
		/* Used for client-side-detected fatal connection issues */
		if(this.isConnected) {
			this.requestDisconnect();
		}
		this.finish('failed', err || ConnectionError.failed);
	};

	Transport.prototype.finish = function(event, err) {
		if(this.isFinished) {
			return;
		}

		this.isFinished = true;
		this.isConnected = false;
		this.maxIdleInterval = null;
		clearTimeout(this.idleTimer);
		this.idleTimer = null;
		this.emit(event, err);
		this.dispose();
	};

	Transport.prototype.onProtocolMessage = function(message) {
		if (Logger.shouldLog(Logger.LOG_MICRO)) {
			Logger.logAction(Logger.LOG_MICRO, 'Transport.onProtocolMessage()', 'received on ' + this.shortName + ': ' + ProtocolMessage.stringify(message) + '; connectionId = ' + this.connectionManager.connectionId);
		}
		this.onActivity();

		switch(message.action) {
		case actions.HEARTBEAT:
			Logger.logAction(Logger.LOG_MICRO, 'Transport.onProtocolMessage()', this.shortName + ' heartbeat; connectionId = ' + this.connectionManager.connectionId);
			this.emit('heartbeat', message.id);
			break;
		case actions.CONNECTED:
			this.onConnect(message);
			this.emit('connected', message.error, message.connectionId, message.connectionDetails, message);
			break;
		case actions.CLOSED:
			this.onClose(message);
			break;
		case actions.DISCONNECTED:
			this.onDisconnect(message);
			break;
		case actions.ACK:
			this.emit('ack', message.msgSerial, message.count);
			break;
		case actions.NACK:
			this.emit('nack', message.msgSerial, message.count, message.error);
			break;
		case actions.SYNC:
			if(message.connectionId !== undefined) {
				/* a transport SYNC */
				this.emit('sync', message.connectionId, message);
				break;
			}
			/* otherwise it's a channel SYNC, so handle it in the channel */
			this.connectionManager.onChannelMessage(message, this);
			break;
		case actions.AUTH:
			this.auth.authorize(function(err) {
				if(err) {
					Logger.logAction(Logger.LOG_ERROR, 'Transport.onProtocolMessage()', 'Ably requested re-authentication, but unable to obtain a new token: ' + Utils.inspectError(err));
				}
			});
			break;
		case actions.ERROR:
			Logger.logAction(Logger.LOG_MINOR, 'Transport.onProtocolMessage()', 'received error action; connectionId = ' + this.connectionManager.connectionId + '; err = ' + Utils.inspect(message.error) + (message.channel ? (', channel: ' +  message.channel) : ''));
			if(message.channel === undefined) {
				this.onFatalError(message);
				break;
			}
			/* otherwise it's a channel-specific error, so handle it in the channel */
			this.connectionManager.onChannelMessage(message, this);
			break;
		default:
			/* all other actions are channel-specific */
			this.connectionManager.onChannelMessage(message, this);
		}
	};

	Transport.prototype.onConnect = function(message) {
		this.isConnected = true;
		var maxPromisedIdle = message.connectionDetails.maxIdleInterval;
		if(maxPromisedIdle) {
			this.maxIdleInterval = maxPromisedIdle + this.timeouts.realtimeRequestTimeout;
			this.onActivity();
		}
		/* else Realtime declines to guarantee any maximum idle interval - CD2h */
	};

	Transport.prototype.onDisconnect = function(message) {
		/* Used for when the server has disconnected the client (usually with a
		 * DISCONNECTED action) */
		var err = message && message.error;
		Logger.logAction(Logger.LOG_MINOR, 'Transport.onDisconnect()', 'err = ' + Utils.inspectError(err));
		this.finish('disconnected', err);
	};

	Transport.prototype.onFatalError = function(message) {
		/* On receipt of a fatal connection error, we can assume that the server
		 * will close the connection and the transport, and do not need to request
		 * a disconnection - RTN15i */
		var err = message && message.error;
		Logger.logAction(Logger.LOG_MINOR, 'Transport.onFatalError()', 'err = ' + Utils.inspectError(err));
		this.finish('failed', err);
	};

	Transport.prototype.onClose = function(message) {
		var err = message && message.error;
		Logger.logAction(Logger.LOG_MINOR, 'Transport.onClose()', 'err = ' + Utils.inspectError(err));
		this.finish('closed', err);
	};

	Transport.prototype.requestClose = function() {
		Logger.logAction(Logger.LOG_MINOR, 'Transport.requestClose()', '');
		this.send(closeMessage);
	};

	Transport.prototype.requestDisconnect = function() {
		Logger.logAction(Logger.LOG_MINOR, 'Transport.requestDisconnect()', '');
		this.send(disconnectMessage);
	};

	Transport.prototype.ping = function(id) {
		var msg = {action: ProtocolMessage.Action.HEARTBEAT};
		if(id) msg.id = id;
		this.send(ProtocolMessage.fromValues(msg));
	};

	Transport.prototype.dispose = function() {
		Logger.logAction(Logger.LOG_MINOR, 'Transport.dispose()', '');
		this.isDisposed = true;
		this.off();
	};

	Transport.prototype.onActivity = function() {
		if(!this.maxIdleInterval) { return; }
		this.lastActivity = this.connectionManager.lastActivity = Utils.now();
		this.setIdleTimer(this.maxIdleInterval + 100);
	};

	Transport.prototype.setIdleTimer = function(timeout) {
		var self = this;
		if(!this.idleTimer) {
			this.idleTimer = setTimeout(function() {
				self.onIdleTimerExpire();
			}, timeout);
		}
	};

	Transport.prototype.onIdleTimerExpire = function() {
		this.idleTimer = null;
		var sinceLast = Utils.now() - this.lastActivity,
			timeRemaining = this.maxIdleInterval - sinceLast;
		if(timeRemaining <= 0) {
			var msg = 'No activity seen from realtime in ' + sinceLast + 'ms; assuming connection has dropped';
			Logger.logAction(Logger.LOG_ERROR, 'Transport.onIdleTimerExpire()', msg);
			this.disconnect(new ErrorInfo(msg, 80003, 408));
		} else {
			this.setIdleTimer(timeRemaining + 100);
		}
	};

	Transport.prototype.onAuthUpdated = function() {};

	return Transport;
})();

var WebSocketTransport = (function() {
	var WebSocket = Platform.WebSocket;
	var shortName = 'web_socket';

	/* public constructor */
	function WebSocketTransport(connectionManager, auth, params) {
		this.shortName = shortName;
		/* If is a browser, can't detect pings, so request protocol heartbeats */
		params.heartbeats = Platform.useProtocolHeartbeats;
		Transport.call(this, connectionManager, auth, params);
		this.wsHost = Defaults.getHost(params.options, params.host, true);
	}
	Utils.inherits(WebSocketTransport, Transport);

	WebSocketTransport.isAvailable = function() {
		return !!WebSocket;
	};

	if(WebSocketTransport.isAvailable())
		ConnectionManager.supportedTransports[shortName] = WebSocketTransport;

	WebSocketTransport.tryConnect = function(connectionManager, auth, params, callback) {
		var transport = new WebSocketTransport(connectionManager, auth, params);
		var errorCb = function(err) { callback({event: this.event, error: err}); };
		transport.on(['failed', 'disconnected'], errorCb);
		transport.on('wsopen', function() {
			Logger.logAction(Logger.LOG_MINOR, 'WebSocketTransport.tryConnect()', 'viable transport ' + transport);
			transport.off(['failed', 'disconnected'], errorCb);
			callback(null, transport);
		});
		transport.connect();
	};

	WebSocketTransport.prototype.createWebSocket = function(uri, connectParams) {
		var paramCount = 0;
		if(connectParams) {
			for(var key in connectParams)
				uri += (paramCount++ ? '&' : '?') + key + '=' + connectParams[key];
		}
		this.uri = uri;
		return new WebSocket(uri);
	};

	WebSocketTransport.prototype.toString = function() {
		return 'WebSocketTransport; uri=' + this.uri;
	};

	WebSocketTransport.prototype.connect = function() {
		Logger.logAction(Logger.LOG_MINOR, 'WebSocketTransport.connect()', 'starting');
		Transport.prototype.connect.call(this);
		var self = this, params = this.params, options = params.options;
		var wsScheme = options.tls ? 'wss://' : 'ws://';
		var wsUri = wsScheme + this.wsHost + ':' + Defaults.getPort(options) + '/';
		Logger.logAction(Logger.LOG_MINOR, 'WebSocketTransport.connect()', 'uri: ' + wsUri);
		this.auth.getAuthParams(function(err, authParams) {
			if(self.isDisposed) {
				return;
			}
			var paramStr = ''; for(var param in authParams) paramStr += ' ' + param + ': ' + authParams[param] + ';';
			Logger.logAction(Logger.LOG_MINOR, 'WebSocketTransport.connect()', 'authParams:' + paramStr + ' err: ' + err);
			if(err) {
				self.disconnect(err);
				return;
			}
			var connectParams = params.getConnectParams(authParams);
			try {
				var wsConnection = self.wsConnection = self.createWebSocket(wsUri, connectParams);
				wsConnection.binaryType = Platform.binaryType;
				wsConnection.onopen = function() { self.onWsOpen(); };
				wsConnection.onclose = function(ev) { self.onWsClose(ev); };
				wsConnection.onmessage = function(ev) { self.onWsData(ev.data); };
				wsConnection.onerror = function(ev) { self.onWsError(ev); };
				if(wsConnection.on) {
					/* node; browsers currently don't have a general eventemitter and can't detect
					 * pings. Also, no need to reply with a pong explicitly, ws lib handles that */
					wsConnection.on('ping', function() { self.onActivity(); });
				}
			} catch(e) {
				Logger.logAction(Logger.LOG_ERROR, 'WebSocketTransport.connect()', 'Unexpected exception creating websocket: err = ' + (e.stack || e.message));
				self.disconnect(e);
			}
		});
	};

	WebSocketTransport.prototype.send = function(message) {
		var wsConnection = this.wsConnection;
		if(!wsConnection) {
			Logger.logAction(Logger.LOG_ERROR, 'WebSocketTransport.send()', 'No socket connection');
			return;
		}
		try {
			wsConnection.send(ProtocolMessage.serialize(message, this.params.format));
		} catch (e) {
			var msg = 'Exception from ws connection when trying to send: ' + Utils.inspectError(e);
			Logger.logAction(Logger.LOG_ERROR, 'WebSocketTransport.send()', msg);
			/* Don't try to request a disconnect, that'll just involve sending data
			 * down the websocket again. Just finish the transport. */
			this.finish('disconnected', new ErrorInfo(msg, 50000, 500));
		}
	};

	WebSocketTransport.prototype.onWsData = function(data) {
		Logger.logAction(Logger.LOG_MICRO, 'WebSocketTransport.onWsData()', 'data received; length = ' + data.length + '; type = ' + typeof(data));
		try {
			this.onProtocolMessage(ProtocolMessage.deserialize(data, this.format));
		} catch (e) {
			Logger.logAction(Logger.LOG_ERROR, 'WebSocketTransport.onWsData()', 'Unexpected exception handing channel message: ' + e.stack);
		}
	};

	WebSocketTransport.prototype.onWsOpen = function() {
		Logger.logAction(Logger.LOG_MINOR, 'WebSocketTransport.onWsOpen()', 'opened WebSocket');
		this.emit('wsopen');
	};

	WebSocketTransport.prototype.onWsClose = function(ev) {
		var wasClean, code;
		if(typeof(ev) == 'object') {
			/* W3C spec-compatible */
			wasClean = ev.wasClean;
			code = ev.code;
		} else /*if(typeof(ev) == 'number')*/ {
			/* ws in node */
			code = ev;
			wasClean = (code == 1000);
		}
		delete this.wsConnection;
		if(wasClean) {
			Logger.logAction(Logger.LOG_MINOR, 'WebSocketTransport.onWsClose()', 'Cleanly closed WebSocket');
			var err = new ErrorInfo('Websocket closed', 80003, 400);
			this.finish('disconnected', err);
		} else {
			var msg = 'Unclean disconnection of WebSocket ; code = ' + code,
				err = new ErrorInfo(msg, 80003, 400);
			Logger.logAction(Logger.LOG_MINOR, 'WebSocketTransport.onWsClose()', msg);
			this.finish('disconnected', err);
		}
		this.emit('disposed');
	};

	WebSocketTransport.prototype.onWsError = function(err) {
		Logger.logAction(Logger.LOG_MINOR, 'WebSocketTransport.onError()', 'Error from WebSocket: ' + err.message);
		/* Wait a tick before aborting: if the websocket was connected, this event
		 * will be immediately followed by an onclose event with a close code. Allow
		 * that to close it (so we see the close code) rather than anticipating it */
		var self = this;
		Utils.nextTick(function() {
			self.disconnect(err);
		});
	};

	WebSocketTransport.prototype.dispose = function() {
		Logger.logAction(Logger.LOG_MINOR, 'WebSocketTransport.dispose()', '');
		this.isDisposed = true;
		var wsConnection = this.wsConnection;
		if(wsConnection) {
			/* Ignore any messages that come through after dispose() is called but before
			 * websocket is actually closed. (mostly would be harmless, but if it's a
			 * CONNECTED, it'll re-tick isConnected and cause all sorts of havoc) */
			wsConnection.onmessage = function() {};
			delete this.wsConnection;
			/* defer until the next event loop cycle before closing the socket,
			 * giving some implementations the opportunity to send any outstanding close message */
			Utils.nextTick(function() {
				Logger.logAction(Logger.LOG_MICRO, 'WebSocketTransport.dispose()', 'closing websocket');
				wsConnection.close();
			});
		}
	};

	return WebSocketTransport;
})();

var CometTransport = (function() {

	var REQ_SEND = 0,
		REQ_RECV = 1,
		REQ_RECV_POLL = 2,
		REQ_RECV_STREAM = 3;

	/* TODO: can remove once realtime sends protocol message responses for comet errors */
	function shouldBeErrorAction(err) {
		var UNRESOLVABLE_ERROR_CODES = [80015, 80017, 80030];
		if(err.code) {
			if(Auth.isTokenErr(err)) return false;
			if(Utils.arrIn(UNRESOLVABLE_ERROR_CODES, err.code)) return true;
			return (err.code >= 40000 && err.code < 50000);
		} else {
			/* Likely a network or transport error of some kind. Certainly not fatal to the connection */
			return false;
		}
	}

	function protocolMessageFromRawError(err) {
		/* err will be either a legacy (non-protocolmessage) comet error response
		 * (which will have an err.code), or a xhr/network error (which won't). */
		if(shouldBeErrorAction(err)) {
			return [ProtocolMessage.fromValues({action: ProtocolMessage.Action.ERROR, error: err})];
		} else {
			return [ProtocolMessage.fromValues({action: ProtocolMessage.Action.DISCONNECTED, error: err})];
		}
	}

	/*
	 * A base comet transport class
	 */
	function CometTransport(connectionManager, auth, params) {
		/* binary not supported for comet, so just fall back to default */
		params.format = undefined;
		params.heartbeats = true;
		Transport.call(this, connectionManager, auth, params);
		/* streaming defaults to true */
		this.stream = ('stream' in params) ? params.stream : true;
		this.sendRequest = null;
		this.recvRequest = null;
		this.pendingCallback = null;
		this.pendingItems = null;
	}
	Utils.inherits(CometTransport, Transport);

	CometTransport.REQ_SEND = REQ_SEND;
	CometTransport.REQ_RECV = REQ_RECV;
	CometTransport.REQ_RECV_POLL = REQ_RECV_POLL;
	CometTransport.REQ_RECV_STREAM = REQ_RECV_STREAM;

	/* public instance methods */
	CometTransport.prototype.connect = function() {
		Logger.logAction(Logger.LOG_MINOR, 'CometTransport.connect()', 'starting');
		Transport.prototype.connect.call(this);
		var self = this, params = this.params, options = params.options;
		var host = Defaults.getHost(options, params.host);
		var port = Defaults.getPort(options);
		var cometScheme = options.tls ? 'https://' : 'http://';

		this.baseUri = cometScheme + host + ':' + port + '/comet/';
		var connectUri = this.baseUri + 'connect';
		Logger.logAction(Logger.LOG_MINOR, 'CometTransport.connect()', 'uri: ' + connectUri);
		this.auth.getAuthParams(function(err, authParams) {
			if(err) {
				self.disconnect(err);
				return;
			}
			if(self.isDisposed) {
				return;
			}
			self.authParams = authParams;
			var connectParams = self.params.getConnectParams(authParams);
			if('stream' in connectParams) self.stream = connectParams.stream;
			Logger.logAction(Logger.LOG_MINOR, 'CometTransport.connect()', 'connectParams:' + Utils.toQueryString(connectParams));

			/* this will be the 'recvRequest' so this connection can stream messages */
			var preconnected = false,
				connectRequest = self.recvRequest = self.createRequest(connectUri, null, connectParams, null, (self.stream ? REQ_RECV_STREAM : REQ_RECV));

			connectRequest.on('data', function(data) {
				if(!self.recvRequest) {
					/* the transport was disposed before we connected */
					return;
				}
				if(!preconnected) {
					preconnected = true;
					self.emit('preconnect');
				}
				self.onData(data);
			});
			connectRequest.on('complete', function(err, _body, headers) {
				if(!self.recvRequest) {
					/* the transport was disposed before we connected */
					err = err || new ErrorInfo('Request cancelled', 80003, 400);
				}
				self.recvRequest = null;
				/* Connect request may complete without a emitting 'data' event since that is not
				 * emitted for e.g. a non-streamed error response. Still implies preconnect. */
				if(!preconnected) {
					preconnected = true;
					self.emit('preconnect');
				}
				self.onActivity();
				if(err) {
					if(err.code) {
						/* A protocol error received from realtime. TODO: once realtime
						 * consistendly sends errors wrapped in protocol messages, should be
						 * able to remove this */
						self.onData(protocolMessageFromRawError(err));
					} else {
						/* A network/xhr error. Don't bother wrapping in a protocol message,
						 * just disconnect the transport */
						self.disconnect(err);
					}
					return;
				}
				Utils.nextTick(function() {
					self.recv();
				});
			});
			connectRequest.exec();
		});
	};

	CometTransport.prototype.requestClose = function() {
		Logger.logAction(Logger.LOG_MINOR, 'CometTransport.requestClose()');
		this._requestCloseOrDisconnect(true);
	};

	CometTransport.prototype.requestDisconnect = function() {
		Logger.logAction(Logger.LOG_MINOR, 'CometTransport.requestDisconnect()');
		this._requestCloseOrDisconnect(false);
	};

	CometTransport.prototype._requestCloseOrDisconnect = function(closing) {
		var closeOrDisconnectUri = closing ? this.closeUri : this.disconnectUri;
		if(closeOrDisconnectUri) {
			var self = this,
				request = this.createRequest(closeOrDisconnectUri, null, this.authParams, null, REQ_SEND);

			request.on('complete', function (err) {
				if(err) {
					Logger.logAction(Logger.LOG_ERROR, 'CometTransport.request' + (closing ? 'Close()' : 'Disconnect()'), 'request returned err = ' + Utils.inspectError(err));
					self.finish('disconnected', err);
				}
			});
			request.exec();
		}
	};

	CometTransport.prototype.dispose = function() {
		Logger.logAction(Logger.LOG_MINOR, 'CometTransport.dispose()', '');
		if(!this.isDisposed) {
			this.isDisposed = true;
			if(this.recvRequest) {
				Logger.logAction(Logger.LOG_MINOR, 'CometTransport.dispose()', 'aborting recv request');
				this.recvRequest.abort();
				this.recvRequest = null;
			}
			/* In almost all cases the transport will be finished before it's
			 * disposed. Finish here just to make sure. */
			this.finish('disconnected', ConnectionError.disconnected);
			var self = this;
			Utils.nextTick(function() {
				self.emit('disposed');
			});
		}
	};

	CometTransport.prototype.onConnect = function(message) {
		/* if this transport has been disposed whilst awaiting connection, do nothing */
		if(this.isDisposed) {
			return;
		}

		/* the connectionKey in a comet connected response is really
		 * <instId>-<connectionKey> */
		var connectionStr = message.connectionKey;
		Transport.prototype.onConnect.call(this, message);

		var baseConnectionUri =  this.baseUri + connectionStr;
		Logger.logAction(Logger.LOG_MICRO, 'CometTransport.onConnect()', 'baseUri = ' + baseConnectionUri + '; connectionKey = ' + message.connectionKey);
		this.sendUri = baseConnectionUri + '/send';
		this.recvUri = baseConnectionUri + '/recv';
		this.closeUri = baseConnectionUri + '/close';
		this.disconnectUri = baseConnectionUri + '/disconnect';
	};

	CometTransport.prototype.send = function(message) {
		if(this.sendRequest) {
			/* there is a pending send, so queue this message */
			this.pendingItems = this.pendingItems || [];
			this.pendingItems.push(message);
			return;
		}
		/* send this, plus any pending, now */
		var pendingItems = this.pendingItems || [];
		pendingItems.push(message);
		this.pendingItems = null;

		this.sendItems(pendingItems);
	};

	CometTransport.prototype.sendAnyPending = function() {
		var pendingItems = this.pendingItems;

		if(!pendingItems) {
			return;
		}

		this.pendingItems = null;
		this.sendItems(pendingItems);
	};

	CometTransport.prototype.sendItems = function(items) {
		var self = this,
			sendRequest = this.sendRequest = self.createRequest(self.sendUri, null, self.authParams, this.encodeRequest(items), REQ_SEND);

		sendRequest.on('complete', function(err, data) {
			if(err) Logger.logAction(Logger.LOG_ERROR, 'CometTransport.sendItems()', 'on complete: err = ' + Utils.inspectError(err));
			self.sendRequest = null;

			/* the result of the request, even if a nack, is usually a protocol response
			 * contained in the data. An err is anomolous, and indicates some issue with the
			 * network,transport, or connection */
			if(err) {
				if(err.code) {
					/* A protocol error received from realtime. TODO: once realtime
					 * consistendly sends errors wrapped in protocol messages, should be
					 * able to remove this */
					self.onData(protocolMessageFromRawError(err));
				} else {
					/* A network/xhr error. Don't bother wrapping in a protocol message,
					 * just disconnect the transport */
					self.disconnect(err);
				}
				return;
			}

			if(data) {
				self.onData(data);
			}

			if(self.pendingItems) {
				Utils.nextTick(function() {
					/* If there's a new send request by now, any pending items will have
					 * been picked up by that; any new ones added since then will be
					 * picked up after that one completes */
					if(!self.sendRequest) {
						self.sendAnyPending();
					}
				});
			}
		});
		sendRequest.exec();
	};

	CometTransport.prototype.recv = function() {
		/* do nothing if there is an active request, which might be streaming */
		if(this.recvRequest)
			return;

		/* If we're no longer connected, do nothing */
		if(!this.isConnected)
			return;

		var self = this,
			recvRequest = this.recvRequest = this.createRequest(this.recvUri, null, this.authParams, null, (self.stream ? REQ_RECV_STREAM : REQ_RECV_POLL));

		recvRequest.on('data', function(data) {
			self.onData(data);
		});
		recvRequest.on('complete', function(err) {
			self.recvRequest = null;
			/* A request completing must be considered activity, as realtime sends
			 * heartbeats every 15s since a request began, not every 15s absolutely */
			self.onActivity();
			if(err) {
				if(err.code) {
					/* A protocol error received from realtime. TODO: once realtime
					 * consistendly sends errors wrapped in protocol messages, should be
					 * able to remove this */
					self.onData(protocolMessageFromRawError(err));
				} else {
					/* A network/xhr error. Don't bother wrapping in a protocol message,
					 * just disconnect the transport */
					self.disconnect(err);
				}
				return;
			}
			Utils.nextTick(function() {
				self.recv();
			});
		});
		recvRequest.exec();
	};

	CometTransport.prototype.onData = function(responseData) {
		try {
			var items = this.decodeResponse(responseData);
			if(items && items.length)
				for(var i = 0; i < items.length; i++)
					this.onProtocolMessage(ProtocolMessage.fromDeserialized(items[i]));
		} catch (e) {
			Logger.logAction(Logger.LOG_ERROR, 'CometTransport.onData()', 'Unexpected exception handing channel event: ' + e.stack);
		}
	};

	CometTransport.prototype.encodeRequest = function(requestItems) {
		return JSON.stringify(requestItems);
	};

	CometTransport.prototype.decodeResponse = function(responseData) {
		if(typeof(responseData) == 'string')
			responseData = JSON.parse(responseData);
		return responseData;
	};

	/* For comet, we could do the auth update by aborting the current recv and
	 * starting a new one with the new token, that'd be sufficient for realtime.
	 * Problem is JSONP - you can't cancel truly abort a recv once started. So
	 * we need to send an AUTH for jsonp. In which case it's simpler to keep all
	 * comet transports the same and do it for all of them. So we send the AUTH
	 * instead, and don't need to abort the recv */
	CometTransport.prototype.onAuthUpdated = function(tokenDetails) {
		this.authParams = {access_token: tokenDetails.token};
	};

	return CometTransport;
})();

var Presence = (function() {
	function noop() {}
	function Presence(channel) {
		this.channel = channel;
		this.basePath = channel.basePath + '/presence';
	}
	Utils.inherits(Presence, EventEmitter);

	Presence.prototype.get = function(params, callback) {
		Logger.logAction(Logger.LOG_MICRO, 'Presence.get()', 'channel = ' + this.channel.name);
		/* params and callback are optional; see if params contains the callback */
		if(callback === undefined) {
			if(typeof(params) == 'function') {
				callback = params;
				params = null;
			} else {
				if(this.channel.rest.options.promises) {
					return Utils.promisify(this, 'get', arguments);
				}
				callback = noop;
			}
		}
		var rest = this.channel.rest,
			format = rest.options.useBinaryProtocol ? 'msgpack' : 'json',
			envelope = Http.supportsLinkHeaders ? undefined : format,
			headers = Utils.defaultGetHeaders(format);

		if(rest.options.headers)
			Utils.mixin(headers, rest.options.headers);

		var options = this.channel.channelOptions;
		(new PaginatedResource(rest, this.basePath, headers, envelope, function(body, headers, unpacked) {
			return PresenceMessage.fromResponseBody(body, options, !unpacked && format);
		})).get(params, callback);
	};

	Presence.prototype.history = function(params, callback) {
		Logger.logAction(Logger.LOG_MICRO, 'Presence.history()', 'channel = ' + this.channel.name);
		this._history(params, callback);
	};

	Presence.prototype._history = function(params, callback) {
		/* params and callback are optional; see if params contains the callback */
		if(callback === undefined) {
			if(typeof(params) == 'function') {
				callback = params;
				params = null;
			} else {
				if(this.channel.rest.options.promises) {
					return Utils.promisify(this, '_history', arguments);
				}
				callback = noop;
			}
		}
		var rest = this.channel.rest,
			format = rest.options.useBinaryProtocol ? 'msgpack' : 'json',
			envelope = Http.supportsLinkHeaders ? undefined : format,
			headers = Utils.defaultGetHeaders(format),
			channel = this.channel;

		if(rest.options.headers)
			Utils.mixin(headers, rest.options.headers);

		var options = this.channel.channelOptions;
		(new PaginatedResource(rest, this.basePath + '/history', headers, envelope, function(body, headers, unpacked) {
			return PresenceMessage.fromResponseBody(body, options, !unpacked && format);
		})).get(params, callback);
	};

	return Presence;
})();

var Resource = (function() {
	var msgpack = Platform.msgpack;

	function Resource() {}

	function withAuthDetails(rest, headers, params, errCallback, opCallback) {
		if (Http.supportsAuthHeaders) {
			rest.auth.getAuthHeaders(function(err, authHeaders) {
				if(err)
					errCallback(err);
				else
					opCallback(Utils.mixin(authHeaders, headers), params);
			});
		} else {
			rest.auth.getAuthParams(function(err, authParams) {
				if(err)
					errCallback(err);
				else
					opCallback(headers, Utils.mixin(authParams, params));
			});
		}
	}

	function unenvelope(callback, format) {
		return function(err, body, outerHeaders, unpacked, outerStatusCode) {
			if(err && !body) {
				callback(err);
				return;
			}

			if(!unpacked) {
				try {
					body = Utils.decodeBody(body, format);
				} catch(e) {
					callback(e);
					return;
				}
			}

			if(body.statusCode === undefined) {
				/* Envelope already unwrapped by the transport */
				callback(err, body, outerHeaders, true, outerStatusCode);
				return;
			}

			var wrappedStatusCode = body.statusCode,
				response = body.response,
				wrappedHeaders = body.headers;

			if(wrappedStatusCode < 200 || wrappedStatusCode >= 300) {
				/* handle wrapped errors */
				var wrappedErr = (response && response.error) || err;
				if(!wrappedErr) {
					wrappedErr = new Error("Error in unenveloping " + body);
					wrappedErr.statusCode = wrappedStatusCode;
				}
				callback(wrappedErr, response, wrappedHeaders, true, wrappedStatusCode);
				return;
			}

			callback(err, response, wrappedHeaders, true, wrappedStatusCode);
		};
	}

	function paramString(params) {
		var paramPairs = [];
		if (params) {
			for (var needle in params) {
				paramPairs.push(needle + '=' + params[needle]);
			}
		}
		return paramPairs.join('&');
	}

	function urlFromPathAndParams(path, params) {
		return path + (params ? '?' : '') + paramString(params);
	}

	function logResponseHandler(callback, method, path, params) {
		return function(err, body, headers, unpacked, statusCode) {
			if (err) {
				Logger.logAction(Logger.LOG_MICRO, 'Resource.' + method + '()', 'Received Error; ' + urlFromPathAndParams(path, params) + '; Error: ' + Utils.inspectError(err));
			} else {
				Logger.logAction(Logger.LOG_MICRO, 'Resource.' + method + '()',
					'Received; ' + urlFromPathAndParams(path, params) + '; Headers: ' + paramString(headers) + '; StatusCode: ' + statusCode + '; Body: ' + (BufferUtils.isBuffer(body) ? body.toString() : body));
			}
			if (callback) { callback(err, body, headers, unpacked, statusCode); }
		}
	}

	Utils.arrForEach(Http.methodsWithoutBody, function(method) {
		Resource[method] = function(rest, path, origheaders, origparams, envelope, callback) {
			Resource['do'](method, rest, path, null, origheaders, origparams, envelope, callback);
		};
	});

	Utils.arrForEach(Http.methodsWithBody, function(method) {
		Resource[method] = function(rest, path, body, origheaders, origparams, envelope, callback) {
			Resource['do'](method, rest, path, body, origheaders, origparams, envelope, callback);
		};
	});

	Resource['do'] = function(method, rest, path, body, origheaders, origparams, envelope, callback) {
		if (Logger.shouldLog(Logger.LOG_MICRO)) {
			callback = logResponseHandler(callback, method, path, origparams);
		}

		if(envelope) {
			callback = (callback && unenvelope(callback, envelope));
			(origparams = (origparams || {}))['envelope'] = envelope;
		}

		function doRequest(headers, params) {
			if (Logger.shouldLog(Logger.LOG_MICRO)) {
				Logger.logAction(Logger.LOG_MICRO, 'Resource.' + method + '()', 'Sending; ' + urlFromPathAndParams(path, params));
			}

			var args = [rest, path, headers, body, params, function(err, res, headers, unpacked, statusCode) {
				if(err && Auth.isTokenErr(err)) {
					/* token has expired, so get a new one */
					rest.auth.authorize(null, null, function(err) {
						if(err) {
							callback(err);
							return;
						}
						/* retry ... */
						withAuthDetails(rest, origheaders, origparams, callback, doRequest);
					});
					return;
				}
				callback(err, res, headers, unpacked, statusCode);
			}];
			if (!body) {
				args.splice(3, 1);
			}

			if (Logger.shouldLog(Logger.LOG_MICRO)) {
				var decodedBody = body;
				if ((headers['content-type'] || '').indexOf('msgpack') > 0) {
					try {
						decodedBody = msgpack.decode(body);
					} catch (decodeErr) {
						Logger.logAction(Logger.LOG_MICRO, 'Resource.' + method + '()', 'Sending MsgPack Decoding Error: ' + Utils.inspectError(decodeErr));
					}
				}
				Logger.logAction(Logger.LOG_MICRO, 'Resource.' + method + '()', 'Sending; ' + urlFromPathAndParams(path, params) + '; Body: ' + decodedBody);
			}
			Http[method].apply(this, args);
		}

		withAuthDetails(rest, origheaders, origparams, callback, doRequest);
	};

	return Resource;
})();

var PaginatedResource = (function() {

	function getRelParams(linkUrl) {
		var urlMatch = linkUrl.match(/^\.\/(\w+)\?(.*)$/);
		return urlMatch && Utils.parseQueryString(urlMatch[2]);
	}

	function parseRelLinks(linkHeader) {
		if(typeof(linkHeader) == 'string')
			linkHeader = linkHeader.split(',');

		var relParams = {};
		for(var i = 0; i < linkHeader.length; i++) {
			var linkMatch = linkHeader[i].match(/^\s*<(.+)>;\s*rel="(\w+)"$/);
			if(linkMatch) {
				var params = getRelParams(linkMatch[1]);
				if(params)
					relParams[linkMatch[2]] = params;
			}
		}
		return relParams;
	}

	function PaginatedResource(rest, path, headers, envelope, bodyHandler, useHttpPaginatedResponse) {
		this.rest = rest;
		this.path = path;
		this.headers = headers;
		this.envelope = envelope;
		this.bodyHandler = bodyHandler;
		this.useHttpPaginatedResponse = useHttpPaginatedResponse || false;
	}

	Utils.arrForEach(Http.methodsWithoutBody, function(method) {
		PaginatedResource.prototype[method] = function(params, callback) {
			var self = this;
			Resource[method](self.rest, self.path, self.headers, params, self.envelope, function(err, body, headers, unpacked, statusCode) {
				self.handlePage(err, body, headers, unpacked, statusCode, callback);
			});
		};
	});

	Utils.arrForEach(Http.methodsWithBody, function(method) {
		PaginatedResource.prototype[method] = function(params, body, callback) {
			var self = this;
			Resource[method](self.rest, self.path, body, self.headers, params, self.envelope, function(err, resbody, headers, unpacked, statusCode) {
				if(callback) {
					self.handlePage(err, resbody, headers, unpacked, statusCode, callback);
				}
			});
		};
	});

	function returnErrOnly(err, body, useHPR) {
		/* If using httpPaginatedResponse, errors from Ably are returned as part of
		 * the HPR, only do callback(err) for network errors etc. which don't
		 * return a body and/or have no ably-originated error code (non-numeric
		 * error codes originate from node) */
		return !(useHPR && (body || typeof err.code === 'number'));
	}

	PaginatedResource.prototype.handlePage = function(err, body, headers, unpacked, statusCode, callback) {
		if(err && returnErrOnly(err, body, this.useHttpPaginatedResponse)) {
			Logger.logAction(Logger.LOG_ERROR, 'PaginatedResource.handlePage()', 'Unexpected error getting resource: err = ' + Utils.inspectError(err));
			callback(err);
			return;
		}
		var items, linkHeader, relParams;
		try {
			items = this.bodyHandler(body, headers, unpacked);
		} catch(e) {
			/* If we got an error, the failure to parse the body is almost certainly
			 * due to that, so cb with that in preference to the parse error */
			callback(err || e);
			return;
		}

		if(headers && (linkHeader = (headers['Link'] || headers['link']))) {
			relParams = parseRelLinks(linkHeader);
		}

		if(this.useHttpPaginatedResponse) {
			callback(null, new HttpPaginatedResponse(this, items, headers, statusCode, relParams, err));
		} else {
			callback(null, new PaginatedResult(this, items, relParams));
		}
	};

	function PaginatedResult(resource, items, relParams) {
		this.resource = resource;
		this.items = items;

		if(relParams) {
			var self = this;
			if('first' in relParams)
				this.first = function(cb) { self.get(relParams.first, cb); };
			if('current' in relParams)
				this.current = function(cb) { self.get(relParams.current, cb); };
			this.next = function(cb) {
				if('next' in relParams)
					self.get(relParams.next, cb);
				else
					cb(null, null);
			};

			this.hasNext = function() { return ('next' in relParams) };
			this.isLast = function() { return !this.hasNext(); };
		}
	}

	/* We assume that only the initial request can be a POST, and that accessing
	 * the rest of a multipage set of results can always be done with GET */
	PaginatedResult.prototype.get = function(params, callback) {
		var res = this.resource;
		Resource.get(res.rest, res.path, res.headers, params, res.envelope, function(err, body, headers, unpacked, statusCode) {
			res.handlePage(err, body, headers, unpacked, statusCode, callback);
		});
	};

	function HttpPaginatedResponse(resource, items, headers, statusCode, relParams, err) {
		PaginatedResult.call(this, resource, items, relParams);
		this.statusCode = statusCode;
		this.success = statusCode < 300 && statusCode >= 200;
		this.headers = headers;
		this.errorCode = err && err.code;
		this.errorMessage = err && err.message;
	}
	Utils.inherits(HttpPaginatedResponse, PaginatedResult);

	return PaginatedResource;
})();

var Auth = (function() {
	var MAX_TOKEN_LENGTH = Math.pow(2, 17);
	function noop() {}
	function random() { return ('000000' + Math.floor(Math.random() * 1E16)).slice(-16); }
	function normaliseAuthcallbackError(err) {
		/* A client auth callback may give errors in any number of formats; normalise to an errorinfo */
		if(!Utils.isErrorInfo(err)) {
			return new ErrorInfo(Utils.inspectError(err), err.code || 40170, err.statusCode || 401);
		}
		/* network errors will not have an inherent error code */
		if(!err.code) {
			if(err.statusCode === 403) {
				err.code = 40300;
			} else {
				err.code = 40170;
				/* normalise statusCode to 401 per RSA4e */
				err.statusCode = 401;
			}
		}
		return err;
	}

	var hmac, toBase64;
	if(Platform.createHmac) {
		toBase64 = function(str) { return (new Buffer(str, 'ascii')).toString('base64'); };
		hmac = function(text, key) {
			var inst = Platform.createHmac('SHA256', key);
			inst.update(text);
			return inst.digest('base64');
		};
	} else {
		toBase64 = Base64.encode;
		hmac = function(text, key) {
			return CryptoJS.HmacSHA256(text, key).toString(CryptoJS.enc.Base64);
		};
	}

	function c14n(capability) {
		if(!capability)
			return '';

		if(typeof(capability) == 'string')
			capability = JSON.parse(capability);

		var c14nCapability = {};
		var keys = Utils.keysArray(capability, true);
		if(!keys)
			return '';
		keys.sort();
		for(var i = 0; i < keys.length; i++) {
			c14nCapability[keys[i]] = capability[keys[i]].sort();
		}
		return JSON.stringify(c14nCapability);
	}

	function logAndValidateTokenAuthMethod(authOptions) {
		if(authOptions.authCallback) {
			Logger.logAction(Logger.LOG_MINOR, 'Auth()', 'using token auth with authCallback');
		} else if(authOptions.authUrl) {
			Logger.logAction(Logger.LOG_MINOR, 'Auth()', 'using token auth with authUrl');
		} else if(authOptions.key) {
			Logger.logAction(Logger.LOG_MINOR, 'Auth()', 'using token auth with client-side signing');
		} else if(authOptions.tokenDetails) {
			Logger.logAction(Logger.LOG_MINOR, 'Auth()', 'using token auth with supplied token only');
		} else {
			var msg = 'authOptions must include valid authentication parameters';
			Logger.logAction(Logger.LOG_ERROR, 'Auth()', msg);
			throw new Error(msg);
		}
	}

	function basicAuthForced(options) {
		return 'useTokenAuth' in options && !options.useTokenAuth;
	}

	/* RSA4 */
	function useTokenAuth(options) {
		return options.useTokenAuth ||
			(!basicAuthForced(options) &&
			 (options.authCallback ||
			  options.authUrl      ||
			  options.token        ||
			  options.tokenDetails))
	}

	/* RSA4a */
	function noWayToRenew(options) {
		return !options.key &&
			!options.authCallback &&
			!options.authUrl;
	}

	var trId = 0;
	function getTokenRequestId() {
		return trId++;
	}

	function Auth(client, options) {
		this.client = client;
		this.tokenParams = options.defaultTokenParams || {};
		/* The id of the current token request if one is in progress, else null */
		this.currentTokenRequestId = null;
		this.waitingForTokenRequest = null;

		if(useTokenAuth(options)) {
			/* Token auth */
			if(options.key && !hmac) {
				var msg = 'client-side token request signing not supported';
				Logger.logAction(Logger.LOG_ERROR, 'Auth()', msg);
				throw new Error(msg);
			}
			if(noWayToRenew(options)) {
				Logger.logAction(Logger.LOG_ERROR, 'Auth()', 'Warning: library initialized with a token literal without any way to renew the token when it expires (no authUrl, authCallback, or key). See https://help.ably.io/error/40171 for help');
			}
			this._saveTokenOptions(options.defaultTokenParams, options);
			logAndValidateTokenAuthMethod(this.authOptions);
		} else {
			/* Basic auth */
			if(!options.key) {
				var msg = 'No authentication options provided; need one of: key, authUrl, or authCallback (or for testing only, token or tokenDetails)';
				Logger.logAction(Logger.LOG_ERROR, 'Auth()', msg);
				throw new ErrorInfo(msg, 40160, 401);
			}
			Logger.logAction(Logger.LOG_MINOR, 'Auth()', 'anonymous, using basic auth');
			this._saveBasicOptions(options);
		}
	}

	/**
	 * Instructs the library to get a token immediately and ensures Token Auth
	 * is used for all future requests, storing the tokenParams and authOptions
	 * given as the new defaults for subsequent use.
	 *
	 * @param tokenParams
	 * an object containing the parameters for the requested token:
	 *
	 * - ttl:        (optional) the requested life of any new token in ms. If none
	 *               is specified a default of 1 hour is provided. The maximum lifetime
	 *               is 24hours; any request exceeeding that lifetime will be rejected
	 *               with an error.
	 *
	 * - capability: (optional) the capability to associate with the access token.
	 *               If none is specified, a token will be requested with all of the
	 *               capabilities of the specified key.
	 *
	 * - clientId:   (optional) a client Id to associate with the token
	 *
	 * - timestamp:  (optional) the time in ms since the epoch. If none is specified,
	 *               the system will be queried for a time value to use.
	 *
	 * @param authOptions
	 * an object containing auth options relevant to token auth:
	 *
	 * - queryTime   (optional) boolean indicating that the Ably system should be
	 *               queried for the current time when none is specified explicitly.
	 *
	 * - tokenDetails: (optional) object: An authenticated TokenDetails object.
	 *
	 * - token:        (optional) string: the `token` property of a tokenDetails object
	 *
	 * - authCallback:  (optional) a JavaScript callback to be called to get auth information.
	 *                  authCallback should be a function of (tokenParams, callback) that calls
	 *                  the callback with (err, result), where result is any of:
	 *                  - a tokenRequest object (ie the result of a rest.auth.createTokenRequest call),
	 *                  - a tokenDetails object (ie the result of a rest.auth.requestToken call),
	 *                  - a token string
	 *
	 * - authUrl:       (optional) a URL to be used to GET or POST a set of token request
	 *                  params, to obtain a signed token request.
	 *
	 * - authHeaders:   (optional) a set of application-specific headers to be added to any request
	 *                  made to the authUrl.
	 *
	 * - authParams:    (optional) a set of application-specific query params to be added to any
	 *                  request made to the authUrl.
	 *
	 *
	 * - requestHeaders (optional, unsupported, for testing only) extra headers to add to the
	 *                  requestToken request
	 *
	 * @param callback (err, tokenDetails)
	 */
	Auth.prototype.authorize = function(tokenParams, authOptions, callback) {
		/* shuffle and normalise arguments as necessary */
		if(typeof(tokenParams) == 'function' && !callback) {
			callback = tokenParams;
			authOptions = tokenParams = null;
		} else if(typeof(authOptions) == 'function' && !callback) {
			callback = authOptions;
			authOptions = null;
		}
		if(!callback) {
			if(this.client.options.promises) {
				return Utils.promisify(this, 'authorize', arguments);
			}
			callback = noop;
		}
		var self = this;

		/* RSA10a: authorize() call implies token auth. If a key is passed it, we
		 * just check if it doesn't clash and assume we're generating a token from it */
		if(authOptions && authOptions.key && (this.authOptions.key !== authOptions.key)) {
			throw new ErrorInfo('Unable to update auth options with incompatible key', 40102, 401);
		}

		if(authOptions && ('force' in authOptions)) {
			Logger.logAction(Logger.LOG_ERROR, 'Auth.authorize', 'Deprecation warning: specifying {force: true} in authOptions is no longer necessary, authorize() now always gets a new token. Please remove this, as in version 1.0 and later, having a non-null authOptions will overwrite stored library authOptions, which may not be what you want');
			/* Emulate the old behaviour: if 'force' was the only member of authOptions,
			 * set it to null so it doesn't overwrite stored. TODO: remove in version 1.0 */
			if(Utils.isOnlyPropIn(authOptions, 'force')) {
				authOptions = null;
			}
		}

		this._forceNewToken(tokenParams, authOptions, function(err, tokenDetails) {
			if(err) {
				callback(err);
				return;
			}
			/* RTC8
			 * - When authorize called by an end user and have a realtime connection,
			 * don't call back till new token has taken effect.
			 * - Use self.client.connection as a proxy for (self.client instanceof Realtime),
			 * which doesn't work in node as Realtime isn't part of the vm context for Rest clients */
			if(self.client.connection) {
				self.client.connection.connectionManager.onAuthUpdated(tokenDetails, callback);
			} else {
				callback(null, tokenDetails);
			}
		});
	};

	Auth.prototype.authorise = function() {
		Logger.deprecated('Auth.authorise', 'Auth.authorize');
		this.authorize.apply(this, arguments);
	};

	/* For internal use, eg by connectionManager - useful when want to call back
	 * as soon as we have the new token, rather than waiting for it to take
	 * effect on the connection as #authorize does */
	Auth.prototype._forceNewToken = function(tokenParams, authOptions, callback) {
		var self = this;

		/* get rid of current token even if still valid */
		this.tokenDetails = null;

		/* _save normalises the tokenParams and authOptions and updates the auth
		 * object. All subsequent operations should use the values on `this`,
		 * not the passed in ones. */
		this._saveTokenOptions(tokenParams, authOptions);

		logAndValidateTokenAuthMethod(this.authOptions);

		this._ensureValidAuthCredentials(true, function(err, tokenDetails) {
			/* RSA10g */
			delete self.tokenParams.timestamp;
			delete self.authOptions.queryTime;
			callback(err, tokenDetails);
		});
	};

	/**
	 * Request an access token
	 * @param authOptions
	 * an object containing the request options:
	 * - key:           the key to use.
	 *
	 * - authCallback:  (optional) a JavaScript callback to be called to get auth information.
	 *                  authCallback should be a function of (tokenParams, callback) that calls
	 *                  the callback with (err, result), where result is any of:
	 *                  - a tokenRequest object (ie the result of a rest.auth.createTokenRequest call),
	 *                  - a tokenDetails object (ie the result of a rest.auth.requestToken call),
	 *                  - a token string
	 *
	 * - authUrl:       (optional) a URL to be used to GET or POST a set of token request
	 *                  params, to obtain a signed token request.
	 *
	 * - authHeaders:   (optional) a set of application-specific headers to be added to any request
	 *                  made to the authUrl.
	 *
	 * - authParams:    (optional) a set of application-specific query params to be added to any
	 *                  request made to the authUrl.
	 *
	 * - queryTime      (optional) boolean indicating that the ably system should be
	 *                  queried for the current time when none is specified explicitly
	 *
	 * - requestHeaders (optional, unsupported, for testing only) extra headers to add to the
	 *                  requestToken request
	 *
	 * @param tokenParams
	 * an object containing the parameters for the requested token:
	 * - ttl:          (optional) the requested life of the token in milliseconds. If none is specified
	 *                  a default of 1 hour is provided. The maximum lifetime is 24hours; any request
	 *                  exceeeding that lifetime will be rejected with an error.
	 *
	 * - capability:    (optional) the capability to associate with the access token.
	 *                  If none is specified, a token will be requested with all of the
	 *                  capabilities of the specified key.
	 *
	 * - clientId:      (optional) a client Id to associate with the token; if not
	 *                  specified, a clientId passed in constructing the Rest interface will be used
	 *
	 * - timestamp:     (optional) the time in ms since the epoch. If none is specified,
	 *                  the system will be queried for a time value to use.
	 *
	 * @param callback (err, tokenDetails)
	 */
	Auth.prototype.requestToken = function(tokenParams, authOptions, callback) {
		/* shuffle and normalise arguments as necessary */
		if(typeof(tokenParams) == 'function' && !callback) {
			callback = tokenParams;
			authOptions = tokenParams = null;
		}
		else if(typeof(authOptions) == 'function' && !callback) {
			callback = authOptions;
			authOptions = null;
		}
		if(!callback && this.client.options.promises) {
			return Utils.promisify(this, 'requestToken', arguments);
		}

		/* RSA8e: if authOptions passed in, they're used instead of stored, don't merge them */
		authOptions = authOptions || this.authOptions;
		tokenParams = tokenParams || Utils.copy(this.tokenParams);
		callback = callback || noop;

		/* first set up whatever callback will be used to get signed
		 * token requests */
		var tokenRequestCallback, client = this.client;

		if(authOptions.authCallback) {
			Logger.logAction(Logger.LOG_MINOR, 'Auth.requestToken()', 'using token auth with authCallback');
			tokenRequestCallback = authOptions.authCallback;
		} else if(authOptions.authUrl) {
			Logger.logAction(Logger.LOG_MINOR, 'Auth.requestToken()', 'using token auth with authUrl');
			tokenRequestCallback = function(params, cb) {
				var authHeaders = Utils.mixin({accept: 'application/json, text/plain'}, authOptions.authHeaders),
					usePost = authOptions.authMethod && authOptions.authMethod.toLowerCase() === 'post';
				if(!usePost) {
					/* Combine authParams with any qs params given in the authUrl */
					var queryIdx = authOptions.authUrl.indexOf('?');
					if(queryIdx > -1) {
						var providedQsParams = Utils.parseQueryString(authOptions.authUrl.slice(queryIdx));
						authOptions.authUrl = authOptions.authUrl.slice(0, queryIdx);
						/* In case of conflict, authParams take precedence over qs params in the authUrl */
						authOptions.authParams = Utils.mixin(providedQsParams, authOptions.authParams);
					}
				}
				/* RSA8c2 */
				var authParams = Utils.mixin({}, authOptions.authParams || {}, params);
				var authUrlRequestCallback = function(err, body, headers, unpacked) {
					var contentType;
					if (err) {
						Logger.logAction(Logger.LOG_MICRO, 'Auth.requestToken().tokenRequestCallback', 'Received Error: ' + Utils.inspectError(err));
					} else {
						contentType = headers['content-type'];
						Logger.logAction(Logger.LOG_MICRO, 'Auth.requestToken().tokenRequestCallback', 'Received; content-type: ' + contentType + '; body: ' + Utils.inspectBody(body));
					}
					if(err || unpacked) return cb(err, body);
					if(BufferUtils.isBuffer(body)) body = body.toString();
					if(!contentType) {
						cb(new ErrorInfo('authUrl response is missing a content-type header', 40170, 401));
						return;
					}
					var json = contentType.indexOf('application/json') > -1,
						text = contentType.indexOf('text/plain') > -1 || contentType.indexOf('application/jwt') > -1;
					if(!json && !text) {
						cb(new ErrorInfo('authUrl responded with unacceptable content-type ' + contentType + ', should be either text/plain, application/jwt or application/json', 40170, 401));
						return;
					}
					if(json) {
						if(body.length > MAX_TOKEN_LENGTH) {
							cb(new ErrorInfo('authUrl response exceeded max permitted length', 40170, 401));
							return;
						}
						try {
							body = JSON.parse(body);
						} catch(e) {
							cb(new ErrorInfo('Unexpected error processing authURL response; err = ' + e.message, 40170, 401));
							return;
						}
					}
					cb(null, body, contentType);
				};
				Logger.logAction(Logger.LOG_MICRO, 'Auth.requestToken().tokenRequestCallback', 'Requesting token from ' + authOptions.authUrl + '; Params: ' + JSON.stringify(authParams) + '; method: ' + (usePost ? 'POST' : 'GET'));
				if(usePost) {
					/* send body form-encoded */
					var headers = authHeaders || {};
					headers['content-type'] = 'application/x-www-form-urlencoded';
					var body = Utils.toQueryString(authParams).slice(1); /* slice is to remove the initial '?' */
					Http.postUri(client, authOptions.authUrl, headers, body, {}, authUrlRequestCallback);
				} else {
					Http.getUri(client, authOptions.authUrl, authHeaders || {}, authParams, authUrlRequestCallback);
				}
			};
		} else if(authOptions.key) {
			var self = this;
			Logger.logAction(Logger.LOG_MINOR, 'Auth.requestToken()', 'using token auth with client-side signing');
			tokenRequestCallback = function(params, cb) { self.createTokenRequest(params, authOptions, cb); };
		} else {
			var msg = "Need a new token, but authOptions does not include any way to request one (no authUrl, authCallback, or key)";
			Logger.logAction(Logger.LOG_ERROR, 'Auth()', 'library initialized with a token literal without any way to renew the token when it expires (no authUrl, authCallback, or key). See https://help.ably.io/error/40171 for help');
			callback(new ErrorInfo(msg, 40171, 403));
			return;
		}

		/* normalise token params */
		if('capability' in tokenParams)
			tokenParams.capability = c14n(tokenParams.capability);

		var tokenRequest = function(signedTokenParams, tokenCb) {
			var keyName = signedTokenParams.keyName,
				path = '/keys/' + keyName + '/requestToken',
				tokenUri = function(host) { return client.baseUri(host) + path; };

			var requestHeaders = Utils.defaultPostHeaders();
			if(authOptions.requestHeaders) Utils.mixin(requestHeaders, authOptions.requestHeaders);
			Logger.logAction(Logger.LOG_MICRO, 'Auth.requestToken().requestToken', 'Sending POST to ' + path + '; Token params: ' + JSON.stringify(signedTokenParams));
			signedTokenParams = JSON.stringify(signedTokenParams);
			Http.post(client, tokenUri, requestHeaders, signedTokenParams, null, tokenCb);
		};

		var tokenRequestCallbackTimeoutExpired = false,
			timeoutLength = this.client.options.timeouts.realtimeRequestTimeout,
			tokenRequestCallbackTimeout = setTimeout(function() {
				tokenRequestCallbackTimeoutExpired = true;
				var msg = 'Token request callback timed out after ' + (timeoutLength / 1000) + ' seconds';
				Logger.logAction(Logger.LOG_ERROR, 'Auth.requestToken()', msg);
				callback(new ErrorInfo(msg, 40170, 401));
			}, timeoutLength);

		tokenRequestCallback(tokenParams, function(err, tokenRequestOrDetails, contentType) {
			if(tokenRequestCallbackTimeoutExpired) return;
			clearTimeout(tokenRequestCallbackTimeout);

			if(err) {
				Logger.logAction(Logger.LOG_ERROR, 'Auth.requestToken()', 'token request signing call returned error; err = ' + Utils.inspectError(err));
				callback(normaliseAuthcallbackError(err));
				return;
			}
			/* the response from the callback might be a token string, a signed request or a token details */
			if(typeof(tokenRequestOrDetails) === 'string') {
				if(tokenRequestOrDetails.length === 0) {
					callback(new ErrorInfo('Token string is empty', 40170, 401));
				} else if(tokenRequestOrDetails.length > MAX_TOKEN_LENGTH) {
					callback(new ErrorInfo('Token string exceeded max permitted length (was ' + tokenRequestOrDetails.length + ' bytes)', 40170, 401));
				} else if(tokenRequestOrDetails === 'undefined' || tokenRequestOrDetails === 'null') {
					/* common failure mode with poorly-implemented authCallbacks */
					callback(new ErrorInfo('Token string was literal null/undefined', 40170, 401));
				} else if((tokenRequestOrDetails[0] === '{') && !(contentType && contentType.indexOf('application/jwt') > -1)) {
					callback(new ErrorInfo('Token was double-encoded; make sure you\'re not JSON-encoding an already encoded token request or details', 40170, 401));
				} else {
					callback(null, {token: tokenRequestOrDetails});
				}
				return;
			}
			if(typeof(tokenRequestOrDetails) !== 'object') {
				var msg = 'Expected token request callback to call back with a token string or token request/details object, but got a ' + typeof(tokenRequestOrDetails);
				Logger.logAction(Logger.LOG_ERROR, 'Auth.requestToken()', msg);
				callback(new ErrorInfo(msg, 40170, 401));
				return;
			}
			var objectSize = JSON.stringify(tokenRequestOrDetails).length;
			if(objectSize > MAX_TOKEN_LENGTH && !authOptions.suppressMaxLengthCheck) {
				callback(new ErrorInfo('Token request/details object exceeded max permitted stringified size (was ' + objectSize + ' bytes)', 40170, 401));
				return;
			}
			if('issued' in tokenRequestOrDetails) {
				/* a tokenDetails object */
				callback(null, tokenRequestOrDetails);
				return;
			}
			if(!('keyName' in tokenRequestOrDetails)) {
				var msg = 'Expected token request callback to call back with a token string, token request object, or token details object';
				Logger.logAction(Logger.LOG_ERROR, 'Auth.requestToken()', msg);
				callback(new ErrorInfo(msg, 40170, 401));
				return;
			}
			/* it's a token request, so make the request */
			tokenRequest(tokenRequestOrDetails, function(err, tokenResponse, headers, unpacked) {
				if(err) {
					Logger.logAction(Logger.LOG_ERROR, 'Auth.requestToken()', 'token request API call returned error; err = ' + Utils.inspectError(err));
					callback(normaliseAuthcallbackError(err));
					return;
				}
				if(!unpacked) tokenResponse = JSON.parse(tokenResponse);
				Logger.logAction(Logger.LOG_MINOR, 'Auth.getToken()', 'token received');
				callback(null, tokenResponse);
			});
		});
	};

	/**
	 * Create and sign a token request based on the given options.
	 * NOTE this can only be used when the key value is available locally.
	 * Otherwise, signed token requests must be obtained from the key
	 * owner (either using the token request callback or url).
	 *
	 * @param authOptions
	 * an object containing the request options:
	 * - key:           the key to use. If not specified, a key passed in constructing
	 *                  the Rest interface will be used
	 *
	 * - queryTime      (optional) boolean indicating that the ably system should be
	 *                  queried for the current time when none is specified explicitly
	 *
	 * - requestHeaders (optional, unsupported, for testing only) extra headers to add to the
	 *                  requestToken request
	 *
	 * @param tokenParams
	 * an object containing the parameters for the requested token:
	 * - ttl:       (optional) the requested life of the token in ms. If none is specified
	 *                  a default of 1 hour is provided. The maximum lifetime is 24hours; any request
	 *                  exceeeding that lifetime will be rejected with an error.
	 *
	 * - capability:    (optional) the capability to associate with the access token.
	 *                  If none is specified, a token will be requested with all of the
	 *                  capabilities of the specified key.
	 *
	 * - clientId:      (optional) a client Id to associate with the token; if not
	 *                  specified, a clientId passed in constructing the Rest interface will be used
	 *
	 * - timestamp:     (optional) the time in ms since the epoch. If none is specified,
	 *                  the system will be queried for a time value to use.
	 *
	 */
	Auth.prototype.createTokenRequest = function(tokenParams, authOptions, callback) {
		/* shuffle and normalise arguments as necessary */
		if(typeof(tokenParams) == 'function' && !callback) {
			callback = tokenParams;
			authOptions = tokenParams = null;
		} else if(typeof(authOptions) == 'function' && !callback) {
			callback = authOptions;
			authOptions = null;
		}
		if(!callback && this.client.options.promises) {
			return Utils.promisify(this, 'createTokenRequest', arguments);
		}

		/* RSA9h: if authOptions passed in, they're used instead of stored, don't merge them */
		authOptions = authOptions || this.authOptions;
		tokenParams = tokenParams || Utils.copy(this.tokenParams);

		var key = authOptions.key;
		if(!key) {
			callback(new ErrorInfo('No key specified', 40101, 403));
			return;
		}
		var keyParts = key.split(':'),
			keyName = keyParts[0],
			keySecret = keyParts[1];

		if(!keySecret) {
			callback(new ErrorInfo('Invalid key specified', 40101, 403));
			return;
		}

		if(tokenParams.clientId === '') {
			callback(new ErrorInfo('clientId can’t be an empty string', 40012, 400));
			return;
		}

		if('capability' in tokenParams) {
			tokenParams.capability = c14n(tokenParams.capability);
		}

		var request = Utils.mixin({ keyName: keyName }, tokenParams),
			clientId = tokenParams.clientId || '',
			ttl = tokenParams.ttl || '',
			capability = tokenParams.capability || '',
			self = this;

		(function(authoriseCb) {
			if(request.timestamp) {
				authoriseCb();
				return;
			}			self.getTimestamp(authOptions && authOptions.queryTime, function(err, time) {
				if(err) {callback(err); return;}
				request.timestamp = time;
				authoriseCb();
			});
		})(function() {
			/* nonce */
			/* NOTE: there is no expectation that the client
			 * specifies the nonce; this is done by the library
			 * However, this can be overridden by the client
			 * simply for testing purposes. */
			var nonce = request.nonce || (request.nonce = random()),
				timestamp = request.timestamp;

			var signText
			=	request.keyName + '\n'
			+	ttl + '\n'
			+	capability + '\n'
			+	clientId + '\n'
			+	timestamp + '\n'
			+	nonce + '\n';

			/* mac */
			/* NOTE: there is no expectation that the client
			 * specifies the mac; this is done by the library
			 * However, this can be overridden by the client
			 * simply for testing purposes. */
			request.mac = request.mac || hmac(signText, keySecret);

			Logger.logAction(Logger.LOG_MINOR, 'Auth.getTokenRequest()', 'generated signed request');
			callback(null, request);
		});
	};

	/**
	 * Get the auth query params to use for a websocket connection,
	 * based on the current auth parameters
	 */
	Auth.prototype.getAuthParams = function(callback) {
		if(this.method == 'basic')
			callback(null, {key: this.key});
		else
			this._ensureValidAuthCredentials(false, function(err, tokenDetails) {
				if(err) {
					callback(err);
					return;
				}
				callback(null, {access_token: tokenDetails.token});
			});
	};

	/**
	 * Get the authorization header to use for a REST or comet request,
	 * based on the current auth parameters
	 */
	Auth.prototype.getAuthHeaders = function(callback) {
		if(this.method == 'basic') {
			callback(null, {authorization: 'Basic ' + this.basicKey});
		} else {
			this._ensureValidAuthCredentials(false, function(err, tokenDetails) {
				if(err) {
					callback(err);
					return;
				}
				callback(null, {authorization: 'Bearer ' + toBase64(tokenDetails.token)});
			});
		}
	};

	/**
	 * Get the current time based on the local clock,
	 * or if the option queryTime is true, return the server time.
	 * The server time offset from the local time is stored so that
	 * only one request to the server to get the time is ever needed
	 */
	Auth.prototype.getTimestamp = function(queryTime, callback) {
		if (!this.isTimeOffsetSet() && (queryTime || this.authOptions.queryTime)) {
			this.client.time(callback);
		} else {
			callback(null, this.getTimestampUsingOffset());
		}
	};

	Auth.prototype.getTimestampUsingOffset = function() {
		return Utils.now() + (this.client.serverTimeOffset || 0);
	};

	Auth.prototype.isTimeOffsetSet = function() {
		return this.client.serverTimeOffset !== null;
	};

	Auth.prototype._saveBasicOptions = function(authOptions) {
		this.method = 'basic';
		this.key = authOptions.key;
		this.basicKey = toBase64(authOptions.key);
		this.authOptions = authOptions || {};
		if('clientId' in authOptions) {
			this._userSetClientId(authOptions.clientId);
		}
	};

	Auth.prototype._saveTokenOptions = function(tokenParams, authOptions) {
		this.method = 'token';

		if(tokenParams) {
			/* We temporarily persist tokenParams.timestamp in case a new token needs
			 * to be requested, then null it out in the callback of
			 * _ensureValidAuthCredentials for RSA10g compliance */
			this.tokenParams = tokenParams;
		}

		if(authOptions) {
			/* normalise */
			if(authOptions.token) {
				/* options.token may contain a token string or, for convenience, a TokenDetails */
				authOptions.tokenDetails = (typeof(authOptions.token) === 'string') ? {token: authOptions.token} : authOptions.token;
			}

			if(authOptions.tokenDetails) {
				this.tokenDetails = authOptions.tokenDetails;
			}

			if('clientId' in authOptions) {
				this._userSetClientId(authOptions.clientId);
			}

			this.authOptions = authOptions;
		}
	};

	/* @param forceSupersede: force a new token request even if there's one in
	 * progress, making all pending callbacks wait for the new one */
	Auth.prototype._ensureValidAuthCredentials = function(forceSupersede, callback) {
		var self = this,
			token = this.tokenDetails;

		if(token) {
			if(this._tokenClientIdMismatch(token.clientId)) {
				/* 403 to trigger a permanently failed client - RSA15c */
				callback(new ErrorInfo('Mismatch between clientId in token (' + token.clientId + ') and current clientId (' + this.clientId + ')', 40102, 403));
				return;
			}
			/* RSA4b1 -- if we have a server time offset set already, we can
			 * autoremove expired tokens. Else just use the cached token. If it is
			 * expired Ably will tell us and we'll discard it then. */
			if(!this.isTimeOffsetSet() || !token.expires || (token.expires >= this.getTimestampUsingOffset())) {
				Logger.logAction(Logger.LOG_MINOR, 'Auth.getToken()', 'using cached token; expires = ' + token.expires);
				callback(null, token);
				return;
			}
			/* expired, so remove and fallthrough to getting a new one */
			Logger.logAction(Logger.LOG_MINOR, 'Auth.getToken()', 'deleting expired token');
			this.tokenDetails = null;
		}

		(this.waitingForTokenRequest || (this.waitingForTokenRequest = Multicaster())).push(callback);
		if(this.currentTokenRequestId !== null && !forceSupersede) {
			return;
		}

		/* Request a new token */
		var tokenRequestId = this.currentTokenRequestId = getTokenRequestId();
		this.requestToken(this.tokenParams, this.authOptions, function(err, tokenResponse) {
			if(self.currentTokenRequestId > tokenRequestId) {
				Logger.logAction(Logger.LOG_MINOR, 'Auth._ensureValidAuthCredentials()', 'Discarding token request response; overtaken by newer one');
				return;
			}
			self.currentTokenRequestId = null;
			var callbacks = self.waitingForTokenRequest || noop;
			self.waitingForTokenRequest = null;
			if(err) {
				callbacks(err);
				return;
			}
			callbacks(null, (self.tokenDetails = tokenResponse));
		});
	};


	/* User-set: check types, '*' is disallowed, throw any errors */
	Auth.prototype._userSetClientId = function(clientId) {
		if(!(typeof(clientId) === 'string' || clientId === null)) {
			throw new ErrorInfo('clientId must be either a string or null', 40012, 400);
		} else if(clientId === '*') {
			throw new ErrorInfo('Can’t use "*" as a clientId as that string is reserved. (To change the default token request behaviour to use a wildcard clientId, instantiate the library with {defaultTokenParams: {clientId: "*"}}), or if calling authorize(), pass it in as a tokenParam: authorize({clientId: "*"}, authOptions)', 40012, 400);
		} else {
			var err = this._uncheckedSetClientId(clientId);
			if(err) throw err;
		}
	};

	/* Ably-set: no typechecking, '*' is allowed but not set on this.clientId), return errors to the caller */
	Auth.prototype._uncheckedSetClientId = function(clientId) {
		if(this._tokenClientIdMismatch(clientId)) {
			/* Should never happen in normal circumstances as realtime should
			 * recognise mismatch and return an error */
			var msg = 'Unexpected clientId mismatch: client has ' + this.clientId + ', requested ' + clientId;
			var err = new ErrorInfo(msg, 40102, 401);
			Logger.logAction(Logger.LOG_ERROR, 'Auth._uncheckedSetClientId()', msg);
			return err;
		} else {
			/* RSA7a4: if options.clientId is provided and is not
			 * null, it overrides defaultTokenParams.clientId */
			this.clientId = this.tokenParams.clientId = clientId;
			return null;
		}
	};

	Auth.prototype._tokenClientIdMismatch = function(tokenClientId) {
		return this.clientId &&
			(this.clientId !== '*') &&
			tokenClientId &&
			(tokenClientId !== '*') &&
			(this.clientId !== tokenClientId);
	};

	Auth.isTokenErr = function(error) {
		return error.code && (error.code >= 40140) && (error.code < 40150);
	};

	return Auth;
})();

var Rest = (function() {
	var noop = function() {};
	var msgpack = Platform.msgpack;

	function Rest(options) {
		if(!(this instanceof Rest)){
			return new Rest(options);
		}

		/* normalise options */
		if(!options) {
			var msg = 'no options provided';
			Logger.logAction(Logger.LOG_ERROR, 'Rest()', msg);
			throw new Error(msg);
		}
		options = Defaults.objectifyOptions(options);

		if(options.log) {
			Logger.setLog(options.log.level, options.log.handler);
		}
		Logger.logAction(Logger.LOG_MICRO, 'Rest()', 'initialized with clientOptions ' + Utils.inspect(options));

		this.options = Defaults.normaliseOptions(options);

		/* process options */
		if(options.key) {
			var keyMatch = options.key.match(/^([^:\s]+):([^:.\s]+)$/);
			if(!keyMatch) {
				var msg = 'invalid key parameter';
				Logger.logAction(Logger.LOG_ERROR, 'Rest()', msg);
				throw new Error(msg);
			}
			options.keyName = keyMatch[1];
			options.keySecret = keyMatch[2];
		}

		if('clientId' in options) {
			if(!(typeof(options.clientId) === 'string' || options.clientId === null))
				throw new ErrorInfo('clientId must be either a string or null', 40012, 400);
			else if(options.clientId === '*')
				throw new ErrorInfo('Can’t use "*" as a clientId as that string is reserved. (To change the default token request behaviour to use a wildcard clientId, use {defaultTokenParams: {clientId: "*"}})', 40012, 400);
		}

		Logger.logAction(Logger.LOG_MINOR, 'Rest()', 'started; version = ' + Defaults.libstring);

		this.baseUri = this.authority = function(host) { return Defaults.getHttpScheme(options) + host + ':' + Defaults.getPort(options, false); };
		this._currentFallback = null;

		this.serverTimeOffset = null;
		this.auth = new Auth(this, options);
		this.channels = new Channels(this);
		this.push = new Push(this);
	}

	Rest.prototype.stats = function(params, callback) {
		/* params and callback are optional; see if params contains the callback */
		if(callback === undefined) {
			if(typeof(params) == 'function') {
				callback = params;
				params = null;
			} else {
				if(this.options.promises) {
					return Utils.promisify(this, 'stats', arguments);
				}
				callback = noop;
			}
		}
		var headers = Utils.defaultGetHeaders(),
			format = this.options.useBinaryProtocol ? 'msgpack' : 'json',
			envelope = Http.supportsLinkHeaders ? undefined : format;

		if(this.options.headers)
			Utils.mixin(headers, this.options.headers);

		(new PaginatedResource(this, '/stats', headers, envelope, function(body, headers, unpacked) {
			var statsValues = (unpacked ? body : JSON.parse(body));
			for(var i = 0; i < statsValues.length; i++) statsValues[i] = Stats.fromValues(statsValues[i]);
			return statsValues;
		})).get(params, callback);
	};

	Rest.prototype.time = function(params, callback) {
		/* params and callback are optional; see if params contains the callback */
		if(callback === undefined) {
			if(typeof(params) == 'function') {
				callback = params;
				params = null;
			} else {
				if(this.options.promises) {
					return Utils.promisify(this, 'time', arguments);
				}
				callback = noop;
			}
		}
		var headers = Utils.defaultGetHeaders();
		if(this.options.headers)
			Utils.mixin(headers, this.options.headers);
		var self = this;
		var timeUri = function(host) { return self.authority(host) + '/time' };
		Http.get(this, timeUri, headers, params, function(err, res, headers, unpacked) {
			if(err) {
				callback(err);
				return;
			}
			if(!unpacked) res = JSON.parse(res);
			var time = res[0];
			if(!time) {
				err = new Error('Internal error (unexpected result type from GET /time)');
				err.statusCode = 500;
				callback(err);
				return;
			}
			/* calculate time offset only once for this device by adding to the prototype */
			self.serverTimeOffset = (time - Utils.now());
			callback(null, time);
		});
	};

	Rest.prototype.request = function(method, path, params, body, customHeaders, callback) {
		var useBinary = this.options.useBinaryProtocol,
			encoder = useBinary ? msgpack.encode: JSON.stringify,
			decoder = useBinary ? msgpack.decode : JSON.parse,
			format = useBinary ? 'msgpack' : 'json',
			envelope = Http.supportsLinkHeaders ? undefined : format;
		params = params || {};
		method = method.toLowerCase();
		var headers = method == 'get' ? Utils.defaultGetHeaders(format) : Utils.defaultPostHeaders(format);

		if(callback === undefined) {
			if(this.options.promises) {
				return Utils.promisify(this, 'request', [method, path, params, body, customHeaders]);
			}
			callback = noop;
		}

		if(typeof body !== 'string') {
			body = encoder(body);
		}
		if(this.options.headers) {
			Utils.mixin(headers, this.options.headers);
		}
		if(customHeaders) {
			Utils.mixin(headers, customHeaders);
		}
		var paginatedResource = new PaginatedResource(this, path, headers, envelope, function(resbody, headers, unpacked) {
			return Utils.ensureArray(unpacked ? resbody : decoder(resbody));
		}, /* useHttpPaginatedResponse: */ true);

		if(!Utils.arrIn(Http.methods, method)) {
			throw new ErrorInfo('Unsupported method ' + method, 40500, 405);
		}

		if(Utils.arrIn(Http.methodsWithBody, method)) {
			paginatedResource[method](params, body, callback);
		} else {
			paginatedResource[method](params, callback);
		}
	};

	Rest.prototype.setLog = function(logOptions) {
		Logger.setLog(logOptions.level, logOptions.handler);
	};

	function Channels(rest) {
		this.rest = rest;
		this.attached = {};
	}

	Channels.prototype.get = function(name, channelOptions) {
		name = String(name);
		var channel = this.attached[name];
		if(!channel) {
			this.attached[name] = channel = new Channel(this.rest, name, channelOptions);
		} else if(channelOptions) {
			channel.setOptions(channelOptions);
		}

		return channel;
	};

	Channels.prototype.release = function(name) {
		delete this.attached[String(name)];
	};

	return Rest;
})();

Rest.Promise = function(options) {
	options = Defaults.objectifyOptions(options);
	options.promises = true;
	return new Rest(options);
};

Rest.Callbacks = Rest;

var Realtime = (function() {

	function Realtime(options) {
		if(!(this instanceof Realtime)){
			return new Realtime(options);
		}

		Logger.logAction(Logger.LOG_MINOR, 'Realtime()', '');
		Rest.call(this, options);
		this.connection = new Connection(this, this.options);
		this.channels = new Channels(this);
		if(options.autoConnect !== false)
			this.connect();
	}
	Utils.inherits(Realtime, Rest);

	Realtime.prototype.connect = function() {
		Logger.logAction(Logger.LOG_MINOR, 'Realtime.connect()', '');
		this.connection.connect();
	};

	Realtime.prototype.close = function() {
		Logger.logAction(Logger.LOG_MINOR, 'Realtime.close()', '');
		this.connection.close();
	};

	function Channels(realtime) {
		EventEmitter.call(this);
		this.realtime = realtime;
		this.all = {};
		this.inProgress = {};
		var self = this;
		realtime.connection.connectionManager.on('transport.active', function() {
			self.onTransportActive();
		});
	}
	Utils.inherits(Channels, EventEmitter);

	Channels.prototype.onChannelMessage = function(msg) {
		var channelName = msg.channel;
		if(channelName === undefined) {
			Logger.logAction(Logger.LOG_ERROR, 'Channels.onChannelMessage()', 'received event unspecified channel, action = ' + msg.action);
			return;
		}
		var channel = this.all[channelName];
		if(!channel) {
			Logger.logAction(Logger.LOG_ERROR, 'Channels.onChannelMessage()', 'received event for non-existent channel: ' + channelName);
			return;
		}
		channel.onMessage(msg);
	};

	/* called when a transport becomes connected; reattempt attach/detach
	 * for channels that are attaching or detaching.
	 * Note that this does not use inProgress as inProgress is only channels which have already made
	* at least one attempt to attach/detach */
	Channels.prototype.onTransportActive = function() {
		for(var channelName in this.all) {
			var channel = this.all[channelName];
			if(channel.state === 'attaching' || channel.state === 'detaching') {
				channel.checkPendingState();
			} else if(channel.state === 'suspended') {
				channel.attach();
			}
		}
	};

	Channels.prototype.reattach = function(reason) {
		for(var channelId in this.all) {
			var channel = this.all[channelId];
			/* NB this should not trigger for merely attaching channels, as they will
			 * be reattached anyway through the onTransportActive checkPendingState */
			if(channel.state === 'attached') {
				channel.requestState('attaching', reason);
			}
		}
	};

	Channels.prototype.resetAttachedMsgIndicators = function() {
		for(var channelId in this.all) {
			var channel = this.all[channelId];
			if(channel.state === 'attached') {
			channel._attachedMsgIndicator = false;
			}
		}
	};

	Channels.prototype.checkAttachedMsgIndicators = function(connectionId) {
		for(var channelId in this.all) {
			var channel = this.all[channelId];
			if(channel.state === 'attached' && channel._attachedMsgIndicator === false) {
				var msg = '30s after a resume, found channel which has not received an attached; channelId = ' + channelId + '; connectionId = ' + connectionId;
				Logger.logAction(Logger.LOG_ERROR, 'Channels.checkAttachedMsgIndicators()', msg);
				ErrorReporter.report('error', msg, 'channel-no-attached-after-resume');
				channel.requestState('attaching');
			}		}
	};

	/* Connection interruptions (ie when the connection will no longer queue
	 * events) imply connection state changes for any channel which is either
	 * attached, pending, or will attempt to become attached in the future */
	Channels.prototype.propogateConnectionInterruption = function(connectionState, reason) {
		var connectionStateToChannelState = {
			'closing'  : 'detached',
			'closed'   : 'detached',
			'failed'   : 'failed',
			'suspended': 'suspended'
		};
		var fromChannelStates = ['attaching', 'attached', 'detaching', 'suspended'];
		var toChannelState = connectionStateToChannelState[connectionState];

		for(var channelId in this.all) {
			var channel = this.all[channelId];
			if(Utils.arrIn(fromChannelStates, channel.state)) {
				 channel.notifyState(toChannelState, reason);
			}
		}
	};

	Channels.prototype.get = function(name, channelOptions) {
		name = String(name);
		var channel = this.all[name];
		if(!channel) {
			channel = this.all[name] = new RealtimeChannel(this.realtime, name, channelOptions);
		} else if(channelOptions) {
			channel.setOptions(channelOptions);
		}
		return channel;
	};

	Channels.prototype.release = function(name) {
		var channel = this.all[name];
		if(channel) {
			delete this.all[name];
		}
	};

	/* Records operations currently pending on a transport; used by connectionManager to decide when
	 * it's safe to upgrade. Note that a channel might be in the attaching state without any pending
	 * operations (eg if attached while the connection state is connecting) - such a channel must not
	 * hold up an upgrade, so is not considered inProgress.
	 * Operation is currently one of either 'statechange' or 'sync' */
	Channels.prototype.setInProgress = function(channel, operation, inProgress) {
		this.inProgress[channel.name] = this.inProgress[channel.name] || {};
		this.inProgress[channel.name][operation] = inProgress;
		if(!inProgress && this.hasNopending()) {
			this.emit('nopending');
		}
	};

	Channels.prototype.onceNopending = function(listener) {
		if(this.hasNopending()) {
			listener();
			return;
		}
		this.once('nopending', listener);
	};

	Channels.prototype.hasNopending = function() {
		return Utils.arrEvery(Utils.valuesArray(this.inProgress, true), function(operations) {
			return !Utils.containsValue(operations, true);
		});
	};

	return Realtime;
})();

Realtime.Promise = function(options) {
	options = Defaults.objectifyOptions(options);
	options.promises = true;
	return new Realtime(options);
};

Realtime.Callbacks = Realtime;

var ConnectionStateChange = (function() {

	/* public constructor */
	function ConnectionStateChange(previous, current, retryIn, reason) {
		this.previous = previous;
		this.current = current;
		if(retryIn) this.retryIn = retryIn;
		if(reason) this.reason = reason;
	}

	return ConnectionStateChange;
})();

var ChannelStateChange = (function() {

	/* public constructor */
	function ChannelStateChange(previous, current, resumed, reason) {
		this.previous = previous;
		this.current = current;
		if(current === 'attached') this.resumed = resumed;
		if(reason) this.reason = reason;
	}

	return ChannelStateChange;
})();

var Connection = (function() {
	function noop() {}

	/* public constructor */
	function Connection(ably, options) {
		EventEmitter.call(this);
		this.ably = ably;
		this.connectionManager = new ConnectionManager(ably, options);
		this.state = this.connectionManager.state.state;
		this.key = undefined;
		this.id = undefined;
		this.serial = undefined;
		this.timeSerial = undefined;
		this.recoveryKey = undefined;
		this.errorReason = null;

		var self = this;
		this.connectionManager.on('connectionstate', function(stateChange) {
			var state = self.state = stateChange.current;
			Utils.nextTick(function() {
				self.emit(state, stateChange);
			});
		});
		this.connectionManager.on('update', function(stateChange) {
			Utils.nextTick(function() {
				self.emit('update', stateChange);
			});
		});
	}
	Utils.inherits(Connection, EventEmitter);

	Connection.prototype.whenState = function(state, listener) {
		EventEmitter.prototype.whenState.call(this, state, this.state, listener, new ConnectionStateChange(undefined, state));
	};

	Connection.prototype.connect = function() {
		Logger.logAction(Logger.LOG_MINOR, 'Connection.connect()', '');
		this.connectionManager.requestState({state: 'connecting'});
	};

	Connection.prototype.ping = function(callback) {
		Logger.logAction(Logger.LOG_MINOR, 'Connection.ping()', '');
		if(!callback) {
			if(this.ably.options.promises) {
				return Utils.promisify(this, 'ping', arguments);
			}
			callback = noop;
		}
		this.connectionManager.ping(null, callback);
	};

	Connection.prototype.close = function() {
		Logger.logAction(Logger.LOG_MINOR, 'Connection.close()', 'connectionKey = ' + this.key);
		this.connectionManager.requestState({state: 'closing'});
	};

	return Connection;
})();

var Push = (function() {
	var noop = function() {};

	function Push(rest) {
		this.rest = rest;
		this.admin = new Admin(rest);
	}

	function Admin(rest) {
		this.rest = rest;
		this.deviceRegistrations = new DeviceRegistrations(rest);
		this.channelSubscriptions = new ChannelSubscriptions(rest);
	}

	Admin.prototype.publish = function(recipient, payload, callback) {
		var rest = this.rest;
		var format = rest.options.useBinaryProtocol ? 'msgpack' : 'json',
			requestBody = Utils.mixin({recipient: recipient}, payload),
			headers = Utils.defaultPostHeaders(format),
			params = {};

		if(typeof callback !== 'function') {
			if(this.rest.options.promises) {
				return Utils.promisify(this, 'publish', arguments);
			}
			callback = noop;
		}

		if(rest.options.headers)
			Utils.mixin(headers, rest.options.headers);

		if(rest.options.pushFullWait)
			Utils.mixin(params, {fullWait: 'true'});

		requestBody = Utils.encodeBody(requestBody, format);
		Resource.post(rest, '/push/publish', requestBody, headers, params, false, function(err) { callback(err); });
	};

	function DeviceRegistrations(rest) {
		this.rest = rest;
	}

	DeviceRegistrations.prototype.save = function(device, callback) {
		var rest = this.rest;
		var format = rest.options.useBinaryProtocol ? 'msgpack' : 'json',
			requestBody = DeviceDetails.fromValues(device),
			headers = Utils.defaultPostHeaders(format),
			params = {};

		if(typeof callback !== 'function') {
			if(this.rest.options.promises) {
				return Utils.promisify(this, 'save', arguments);
			}
			callback = noop;
		}

		if(rest.options.headers)
			Utils.mixin(headers, rest.options.headers);

		if(rest.options.pushFullWait)
			Utils.mixin(params, {fullWait: 'true'});

		requestBody = Utils.encodeBody(requestBody, format);
		Resource.put(rest, '/push/deviceRegistrations/' + encodeURIComponent(device.id), requestBody, headers, params, false, function(err, body, headers, unpacked) {
			callback(err, !err && DeviceDetails.fromResponseBody(body, !unpacked && format));
		});
	};

	DeviceRegistrations.prototype.get = function(deviceIdOrDetails, callback) {
		var rest = this.rest,
			format = rest.options.useBinaryProtocol ? 'msgpack' : 'json',
			headers = Utils.defaultGetHeaders(format),
			deviceId = deviceIdOrDetails.id || deviceIdOrDetails;

		if(typeof callback !== 'function') {
			if(this.rest.options.promises) {
				return Utils.promisify(this, 'get', arguments);
			}
			callback = noop;
		}

		if(typeof deviceId !== 'string' || !deviceId.length) {
			callback(new ErrorInfo('First argument to DeviceRegistrations#get must be a deviceId string or DeviceDetails', 40000, 400));
			return;
		}

		if(rest.options.headers)
			Utils.mixin(headers, rest.options.headers);

		Resource.get(rest, '/push/deviceRegistrations/' + encodeURIComponent(deviceId), headers, {}, false, function(err, body, headers, unpacked) {
			callback(err, !err && DeviceDetails.fromResponseBody(body, !unpacked && format));
		});
	};

	DeviceRegistrations.prototype.list = function(params, callback) {
		var rest = this.rest,
			format = rest.options.useBinaryProtocol ? 'msgpack' : 'json',
			envelope = Http.supportsLinkHeaders ? undefined : format,
			headers = Utils.defaultGetHeaders(format);

		if(typeof callback !== 'function') {
			if(this.rest.options.promises) {
				return Utils.promisify(this, 'list', arguments);
			}
			callback = noop;
		}

		if(rest.options.headers)
			Utils.mixin(headers, rest.options.headers);

		(new PaginatedResource(rest, '/push/deviceRegistrations', headers, envelope, function(body, headers, unpacked) {
			return DeviceDetails.fromResponseBody(body, !unpacked && format);
		})).get(params, callback);
	};

	DeviceRegistrations.prototype.remove = function(deviceIdOrDetails, callback) {
		var rest = this.rest,
			format = rest.options.useBinaryProtocol ? 'msgpack' : 'json',
			headers = Utils.defaultGetHeaders(format),
			params = {},
			deviceId = deviceIdOrDetails.id || deviceIdOrDetails;

		if(typeof callback !== 'function') {
			if(this.rest.options.promises) {
				return Utils.promisify(this, 'remove', arguments);
			}
			callback = noop;
		}

		if(typeof deviceId !== 'string' || !deviceId.length) {
			callback(new ErrorInfo('First argument to DeviceRegistrations#remove must be a deviceId string or DeviceDetails', 40000, 400));
			return;
		}

		if(rest.options.headers)
			Utils.mixin(headers, rest.options.headers);

		if(rest.options.pushFullWait)
			Utils.mixin(params, {fullWait: 'true'});

		Resource['delete'](rest, '/push/deviceRegistrations/' + encodeURIComponent(deviceId), headers, params, false, function(err) { callback(err); });
	};

	DeviceRegistrations.prototype.removeWhere = function(params, callback) {
		var rest = this.rest,
			format = rest.options.useBinaryProtocol ? 'msgpack' : 'json',
			headers = Utils.defaultGetHeaders(format);

		if(typeof callback !== 'function') {
			if(this.rest.options.promises) {
				return Utils.promisify(this, 'removeWhere', arguments);
			}
			callback = noop;
		}

		if(rest.options.headers)
			Utils.mixin(headers, rest.options.headers);

		if(rest.options.pushFullWait)
			Utils.mixin(params, {fullWait: 'true'});

		Resource['delete'](rest, '/push/deviceRegistrations', headers, params, false, function(err) { callback(err); });
	};

	function ChannelSubscriptions(rest) {
		this.rest = rest;
	}

	ChannelSubscriptions.prototype.save = function(subscription, callback) {
		var rest = this.rest;
		var format = rest.options.useBinaryProtocol ? 'msgpack' : 'json',
			requestBody = PushChannelSubscription.fromValues(subscription),
			headers = Utils.defaultPostHeaders(format),
			params = {};

		if(typeof callback !== 'function') {
			if(this.rest.options.promises) {
				return Utils.promisify(this, 'save', arguments);
			}
			callback = noop;
		}

		if(rest.options.headers)
			Utils.mixin(headers, rest.options.headers);

		if(rest.options.pushFullWait)
			Utils.mixin(params, {fullWait: 'true'});

		requestBody = Utils.encodeBody(requestBody, format);
		Resource.post(rest, '/push/channelSubscriptions', requestBody, headers, params, false, function(err, body, headers, unpacked) {
			callback(err, !err && PushChannelSubscription.fromResponseBody(body, !unpacked && format));
		});
	};

	ChannelSubscriptions.prototype.list = function(params, callback) {
		var rest = this.rest,
			format = rest.options.useBinaryProtocol ? 'msgpack' : 'json',
			envelope = Http.supportsLinkHeaders ? undefined : format,
			headers = Utils.defaultGetHeaders(format);

		if(typeof callback !== 'function') {
			if(this.rest.options.promises) {
				return Utils.promisify(this, 'list', arguments);
			}
			callback = noop;
		}

		if(rest.options.headers)
			Utils.mixin(headers, rest.options.headers);

		(new PaginatedResource(rest, '/push/channelSubscriptions', headers, envelope, function(body, headers, unpacked) {
			return PushChannelSubscription.fromResponseBody(body, !unpacked && format);
		})).get(params, callback);
	};

	ChannelSubscriptions.prototype.removeWhere = function(params, callback) {
		var rest = this.rest,
			format = rest.options.useBinaryProtocol ? 'msgpack' : 'json',
			headers = Utils.defaultGetHeaders(format);

		if(typeof callback !== 'function') {
			if(this.rest.options.promises) {
				return Utils.promisify(this, 'removeWhere', arguments);
			}
			callback = noop;
		}

		if(rest.options.headers)
			Utils.mixin(headers, rest.options.headers);

		if(rest.options.pushFullWait)
			Utils.mixin(params, {fullWait: 'true'});

		Resource['delete'](rest, '/push/channelSubscriptions', headers, params, false, function(err) { callback(err); });
	};

	/* ChannelSubscriptions have no unique id; removing one is equivalent to removeWhere by its properties */
	ChannelSubscriptions.prototype.remove = ChannelSubscriptions.prototype.removeWhere;

	ChannelSubscriptions.prototype.listChannels = function(params, callback) {
		var rest = this.rest,
			format = rest.options.useBinaryProtocol ? 'msgpack' : 'json',
			envelope = Http.supportsLinkHeaders ? undefined : format,
			headers = Utils.defaultGetHeaders(format);

		if(typeof callback !== 'function') {
			if(this.rest.options.promises) {
				return Utils.promisify(this, 'listChannels', arguments);
			}
			callback = noop;
		}

		if(rest.options.headers)
			Utils.mixin(headers, rest.options.headers);

		if(rest.options.pushFullWait)
			Utils.mixin(params, {fullWait: 'true'});

		(new PaginatedResource(rest, '/push/channels', headers, envelope, function(body, headers, unpacked) {
			var f = !unpacked && format;

			if(f) {
				body = Utils.decodeBody(body, format);
			}

			for(var i = 0; i < body.length; i++) {
				body[i] = String(body[i]);
			}
			return body;
		})).get(params, callback);
	};

	return Push;
})();

var Channel = (function() {
	function noop() {}
	var MSG_ID_ENTROPY_BYTES = 9;

	/* public constructor */
	function Channel(rest, name, channelOptions) {
		Logger.logAction(Logger.LOG_MINOR, 'Channel()', 'started; name = ' + name);
		EventEmitter.call(this);
		this.rest = rest;
		this.name = name;
		this.basePath = '/channels/' + encodeURIComponent(name);
		this.presence = new Presence(this);
		this.setOptions(channelOptions);
	}
	Utils.inherits(Channel, EventEmitter);

	Channel.prototype.setOptions = function(options) {
		this.channelOptions = options = options || {};
		if(options.cipher) {
			if(!Crypto) throw new Error('Encryption not enabled; use ably.encryption.js instead');
			var cipher = Crypto.getCipher(options.cipher);
			options.cipher = cipher.cipherParams;
			options.channelCipher = cipher.cipher;
		} else if('cipher' in options) {
			/* Don't deactivate an existing cipher unless options
			 * has a 'cipher' key that's falsey */
			options.cipher = null;
			options.channelCipher = null;
		}
	};

	Channel.prototype.history = function(params, callback) {
		Logger.logAction(Logger.LOG_MICRO, 'Channel.history()', 'channel = ' + this.name);
		/* params and callback are optional; see if params contains the callback */
		if(callback === undefined) {
			if(typeof(params) == 'function') {
				callback = params;
				params = null;
			} else {
				if(this.rest.options.promises) {
					return Utils.promisify(this, 'history', arguments);
				}
				callback = noop;
			}
		}

		this._history(params, callback);
	};

	Channel.prototype._history = function(params, callback) {
		var rest = this.rest,
			format = rest.options.useBinaryProtocol ? 'msgpack' : 'json',
			envelope = Http.supportsLinkHeaders ? undefined : format,
			headers = Utils.defaultGetHeaders(format);

		if(rest.options.headers)
			Utils.mixin(headers, rest.options.headers);

		var options = this.channelOptions;
		(new PaginatedResource(rest, this.basePath + '/messages', headers, envelope, function(body, headers, unpacked) {
			return Message.fromResponseBody(body, options, !unpacked && format);
		})).get(params, callback);
	};

	function allEmptyIds(messages) {
		return Utils.arrEvery(messages, function(message) {
			return !message.id;
		});
	}

	Channel.prototype.publish = function() {
		var argCount = arguments.length,
			first = arguments[0],
			second = arguments[1],
			callback = arguments[argCount - 1],
			messages,
			params,
			self = this;

		if(typeof(callback) !== 'function') {
			if(this.rest.options.promises) {
				return Utils.promisify(this, 'publish', arguments);
			}
			callback = noop;
		}

		if(typeof first === 'string' || first === null) {
			/* (name, data, ...) */
			messages = [Message.fromValues({name: first, data: second})];
			params = arguments[2];
		} else if(Utils.isObject(first)) {
			messages = [Message.fromValues(first)];
			params = arguments[1];
		} else if(Utils.isArray(first)) {
			messages = Message.fromValuesArray(first);
			params = arguments[1];
		} else {
			throw new ErrorInfo('The single-argument form of publish() expects a message object or an array of message objects', 40013, 400);
		}

		if(typeof params !== 'object' || !params) {
			/* No params supplied (so after-message argument is just the callback or undefined) */
			params = {};
		}

		var rest = this.rest,
			options = rest.options,
			format = options.useBinaryProtocol ? 'msgpack' : 'json',
			idempotentRestPublishing = rest.options.idempotentRestPublishing,
			headers = Utils.defaultPostHeaders(format);

		if(options.headers)
			Utils.mixin(headers, options.headers);

		if(idempotentRestPublishing && allEmptyIds(messages)) {
			var msgIdBase = Utils.randomString(MSG_ID_ENTROPY_BYTES);
			Utils.arrForEach(messages, function(message, index) {
				message.id = msgIdBase + ':' + index.toString();
			});
		}

		Message.encodeArray(messages, this.channelOptions, function(err) {
			if(err) {
				callback(err);
				return;
			}

			/* RSL1i */
			var size = Message.getMessagesSize(messages),
				maxMessageSize = options.maxMessageSize;
			if(size > maxMessageSize) {
				callback(new ErrorInfo('Maximum size of messages that can be published at once exceeded ( was ' + size + ' bytes; limit is ' + maxMessageSize + ' bytes)', 40009, 400));
				return;
			}

			self._publish(Message.serialize(messages, format), headers, params, callback);
		});
	};

	Channel.prototype._publish = function(requestBody, headers, params, callback) {
		Resource.post(this.rest, this.basePath + '/messages', requestBody, headers, params, false, callback);
	};

	return Channel;
})();

var RealtimeChannel = (function() {
	var actions = ProtocolMessage.Action;
	var noop = function() {};
	var statechangeOp = 'statechange';
	var syncOp = 'sync';

	/* public constructor */
	function RealtimeChannel(realtime, name, options) {
		Logger.logAction(Logger.LOG_MINOR, 'RealtimeChannel()', 'started; name = ' + name);
		Channel.call(this, realtime, name, options);
		this.realtime = realtime;
		this.presence = new RealtimePresence(this, realtime.options);
		this.connectionManager = realtime.connection.connectionManager;
		this.state = 'initialized';
		this.subscriptions = new EventEmitter();
		this.syncChannelSerial = undefined;
		this.properties = {
			attachSerial: undefined
		};
		this.setOptions(options);
		this.errorReason = null;
		this._requestedFlags = null;
		this._mode = null;
		/* Temporary; only used for the checkChannelsOnResume option */
		this._attachedMsgIndicator = false;
	}
	Utils.inherits(RealtimeChannel, Channel);

	RealtimeChannel.invalidStateError = function(state) {
		return {
			statusCode: 400,
			code: 90001,
			message: 'Channel operation failed as channel state is ' + state
		};
	};

	RealtimeChannel.progressOps = {
		statechange: statechangeOp,
		sync: syncOp
	};

	RealtimeChannel.processListenerArgs = function(args) {
		/* [event], listener, [callback] */
		args = Array.prototype.slice.call(args);
		if(typeof args[0] === 'function') {
			args.unshift(null);
		}
		if(args[args.length - 1] == undefined) {
			args.pop();
		}
		return args;
	};

	RealtimeChannel.prototype.publish = function() {
		var argCount = arguments.length,
			messages = arguments[0],
			callback = arguments[argCount - 1];

		if(typeof(callback) !== 'function') {
			if(this.realtime.options.promises) {
				return Utils.promisify(this, 'publish', arguments);
			}
			callback = noop;
			++argCount;
		}
		if(!this.connectionManager.activeState()) {
			callback(this.connectionManager.getError());
			return;
		}
		if(argCount == 2) {
			if(Utils.isObject(messages))
				messages = [Message.fromValues(messages)];
			else if(Utils.isArray(messages))
				messages = Message.fromValuesArray(messages);
			else
				throw new ErrorInfo('The single-argument form of publish() expects a message object or an array of message objects', 40013, 400);
		} else {
			messages = [Message.fromValues({name: arguments[0], data: arguments[1]})];
		}
		var self = this,
			maxMessageSize = this.realtime.options.maxMessageSize;
		Message.encodeArray(messages, this.channelOptions, function(err) {
			if (err) {
				callback(err);
				return;
			}
			/* RSL1i */
			var size = Message.getMessagesSize(messages);
			if(size > maxMessageSize) {
				callback(new ErrorInfo('Maximum size of messages that can be published at once exceeded ( was ' + size + ' bytes; limit is ' + maxMessageSize + ' bytes)', 40009, 400));
				return;
			}
			self._publish(messages, callback);
		});
	};

	RealtimeChannel.prototype._publish = function(messages, callback) {
		Logger.logAction(Logger.LOG_MICRO, 'RealtimeChannel.publish()', 'message count = ' + messages.length);
		var state = this.state;
		switch(state) {
			case 'failed':
			case 'suspended':
				callback(ErrorInfo.fromValues(RealtimeChannel.invalidStateError(state)));
				break;
			default:
				Logger.logAction(Logger.LOG_MICRO, 'RealtimeChannel.publish()', 'sending message; channel state is ' + state);
				var msg = new ProtocolMessage();
				msg.action = actions.MESSAGE;
				msg.channel = this.name;
				msg.messages = messages;
				this.sendMessage(msg, callback);
				break;
		}
	};

	RealtimeChannel.prototype.onEvent = function(messages) {
		Logger.logAction(Logger.LOG_MICRO, 'RealtimeChannel.onEvent()', 'received message');
		var subscriptions = this.subscriptions;
		for(var i = 0; i < messages.length; i++) {
			var message = messages[i];
			subscriptions.emit(message.name, message);
		}
	};

	RealtimeChannel.prototype.attach = function(flags, callback) {
		if(typeof(flags) === 'function') {
			callback = flags;
			flags = null;
		}
		if(!callback) {
			if(this.realtime.options.promises) {
				return Utils.promisify(this, 'attach', arguments);
			}
			callback = function(err) {
				if(err) {
					Logger.logAction(Logger.LOG_MAJOR, 'RealtimeChannel.attach()', 'Channel attach failed: ' + err.toString());
				}
			};
		}
		if(flags) {
			this._requestedFlags = flags;
		}
		var connectionManager = this.connectionManager;
		if(!connectionManager.activeState()) {
			callback(connectionManager.getError());
			return;
		}
		switch(this.state) {
			case 'attached':
				/* If flags requested, always do a re-attach. TODO only do this if if
				* current mode differs from requested mode */
				if(!flags) {
					callback();
					break;
				} /* else fallthrough */
			default:
				this.requestState('attaching');
			case 'attaching':
				this.once(function(stateChange) {
					switch(this.event) {
						case 'attached':
							callback();
							break;
						case 'detached':
						case 'suspended':
						case 'failed':
							callback(stateChange.reason || connectionManager.getError());
							break;
						case 'detaching':
							callback(new ErrorInfo('Attach request superseded by a subsequent detach request', 90000, 409));
							break;
					}
				});
			}
	};

	RealtimeChannel.prototype.attachImpl = function() {
		Logger.logAction(Logger.LOG_MICRO, 'RealtimeChannel.attachImpl()', 'sending ATTACH message');
		this.setInProgress(statechangeOp, true);
		var attachMsg = ProtocolMessage.fromValues({action: actions.ATTACH, channel: this.name});
		if(this._requestedFlags) {
			Utils.arrForEach(this._requestedFlags, function(flag) {
				attachMsg.setFlag(flag);
			});
		}
		this.sendMessage(attachMsg, noop);
	};

	RealtimeChannel.prototype.detach = function(callback) {
		if(!callback) {
			if(this.realtime.options.promises) {
				return Utils.promisify(this, 'detach', arguments);
			}
			callback = noop;
		}
		var connectionManager = this.connectionManager;
		if(!connectionManager.activeState()) {
			callback(connectionManager.getError());
			return;
		}
		switch(this.state) {
			case 'detached':
			case 'failed':
				callback();
				break;
			default:
				this.requestState('detaching');
			case 'detaching':
				this.once(function(stateChange) {
					switch(this.event) {
						case 'detached':
							callback();
							break;
						case 'attached':
						case 'suspended':
						case 'failed':
							callback(stateChange.reason || connectionManager.getError());
							break;
						case 'attaching':
							callback(new ErrorInfo('Detach request superseded by a subsequent attach request', 90000, 409));
							break;
					}
				});
		}
	};

	RealtimeChannel.prototype.detachImpl = function(callback) {
		Logger.logAction(Logger.LOG_MICRO, 'RealtimeChannel.detach()', 'sending DETACH message');
		this.setInProgress(statechangeOp, true);
		var msg = ProtocolMessage.fromValues({action: actions.DETACH, channel: this.name});
		this.sendMessage(msg, (callback || noop));
	};

	RealtimeChannel.prototype.subscribe = function(/* [event], listener, [callback] */) {
		var args = RealtimeChannel.processListenerArgs(arguments);
		var event = args[0];
		var listener = args[1];
		var callback = args[2];

		if(!callback) {
			if(this.realtime.options.promises) {
				return Utils.promisify(this, 'subscribe', [event, listener]);
			}
			callback = noop;
		}

		if(this.state === 'failed') {
			callback(ErrorInfo.fromValues(RealtimeChannel.invalidStateError('failed')));
			return;
		}

		this.subscriptions.on(event, listener);

		return this.attach(callback);
	};

	RealtimeChannel.prototype.unsubscribe = function(/* [event], listener */) {
		var args = RealtimeChannel.processListenerArgs(arguments);
		var event = args[0];
		var listener = args[1];
		this.subscriptions.off(event, listener);
	};

	RealtimeChannel.prototype.sync = function() {
		/* check preconditions */
		switch(this.state) {
			case 'initialized':
			case 'detaching':
			case 'detached':
				throw new ErrorInfo("Unable to sync to channel; not attached", 40000);
		}
		var connectionManager = this.connectionManager;
		if(!connectionManager.activeState()) {
			throw connectionManager.getError();
		}

		/* send sync request */
		var syncMessage = ProtocolMessage.fromValues({action: actions.SYNC, channel: this.name});
		if(this.syncChannelSerial) {
			syncMessage.channelSerial = this.syncChannelSerial;
		}
		connectionManager.send(syncMessage);
	};

	RealtimeChannel.prototype.sendMessage = function(msg, callback) {
		this.connectionManager.send(msg, this.realtime.options.queueMessages, callback);
	};

	RealtimeChannel.prototype.sendPresence = function(presence, callback) {
		var msg = ProtocolMessage.fromValues({
			action: actions.PRESENCE,
			channel: this.name,
			presence: (Utils.isArray(presence) ?
				PresenceMessage.fromValuesArray(presence) :
				[PresenceMessage.fromValues(presence)])
		});
		this.sendMessage(msg, callback);
	};

	RealtimeChannel.prototype.onMessage = function(message) {
		var syncChannelSerial, isSync = false;
		switch(message.action) {
		case actions.ATTACHED:
			this._attachedMsgIndicator = true;
			this.properties.attachSerial = message.channelSerial;
			this._mode = message.getMode();
			if(this.state === 'attached') {
				var resumed = message.hasFlag('RESUMED');
				if(!resumed || this.channelOptions.updateOnAttached) {
					/* On a loss of continuity, the presence set needs to be re-synced */
					this.presence.onAttached(message.hasFlag('HAS_PRESENCE'));
					var change = new ChannelStateChange(this.state, this.state, resumed, message.error);
					this.emit('update', change);
				}
			} else {
				this.notifyState('attached', message.error, message.hasFlag('RESUMED'), message.hasFlag('HAS_PRESENCE'));
			}
			break;

		case actions.DETACHED:
			var err = message.error ? ErrorInfo.fromValues(message.error) : new ErrorInfo('Channel detached', 90001, 404);
			if(this.state === 'detaching') {
				this.notifyState('detached', err);
			} else if(this.state === 'attaching') {
				/* Only retry immediately if we were previously attached. If we were
				 * attaching, go into suspended, fail messages, and wait a few seconds
				 * before retrying */
				this.notifyState('suspended', err);
			} else {
				this.requestState('attaching', err);
			}
			break;

		case actions.SYNC:
			/* syncs can have channelSerials, but might not if the sync is one page long */
			isSync = true;
			syncChannelSerial = this.syncChannelSerial = message.channelSerial;
			/* syncs can happen on channels with no presence data as part of connection
			 * resuming, in which case protocol message has no presence property */
			if(!message.presence) break;
		case actions.PRESENCE:
			var presence = message.presence,
				id = message.id,
				connectionId = message.connectionId,
				timestamp = message.timestamp;

			var options = this.channelOptions;
			for(var i = 0; i < presence.length; i++) {
				try {
					var presenceMsg = presence[i];
					PresenceMessage.decode(presenceMsg, options);
				} catch (e) {
					Logger.logAction(Logger.LOG_ERROR, 'RealtimeChannel.onMessage()', e.toString());
				}
				if(!presenceMsg.connectionId) presenceMsg.connectionId = connectionId;
				if(!presenceMsg.timestamp) presenceMsg.timestamp = timestamp;
				if(!presenceMsg.id) presenceMsg.id = id + ':' + i;
			}
			this.presence.setPresence(presence, isSync, syncChannelSerial);
			break;

		case actions.MESSAGE:
			var messages = message.messages,
				id = message.id,
				connectionId = message.connectionId,
				timestamp = message.timestamp;

			var options = this.channelOptions;
			for(var i = 0; i < messages.length; i++) {
				try {
					var msg = messages[i];
					Message.decode(msg, options);
				} catch (e) {
					/* decrypt failed .. the most likely cause is that we have the wrong key */
					Logger.logAction(Logger.LOG_MINOR, 'RealtimeChannel.onMessage()', e.toString());
				}
				if(!msg.connectionId) msg.connectionId = connectionId;
				if(!msg.timestamp) msg.timestamp = timestamp;
				if(!msg.id) msg.id = id + ':' + i;
			}
			this.onEvent(messages);
			break;

		case actions.ERROR:
			/* there was a channel-specific error */
			var err = message.error;
			if(err && err.code == 80016) {
				/* attach/detach operation attempted on superseded transport handle */
				this.checkPendingState();
			} else {
				this.notifyState('failed', ErrorInfo.fromValues(err));
			}
			break;

		default:
			Logger.logAction(Logger.LOG_ERROR, 'RealtimeChannel.onMessage()', 'Fatal protocol error: unrecognised action (' + message.action + ')');
			this.connectionManager.abort(ConnectionError.unknownChannelErr);
		}
	};

	RealtimeChannel.prototype.onAttached = function() {
		Logger.logAction(Logger.LOG_MINOR, 'RealtimeChannel.onAttached', 'activating channel; name = ' + this.name);
	};

	RealtimeChannel.prototype.notifyState = function(state, reason, resumed, hasPresence) {
		Logger.logAction(Logger.LOG_MICRO, 'RealtimeChannel.notifyState', 'name = ' + this.name + ', current state = ' + this.state + ', notifying state ' + state);
		this.clearStateTimer();

		if(state === this.state) {
			return;
		}
		this.presence.actOnChannelState(state, hasPresence, reason);
		if(state === 'suspended' && this.connectionManager.state.sendEvents) {
			this.startRetryTimer();
		} else {
			this.cancelRetryTimer();
		}
		if(reason) {
			this.errorReason = reason;
		}
		var change = new ChannelStateChange(this.state, state, resumed, reason);
		var logLevel = state === 'failed' ? Logger.LOG_ERROR : Logger.LOG_MAJOR;
		Logger.logAction(logLevel, 'Channel state for channel "' + this.name + '"', state + (reason ? ('; reason: ' + reason) : ''));

		/* Note: we don't set inProgress for pending states until the request is actually in progress */
		if(state === 'attached') {
			this.onAttached();
			this.setInProgress(syncOp, hasPresence);
			this.setInProgress(statechangeOp, false);
		} else if(state === 'detached' || state === 'failed' || state === 'suspended') {
			this.setInProgress(statechangeOp, false);
			this.setInProgress(syncOp, false);
		}

		this.state = state;
		this.emit(state, change);
	};

	RealtimeChannel.prototype.requestState = function(state, reason) {
		Logger.logAction(Logger.LOG_MINOR, 'RealtimeChannel.requestState', 'name = ' + this.name + ', state = ' + state);
		this.notifyState(state, reason);
		/* send the event and await response */
		this.checkPendingState();
	};

	RealtimeChannel.prototype.checkPendingState = function() {
		/* if can't send events, do nothing */
		var cmState = this.connectionManager.state;
		/* Allow attach messages to queue up when synchronizing, since this will be
		 * the state we'll be in when upgrade transport.active triggers a checkpendingstate */
		if(!(cmState.sendEvents || cmState.forceQueueEvents)) {
			Logger.logAction(Logger.LOG_MINOR, 'RealtimeChannel.checkPendingState', 'sendEvents is false; state is ' + this.connectionManager.state.state);
			return;
		}

		Logger.logAction(Logger.LOG_MINOR, 'RealtimeChannel.checkPendingState', 'name = ' + this.name + ', state = ' + this.state);
		/* Only start the state timer running when actually sending the event */
		switch(this.state) {
			case 'attaching':
				this.startStateTimerIfNotRunning();
				this.attachImpl();
				break;
			case 'detaching':
				this.startStateTimerIfNotRunning();
				this.detachImpl();
				break;
			case 'attached':
				/* resume any sync operation that was in progress */
				this.sync();
		}
	};

	RealtimeChannel.prototype.timeoutPendingState = function() {
		switch(this.state) {
			case 'attaching':
				var err = new ErrorInfo('Channel attach timed out', 90007, 408);
				this.notifyState('suspended', err);
				break;
			case 'detaching':
				var err = new ErrorInfo('Channel detach timed out', 90007, 408);
				this.notifyState('attached', err);
				break;
			default:
				this.checkPendingState();
				break;
		}
	};

	RealtimeChannel.prototype.startStateTimerIfNotRunning = function() {
		var self = this;
		if(!this.stateTimer) {
			this.stateTimer = setTimeout(function() {
				Logger.logAction(Logger.LOG_MINOR, 'RealtimeChannel.startStateTimerIfNotRunning', 'timer expired');
				self.stateTimer = null;
				self.timeoutPendingState();
			}, this.realtime.options.timeouts.realtimeRequestTimeout);
		}
	};

	RealtimeChannel.prototype.clearStateTimer = function() {
		var stateTimer = this.stateTimer;
		if(stateTimer) {
			clearTimeout(stateTimer);
			this.stateTimer = null;
		}
	};

	RealtimeChannel.prototype.startRetryTimer = function() {
		var self = this;
		if(this.retryTimer) return;

		this.retryTimer = setTimeout(function() {
			/* If connection is not connected, just leave in suspended, a reattach
			 * will be triggered once it connects again */
			if(self.state === 'suspended' && self.connectionManager.state.sendEvents) {
				self.retryTimer = null;
				Logger.logAction(Logger.LOG_MINOR, 'RealtimeChannel retry timer expired', 'attempting a new attach');
				self.requestState('attaching');
			}
		}, this.realtime.options.timeouts.channelRetryTimeout);
	};

	RealtimeChannel.prototype.cancelRetryTimer = function() {
		if(this.retryTimer) {
			clearTimeout(this.retryTimer);
			this.suspendTimer = null;
		}
	};

	RealtimeChannel.prototype.setInProgress = function(operation, value) {
		this.rest.channels.setInProgress(this, operation, value);
	};

	RealtimeChannel.prototype.history = function(params, callback) {
		Logger.logAction(Logger.LOG_MICRO, 'RealtimeChannel.history()', 'channel = ' + this.name);
		/* params and callback are optional; see if params contains the callback */
		if(callback === undefined) {
			if(typeof(params) == 'function') {
				callback = params;
				params = null;
			} else {
				if(this.rest.options.promises) {
					return Utils.promisify(this, 'history', arguments);
				}
				callback = noop;
			}
		}

		if(params && params.untilAttach) {
			if(this.state !== 'attached') {
				callback(new ErrorInfo("option untilAttach requires the channel to be attached", 40000, 400));
				return;
			}
			if(!this.properties.attachSerial) {
				callback(new ErrorInfo("untilAttach was specified and channel is attached, but attachSerial is not defined", 40000, 400));
				return;
			}
			delete params.untilAttach;
			params.from_serial = this.properties.attachSerial;
		}

		Channel.prototype._history.call(this, params, callback);
	};

	RealtimeChannel.prototype.whenState = function(state, listener) {
		EventEmitter.prototype.whenState.call(this, state, this.state, listener);
	};

	return RealtimeChannel;
})();

var RealtimePresence = (function() {
	var noop = function() {};

	function memberKey(item) {
		return item.clientId + ':' + item.connectionId;
	}

	function getClientId(realtimePresence) {
		return realtimePresence.channel.realtime.auth.clientId;
	}

	function isAnonymousOrWildcard(realtimePresence) {
		var realtime = realtimePresence.channel.realtime;
		/* If not currently connected, we can't assume that we're an anonymous
		 * client, as realtime may inform us of our clientId in the CONNECTED
		 * message. So assume we're not anonymous and leave it to realtime to
		 * return an error if we are */
		var clientId = realtime.auth.clientId;
		return (!clientId || (clientId === '*')) && realtime.connection.state === 'connected';
	}

	/* Callback is called only in the event of an error */
	function waitAttached(channel, callback, action) {
		switch(channel.state) {
			case 'attached':
			case 'suspended':
				action();
				break;
			case 'initialized':
			case 'detached':
			case 'detaching':
			case 'attaching':
				channel.attach(function(err) {
					if(err) callback(err);
					else action();
				});
				break;
			default:
				callback(ErrorInfo.fromValues(RealtimeChannel.invalidStateError(channel.state)));
		}
	}

	function RealtimePresence(channel, options) {
		Presence.call(this, channel);
		this.syncComplete = false;
		this.members = new PresenceMap(this);
		this._myMembers = new PresenceMap(this);
		this.subscriptions = new EventEmitter();
		this.pendingPresence = [];
	}
	Utils.inherits(RealtimePresence, Presence);

	RealtimePresence.prototype.enter = function(data, callback) {
		if(isAnonymousOrWildcard(this)) {
			throw new ErrorInfo('clientId must be specified to enter a presence channel', 40012, 400);
		}
		return this._enterOrUpdateClient(undefined, data, 'enter', callback);
	};

	RealtimePresence.prototype.update = function(data, callback) {
		if(isAnonymousOrWildcard(this)) {
			throw new ErrorInfo('clientId must be specified to update presence data', 40012, 400);
		}
		return this._enterOrUpdateClient(undefined, data, 'update', callback);
	};

	RealtimePresence.prototype.enterClient = function(clientId, data, callback) {
		return this._enterOrUpdateClient(clientId, data, 'enter', callback);
	};

	RealtimePresence.prototype.updateClient = function(clientId, data, callback) {
		return this._enterOrUpdateClient(clientId, data, 'update', callback);
	};

	RealtimePresence.prototype._enterOrUpdateClient = function(clientId, data, action, callback) {
		if (!callback) {
			if (typeof(data)==='function') {
				callback = data;
				data = null;
			} else {
				if(this.channel.realtime.options.promises) {
					return Utils.promisify(this, '_enterOrUpdateClient', [clientId, data, action]);
				}
				callback = noop;
			}
		}

		var channel = this.channel;
		if(!channel.connectionManager.activeState()) {
			callback(channel.connectionManager.getError());
			return;
		}

		Logger.logAction(Logger.LOG_MICRO, 'RealtimePresence.' + action + 'Client()',
		  'channel = ' + channel.name + ', client = ' + (clientId || '(implicit) ' + getClientId(this)));

		var presence = PresenceMessage.fromValues({
			action : action,
			data   : data
		});
		if (clientId) {
			presence.clientId = clientId;
		}

		var self = this;
		PresenceMessage.encode(presence, channel.channelOptions, function(err) {
			if (err) {
				callback(err);
				return;
			}
			switch(channel.state) {
				case 'attached':
					channel.sendPresence(presence, callback);
					break;
				case 'initialized':
				case 'detached':
					channel.attach();
				case 'attaching':
					self.pendingPresence.push({
						presence : presence,
						callback : callback
					});
					break;
				default:
					err = new ErrorInfo('Unable to ' + action + ' presence channel (incompatible state)', 90001);
					err.code = 90001;
					callback(err);
			}
		});
	};

	RealtimePresence.prototype.leave = function(data, callback) {
		if(isAnonymousOrWildcard(this)) {
			throw new ErrorInfo('clientId must have been specified to enter or leave a presence channel', 40012, 400);
		}
		return this.leaveClient(undefined, data, callback);
	};

	RealtimePresence.prototype.leaveClient = function(clientId, data, callback) {
		if (!callback) {
			if (typeof(data)==='function') {
				callback = data;
				data = null;
			} else {
				if(this.channel.realtime.options.promises) {
					return Utils.promisify(this, 'leaveClient', [clientId, data]);
				}
				callback = noop;
			}
		}

		var channel = this.channel;
		if(!channel.connectionManager.activeState()) {
			callback(channel.connectionManager.getError());
			return;
		}

		Logger.logAction(Logger.LOG_MICRO, 'RealtimePresence.leaveClient()', 'leaving; channel = ' + this.channel.name + ', client = ' + clientId);
		var presence = PresenceMessage.fromValues({
			action : 'leave',
			data   : data
		});
		if (clientId) { presence.clientId = clientId; }

		switch(channel.state) {
			case 'attached':
				channel.sendPresence(presence, callback);
				break;
			case 'attaching':
				this.pendingPresence.push({
					presence : presence,
					callback : callback
				});
				break;
			case 'initialized':
			case 'failed':
				/* we're not attached; therefore we let any entered status
				 * timeout by itself instead of attaching just in order to leave */
				var err = new ErrorInfo('Unable to leave presence channel (incompatible state)', 90001);
				callback(err);
				break;
			default:
				/* there is no connection; therefore we let
				 * any entered status timeout by itself */
				callback(ConnectionError.failed);
		}
	};

	RealtimePresence.prototype.get = function(/* params, callback */) {
		var args = Array.prototype.slice.call(arguments);
		if(args.length == 1 && typeof(args[0]) == 'function')
			args.unshift(null);

		var params = args[0],
			callback = args[1],
			waitForSync = !params || ('waitForSync' in params ? params.waitForSync : true);

		if(!callback) {
			if(this.channel.realtime.options.promises) {
				return Utils.promisify(this, 'get', args);
			}
			callback = noop;
		}

		function returnMembers(members) {
			callback(null, params ? members.list(params) : members.values());
		}

		/* Special-case the suspended state: can still get (stale) presence set if waitForSync is false */
		if(this.channel.state === 'suspended') {
			if(waitForSync) {
				callback(ErrorInfo.fromValues({
					statusCode: 400,
					code: 91005,
					message: 'Presence state is out of sync due to channel being in the SUSPENDED state'
				}));
			} else {
				returnMembers(this.members);
			}
			return;
		}

		var self = this;
		waitAttached(this.channel, callback, function() {
			var members = self.members;
			if(waitForSync) {
				members.waitSync(function() {
					returnMembers(members);
				});
			} else {
				returnMembers(members);
			}
		});
	};

	RealtimePresence.prototype.history = function(params, callback) {
		Logger.logAction(Logger.LOG_MICRO, 'RealtimePresence.history()', 'channel = ' + this.name);
		/* params and callback are optional; see if params contains the callback */
		if(callback === undefined) {
			if(typeof(params) == 'function') {
				callback = params;
				params = null;
			} else {
				if(this.channel.realtime.options.promises) {
					return Utils.promisify(this, 'history', arguments);
				}
				callback = noop;
			}
		}

		if(params && params.untilAttach) {
			if(this.channel.state === 'attached') {
				delete params.untilAttach;
				params.from_serial = this.channel.properties.attachSerial;
			} else {
				callback(new ErrorInfo("option untilAttach requires the channel to be attached, was: " + this.channel.state, 40000, 400));
			}
		}

		Presence.prototype._history.call(this, params, callback);
	};

	RealtimePresence.prototype.setPresence = function(presenceSet, isSync, syncChannelSerial) {
		Logger.logAction(Logger.LOG_MICRO, 'RealtimePresence.setPresence()', 'received presence for ' + presenceSet.length + ' participants; syncChannelSerial = ' + syncChannelSerial);
		var syncCursor, match, members = this.members, myMembers = this._myMembers,
			broadcastMessages = [], connId = this.channel.connectionManager.connectionId;

		if(isSync) {
			this.members.startSync();
			if(syncChannelSerial && (match = syncChannelSerial.match(/^[\w\-]+:(.*)$/))) {
				syncCursor = match[1];
			}
		}

		for(var i = 0; i < presenceSet.length; i++) {
			var presence = PresenceMessage.fromValues(presenceSet[i]);
			switch(presence.action) {
				case 'leave':
					if(members.remove(presence)) {
						broadcastMessages.push(presence);
					}
					if(presence.connectionId === connId && !presence.isSynthesized()) {
						myMembers.remove(presence);
					}
					break;
				case 'enter':
				case 'present':
				case 'update':
					if(members.put(presence)) {
						broadcastMessages.push(presence);
					}
					if(presence.connectionId === connId) {
						myMembers.put(presence);
					}
					break;
			}
		}
		/* if this is the last (or only) message in a sequence of sync updates, end the sync */
		if(isSync && !syncCursor) {
			members.endSync();
			/* RTP5c2: re-enter our own members if they haven't shown up in the sync */
			this._ensureMyMembersPresent();
			this.channel.setInProgress(RealtimeChannel.progressOps.sync, false);
			this.channel.syncChannelSerial = null;
		}

		/* broadcast to listeners */
		for(var i = 0; i < broadcastMessages.length; i++) {
			var presence = broadcastMessages[i];
			this.subscriptions.emit(presence.action, presence);
		}
	};

	RealtimePresence.prototype.onAttached = function(hasPresence) {
		Logger.logAction(Logger.LOG_MINOR, 'RealtimePresence.onAttached()', 'channel = ' + this.channel.name + ', hasPresence = ' + hasPresence);

		if(hasPresence) {
			this.members.startSync();
		} else {
			this._synthesizeLeaves(this.members.values());
			this.members.clear();
			this._ensureMyMembersPresent();
		}

		/* NB this must be after the _ensureMyMembersPresent call, which may add items to pendingPresence */
		var pendingPresence = this.pendingPresence,
			pendingPresCount = pendingPresence.length;

		if(pendingPresCount) {
			this.pendingPresence = [];
			var presenceArray = [];
			var multicaster = Multicaster();
			Logger.logAction(Logger.LOG_MICRO, 'RealtimePresence.onAttached', 'sending ' + pendingPresCount + ' queued presence messages');
			for(var i = 0; i < pendingPresCount; i++) {
				var event = pendingPresence[i];
				presenceArray.push(event.presence);
				multicaster.push(event.callback);
			}
			this.channel.sendPresence(presenceArray, multicaster);
		}
	};

	RealtimePresence.prototype.actOnChannelState = function(state, hasPresence, err) {
		switch(state) {
			case 'attached':
				this.onAttached(hasPresence);
				break;
			case 'detached':
			case 'failed':
				this._clearMyMembers();
				this.members.clear();
				/* falls through */
			case 'suspended':
				this.failPendingPresence(err);
				break;
		}
	};

	RealtimePresence.prototype.failPendingPresence = function(err) {
		if(this.pendingPresence.length) {
			Logger.logAction(Logger.LOG_MINOR, 'RealtimeChannel.failPendingPresence', 'channel; name = ' + this.channel.name + ', err = ' + Utils.inspectError(err));
			for(var i = 0; i < this.pendingPresence.length; i++)
				try {
					this.pendingPresence[i].callback(err);
				} catch(e) {}
			this.pendingPresence = [];
		}
	};

	RealtimePresence.prototype._clearMyMembers = function() {
		this._myMembers.clear();
	};

	RealtimePresence.prototype._ensureMyMembersPresent = function() {
		var self = this, members = this.members, myMembers = this._myMembers,
			reenterCb = function(err) {
				if(err) {
					var msg = 'Presence auto-re-enter failed: ' + err.toString();
					var wrappedErr = new ErrorInfo(msg, 91004, 400);
					Logger.logAction(Logger.LOG_ERROR, 'RealtimePresence._ensureMyMembersPresent()', msg);
					var change = new ChannelStateChange(self.channel.state, self.channel.state, true, wrappedErr);
					self.channel.emit('update', change);
				}
			};

		for(var memberKey in myMembers.map) {
			if(!(memberKey in members.map)) {
				var entry = myMembers.map[memberKey];
				Logger.logAction(Logger.LOG_MICRO, 'RealtimePresence._ensureMyMembersPresent()', 'Auto-reentering clientId "' + entry.clientId + '" into the presence set');
				this._enterOrUpdateClient(entry.clientId, entry.data, 'enter', reenterCb);
				delete myMembers.map[memberKey];
			}
		}
	};

	RealtimePresence.prototype._synthesizeLeaves = function(items) {
		var subscriptions = this.subscriptions;
		Utils.arrForEach(items, function(item) {
			var presence = PresenceMessage.fromValues({
				action: 'leave',
				connectionId: item.connectionId,
				clientId: item.clientId,
				data: item.data,
				encoding: item.encoding,
				timestamp: Utils.now()
			});
			subscriptions.emit('leave', presence);
		});
	};

	/* Deprecated */
	RealtimePresence.prototype.on = function() {
		Logger.deprecated('presence.on', 'presence.subscribe');
		this.subscribe.apply(this, arguments);
	};

	/* Deprecated */
	RealtimePresence.prototype.off = function() {
		Logger.deprecated('presence.off', 'presence.unsubscribe');
		this.unsubscribe.apply(this, arguments);
	};

	RealtimePresence.prototype.subscribe = function(/* [event], listener, [callback] */) {
		var args = RealtimeChannel.processListenerArgs(arguments);
		var event = args[0];
		var listener = args[1];
		var callback = args[2];
		var channel = this.channel;

		if(!callback) {
			if(this.channel.realtime.options.promises) {
				return Utils.promisify(this, 'subscribe', [event, listener]);
			}
			callback = noop;
		}

		if(channel.state === 'failed') {
			callback(ErrorInfo.fromValues(RealtimeChannel.invalidStateError('failed')));
			return;
		}

		this.subscriptions.on(event, listener);
		channel.attach(callback);
	};

	RealtimePresence.prototype.unsubscribe = function(/* [event], listener */) {
		var args = RealtimeChannel.processListenerArgs(arguments);
		var event = args[0];
		var listener = args[1];
		this.subscriptions.off(event, listener);
	};

	function PresenceMap(presence) {
		EventEmitter.call(this);
		this.presence = presence;
		this.map = {};
		this.syncInProgress = false;
		this.residualMembers = null;
	}
	Utils.inherits(PresenceMap, EventEmitter);

	PresenceMap.prototype.get = function(key) {
		return this.map[key];
	};

	PresenceMap.prototype.getClient = function(clientId) {
		var map = this.map, result = [];
		for(var key in map) {
			var item = map[key];
			if(item.clientId == clientId && item.action != 'absent')
				result.push(item);
		}
		return result;
	};

	PresenceMap.prototype.list = function(params) {
		var map = this.map,
			clientId = params && params.clientId,
			connectionId = params && params.connectionId,
			result = [];

		for(var key in map) {
			var item = map[key];
			if(item.action === 'absent') continue;
			if(clientId && clientId != item.clientId) continue;
			if(connectionId && connectionId != item.connectionId) continue;
			result.push(item);
		}
		return result;
	};

	function newerThan(item, existing) {
		/* RTP2b1: if either is synthesised, compare by timestamp */
		if(item.isSynthesized() || existing.isSynthesized()) {
			return item.timestamp > existing.timestamp;
		}

		/* RTP2b2 */
		var itemOrderings = item.parseId(),
			existingOrderings = existing.parseId();
		if(itemOrderings.msgSerial === existingOrderings.msgSerial) {
			return itemOrderings.index > existingOrderings.index;
		} else {
			return itemOrderings.msgSerial > existingOrderings.msgSerial;
		}
	}

	PresenceMap.prototype.put = function(item) {
		if(item.action === 'enter' || item.action === 'update') {
			item = PresenceMessage.fromValues(item);
			item.action = 'present';
		}
		var map = this.map, key = memberKey(item);
		/* we've seen this member, so do not remove it at the end of sync */
		if(this.residualMembers)
			delete this.residualMembers[key];

		/* compare the timestamp of the new item with any existing member (or ABSENT witness) */
		var existingItem = map[key];
		if(existingItem && !newerThan(item, existingItem)) {
			return false;
		}
		map[key] = item;
		return true;

	};

	PresenceMap.prototype.values = function() {
		var map = this.map, result = [];
		for(var key in map) {
			var item = map[key];
			if(item.action != 'absent')
				result.push(item);
		}
		return result;
	};

	PresenceMap.prototype.remove = function(item) {
		var map = this.map, key = memberKey(item);
		var existingItem = map[key];

		if(existingItem && !newerThan(item, existingItem)) {
			return false;
		}

		/* RTP2f */
		if(this.syncInProgress) {
			item = PresenceMessage.fromValues(item);
			item.action = 'absent';
			map[key] = item;
		} else {
			delete map[key];
		}

		return true;
	};

	PresenceMap.prototype.startSync = function() {
		var map = this.map, syncInProgress = this.syncInProgress;
		Logger.logAction(Logger.LOG_MINOR, 'PresenceMap.startSync()', 'channel = ' + this.presence.channel.name + '; syncInProgress = ' + syncInProgress);
		/* we might be called multiple times while a sync is in progress */
		if(!this.syncInProgress) {
			this.residualMembers = Utils.copy(map);
			this.setInProgress(true);
		}
	};

	PresenceMap.prototype.endSync = function() {
		var map = this.map, syncInProgress = this.syncInProgress;
		Logger.logAction(Logger.LOG_MINOR, 'PresenceMap.endSync()', 'channel = ' + this.presence.channel.name + '; syncInProgress = ' + syncInProgress);
		if(syncInProgress) {
			/* we can now strip out the ABSENT members, as we have
			 * received all of the out-of-order sync messages */
			for(var memberKey in map) {
				var entry = map[memberKey];
				if(entry.action === 'absent') {
					delete map[memberKey];
				}
			}
			/* any members that were present at the start of the sync,
			 * and have not been seen in sync, can be removed, and leave events emitted */
			this.presence._synthesizeLeaves(Utils.valuesArray(this.residualMembers));
			for(var memberKey in this.residualMembers) {
				delete map[memberKey];
			}
			this.residualMembers = null;

			/* finish, notifying any waiters */
			this.setInProgress(false);
		}
		this.emit('sync');
	};

	PresenceMap.prototype.waitSync = function(callback) {
		var syncInProgress = this.syncInProgress;
		Logger.logAction(Logger.LOG_MINOR, 'PresenceMap.waitSync()', 'channel = ' + this.presence.channel.name + '; syncInProgress = ' + syncInProgress);
		if(!syncInProgress) {
			callback();
			return;
		}
		this.once('sync', callback);
	};

	PresenceMap.prototype.clear = function(callback) {
		this.map = {};
		this.setInProgress(false);
		this.residualMembers = null;
	};

	PresenceMap.prototype.setInProgress = function(inProgress) {
		Logger.logAction(Logger.LOG_MICRO, 'PresenceMap.setInProgress()', 'inProgress = ' + inProgress);
		this.syncInProgress = inProgress;
		this.presence.syncComplete = !inProgress;
	};

	return RealtimePresence;
})();

var XHRRequest = (function() {
	var noop = function() {};
	var idCounter = 0;
	var pendingRequests = {};

	var REQ_SEND = 0,
		REQ_RECV_STREAM = 3;

	function clearPendingRequests() {
		for(var id in pendingRequests)
			pendingRequests[id].dispose();
	}

	var isIE = typeof global !== 'undefined' && global.XDomainRequest;

	function ieVersion() {
		var match = navigator.userAgent.toString().match(/MSIE\s([\d.]+)/);
		return match && Number(match[1]);
	}

	function needJsonEnvelope() {
		/* IE 10 xhr bug: http://stackoverflow.com/a/16320339 */
		var version;
		return isIE && (version = ieVersion()) && version === 10;
	}

	function getHeader(xhr, header) {
		return xhr.getResponseHeader && xhr.getResponseHeader(header);
	}

	/* Safari mysteriously returns 'Identity' for transfer-encoding when in fact
	 * it is 'chunked'. So instead, decide that it is chunked when
	 * transfer-encoding is present or content-length is absent.  ('or' because
	 * when using http2 streaming, there's no transfer-encoding header, but can
	 * still deduce streaming from lack of content-length) */
	function isEncodingChunked(xhr) {
		return xhr.getResponseHeader
			&& (xhr.getResponseHeader('transfer-encoding')
			|| !xhr.getResponseHeader('content-length'));
	}

	function getHeadersAsObject(xhr) {
		var headerPairs = Utils.trim(xhr.getAllResponseHeaders()).split('\r\n'),
			headers = {};
		for (var i = 0; i < headerPairs.length; i++) {
			var parts = Utils.arrMap(headerPairs[i].split(':'), Utils.trim);
			headers[parts[0].toLowerCase()] = parts[1];
		}
		return headers;
	}

	function XHRRequest(uri, headers, params, body, requestMode, timeouts, method) {
		EventEmitter.call(this);
		params = params || {};
		params.rnd = Utils.cheapRandStr();
		if(needJsonEnvelope() && !params.envelope)
			params.envelope = 'json';
		this.uri = uri + Utils.toQueryString(params);
		this.headers = headers || {};
		this.body = body;
		this.method = method ? method.toUpperCase() : (Utils.isEmptyArg(body) ? 'GET' : 'POST');
		this.requestMode = requestMode;
		this.timeouts = timeouts;
		this.timedOut = false;
		this.requestComplete = false;
		pendingRequests[this.id = String(++idCounter)] = this;
	}
	Utils.inherits(XHRRequest, EventEmitter);

	var createRequest = XHRRequest.createRequest = function(uri, headers, params, body, requestMode, timeouts, method) {
		/* XHR requests are used either with the context being a realtime
		 * transport, or with timeouts passed in (for when used by a rest client),
		 * or completely standalone.  Use the appropriate timeouts in each case */
		timeouts = timeouts || Defaults.TIMEOUTS;
		return new XHRRequest(uri, headers, Utils.copy(params), body, requestMode, timeouts, method);
	};

	XHRRequest.prototype.complete = function(err, body, headers, unpacked, statusCode) {
		if(!this.requestComplete) {
			this.requestComplete = true;
			if(!err && body) {
				this.emit('data', body);
			}
			this.emit('complete', err, body, headers, unpacked, statusCode);
			this.dispose();
		}
	};

	XHRRequest.prototype.abort = function() {
		this.dispose();
	};

	XHRRequest.prototype.exec = function() {
		var timeout = (this.requestMode == REQ_SEND) ? this.timeouts.httpRequestTimeout : this.timeouts.recvTimeout,
			self = this,
			timer = this.timer = setTimeout(function() {
				self.timedOut = true;
				xhr.abort();
			}, timeout),
			body = this.body,
			method = this.method,
			headers = this.headers,
			xhr = this.xhr = new XMLHttpRequest(),
			accept = headers['accept'],
			responseType = 'text';

		if(!accept) {
			headers['accept'] = 'application/json';
		} else if(accept.indexOf('application/x-msgpack') === 0) {
			responseType = 'arraybuffer';
		}

		if(body) {
			var contentType = headers['content-type'] || (headers['content-type'] = 'application/json');
			if(contentType.indexOf('application/json') > -1 && typeof(body) != 'string')
				body = JSON.stringify(body);
		}

		xhr.open(method, this.uri, true);
		xhr.responseType = responseType;

		if ('authorization' in headers) {
			xhr.withCredentials = true;
		}

		for(var h in headers)
			xhr.setRequestHeader(h, headers[h]);

		var errorHandler = function(errorEvent, message, code, statusCode) {
			var errorMessage = message + ' (event type: ' + errorEvent.type + ')' + (self.xhr.statusText ? ', current statusText is ' + self.xhr.statusText : '');
			Logger.logAction(Logger.LOG_ERROR, 'Request.on' + errorEvent.type + '()', errorMessage);
			self.complete(new ErrorInfo(errorMessage, code, statusCode));
		};
		xhr.onerror = function(errorEvent) {
			errorHandler(errorEvent, 'XHR error occurred', null, 400);
		};
		xhr.onabort = function(errorEvent) {
			if(self.timedOut) {
				errorHandler(errorEvent, 'Request aborted due to request timeout expiring', null, 408);
			} else {
				errorHandler(errorEvent, 'Request cancelled', null, 400);
			}
		};
		xhr.ontimeout = function(errorEvent) {
			errorHandler(errorEvent, 'Request timed out', null, 408);
		};

		var streaming,
			statusCode,
			responseBody,
			contentType,
			successResponse,
			streamPos = 0,
			unpacked = false;

		function onResponse() {
			clearTimeout(timer);
			successResponse = (statusCode < 400);
			if(statusCode == 204) {
				self.complete(null, null, null, null, statusCode);
				return;
			}
			streaming = (self.requestMode == REQ_RECV_STREAM && successResponse && isEncodingChunked(xhr));
		}

		function onEnd() {
			try {
				var contentType = getHeader(xhr, 'content-type'),
					headers,
					responseBody,
					/* Be liberal in what we accept; buggy auth servers may respond
					 * without the correct contenttype, but assume they're still
					 * responding with json */
					json = contentType ? (contentType.indexOf('application/json') >= 0) : (xhr.responseType == 'text');

				if(json) {
					/* If we requested msgpack but server responded with json, then since
					 * we set the responseType expecting msgpack, the response will be
					 * an ArrayBuffer containing json */
					responseBody = (xhr.responseType === 'arraybuffer') ? BufferUtils.utf8Decode(xhr.response) : String(xhr.responseText);
					if(responseBody.length) {
						responseBody = JSON.parse(responseBody);
					}
					unpacked = true;
				} else {
					responseBody = xhr.response;
				}

				if(responseBody.response !== undefined) {
					/* unwrap JSON envelope */
					statusCode = responseBody.statusCode;
					successResponse = (statusCode < 400);
					headers = responseBody.headers;
					responseBody = responseBody.response;
				} else {
					headers = getHeadersAsObject(xhr);
				}
			} catch(e) {
				self.complete(new ErrorInfo('Malformed response body from server: ' + e.message, null, 400));
				return;
			}

			/* If response is an array, it's an array of protocol messages -- even if
			 * is contains an error action (hence the nonsuccess statuscode), we can
			 * consider the request to have succeeded, just pass it on to
			 * onProtocolMessage to decide what to do */
			if(successResponse || Utils.isArray(responseBody)) {
				self.complete(null, responseBody, headers, unpacked, statusCode);
				return;
			}

			var err = responseBody.error;
			if(!err) {
				err = new ErrorInfo('Error response received from server: ' + statusCode + ' body was: ' + Utils.inspect(responseBody), null, statusCode);
			}
			self.complete(err, responseBody, headers, unpacked, statusCode);
		}

		function onProgress() {
			responseBody = xhr.responseText;
			var bodyEnd = responseBody.length - 1, idx, chunk;
			while((streamPos < bodyEnd) && (idx = responseBody.indexOf('\n', streamPos)) > -1) {
				chunk = responseBody.slice(streamPos, idx);
				streamPos = idx + 1;
				onChunk(chunk);
			}
		}

		function onChunk(chunk) {
			try {
				chunk = JSON.parse(chunk);
			} catch(e) {
				self.complete(new ErrorInfo('Malformed response body from server: ' + e.message, null, 400));
				return;
			}
			self.emit('data', chunk);
		}

		function onStreamEnd() {
			onProgress();
			self.streamComplete = true;
			Utils.nextTick(function() {
				self.complete();
			});
		}

		xhr.onreadystatechange = function() {
			var readyState = xhr.readyState;
			if(readyState < 3) return;
			if(xhr.status !== 0) {
				if(statusCode === undefined) {
					statusCode = xhr.status;
					/* IE returns 1223 for 204: http://bugs.jquery.com/ticket/1450 */
					if(statusCode === 1223) statusCode = 204;
					onResponse();
				}
				if(readyState == 3 && streaming) {
					onProgress();
				} else if(readyState == 4) {
					if(streaming)
						onStreamEnd();
					else
						onEnd();
				}
			}
		};
		xhr.send(body);
	};

	XHRRequest.prototype.dispose = function() {
		var xhr = this.xhr;
		if(xhr) {
			xhr.onreadystatechange = xhr.onerror = xhr.onabort = xhr.ontimeout = noop;
			this.xhr = null;
			var timer = this.timer;
			if(timer) {
				clearTimeout(timer);
				this.timer = null;
			}
			if(!this.requestComplete)
				xhr.abort();
		}
		delete pendingRequests[this.id];
	};

	if(Platform.xhrSupported) {
		if(typeof DomEvent === 'object') {
			DomEvent.addUnloadListener(clearPendingRequests);
		}
		if(typeof(Http) !== 'undefined') {
			Http.supportsAuthHeaders = true;
			Http.Request = function(method, rest, uri, headers, params, body, callback) {
				var req = createRequest(uri, headers, params, body, REQ_SEND, rest && rest.options.timeouts, method);
				req.once('complete', callback);
				req.exec();
				return req;
			};

			Http.checkConnectivity = function(callback) {
				var upUrl = Defaults.internetUpUrl;
				Logger.logAction(Logger.LOG_MICRO, '(XHRRequest)Http.checkConnectivity()', 'Sending; ' + upUrl);
				Http.getUri(null, upUrl, null, null, function(err, responseText) {
					var result = (!err && responseText.replace(/\n/, '') == 'yes');
					Logger.logAction(Logger.LOG_MICRO, '(XHRRequest)Http.checkConnectivity()', 'Result: ' + result);
					callback(null, result);
				});
			};
		}
	}

	return XHRRequest;
})();

var XHRStreamingTransport = (function() {
	var shortName = 'xhr_streaming';

	/* public constructor */
	function XHRStreamingTransport(connectionManager, auth, params) {
		CometTransport.call(this, connectionManager, auth, params);
		this.shortName = shortName;
	}
	Utils.inherits(XHRStreamingTransport, CometTransport);

	XHRStreamingTransport.isAvailable = function() {
		return Platform.xhrSupported && Platform.streamingSupported && Platform.allowComet;
	};

	XHRStreamingTransport.tryConnect = function(connectionManager, auth, params, callback) {
		var transport = new XHRStreamingTransport(connectionManager, auth, params);
		var errorCb = function(err) { callback({event: this.event, error: err}); };
		transport.on(['failed', 'disconnected'], errorCb);
		transport.on('preconnect', function() {
			Logger.logAction(Logger.LOG_MINOR, 'XHRStreamingTransport.tryConnect()', 'viable transport ' + transport);
			transport.off(['failed', 'disconnected'], errorCb);
			callback(null, transport);
		});
		transport.connect();
	};

	XHRStreamingTransport.prototype.toString = function() {
		return 'XHRStreamingTransport; uri=' + this.baseUri + '; isConnected=' + this.isConnected;
	};

	XHRStreamingTransport.prototype.createRequest = function(uri, headers, params, body, requestMode) {
		return XHRRequest.createRequest(uri, headers, params, body, requestMode, this.timeouts);
	};

	if(typeof(ConnectionManager) !== 'undefined' && XHRStreamingTransport.isAvailable()) {
		ConnectionManager.supportedTransports[shortName] = XHRStreamingTransport;
	}

	return XHRStreamingTransport;
})();

var XHRPollingTransport = (function() {
	var shortName = 'xhr_polling';

	function XHRPollingTransport(connectionManager, auth, params) {
		params.stream = false;
		CometTransport.call(this, connectionManager, auth, params);
		this.shortName = shortName;
	}
	Utils.inherits(XHRPollingTransport, CometTransport);

	XHRPollingTransport.isAvailable = function() {
		return Platform.xhrSupported && Platform.allowComet;
	};

	XHRPollingTransport.tryConnect = function(connectionManager, auth, params, callback) {
		var transport = new XHRPollingTransport(connectionManager, auth, params);
		var errorCb = function(err) { callback({event: this.event, error: err}); };
		transport.on(['failed', 'disconnected'], errorCb);
		transport.on('preconnect', function() {
			Logger.logAction(Logger.LOG_MINOR, 'XHRPollingTransport.tryConnect()', 'viable transport ' + transport);
			transport.off(['failed', 'disconnected'], errorCb);
			callback(null, transport);
		});
		transport.connect();
	};

	XHRPollingTransport.prototype.toString = function() {
		return 'XHRPollingTransport; uri=' + this.baseUri + '; isConnected=' + this.isConnected;
	};

	XHRPollingTransport.prototype.createRequest = function(uri, headers, params, body, requestMode) {
		return XHRRequest.createRequest(uri, headers, params, body, requestMode, this.timeouts);
	};

	if(typeof(ConnectionManager) !== 'undefined' && XHRPollingTransport.isAvailable()) {
		ConnectionManager.supportedTransports[shortName] = XHRPollingTransport;
	}

	return XHRPollingTransport;
})();

var JSONPTransport = (function() {
	var noop = function() {};
	/* Can't just use window.Ably, as that won't exist if using the commonjs version. */
	var _ = global._ablyjs_jsonp = {};

	/* express strips out parantheses from the callback!
	 * Kludge to still alow its responses to work, while not keeping the
	 * function form for normal use and not cluttering window.Ably
	 * https://github.com/strongloop/express/blob/master/lib/response.js#L305
	 */
	_._ = function(id) { return _['_' + id] || noop; };
	var idCounter = 1;
	var head = null;
	var shortName = 'jsonp';

	/* public constructor */
	function JSONPTransport(connectionManager, auth, params) {
		params.stream = false;
		CometTransport.call(this, connectionManager, auth, params);
		this.shortName = shortName;
	}
	Utils.inherits(JSONPTransport, CometTransport);

	JSONPTransport.isAvailable = function() {
		return Platform.jsonpSupported && Platform.allowComet;
	};
	if(JSONPTransport.isAvailable()) {
		ConnectionManager.supportedTransports[shortName] = JSONPTransport;
	}
	if(Platform.jsonpSupported) {
		head = document.getElementsByTagName('head')[0];
	}

	/* connectivity check; since this has a hard-coded callback id,
	 * we just make sure that we handle concurrent requests (but the
	 * connectionmanager should ensure this doesn't happen anyway */
	var checksInProgress = null;
	global.JSONPTransport = JSONPTransport;

	JSONPTransport.tryConnect = function(connectionManager, auth, params, callback) {
		var transport = new JSONPTransport(connectionManager, auth, params);
		var errorCb = function(err) { callback({event: this.event, error: err}); };
		transport.on(['failed', 'disconnected'], errorCb);
		transport.on('preconnect', function() {
			Logger.logAction(Logger.LOG_MINOR, 'JSONPTransport.tryConnect()', 'viable transport ' + transport);
			transport.off(['failed', 'disconnected'], errorCb);
			callback(null, transport);
		});
		transport.connect();
	};

	JSONPTransport.prototype.toString = function() {
		return 'JSONPTransport; uri=' + this.baseUri + '; isConnected=' + this.isConnected;
	};

	var createRequest = JSONPTransport.prototype.createRequest = function(uri, headers, params, body, requestMode, timeouts, method) {
		/* JSONP requests are used either with the context being a realtime
		 * transport, or with timeouts passed in (for when used by a rest client),
		 * or completely standalone.  Use the appropriate timeouts in each case */
		timeouts = (this && this.timeouts) || timeouts || Defaults.TIMEOUTS;
		return new Request(undefined, uri, headers, Utils.copy(params), body, requestMode, timeouts, method);
	};

	function Request(id, uri, headers, params, body, requestMode, timeouts, method) {
		EventEmitter.call(this);
		if(id === undefined) id = idCounter++;
		this.id = id;
		this.uri = uri;
		this.params = params || {};
		this.params.rnd = Utils.cheapRandStr();
		if(headers) {
			/* JSONP doesn't allow headers. Cherry-pick a couple to turn into qs params */
			if(headers['X-Ably-Version']) this.params.v = headers['X-Ably-Version'];
			if(headers['X-Ably-Lib']) this.params.lib = headers['X-Ably-Lib'];
		}
		this.body = body;
		this.method = method;
		this.requestMode = requestMode;
		this.timeouts = timeouts;
		this.requestComplete = false;
	}
	Utils.inherits(Request, EventEmitter);

	Request.prototype.exec = function() {
		var id = this.id,
			body = this.body,
			method = this.method,
			uri = this.uri,
			params = this.params,
			self = this;

		params.callback = '_ablyjs_jsonp._(' + id + ')';

		params.envelope = 'jsonp';
		if(body) {
			params.body = body;
		}
		if(method && method !== 'get') {
			params.method = method;
		}

		var script = this.script = document.createElement('script');
		var src = uri + Utils.toQueryString(params);
		script.src = src;
		if(script.src.split('/').slice(-1)[0] !== src.split('/').slice(-1)[0]) {
			/* The src has been truncated. Can't abort, but can at least emit an
			 * error so the user knows what's gone wrong. (Can't compare strings
			 * directly as src may have a port, script.src won't) */
			Logger.logAction(Logger.LOG_ERROR, 'JSONP Request.exec()', 'Warning: the browser appears to have truncated the script URI. This will likely result in the request failing due to an unparseable body param');
		}
		script.async = true;
		script.type = 'text/javascript';
		script.charset = 'UTF-8';
		script.onerror = function(err) {
			self.complete(new ErrorInfo('JSONP script error (event: ' + Utils.inspect(err) + ')', null, 400));
		};

		_['_' + id] = function(message) {
			if(message.statusCode) {
				/* Handle as enveloped jsonp, as all jsonp transport uses should be */
				var response = message.response;
				if(message.statusCode == 204) {
					self.complete(null, null, null, message.statusCode);
				} else if(!response) {
					self.complete(new ErrorInfo('Invalid server response: no envelope detected', null, 500));
				} else if(message.statusCode < 400 || Utils.isArray(response)) {
					/* If response is an array, it's an array of protocol messages -- even if
					 * it contains an error action (hence the nonsuccess statuscode), we can
					 * consider the request to have succeeded, just pass it on to
					 * onProtocolMessage to decide what to do */
					self.complete(null, response, message.headers, message.statusCode);
				} else {
					var err = response.error || new ErrorInfo('Error response received from server', null, message.statusCode);
					self.complete(err);
				}
			} else {
				/* Handle as non-enveloped -- as will be eg from a customer's authUrl server */
				self.complete(null, message);
			}
		};

		var timeout = (this.requestMode == CometTransport.REQ_SEND) ? this.timeouts.httpRequestTimeout : this.timeouts.recvTimeout;
		this.timer = setTimeout(function() { self.abort(); }, timeout);
		head.insertBefore(script, head.firstChild);
	};

	Request.prototype.complete = function(err, body, headers, statusCode) {
		headers = headers || {};
		if(!this.requestComplete) {
			this.requestComplete = true;
			var contentType;
			if(body) {
				contentType = (typeof(body) == 'string') ? 'text/plain' : 'application/json';
				headers['content-type'] = contentType;
				this.emit('data', body);
			}

			this.emit('complete', err, body, headers, /* unpacked: */ true, statusCode);
			this.dispose();
		}
	};

	Request.prototype.abort = function() {
		this.dispose();
	};

	Request.prototype.dispose = function() {
		var timer = this.timer;
		if(timer) {
			clearTimeout(timer);
			this.timer = null;
		}
		var script = this.script;
		if(script.parentNode) script.parentNode.removeChild(script);
		delete _[this.id];
		this.emit('disposed');
	};

	if(Platform.jsonpSupported && !Http.Request) {
		Http.Request = function(method, rest, uri, headers, params, body, callback) {
			var req = createRequest(uri, headers, params, body, CometTransport.REQ_SEND, rest && rest.options.timeouts, method);
			req.once('complete', callback);
			Utils.nextTick(function() {
				req.exec();
			});
			return req;
		};

		Http.checkConnectivity = function(callback) {
			var upUrl = Defaults.jsonpInternetUpUrl;

			if(checksInProgress) {
				checksInProgress.push(callback);
				return;
			}
			checksInProgress = [callback];
			Logger.logAction(Logger.LOG_MICRO, '(JSONP)Http.checkConnectivity()', 'Sending; ' + upUrl);

			var req = new Request('isTheInternetUp', upUrl, null, null, null, CometTransport.REQ_SEND, Defaults.TIMEOUTS);
			req.once('complete', function(err, response) {
				var result = !err && response;
				Logger.logAction(Logger.LOG_MICRO, '(JSONP)Http.checkConnectivity()', 'Result: ' + result);
				for(var i = 0; i < checksInProgress.length; i++) checksInProgress[i](null, result);
				checksInProgress = null;
			});
			Utils.nextTick(function() {
				req.exec();
			});
		};
	}

	return JSONPTransport;
})();

Ably.msgpack = msgpack;
Ably.Rest = Rest;
Ably.Realtime = Realtime;
Realtime.ConnectionManager = ConnectionManager;
Realtime.BufferUtils = Rest.BufferUtils = BufferUtils;
if(typeof(Crypto) !== 'undefined') Realtime.Crypto = Rest.Crypto = Crypto;
Realtime.Defaults = Rest.Defaults = Defaults;
Realtime.Http = Rest.Http = Http;
Realtime.Utils = Rest.Utils = Utils;
Realtime.Http = Rest.Http = Http;
Realtime.Message = Rest.Message = Message;
Realtime.PresenceMessage = Rest.PresenceMessage = PresenceMessage;
Realtime.ProtocolMessage = Rest.ProtocolMessage = ProtocolMessage;

module.exports = Ably;

/* SystemJS support for default exports to be added to the root of the module
   https://github.com/frankwallis/plugin-typescript/issues/185 */
module.exports.__esModule = true;
});

var Ably = unwrapExports(ablyCommonjs_noencryption);

const ably = new Ably.Realtime('FPRzWg.K37Q-g:DIzMBDeHognMNLuU');

const roomChannel = ably.channels.get(roomId);

const ownChannel = ably.channels.get(ownId);

const getChannel = (channelId) => ably.channels.get(channelId);

// List of external subscriptions to be called on data received by peers
// `method` key is used to filter received data
// [{ method: string, callback: (payload) => void }]
const subscriptions = [];

const linkSubscriptions = ({ data: { payload, method } }) => {
  subscriptions.forEach(({ method: subscriptionMethod, callback }) => {
    if (method === subscriptionMethod) {
      callback(payload);
    }
  });
};

roomChannel.subscribe('data', linkSubscriptions);
ownChannel.subscribe('data', linkSubscriptions);

const subscribeToMethod = (method, callback) => {
  subscriptions.push({ method, callback });
};

const sendToAllPeers = (method, payload) => {
  roomChannel.publish('data', { method, payload });
};

const sendToPeer = (method, payload, peerId) => {
  getChannel(peerId).publish('data', { method, payload });
};

// List of all the connected peers
// [{ id: string, connection: {new Peer()} }]
const peers = [];

window.peers = peers;

// List of external subscriptions to be called on data received by peers
// `method` key is used to filter received data
// [{ method: string, callback: (data) => void }]
const subscriptions$1 = [];

const subscribeToMethod$1 = (method, callback) => {
  subscriptions$1.push({ method, callback });
};

const getPeerIds = () => peers.map(({ id }) => id);

const sendToAllPeers$1 = (method, data, persist) => {
  peers.forEach((peer) => {
    if (
      !peer.connection ||
      !peer.connection.writable ||
      !peer.connection.connected
    ) {
      // removePeer(peer.id);
      console.log('Peer connection unreachable', peer.id, peer.connection);
      return;
    }
    peer.connection.send(
      JSON.stringify({
        method,
        data,
      }),
    );
  });

  if (persist) {
    persistedMessages.push({
      method,
      data,
    });
  }
};

const sendToPeer$1 = (method, data, peerId) => {
  const peer = peers.find((p) => p.id === peerId);

  if (!peer) {
    // eslint-disable-next-line no-console
    console.error('could not found peer', peerId);
    return;
  }

  if (
    !peer.connection ||
    !peer.connection.writable ||
    !peer.connection.connected
  ) {
    // removePeer(peer.id);
    console.log('Peer connection unreachable', peer.id, peer.connection);
    return;
  }

  peer.connection.send(
    JSON.stringify({
      method,
      data,
    }),
  );
};

const removePeer = (peerId) => {
  const index = peers.findIndex((p) => p.id === peerId);
  if (index >= 0) {
    peers[index].connection.destroy();
    peers.splice(index, 1);
  }
};

const setupSubscriptionCallbacks = (peer) => {
  peer.connection.on('data', (stringData) => {
    const { method, data } = JSON.parse(stringData);
    console.log('data', { method, data });
    subscriptions$1
      .filter((subscription) => subscription.method === method)
      .forEach((subscription) => {
        subscription.callback(data);
      });
  });

  peer.connection.on('connect', () => {
    console.log('connect', peer);
    persistedMessages.forEach(({ method, data }) => {
      sendToPeer$1(method, data, peer.id);
    });
  });

  peer.connection.on('close', () => {
    console.log('close', peer);
    removePeer(peer.id);
  });

  peer.connection.on('error', (error) => {
    console.log('error', error, peer);
    removePeer(peer.id);
  });
};

// Hackish or what?
setTimeout(() => {
  // Let everyone know I want to join the channel
  sendToAllPeers('peer-joined', { id: ownId, roomId });
}, 5000);

// When someone wants to join the channel
// we create a peer connection and send him the signalling data back
subscribeToMethod('peer-joined', ({ id }) => {
  console.log('peer-joined', id);
  if (id === ownId) {
    return;
  }

  // TODO: make peer connection UDP
  // Create the peer connection instance
  const connection = new simplePeer({
    initiator: true,
    trickle: false,
  });

  const peer = {
    id,
    connection,
  };

  // Save the peer connection for later use
  peers.push(peer);

  setupSubscriptionCallbacks(peer);

  // Create signaling data from the webrtc library
  connection.on('signal', (data) => {
    console.log('initiator signal', data);
    // Send the webrtc signalling data through websockets to try to establish connection
    sendToPeer(
      'signal',
      {
        id: ownId,
        signalData: data,
      },
      id,
    );
  });
});

// When receiving a signal, we create the other instance of the peer connection
// And send back an answer signal to finish establishing webrtc connection
subscribeToMethod('signal', ({ id, signalData }) => {
  console.log('receiving signal', { id, signalData });
  let peer = peers.find((p) => p.id === id);

  if (!peer) {
    const connection = new simplePeer({
      initiator: false,
      trickle: false,
    });

    peer = {
      id,
      connection,
    };
    peers.push(peer);
    setupSubscriptionCallbacks(peer);

    // Create the answering signal data from the webrtc library
    connection.on('signal', (data) => {
      console.log('receiver signal', data);
      sendToPeer(
        'signal',
        {
          id: ownId,
          signalData: data,
        },
        id,
      );
    });
  }

  peer.connection.signal(signalData);
});

setTimeout(() => console.log('getPeerIds', getPeerIds()), 10000);

window.sendToAllPeers = sendToAllPeers$1;
window.subscribeToMethod = subscribeToMethod$1;
