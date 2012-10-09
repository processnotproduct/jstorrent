window.jstorrent = {
};

window.config = {
    //debug_torrent_client: {ip:'127.0.0.1', port:8030},
    //debug_torrent_client: {ip:'192.168.56.1', port:8030},
    //debug_torrent_client: {ip:'192.168.56.101', port:64399},
    unit_tests: true, // run unit tests
    debug_asserts: false,
    tracker_proxy: 'http://192.168.56.1:6969/proxy', // tracker proxy service
    jstorrent_host: 'http://192.168.56.1:9090', // website host (i.e. jstorrent.com)
    bittorrent_proxy: '192.168.56.1:8030',
//    external_ip: '38.99.42.130', // HARD CODED IP AT WORK
    bittorrent_incoming_proxy: '192.168.56.1:8030',
    udp_proxy: '192.168.56.1:8030',
    //ip_aliases: { '38.99.42.130': '127.0.0.1' },
    default_tracker: 'http://192.168.56.1:6969/announce',
    kyle_ut_home: 'kzahel.dyndns.org:38028',
    public_trackers: ["udp://tracker.openbittorrent.com:80/announce",
                      "udp://tracker.publicbt.com:80/announce"]
    //bittorrent_proxy: 'kzahel.dyndns.org:8030' // torrent proxy service
}
if (window.location.host.match('jstorrent.com')) {
    config.default_tracker = "udp://tracker.openbittorrent.com:80/announce";
    config.tracker_proxy = 'http://kzahel.dyndns.org:6969/proxy';
    config.jstorrent_host = 'http://jstorrent.com';
    config.bittorrent_proxy = 'kzahel.dyndns.org:8030';
    config.udp_proxy = 'kzahel.dyndns.org:8030';
    config.bittorrent_incoming_proxy = 'kzahel.dyndns.org:8030';
}

window.assert = function(v) {
    if (!v) { 
        mylog(LOGMASK.error,'assertion failed');
        var l = [];
        for (var i=0; i<arguments.length; i++) {
            l.push(arguments[i]);
        }
        mylog(LOGMASK.error, l.slice(1, l.length));
        debugger; 
        if (arguments[1] && arguments[1].throw) {
            throw Error('assert throw');
        }

    }
}

var loglevel = 1;

window.LOGMASK = {'general':1, 
                  'network': 2, 
                  'disk':Math.pow(2,3),
                  'hash':Math.pow(2,4),
                  'ui':Math.pow(2,5), // user interface
                  'error': Math.pow(2,6),
                  'peer': Math.pow(2,7),
                  'tracker': Math.pow(2,8),
                  'queue': Math.pow(2,9),
                  'udp': Math.pow(2,10),
                  'warn': Math.pow(2,11),
                  'mem': Math.pow(2,12),
                 };
LOGMASK_R = {}
for (var name in LOGMASK) {
    LOGMASK_R[LOGMASK[name]] = name;
}

var b = 0;
for (var key in LOGMASK) {
    b = b | LOGMASK[key];
}
LOGMASK.all = b;

function to_file_size(size) {
  var precision = 1;
  var sz = ['B', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB'];
  var szmax = sz.length-1;

  // Force units to be at least kB                                              
    var unit = 0;
    
/*
  var unit = 1;
  size /= 1024;
*/

  while ((size >= 1024) && (unit < szmax)) {
    size /= 1024;
    unit++;
  }
    if (unit == 0) {
        precision = 0;
    } else if (unit > 1) {
        precision = 2;
    }
        return (size.toFixed(precision) + " " + sz[unit]);

}

//var curlogmask = LOGMASK.network | LOGMASK.general
//var curlogmask = LOGMASK.general | LOGMASK.hash;
//var curlogmask = LOGMASK.general | LOGMASK.disk;
//var curlogmask = LOGMASK.general | LOGMASK.ui;
var curlogmask = LOGMASK.general;
//var curlogmask = LOGMASK.all;
//var curlogmask = LOGMASK.general | LOGMASK.ui | LOGMASK.peer | LOGMASK.hash;
//var curlogmask = LOGMASK.general | LOGMASK.disk | LOGMASK.hash | LOGMASK.ui;


var _log_fixed = false;
window.mylog = function(level) {
    if (! window.console) {
        return;
    }

    var l = [];
    for (var i=0; i<arguments.length; i++) {
        l.push(arguments[i]);
    }

    if (LOGMASK_R[level] == 'error') {
        l[0] = LOGMASK_R[level] + '>  ';
        if (typeof console.error == 'object') {
            console.error(l[0], l[1], l[2], l[3], l[4], l[5]);
        } else {
            console.error.apply(console, l);
        }
    } else if (LOGMASK_R[level] == 'warn') {
        l[0] = LOGMASK_R[level] + '>  ';
        if (typeof console.warn == 'object') {
            console.warn(l[0], l[1], l[2], l[3], l[4], l[5]);
        } else {
            console.warn.apply(console, l);
        }
    } else if (level & curlogmask) {
        l[0] = LOGMASK_R[level] + '>  ';
        //console.log.apply(console, l.slice(1, l.length));
        if (typeof console.log == 'object') {
            console.log(l[0], l[1], l[2], l[3], l[4], l[5]);
        } else {
            console.log.apply(console, l);
        }
    }

/*
    if (level <= loglevel) {
        console.log.apply(console, l.slice(1, l.length));
    }
*/
}


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
