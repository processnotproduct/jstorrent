(function() {
    jstorrent.decode_peer = function(str) {
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
            this.set('responses',0);
            this.set('errors',0);
            this.set('peers',0);
            if (this.is_udp()) {
                this.use_proxy = true;
            }
        },
        min_announce_interval: function() {
            return 60 * 1000 * 30;
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
        force_announce: function() {
            this._last_announce = null;
            this.announce();
        },
        announce: function() {
            if (! this.can_announce()) {
                return;
            }
            this._last_announce = new Date();
            if (false && this.is_udp()) {
                mylog(LOGMASK.error,'udp tracker unsupported');
                return; // figure this out...
            }

            this.set('announces',this.get('announces')+1);
            var _this = this;
            var inc_conn = this.torrent.collection.client.incoming_connections.current();
            var remote_port = inc_conn ? inc_conn.get('remote_port') : null;
            var params = { info_hash: hex2str(this.torrent.get_infohash('hex')), event: 'started',
                           peer_id: arr2str(my_peer_id),
                           port: remote_port || 0,
                           downloaded: 0,
                           uploaded: 0,
                           compact: 1,
                           left: Math.floor( (1000 - this.torrent.get('complete')) * this.torrent.get_size() ) || 0
                         };
                              // hello?
            if (remote_port) {
                // params.ip = config.bittorrent_incoming_proxy; // includes port. probably wont work
            }

            var ajax_opts = { url: this.get_url(params),
                              success: _.bind(this.on_success,this),

                              beforeSend: function(xhr) {
                                  //xhr.overrideMimeType('text/plain; charset=x-user-defined');
                                  xhr.responseType = 'arraybuffer';
                              },

                              error: _.bind(function(xhr, status, text) {
                                  this.set('errors',this.get('errors')+1);
                                  this.set('state','xhr error');
                                  mylog(LOGMASK.error,'xhr announce error',xhr.responseText);
                                  if (!this.use_proxy && !this.is_udp()) {
                                      this.use_proxy = true;
                                      this._last_announce = null;
                                      this.announce();
                                  }
                                  
                              },this)
                           };

            var xhr = new XMLHttpRequest
            xhr.open("GET", ajax_opts.url, true)
            xhr.responseType = 'arraybuffer'
            xhr.onload = ajax_opts.success;
            xhr.onerror = ajax_opts.error;
            xhr.send();
            //ajax_opts.data = params;
            ajax_opts.type = "GET";
            //jQuery.ajax(ajax_opts);
        },
        is_udp: function() {
            return this.url.slice(0,4) == 'udp:';
        },
        compact_peer_response: function(decoded) {
            return this.is_udp() || typeof decoded.peers == 'string';
        },
        on_success: function(evt) {
            var data = evt.target.response;
            var arr = new Uint8Array(data);
            this.set('responses',this.get('responses')+1);
            // need to base64 decode
            //var data = atob(b64data);

            //var data = base64.toBits(b64data)
            var decoded = bdecode(arr2str(arr));
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
                            var peerdata = jstorrent.decode_peer( peers.slice( i*6, (i+1)*6 ) );
                            decodedpeers.push(peerdata);
                            this.trigger('newpeer',peerdata);
                        }
                    } else {
                        for (var i=0; i<itermax; i++) {
                            var peerdata = jstorrent.decode_peer( peers.slice( i*6, (i+1)*6 ) );
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
                this.set('peers', this.get('peers') + decodedpeers.length);

            } else if (decoded.error) {
                this.set('active','error');
                mylog(LOGMASK.error, 'tracker connection error', decoded.error, decoded);
            }
        },
        get_url: function(params) {
            var s = this.url + '?info_hash=' + params.info_hash;

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
            if (this.use_proxy && config.tracker_proxy) {
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
