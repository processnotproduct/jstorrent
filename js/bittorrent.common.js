jstorrent = {
};

window.config = {
    //debug_torrent_client: {ip:'127.0.0.1', port:8031},
    //debug_torrent_client: {ip:'192.168.56.101', port:64399},
    tracker_proxy: 'http://192.168.56.1:6969/proxy', // tracker proxy service
    jstorrent_host: 'http://192.168.56.1:9090', // website host (i.e. jstorrent.com)
    bittorrent_proxy: '192.168.56.1:8030',
    default_tracker: 'http://192.168.56.1:6969/announce',
    kyle_ut_home: 'kzahel.dyndns.org:38028'
    //bittorrent_proxy: 'kzahel.dyndns.org:8030' // torrent proxy service
}

if (window.location.host.match('jstorrent.com')) {
    config.default_tracker = "udp://tracker.openbittorrent.com:80/announce";
    config.tracker_proxy = 'http://kzahel.dyndns.org:6969/proxy';
    config.jstorrent_host = 'http://jstorrent.com';
    config.bittorrent_proxy = 'kzahel.dyndns.org:8030';
} else if (window.location.host.match('127.0.0.1')) {
    config.tracker_proxy = 'http://127.0.0.1:6969/proxy';
    config.jstorrent_host = 'http://127.0.0.1:9090';
    config.bittorrent_proxy = '127.0.0.1:8030';
    config.default_tracker = 'http://127.0.0.1:6969/announce';
}
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
                  'ui':Math.pow(2,5), // user interface
                  'error': Math.pow(2,6),
                  'peer': Math.pow(2,7),
                  'tracker': Math.pow(2,8)
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
  var precision = 2;
  var sz = ['b', 'kb', 'Mb', 'Gb', 'Tb', 'Pb', 'Eb'];
  var szmax = sz.length-1;

  // Force units to be at least kB                                              
  var unit = 1;
  size /= 1024;

  while ((size >= 1024) && (unit < szmax)) {
    size /= 1024;
    unit++;
  }
  return (size.toFixed(precision || 1) + " " + sz[unit]);
}

//var curlogmask = LOGMASK.network | LOGMASK.general
var curlogmask = LOGMASK.general | LOGMASK.tracker | LOGMASK.disk;
//var curlogmask = LOGMASK.general
//var curlogmask = LOGMASK.all;
//var curlogmask = LOGMASK.general | LOGMASK.ui | LOGMASK.peer | LOGMASK.hash;
//var curlogmask = LOGMASK.general | LOGMASK.disk | LOGMASK.hash | LOGMASK.ui;

window.mylog = function(level) {
    var l = [];
    for (var i=0; i<arguments.length; i++) {
        l.push(arguments[i]);
    }

    if (LOGMASK_R[level] == 'error') {
        console.error.apply(console, l);
    } else if (level & curlogmask) {
        l[0] = LOGMASK_R[level] + '>  ';
        //console.log.apply(console, l.slice(1, l.length));
        console.log.apply(console, l);
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
                var fthis = fndata.this;
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
    for (var key in FileError) {
        FileErrors[ FileError[key] ] = key;
    }
    function log_file_error(err) {
        mylog(LOGMASK.error, err, err.code, FileErrors[err.code]);
    }
    window.log_file_error = log_file_error;

    window.decode_url_arguments = function(place) {
        place = place || search
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



})();
