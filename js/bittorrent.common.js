jstorrent = {
};

window.config = {
    //debug_torrent_client: {ip:'127.0.0.1', port:8031},
    debug_torrent_client: {ip:'192.168.56.101', port:64399},
    tracker_proxy: 'http://192.168.56.1:6969/proxy', // tracker proxy service
    jstorrent_host: 'http://192.168.56.1:9090', // website host (i.e. jstorrent.com)
    bittorrent_proxy: '192.168.56.1:8030',
    default_tracker: 'http://192.168.56.1:6969/announce'
    //bittorrent_proxy: 'kzahel.dyndns.org:8030' // torrent proxy service
}

if (window.location.host.match('jstorrent.com')) {
    default_tracker = "udp://tracker.openbittorrent.com:80/announce";
    config.tracker_proxy = 'http://kzahel.dyndns.org:6969/proxy';
    jstorrent_host = 'http://jstorrent.com';
    bittorrent_proxy = 'kzahel.dyndns.org:8030';
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
                  'peer': Math.pow(2,7)
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



//var curlogmask = LOGMASK.network | LOGMASK.general
//var curlogmask = LOGMASK.general | LOGMASK.hash;
var curlogmask = LOGMASK.all;
//var curlogmask = LOGMASK.general | LOGMASK.ui | LOGMASK.peer | LOGMASK.hash;
//var curlogmask = LOGMASK.general | LOGMASK.disk | LOGMASK.hash | LOGMASK.ui;

window.mylog = function(level) {
    var l = [];
    for (var i=0; i<arguments.length; i++) {
        l.push(arguments[i]);
    }

    if (level & curlogmask) {
        l[0] = LOGMASK_R[level] + '>  ';
        //console.log.apply(console, l.slice(1, l.length));
        if (LOGMASK_R[level] == 'error') {
            console.error.apply(console, l);
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
