window.jstorrent = {
    state: {}
};

window.config = {
    //debug_torrent_client: {ip:'127.0.0.1', port:8030},
    //debug_torrent_client: {ip:'192.168.56.1', port:8030},
    debug_torrent_client: {ip:'192.168.56.101', port:25094},
    unit_tests: false, // run unit tests
    debug_asserts: true,
    tracker_proxy: 'http://192.168.56.1:6969/proxy', // tracker proxy service
    jstorrent_host: 'http://192.168.56.1:9090', // website host (i.e. jstorrent.com)
    //bittorrent_proxy: false,
    bittorrent_proxy: '192.168.56.1:8030',
    //bittorrent_proxy:'kzahel.dyndns.org:8030', // use home computer
    home_computer: 'kzahel.dyndns.org:14098',
//    external_ip: '38.99.42.130', // HARD CODED IP AT WORK
    bittorrent_incoming_proxy: '192.168.56.1:8030',
    udp_proxy: '192.168.56.1:8030',
    //udp_proxy: '127.0.0.1:8030',
    packaged_app: window.chrome && window.chrome.app && window.chrome.app.window,
    //ip_aliases: { '38.99.42.130': '127.0.0.1' },
    default_tracker: 'http://192.168.56.1:6969/announce',
    kyle_ut_home: 'kzahel.dyndns.org:38028',
    disable_filesystem: true,
    public_trackers: ["udp://tracker.openbittorrent.com:80/announce",
                      "udp://tracker.publicbt.com:80/announce"]
    //bittorrent_proxy: 'kzahel.dyndns.org:8030' // torrent proxy service
}
if (config.packaged_app) {
    //config.disable_filesystem = false;
    //config.debug_torrent_client = null;
}

if (window.location.host.match('jstorrent.com')) {
    config.default_tracker = "udp://tracker.openbittorrent.com:80/announce";
    config.tracker_proxy = 'http://kzahel.dyndns.org:6969/proxy';
    config.jstorrent_host = 'http://jstorrent.com';
    config.bittorrent_proxy = 'kzahel.dyndns.org:8030';
    config.udp_proxy = 'kzahel.dyndns.org:8030';
    config.bittorrent_incoming_proxy = 'kzahel.dyndns.org:8030';
}

window.gdriveloaded = function() {
    jstorrent.state.gdriveloaded = true;
    if (jstorrent.JSTorrentClient.instance) {
        // google drive loaded AFTER jstorrent code loaded
        jstorrent.JSTorrentClient.instance.get_cloud_storage().gdrive_onload();
    }
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
                  'cloud': Math.pow(2,13)
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

curlogmask = LOGMASK.general | LOGMASK.cloud;
//var curlogmask = LOGMASK.network | LOGMASK.general
//var curlogmask = LOGMASK.general | LOGMASK.hash | LOGMASK.disk;
//var curlogmask = LOGMASK.general | LOGMASK.disk;
//var curlogmask = LOGMASK.general | LOGMASK.ui;
//var curlogmask = LOGMASK.general | LOGMASK.cloud;
//var curlogmask = LOGMASK.all;

//curlogmask = LOGMASK.all & (  (Math.pow(2,20) - 1) ^ LOGMASK.udp  )
//var curlogmask = LOGMASK.general | LOGMASK.ui | LOGMASK.peer | LOGMASK.hash;
//var curlogmask = LOGMASK.general | LOGMASK.disk | LOGMASK.hash | LOGMASK.ui;


// remove specific logging flags
curlogmask &= (Math.pow(2,20) - 1) ^ LOGMASK.udp

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

