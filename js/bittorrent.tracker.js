(function() {
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

    jstorrent.TrackerConnection = Backbone.Model.extend({
        initialize: function(opts) {
            this.url = opts.url;
            this.torrent = opts.torrent;
            this.set('announces',0);
        },
        min_announce_interval: function() {
            return 60 * 1000;
        },
        repr: function() {
            return '<Tracker ' + this.url + '>';
        },
        can_announce: function(t) {
            var now = t || new Date();
            if (this._last_announce && now - this._last_announce < this.min_announce_interval()) {
                return false;
            }
            return true;
        },
        announce: function() {
            if (! this.can_announce()) {
                return;
            }

            this._last_announce = new Date();
            this.set('announces',this.get('announces')+1);
            var _this = this;
            var params = { info_hash: hex2str(this.torrent.get_infohash('hex')), event: 'started',
                           peer_id: ab2str(my_peer_id),
                           port: 0,
                           downloaded: 0,
                           uploaded: 0,
                           compact: 1,
                           left: 0
                         };
            jQuery.ajax( { url: this.get_url(params),
                           success: _.bind(this.on_success,this),
                           dataType: 'jsonp', // TODO -- insecure - force trackers to support websockets instead
                           error: _.bind(function(xhr, status, text) {
                               this.set('state','xhr error');
                           },this)
                         });
        },
        is_udp: function() {
            return this.url.slice(0,4) == 'udp:';
        },
        compact_peer_response: function(decoded) {
            return this.is_udp() || typeof decoded.peers == 'string';
        },
        on_success: function(b64data, status, xhr) {
            // need to base64 decode
            var data = atob(b64data);
            //var data = base64.toBits(b64data)
            var decoded = bdecode(data);
            mylog(LOGMASK.tracker, 'tracker response',decoded);
            if (decoded.peers) {
                var peers = decoded.peers;
                var decodedpeers = [];
                if (this.compact_peer_response(decoded)) {
                    assert(peers.length % 6 == 0);

                    var itermax = peers.length/6;
                    if (false) {
                        var numpeers = 4;
                        // pick a single peer, for debugging
                        for (j=0;j<numpeers;j++){
                            var i = Math.floor( Math.random() * itermax );
                            var peerdata = decode_peer( peers.slice( i*6, (i+1)*6 ) );
                            decodedpeers.push(peerdata);
                            this.trigger('newpeer',peerdata);
                        }
                        
                    } else {
                        for (var i=0; i<itermax; i++) {
                            var peerdata = decode_peer( peers.slice( i*6, (i+1)*6 ) );
                            decodedpeers.push(peerdata);
                            this.trigger('newpeer',peerdata);
                        }
                    }
                } else {
                    for (var i=0; i<peers.length; i++) {
                        var peer = peers[i];
                        decodedpeers.push(peer);
                        this.trigger('newpeer',peer);
                        mylog(1,'got peer',peer);
                    }
                }
                this.set('state','active');
                mylog(LOGMASK.tracker, 'decoded peers',decodedpeers);

            } else if (decoded.error) {
                this.set('active','error');
                mylog(LOGMASK.error, 'tracker connection error', decoded.error, decoded);
            }
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
            if (config.tracker_proxy) {
                return config.tracker_proxy + '?_tracker_url=' + encodeURIComponent(s);
            } else {
                return s;
            }
        }
    });


    jstorrent.TrackerCollection = jstorrent.Collection.extend({
        model: jstorrent.TrackerConnection
    });

})();
