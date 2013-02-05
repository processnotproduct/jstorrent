
window.base64 = {
    _chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",

    // 6 bits per character

    // -----|-----|-----|-----|
    // -------|-------|-------|

    toBits: function(str) {
        //str = str.replace(/\s|=/g,''); // remove whitespace?

        }
};



function analyze_xhr_event(evt) {
    var xhr = evt.target;
    console.log('xhr event',evt,'of type',evt.type, 'for xhr',xhr, xhr.status, xhr.statusText);
}

try {
    if (new Blob( [new Uint8Array([1,1,1])], {type: "application/octet-binary"} ).size == 3) {
        window.FixSafariBuggyBlob = function(arr, opt) {
            if (opt) {
                return new Blob(arr, opt);
            } else {
                return new Blob(arr);
            }
        }
    } else {
        window.FixSafariBuggyBlob = function(arr, opt) {
            //assert(arr.length == 1);
            var totallength = 0;
            for (var i=0; i<arr.length; i++) {
                totallength += arr[i].length;
            }

            var view;

            var ab = new ArrayBuffer(totallength);
            var ia = new Uint8Array(ab);

            var absoffset = 0;
            for (var j=0; j<arr.length; j++) {
                view = arr[j];
                for (var i = 0; i < view.length; i++) {
                    ia[absoffset] = view[i];
                    absoffset++;
                }
            }

            return new Blob([ab], {type: 'mimeString'});
        }
    }
} catch(e) {
    window.FixSafariBuggyBlob = null;
}

(function() {
    assert( window.mime_data );
    window.mime_map = function(s) {
        var ext, parts;
        if (s.indexOf('.') != -1) {
            parts = s.split('.')
            ext = parts[parts.length - 1].toLowerCase();
        }

        if (ext) {
            if (mime_data[ext]) {
                return mime_data[ext];
            } else {
                return 'text/plain';
            }
        } else {
            return 'text/plain';
        }
    }

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
/*
    var r = bdecode( utf8.parse(bencode( { 'hello':23} )) );
    assert( r['hello'] = 23 );
*/

    window.ab2str = function(buf) {
        assert(false) // this function sucks (chromium os dont work)
        return String.fromCharCode.apply(null, new Uint16Array(buf));
    }

    window.ab2arr = function(buf) {
        var arr = [];
        for (var i=0; i<buf.length; i++) {
            arr.push(buf[i]);
        }
        return arr;
    }

    window.arr2str = function(buf, startindex) {
        //return String.fromCharCode.apply(null, buf); // returns maximum stack exceeded
        startindex = (startindex === undefined)?0:startindex;
        var s = ""
        var l = buf.length;
        for (var i=startindex; i<l; i++) {
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




function hex2str(hex) {
    assert(hex.length%2 == 0);
    var s = '';
    for (var i=0; i<hex.length/2; i++) {
        var val = parseInt(hex.slice(2*i, 2*i+2), 16)
        s += String.fromCharCode(val);
    }
    return s
}

function hex2arr(hex) {
    assert(hex.length%2 == 0);
    var s = [];
    for (var i=0; i<hex.length/2; i++) {
        var val = parseInt(hex.slice(2*i, 2*i+2), 16)
        s.push(val);
    }
    return s
};

function b642arr(inp) {
    debugger;
};




(function(){


    //var alphabet = '0123456789abcdefghjkmnpqrtuvwxyz'
    var alphabet = 'abcdefghijklmnopqrstuvwxyz234567';     // http://tools.ietf.org/html/rfc3548.html
    //var alias = { o:0, i:1, l:1, s:5 }
    var alias = {};

    /**
     * Build a lookup table and memoize it
     *
     * Return an object that maps a character to its
     * byte value.
     */

    var lookup = function() {
        var table = {}
        // Invert 'alphabet'
        for (var i = 0; i < alphabet.length; i++) {
            table[alphabet[i]] = i
        }
        // Splice in 'alias'
        for (var key in alias) {
            if (!alias.hasOwnProperty(key)) continue
            table[key] = table['' + alias[key]]
        }
        lookup = function() { return table }
        return table
    }
    // Functions analogously to Encoder

    function Decoder() {
        var skip = 0 // how many bits we have from the previous character
        var byte = 0 // current byte we're producing

        this.output = ''

        // Consume a character from the stream, store
        // the output in this.output. As before, better
        // to use update().
        this.readChar = function(char) {
            if (typeof char != 'string'){
                if (typeof char == 'number') {
                    char = String.fromCharCode(char)
                }
            }
            char = char.toLowerCase()
            var val = lookup()[char]
            if (typeof val == 'undefined') {
                // character does not exist in our lookup table
                return // skip silently. An alternative would be:
                // throw Error('Could not find character "' + char + '" in lookup table.')
            }
            val <<= 3 // move to the high bits
            byte |= val >>> skip
            skip += 5
            if (skip >= 8) {
                // we have enough to preduce output
                this.output += String.fromCharCode(byte)
                skip -= 8
                if (skip > 0) byte = (val << (5 - skip)) & 255
                else byte = 0
            }

        }

        this.finish = function(check) {
            var output = this.output + (skip < 0 ? alphabet[bits >> 3] : '') + (check ? '$' : '')
            this.output = ''
            return output
        }
    }

    Decoder.prototype.update = function(input, flush) {
        for (var i = 0; i < input.length; i++) {
            this.readChar(input[i])
        }
        var output = this.output
        this.output = ''
        if (flush) {
            output += this.finish()
        }
        return output
    }


    // Base32-encoded string goes in, decoded data comes out.
    window.b32decode = function(input) {
        var decoder = new Decoder()
        var output = decoder.update(input, true)
        return output
    }


    function Multi(fns) {

        /* example function we want to use:
           webkitRequestQuota( 1, 2, success_cb, error_cb )

           example use:
           m = new Multi( { fn: webkitRequestQuota, this: window, args:[1,2] }, callbacks: [3,4] } )

           m.parallel( function(results) {
             
           });

           m.sequential( function(results) {
             // returns responses for each
           });

        */
        
        //function sequential_helper( arr, callbacks
        
        this.sequential = function(user_callback) {
            if (fns.length == 0) {
                return user_callback({"called":[]});
            }
            var called = [];
            var calling = 0;

            function single_callback(n, iserr) {
                var retvals = [];
                for (var i=2; i<arguments.length; i++) {
                    retvals.push(arguments[i]);
                }
                called.push( {data:retvals, idx:n} );

                calling++;
                if (iserr) {
                    user_callback({"error":true, "called":called})
                } else if (calling == fns.length) {
                    user_callback({"called":called});
                } else {
                    call_fn(calling);
                }
            }

            function call_fn(n) {
                var fndata = _.clone(fns[n]);
                var fn = fndata.fn;
                var fthis = fndata.fnthis;
                for (i=0; i<fndata.callbacks.length; i++) {
                    var idx = fndata.callbacks[i];
                    var iserr = fndata.error && fndata.error == idx;
                    fndata.arguments[idx] = _.bind(single_callback, null, idx, iserr);
                }
                fn.apply( fthis, fndata.arguments );
            }
            call_fn(calling);
        }
    }
    window.Multi = Multi

    var FileErrors = {};
    if (window.FileError) {
        for (var key in FileError) {
            FileErrors[ FileError[key] ] = key;
        }
    }
    function log_file_error(err) {
        mylog(LOGMASK.error, err, err.code, FileErrors[err.code]);
    }
    window.log_file_error = log_file_error;

    window.decode_url_arguments = function(place) {
        place = place || 'search';
        var query = window.location[place];
        var parts = query.slice(1, query.length).split('&');
        var d = {};
        for (var i=0; i<parts.length; i++) {
            var kv = parts[i].split('=');
            if (kv[0].length > 0) {
                d[kv[0]] = decodeURIComponent(kv[1]);
            }
        }
        return d;
    }

    window.bisect_left = function(arr, v, lo, hi) {
        var mid;
        lo = lo || 0;
        hi = hi || arr.length;
        while (lo < hi) {
            mid = Math.floor((lo+hi)/2);
            if (arr[mid] < v) { lo = mid+1; }
            else { hi = mid; }
        }
        return lo
    }
    
    window.geolocate = function(ip) {
        if (!window.geoip_ip) {
            return;
        }
        var nums = ip.split('.');
        var s = 0;
        for (var i=0; i<nums.length; i++) {
            s += Math.pow(256,nums.length-1 - i) * parseInt(nums[i],10)
        }
        var idx = bisect_left(geoip_ip, s);
        assert(s > geoip_ip[idx-1] && s <= geoip_ip[idx]);
        if (s == geoip_ip[idx]) {
            // not sure about this!
            var country = geoip_country[idx];
        } else {
            var country = geoip_country[idx-1];
        }
        return country;
    }

        
    jstorrent.Collection = Backbone.Collection.extend({
        setSort: function(params) {
            mylog(LOGMASK.ui,'set sort',params);
        },
        getLength: function() { return this.models.length; },
        getItem: function(i) { return this.models[i]; }
    });


    jstorrent.RingBuffer = function(num) {
        this.num = num;
        this.buf = [];
        this.idx = 0;
        this.recorded = 0;
    }
    jstorrent.RingBuffer.prototype = {
        push: function(data) {
            this.buf[this.idx] = data;
            this.idx = (this.idx + 1)%this.num;
            this.recorded++;
        },
        show: function() {
            var toshow = [];
            for (var i=0; i<Math.min(this.num, this.recorded); i++) {
                var w = this.idx - 1 - i;
                if (w<0) {
                    w = w+this.num;
                }
                toshow.push( this.buf[w] );
            }
            return toshow;
        }
    }

    if (config.unit_tests) {
        var rb = new jstorrent.RingBuffer(3);
        rb.push(2)
        rb.push(4)
        assert( JSON.stringify(rb.buf) == '[2,4]' );
        assert( JSON.stringify(rb.show()) == '[4,2]');
        rb.push(9)
        rb.push(8)
        assert( JSON.stringify(rb.buf) == '[8,4,9]' );
        assert( JSON.stringify(rb.show()) == '[8,9,4]');
        rb.push(33)
        assert( JSON.stringify(rb.show()) == '[33,8,9]');
    }

})();

/*
(function (ctx) {
    var cache = {};

    ctx.tmpl = function tmpl(str, data) {
        // Figure out if we're getting a template, or if we need to
        // load the template - and be sure to cache the result.
        var fn = !/\W/.test(str) ?
            cache[str] = cache[str] ||
            tmpl(document.getElementById(str).innerHTML) :

        // Generate a reusable function that will serve as a template
        // generator (and which will be cached).
        new Function("obj",
                     "var p=[],print=function(){p.push.apply(p,arguments);};" +

                     // Introduce the data as local variables using with(){}
                     "with(obj){p.push('" +

                     // Convert the template into pure JavaScript
                     str
                     .replace(/[\r\t\n]/g, " ")
                     .split("<%").join("\t")
                     .replace(/((^|%>)[^\t]*)'/g, "$1\r")
                     .replace(/\t=(.*?)%>/g, "',$1,'")
                     .split("\t").join("');")
                     .split("%>").join("p.push('")
                     .split("\r").join("\\'") + "');}return p.join('');");

        // Provide some basic currying to the user
        return data ? fn(data) : fn;
    };
})(jstorrent);
*/
