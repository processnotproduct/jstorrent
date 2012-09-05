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

var TrackerConnection = function(url, torrent) {
    this.url = url;
    this.torrent = torrent;
}

function decode_peer(str) {
    assert(str.length == 6);
    var ip = str.charCodeAt(0) + '.' + str.charCodeAt(1) + '.' + str.charCodeAt(2) + '.' + str.charCodeAt(3)
    var port = 256 * str.charCodeAt(4) + str.charCodeAt(5);
    return { ip: ip, port: port };
}

function btURIEncode(s) {
    if (typeof s == 'number') {
        s = s.toString();
    }
    var res = '';
    for (var i=0; i<s.length; i++) {
        if (encodeURIComponent(s[i]) == s[i]) {
            res += s[i];
        } else {
            res += '%' + ab2hex( [s.charCodeAt(i)] );
        }
    }
    return res;
}

TrackerConnection.prototype = {
    announce: function() {

        if (window.config && config.debug_torrent_client) {
            // bypass tracker and always connect to a debug torrent client (ktorrent)
            this.trigger('newpeer',config.debug_torrent_client);
            return;
        }

        var _this = this;
        var params = { info_hash: hex2str(this.torrent.get_infohash('hex')), event: 'started',
                       peer_id: ab2str(my_peer_id),
                       port: 0,
                       downloaded: 0,
                       uploaded: 0,
                       left: 0
                     };
        jQuery.ajax( { url: this.get_url(params),
                       success: function(b64data, status, xhr) {
                           // need to base64 decode
                           var data = atob(b64data);
                           //var data = base64.toBits(b64data)
                           var decoded = bdecode(data);
                           if (decoded.peers) {
                               var peers = decoded.peers;
                               assert(peers.length % 6 == 0);

                               var itermax = peers.length/6;

                               if (true) {
                                   // pick a single peer, for debugging
                                   var i = Math.floor( Math.random() * itermax );
                                   var peerdata = decode_peer( peers.slice( i*6, (i+1)*6 ) );
                                   _this.trigger('newpeer',peerdata);
                                   mylog(1,'got peer',peerdata);
                                   
                               } else {
                                   for (var i=0; i<itermax; i++) {
                                       var peerdata = decode_peer( peers.slice( i*6, (i+1)*6 ) );
                                       _this.trigger('newpeer',peerdata);
                                       mylog(1,'got peer',peerdata);
                                   }
                               }
                           }
                       },
                       dataType: 'jsonp',
                       error: function(xhr, status, text) {
                           debugger;
                       }
                     });
    },
    get_url: function(params) {
        //var s = this.url + '?info_hash=' + params.info_hash;
        var s = this.url + '?';
        if (this.url.indexOf('?') == -1) {
            var s = this.url + '?';
        } else {
            var s = this.url + '&';
        }
        var i = 0;
        for (var key in params) {
            s += (i==0?'':'&') + key + '=' + btURIEncode(params[key]);
            i++;
        }
        return s;
    }
}


window.bindable = {
    bind: function(evt, callback) {
        if (this.__bound === undefined) {
            this.__bound = {};
        }
        this.__bound[evt] = callback;
    },
    trigger: function(evt, data) {
        this.__bound[evt](data);
    },
}

_.extend(TrackerConnection.prototype, bindable);
