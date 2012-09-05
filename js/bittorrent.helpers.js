window.config = {
    //debug_torrent_client: {ip:'127.0.0.1', port:8030}
    tracker_proxy: 'http://192.168.56.1:6969/proxy'
}

window.base64 = {
    _chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",

    // 6 bits per character

    // -----|-----|-----|-----|
    // -------|-------|-------|

    toBits: function(str) {
        //str = str.replace(/\s|=/g,''); // remove whitespace?

        }
};

window.assert = function(v) {
    if (!v) { 
        var l = [];
        for (var i=0; i<arguments.length; i++) {
            l.push(arguments[i]);
        }
        console.error.apply(console, l.slice(1, l.length));
        debugger; 
    }
}

var loglevel = 1;

window.LOGMASK = {'general':1, 
                  'network': 2, 
                  'disk':Math.pow(2,3),
                  'hash':Math.pow(2,4),
                 };

var b = 0;
for (var key in LOGMASK) {
    b = b | LOGMASK[key];
}
LOGMASK.all = b;

//var curlogmask = LOGMASK.network | LOGMASK.general
//var curlogmask = LOGMASK.general | LOGMASK.hash;
var curlogmask = LOGMASK.all;
//var curlogmask = LOGMASK.general;

window.mylog = function(level) {
    var l = [];
    for (var i=0; i<arguments.length; i++) {
        l.push(arguments[i]);
    }

    if (level & curlogmask) {
        console.log.apply(console, l.slice(1, l.length));
    }

/*
    if (level <= loglevel) {
        console.log.apply(console, l.slice(1, l.length));
    }
*/
}


/*!
 *  Copyright © 2008 Fair Oaks Labs, Inc.
 *  All rights reserved.
 */

// Utility object:  Encode/Decode C-style binary primitives to/from octet arrays



function JSPack()
{
	// Module-level (private) variables
	var el,  bBE = false, m = this;


	// Raw byte arrays
	m._DeArray = function (a, p, l)
	{
		return [a.slice(p,p+l)];
	};
	m._EnArray = function (a, p, l, v)
	{
		for (var i = 0; i < l; a[p+i] = v[i]?v[i]:0, i++);
	};

	// ASCII characters
	m._DeChar = function (a, p)
	{
		return String.fromCharCode(a[p]);
	};
	m._EnChar = function (a, p, v)
	{
		a[p] = v.charCodeAt(0);
	};

	// Little-endian (un)signed N-byte integers
	m._DeInt = function (a, p)
	{
		var lsb = bBE?(el.len-1):0, nsb = bBE?-1:1, stop = lsb+nsb*el.len, rv, i, f;
		for (rv = 0, i = lsb, f = 1; i != stop; rv+=(a[p+i]*f), i+=nsb, f*=256);
		if (el.bSigned && (rv & Math.pow(2, el.len*8-1))) { rv -= Math.pow(2, el.len*8); }
		return rv;
	};
	m._EnInt = function (a, p, v)
	{
		var lsb = bBE?(el.len-1):0, nsb = bBE?-1:1, stop = lsb+nsb*el.len, i;
		v = (v<el.min)?el.min:(v>el.max)?el.max:v;
		for (i = lsb; i != stop; a[p+i]=v&0xff, i+=nsb, v>>=8);
	};

	// ASCII character strings
	m._DeString = function (a, p, l)
	{
		for (var rv = new Array(l), i = 0; i < l; rv[i] = String.fromCharCode(a[p+i]), i++);
		return rv.join('');
	};
	m._EnString = function (a, p, l, v)
	{
		for (var t, i = 0; i < l; a[p+i] = (t=v.charCodeAt(i))?t:0, i++);
	};

	// Little-endian N-bit IEEE 754 floating point
	m._De754 = function (a, p)
	{
		var s, e, m, i, d, nBits, mLen, eLen, eBias, eMax;
		mLen = el.mLen, eLen = el.len*8-el.mLen-1, eMax = (1<<eLen)-1, eBias = eMax>>1;

		i = bBE?0:(el.len-1); d = bBE?1:-1; s = a[p+i]; i+=d; nBits = -7;
		for (e = s&((1<<(-nBits))-1), s>>=(-nBits), nBits += eLen; nBits > 0; e=e*256+a[p+i], i+=d, nBits-=8);
		for (m = e&((1<<(-nBits))-1), e>>=(-nBits), nBits += mLen; nBits > 0; m=m*256+a[p+i], i+=d, nBits-=8);

		switch (e)
		{
			case 0:
				// Zero, or denormalized number
				e = 1-eBias;
				break;
			case eMax:
				// NaN, or +/-Infinity
				return m?NaN:((s?-1:1)*Infinity);
			default:
				// Normalized number
				m = m + Math.pow(2, mLen);
				e = e - eBias;
				break;
		}
		return (s?-1:1) * m * Math.pow(2, e-mLen);
	};
	m._En754 = function (a, p, v)
	{
		var s, e, m, i, d, c, mLen, eLen, eBias, eMax;
		mLen = el.mLen, eLen = el.len*8-el.mLen-1, eMax = (1<<eLen)-1, eBias = eMax>>1;

		s = v<0?1:0;
		v = Math.abs(v);
		if (isNaN(v) || (v == Infinity))
		{
			m = isNaN(v)?1:0;
			e = eMax;
		}
		else
		{
			e = Math.floor(Math.log(v)/Math.LN2);			// Calculate log2 of the value
			if (v*(c = Math.pow(2, -e)) < 1) { e--; c*=2; }		// Math.log() isn't 100% reliable

			// Round by adding 1/2 the significand's LSD
			if (e+eBias >= 1) { v += el.rt/c; }			// Normalized:  mLen significand digits
			else { v += el.rt*Math.pow(2, 1-eBias); } 		// Denormalized:  <= mLen significand digits
			if (v*c >= 2) { e++; c/=2; }				// Rounding can increment the exponent

			if (e+eBias >= eMax)
			{
				// Overflow
				m = 0;
				e = eMax;
			}
			else if (e+eBias >= 1)
			{
				// Normalized - term order matters, as Math.pow(2, 52-e) and v*Math.pow(2, 52) can overflow
				m = (v*c-1)*Math.pow(2, mLen);
				e = e + eBias;
			}
			else
			{
				// Denormalized - also catches the '0' case, somewhat by chance
				m = v*Math.pow(2, eBias-1)*Math.pow(2, mLen);
				e = 0;
			}
		}

		for (i = bBE?(el.len-1):0, d=bBE?-1:1; mLen >= 8; a[p+i]=m&0xff, i+=d, m/=256, mLen-=8);
		for (e=(e<<mLen)|m, eLen+=mLen; eLen > 0; a[p+i]=e&0xff, i+=d, e/=256, eLen-=8);
		a[p+i-d] |= s*128;
	};


	// Class data
	m._sPattern	= '(\\d+)?([AxcbBhHsfdiIlL])';
	m._lenLut	= {'A':1, 'x':1, 'c':1, 'b':1, 'B':1, 'h':2, 'H':2, 's':1, 'f':4, 'd':8, 'i':4, 'I':4, 'l':4, 'L':4};
	m._elLut	= {	'A': {en:m._EnArray, de:m._DeArray},
				's': {en:m._EnString, de:m._DeString},
				'c': {en:m._EnChar, de:m._DeChar},
				'b': {en:m._EnInt, de:m._DeInt, len:1, bSigned:true, min:-Math.pow(2, 7), max:Math.pow(2, 7)-1},
				'B': {en:m._EnInt, de:m._DeInt, len:1, bSigned:false, min:0, max:Math.pow(2, 8)-1},
				'h': {en:m._EnInt, de:m._DeInt, len:2, bSigned:true, min:-Math.pow(2, 15), max:Math.pow(2, 15)-1},
				'H': {en:m._EnInt, de:m._DeInt, len:2, bSigned:false, min:0, max:Math.pow(2, 16)-1},
				'i': {en:m._EnInt, de:m._DeInt, len:4, bSigned:true, min:-Math.pow(2, 31), max:Math.pow(2, 31)-1},
				'I': {en:m._EnInt, de:m._DeInt, len:4, bSigned:false, min:0, max:Math.pow(2, 32)-1},
				'l': {en:m._EnInt, de:m._DeInt, len:4, bSigned:true, min:-Math.pow(2, 31), max:Math.pow(2, 31)-1},
				'L': {en:m._EnInt, de:m._DeInt, len:4, bSigned:false, min:0, max:Math.pow(2, 32)-1},
				'f': {en:m._En754, de:m._De754, len:4, mLen:23, rt:Math.pow(2, -24)-Math.pow(2, -77)},
				'd': {en:m._En754, de:m._De754, len:8, mLen:52, rt:0}};

	// Unpack a series of n elements of size s from array a at offset p with fxn
	m._UnpackSeries = function (n, s, a, p)
	{
		for (var fxn = el.de, rv = [], i = 0; i < n; rv.push(fxn(a, p+i*s)), i++);
		return rv;
	};

	// Pack a series of n elements of size s from array v at offset i to array a at offset p with fxn
	m._PackSeries = function (n, s, a, p, v, i)
	{
		for (var fxn = el.en, o = 0; o < n; fxn(a, p+o*s, v[i+o]), o++);
	};

	// Unpack the octet array a, beginning at offset p, according to the fmt string
	m.Unpack = function (fmt, a, p)
	{
		// Set the private bBE flag based on the format string - assume big-endianness
		bBE = (fmt.charAt(0) != '<');

		p = p?p:0;
		var re = new RegExp(this._sPattern, 'g'), m, n, s, rv = [];
		while (m = re.exec(fmt))
		{
			n = ((m[1]==undefined)||(m[1]==''))?1:parseInt(m[1]);
			s = this._lenLut[m[2]];
			if ((p + n*s) > a.length)
			{
				return undefined;
			}
			switch (m[2])
			{
				case 'A': case 's':
					rv.push(this._elLut[m[2]].de(a, p, n));
					break;
				case 'c': case 'b': case 'B': case 'h': case 'H':
				case 'i': case 'I': case 'l': case 'L': case 'f': case 'd':
					el = this._elLut[m[2]];
					rv.push(this._UnpackSeries(n, s, a, p));
					break;
			}
			p += n*s;
		}
		return Array.prototype.concat.apply([], rv);
	};

	// Pack the supplied values into the octet array a, beginning at offset p, according to the fmt string
	m.PackTo = function (fmt, a, p, values)
	{
		// Set the private bBE flag based on the format string - assume big-endianness
		bBE = (fmt.charAt(0) != '<');

		var re = new RegExp(this._sPattern, 'g'), m, n, s, i = 0, j;
		while (m = re.exec(fmt))
		{
			n = ((m[1]==undefined)||(m[1]==''))?1:parseInt(m[1]);
			s = this._lenLut[m[2]];
			if ((p + n*s) > a.length)
			{
				return false;
			}
			switch (m[2])
			{
				case 'A': case 's':
					if ((i + 1) > values.length) { return false; }
					this._elLut[m[2]].en(a, p, n, values[i]);
					i += 1;
					break;
				case 'c': case 'b': case 'B': case 'h': case 'H':
				case 'i': case 'I': case 'l': case 'L': case 'f': case 'd':
					el = this._elLut[m[2]];
					if ((i + n) > values.length) { return false; }
					this._PackSeries(n, s, a, p, values, i);
					i += n;
					break;
				case 'x':
					for (j = 0; j < n; j++) { a[p+j] = 0; }
					break;
			}
			p += n*s;
		}
		return a;
	};

	// Pack the supplied values into a new octet array, according to the fmt string
	m.Pack = function (fmt, values)
	{
		return this.PackTo(fmt, new Array(this.CalcLength(fmt)), 0, values);
	};

	// Determine the number of bytes represented by the format string
	m.CalcLength = function (fmt)
	{
		var re = new RegExp(this._sPattern, 'g'), m, sum = 0;
		while (m = re.exec(fmt))
		{
			sum += (((m[1]==undefined)||(m[1]==''))?1:parseInt(m[1])) * this._lenLut[m[2]];
		}
		return sum;
	};
};







/*
 * A JavaScript implementation of the Secure Hash Algorithm, SHA-1, as defined
 * in FIPS PUB 180-1
 * Version 2.1a Copyright Paul Johnston 2000 - 2002.
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 * Distributed under the BSD License
 * See http://pajhome.org.uk/crypt/md5 for details.
 */

/*
 * Configurable variables. You may need to tweak these to be compatible with
 * the server-side, but the defaults work in most cases.
 */
var hexcase = 0;  /* hex output format. 0 - lowercase; 1 - uppercase        */
var b64pad  = ""; /* base-64 pad character. "=" for strict RFC compliance   */
var chrsz   = 8;  /* bits per input character. 8 - ASCII; 16 - Unicode      */

/*
 * These are the functions you'll usually want to call
 * They take string arguments and return either hex or base-64 encoded strings
 */
function hex_sha1(s){return binb2hex(core_sha1(str2binb(s),s.length * chrsz));}
function b64_sha1(s){return binb2b64(core_sha1(str2binb(s),s.length * chrsz));}
function str_sha1(s){return binb2str(core_sha1(str2binb(s),s.length * chrsz));}
function hex_hmac_sha1(key, data){ return binb2hex(core_hmac_sha1(key, data));}
function b64_hmac_sha1(key, data){ return binb2b64(core_hmac_sha1(key, data));}
function str_hmac_sha1(key, data){ return binb2str(core_hmac_sha1(key, data));}

/*
 * Perform a simple self-test to see if the VM is working
 */
function sha1_vm_test()
{
  return hex_sha1("abc") == "a9993e364706816aba3e25717850c26c9cd0d89d";
}

/*
 * Calculate the SHA-1 of an array of big-endian words, and a bit length
 */
function core_sha1(x, len)
{
  /* append padding */
  x[len >> 5] |= 0x80 << (24 - len % 32);
  x[((len + 64 >> 9) << 4) + 15] = len;

  var w = Array(80);
  var a =  1732584193;
  var b = -271733879;
  var c = -1732584194;
  var d =  271733878;
  var e = -1009589776;

  for(var i = 0; i < x.length; i += 16)
  {
    var olda = a;
    var oldb = b;
    var oldc = c;
    var oldd = d;
    var olde = e;

    for(var j = 0; j < 80; j++)
    {
      if(j < 16) w[j] = x[i + j];
      else w[j] = rol(w[j-3] ^ w[j-8] ^ w[j-14] ^ w[j-16], 1);
      var t = safe_add(safe_add(rol(a, 5), sha1_ft(j, b, c, d)),
                       safe_add(safe_add(e, w[j]), sha1_kt(j)));
      e = d;
      d = c;
      c = rol(b, 30);
      b = a;
      a = t;
    }

    a = safe_add(a, olda);
    b = safe_add(b, oldb);
    c = safe_add(c, oldc);
    d = safe_add(d, oldd);
    e = safe_add(e, olde);
  }
  return Array(a, b, c, d, e);

}

/*
 * Perform the appropriate triplet combination function for the current
 * iteration
 */
function sha1_ft(t, b, c, d)
{
  if(t < 20) return (b & c) | ((~b) & d);
  if(t < 40) return b ^ c ^ d;
  if(t < 60) return (b & c) | (b & d) | (c & d);
  return b ^ c ^ d;
}

/*
 * Determine the appropriate additive constant for the current iteration
 */
function sha1_kt(t)
{
  return (t < 20) ?  1518500249 : (t < 40) ?  1859775393 :
         (t < 60) ? -1894007588 : -899497514;
}

/*
 * Calculate the HMAC-SHA1 of a key and some data
 */
function core_hmac_sha1(key, data)
{
  var bkey = str2binb(key);
  if(bkey.length > 16) bkey = core_sha1(bkey, key.length * chrsz);

  var ipad = Array(16), opad = Array(16);
  for(var i = 0; i < 16; i++)
  {
    ipad[i] = bkey[i] ^ 0x36363636;
    opad[i] = bkey[i] ^ 0x5C5C5C5C;
  }

  var hash = core_sha1(ipad.concat(str2binb(data)), 512 + data.length * chrsz);
  return core_sha1(opad.concat(hash), 512 + 160);
}

/*
 * Add integers, wrapping at 2^32. This uses 16-bit operations internally
 * to work around bugs in some JS interpreters.
 */
function safe_add(x, y)
{
  var lsw = (x & 0xFFFF) + (y & 0xFFFF);
  var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return (msw << 16) | (lsw & 0xFFFF);
}

/*
 * Bitwise rotate a 32-bit number to the left.
 */
function rol(num, cnt)
{
  return (num << cnt) | (num >>> (32 - cnt));
}

/*
 * Convert an 8-bit or 16-bit string to an array of big-endian words
 * In 8-bit function, characters >255 have their hi-byte silently ignored.
 */
function str2binb(str)
{
  var bin = Array();
  var mask = (1 << chrsz) - 1;
  for(var i = 0; i < str.length * chrsz; i += chrsz)
    bin[i>>5] |= (str.charCodeAt(i / chrsz) & mask) << (32 - chrsz - i%32);
  return bin;
}

/*
 * Convert an array of big-endian words to a string
 */
function binb2str(bin)
{
  var str = "";
  var mask = (1 << chrsz) - 1;
  for(var i = 0; i < bin.length * 32; i += chrsz)
    str += String.fromCharCode((bin[i>>5] >>> (32 - chrsz - i%32)) & mask);
  return str;
}

/*
 * Convert an array of big-endian words to a hex string.
 */
function binb2hex(binarray)
{
  var hex_tab = hexcase ? "0123456789ABCDEF" : "0123456789abcdef";
  var str = "";
  for(var i = 0; i < binarray.length * 4; i++)
  {
    str += hex_tab.charAt((binarray[i>>2] >> ((3 - i%4)*8+4)) & 0xF) +
           hex_tab.charAt((binarray[i>>2] >> ((3 - i%4)*8  )) & 0xF);
  }
  return str;
}

/*
 * Convert an array of big-endian words to a base-64 string
 */
function binb2b64(binarray)
{
  var tab = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var str = "";
  for(var i = 0; i < binarray.length * 4; i += 3)
  {
    var triplet = (((binarray[i   >> 2] >> 8 * (3 -  i   %4)) & 0xFF) << 16)
                | (((binarray[i+1 >> 2] >> 8 * (3 - (i+1)%4)) & 0xFF) << 8 )
                |  ((binarray[i+2 >> 2] >> 8 * (3 - (i+2)%4)) & 0xFF);
    for(var j = 0; j < 4; j++)
    {
      if(i * 8 + j * 6 > binarray.length * 32) str += b64pad;
      else str += tab.charAt((triplet >> 6*(3-j)) & 0x3F);
    }
  }
  return str;
}


/**
 * Support for generating SHA-1 of a stream.
 *
 * Based on http://pajhome.org.uk/crypt/md5/sha1.js.
 */

function naked_sha1_head() {
  var w = Array(80);
  var a =  1732584193;
  var b = -271733879;
  var c = -1732584194;
  var d =  271733878;
  var e = -1009589776;
  return [w, a, b, c, d, e, [], 0, 0];
}

function naked_sha1(x, len, h) {
  var w = h[0], a = h[1], b = h[2], c = h[3], d = h[4], e = h[5];
  /* prepend data from last time */
  var old_len = h[8];
  var blen = x.length;
  if (x.length > 0) {
    var shift = old_len % 32;
    if (shift > 0) {
      h[6][old_len >> 5] |= x[0] >> shift;
      for (var i=0; i<x.length-1; i++) {
        x[i] = x[i] << (32 - shift) | x[i+1] >> shift;
      }
      x[x.length-1] <<= 32 - shift;
    }
  }
  x = h[6].concat(x)
  var max = (old_len + len) >> 5;
  max -= max % 16;
  for(var i = 0; i < max; i += 16)
  {
    var olda = a;
    var oldb = b;
    var oldc = c;
    var oldd = d;
    var olde = e;

    for(var j = 0; j < 80; j++)
    {
      if(j < 16) w[j] = x[i + j];
      else w[j] = rol(w[j-3] ^ w[j-8] ^ w[j-14] ^ w[j-16], 1);
      var t = safe_add(safe_add(rol(a, 5), sha1_ft(j, b, c, d)),
                       safe_add(safe_add(e, w[j]), sha1_kt(j)));
      e = d;
      d = c;
      c = rol(b, 30);
      b = a;
      a = t;
    }

    a = safe_add(a, olda);
    b = safe_add(b, oldb);
    c = safe_add(c, oldc);
    d = safe_add(d, oldd);
    e = safe_add(e, olde);
  }
  h[0] = w;
  h[1] = a;
  h[2] = b;
  h[3] = c;
  h[4] = d;
  h[5] = e;
  /* store extra for next time */
  h[6] = x.slice(max, (old_len + len + 24) >> 5);
  h[7] += len;
  h[8] += len - 32 * max;
}

function naked_sha1_tail(h) {
  /* append padding */
  var x = h[6];
  var total_len = h[7];
  var len = h[8];
  x[len >> 5] |= 0x80 << (24 - len % 32);
  x[((len + 64 >> 9) << 4) + 15] = total_len;
  h[8] += 512 - len % 512;
  naked_sha1([], 0, h);
  return h.slice(1, 6);
}

function hmac_sha1_stream_head(key, data) {
  var bkey = str2binb(key);
  if(bkey.length > 16) bkey = core_sha1(bkey, key.length * chrsz);

  var ipad = Array(16), opad = Array(16);
  for(var i = 0; i < 16; i++)
  {
    ipad[i] = bkey[i] ^ 0x36363636;
    opad[i] = bkey[i] ^ 0x5C5C5C5C;
  }

  var naked_hash = naked_sha1_head();
  naked_sha1(ipad.concat(str2binb(data)), 512 + data.length * chrsz, naked_hash);

  return {
    opad: opad,
    naked_hash: naked_hash
  };
}

function hmac_sha1_stream(data, naked_hash) {
  naked_sha1(str2binb(data), data.length * chrsz, naked_hash);
}

function hmac_sha1_stream_tail(opad, naked_hash) {
  var hash = naked_sha1_tail(naked_hash);
  return binb2b64(core_sha1(opad.concat(hash), 512 + 160));
}


(function() {
    window.utf8 = {}
    // simpler version
    utf8.toByteArray = function(str) {
        var byteArray = [];
        for (var i = 0; i < str.length; i++)
            if (str.charCodeAt(i) <= 0x7F)
                byteArray.push(str.charCodeAt(i));
        else {
            var h = encodeURIComponent(str.charAt(i)).substr(1).split('%');
            for (var j = 0; j < h.length; j++)
                byteArray.push(parseInt(h[j], 16));
        }
        return byteArray;
    };

    utf8.parse = function(byteArray) {
        var str = '';
        for (var i = 0; i < byteArray.length; i++)
            str +=  byteArray[i] <= 0x7F?
            byteArray[i] === 0x25 ? "%25" : // %
            String.fromCharCode(byteArray[i]) :
        "%" + byteArray[i].toString(16).toUpperCase();
        return decodeURIComponent(str);
    };

    window.reversedict = function(d) {
        var rd = {}
        for (var key in d) {
            rd[d[key]] = key;
        }
        return rd;
    }

    //http://www.webtoolkit.info/javascript-utf8.html
    var Utf8 = {
 	// public method for url encoding
	encode : function (string) {
	    string = string.replace(/\r\n/g,"\n");
	    var utftext = "";
	    for (var n = 0; n < string.length; n++) {
		var c = string.charCodeAt(n);
		if (c < 128) {
		    utftext += String.fromCharCode(c);
		}
		else if((c > 127) && (c < 2048)) {
		    utftext += String.fromCharCode((c >> 6) | 192);
		    utftext += String.fromCharCode((c & 63) | 128);
		}
		else {
		    utftext += String.fromCharCode((c >> 12) | 224);
		    utftext += String.fromCharCode(((c >> 6) & 63) | 128);
		    utftext += String.fromCharCode((c & 63) | 128);
		}
	    }
	    return utftext;
	},
        
	// public method for url decoding
	decode : function (utftext) {
	    var string = "";
	    var i = 0;
	    var c = c1 = c2 = 0;
	    while ( i < utftext.length ) {
		c = utftext.charCodeAt(i);
		if (c < 128) {
		    string += String.fromCharCode(c);
		    i++;
		}
		else if((c > 191) && (c < 224)) {
		    c2 = utftext.charCodeAt(i+1);
		    string += String.fromCharCode(((c & 31) << 6) | (c2 & 63));
		    i += 2;
		}
		else {
		    c2 = utftext.charCodeAt(i+1);
		    c3 = utftext.charCodeAt(i+2);
		    string += String.fromCharCode(((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
		    i += 3;
		}
	    }
	    return string;
	}
    };

    function python_int(s) {
        var n = parseInt(s,10);
        if (n === NaN) { throw Error('ValueError'); }
        return n;
    }

    function decode_int(x,f) {
        f++;
        
        var newf = x.indexOf('e',f);;
        var n = python_int(x.slice(f,newf));

        if (x[f] == '-') {
            if (x[f+1] == '0') {
                throw Error('ValueError');
            }
        } else if (x[f] == '0' && newf != f+1) {
            throw Error('ValueError');
        }

        return [n, newf+1];
    }

    function decode_string(x,f, opts) {
        var colon = x.indexOf(':',f);
        var n = python_int(x.slice(f,colon));
        if (x[f] == '0' && colon != f+1) {
            throw Error('ValueError');
        }
        colon++;
        var raw = x.slice(colon,colon+n);
        if (opts && opts.utf8) {
            var decoded = Utf8.decode(raw);
        } else {
            var decoded = raw;
        }
        toret = [decoded, colon+n];
        return toret;
    }

    function decode_list(x,f, opts) {
        var data;
        var v;

        var r = [];
        f++;
        while (x[f] != 'e') {
            data = decode_func[x[f]](x,f, opts);
            v = data[0];
            f = data[1];
            r.push(v);
        }
        return [r, f+1];
    }

    function decode_dict(x, f, opts) {
        var data;
        var data2;
        var k;

        var r = {};
        f++;
        while (x[f] != 'e') {
            data = decode_string(x, f, opts);
            k = data[0];
            f = data[1];

            data2 = decode_func[ x[f] ](x,f, opts)
            r[k] = data2[0];
            f = data2[1];
        }
        return [r, f+1];
    }

    var decode_func = {};
    decode_func['l'] = decode_list;
    decode_func['d'] = decode_dict;
    decode_func['i'] = decode_int;
    for (var i=0; i<10; i++) {
        decode_func[i.toString()] = decode_string;
    }

    window.bdecode = function(x, opts) {
        var data = decode_func[x[0]](x, 0, opts);
        var r = data[0];
        var l = data[1];
        return r;
    }

    function isArray(obj) {
        return Object.prototype.toString.call(obj) === '[object Array]';
    }

    function gettype(val) {
        if (typeof val == 'number' && val.toString() == parseInt(val.toString(),10)) {
            return 'integer';
        } else if (isArray(val)) {
            return 'array';
        } else {
            return typeof val;
        }
    }

    function encode_int(x, r) {
        r.push('i'.charCodeAt(0));
        var s = x.toString();
        for (var i=0; i<s.length; i++) {
            r.push( s[i].charCodeAt(0) ); 
        }
        r.push('e'.charCodeAt(0));
    }
    function encode_string(x, r, stack, cb, opts) {
        if (opts && opts.utf8) {
            var bytes = utf8.toByteArray(x);
        } else {
            var bytes = [];
            for (var i=0; i<x.length; i++) {
                bytes.push(x.charCodeAt(i));
            }
        }
        var s = bytes.length.toString();
        for (var i=0; i<s.length; i++) {
            r.push( s[i].charCodeAt(0) );
        }
        r.push(':'.charCodeAt(0))
        for (var i=0; i<bytes.length; i++) {
            r.push(bytes[i]);
        }
    }
    function encode_array(x, r, stack, cb, opts) {
        r.push( 'l'.charCodeAt(0) );
        for (var i=0; i<x.length; i++) {
            encode_func[gettype(x[i])](x[i], r, stack, cb, opts);
        }
        r.push('e'.charCodeAt(0));
    }
    function encode_object(x ,r, stack, stack_callback, opts) {
        r.push('d'.charCodeAt(0));
        var keys = [];
        for (var key in x) {
            keys.push(key);
        }
        keys.sort()
        for (var j=0; j<keys.length; j++) {
            var key = keys[j];

            var bytes = utf8.toByteArray(key);

            var s = bytes.length.toString();

            for (var i=0; i<s.length; i++) {
                r.push( s[i].charCodeAt(0) );
            }
            r.push(':'.charCodeAt(0));
            for (var i=0; i<bytes.length; i++) {
                r.push( bytes[i] );
            }
            stack.push(key);
            if (stack_callback) { stack_callback(stack, r); }
            encode_func[gettype(x[key])]( x[key], r, stack, stack_callback, opts );
            stack.pop();
        }
        r.push('e'.charCodeAt(0));
    }

    var encode_func = {};
    encode_func['integer'] = encode_int;
    encode_func['string'] = encode_string;
    encode_func['array'] = encode_array;
    encode_func['object'] = encode_object;

    window.bencode = function(x, stack_callback, opts) {
        var r = [];
        var stack = [];
        encode_func[gettype(x)](x ,r, stack, stack_callback, opts);
        return r;
    }
    var r = bdecode( utf8.parse(bencode( { 'hello':23} )) );
    assert( r['hello'] = 23 );

    window.ab2str = function(buf) {
        return String.fromCharCode.apply(null, new Uint16Array(buf));
    }

    window.arr2str = function(buf) {
        //return String.fromCharCode.apply(null, buf); // returns maximum stack exceeded
        var s = ""
        var l = buf.length;
        for (var i=0; i<l; i++) {
            s += String.fromCharCode(buf[i]);
        }
        return s;
        // build array and use join any faster?
    }

    function str2ab(str) {
        assert(false,'this function suck');
        var buf = new ArrayBuffer(str.length*2); // 2 bytes for each char
        var bufView = new Uint16Array(buf);
        for (var i=0, strLen=str.length; i<strLen; i++) {
            bufView[i] = str.charCodeAt(i);
        }
        return buf;
    }

    function hexpad(s) {
        if (s.length == 1) {
            return '0' + s;
        } else {
            return s;
        }
    }

    window.ab2hex = function(ab) {
        var accum = [];
        var len = ab.byteLength | ab.length;
        for (var i=0; i<len; i++) {
            
            accum.push(hexpad(ab[i].toString(16)));
        }
        return accum.join('');
    }

    window.str2arr = function(str) {
        var arr = [];
        for (var i=0; i<str.length; i++) {
            arr.push(str.charCodeAt(i));
        }
        return arr;
    }

    window.intersect = function(i1, i2) {
        if (i1[1] < i2[0] || i2[1] < i1[0]) {
            return null;
        } else {
            return [Math.max(i1[0],i2[0]), Math.min(i1[1],i2[1])];
        }
    }


})();
