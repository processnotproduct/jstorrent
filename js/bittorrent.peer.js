(function() {

    jstorrent.Peer = Backbone.Model.extend({
        className: 'Peer',
        initialize: function(opts) {
            this.torrent = opts.torrent;
            this.swarm = opts.torrent.swarm;
            var parts = this.id.split(':');
            this.ip = parts[0];
            this.port = parseInt(parts[1],10);
            this.set('incoming',opts.incoming);
            this.set('country',geolocate(this.ip));
            this.set('last_closed', null);
            this.set('unresponsive',null);
            this.set('pex_peers',0);
            this.set('banned', null);
            this.set('closereason', null);
            this.set('ever_connected', null); // whether this peer ever did anything useful...
        },
        repr: function() {
            return this.id;
        },
        ban: function() {
            this.set('banned', true);
            // ban this peer.
        },
        handle_pex: function(info) {
            var decodedpeers = [];
            if (info.added) {
                var itermax = info.added.length/6;
                for (var i=0; i<itermax; i++) {
                    var peerdata = jstorrent.decode_peer( info.added.slice( i*6, (i+1)*6 ), {isstr:true} );
                    decodedpeers.push(peerdata);
                    var added = this.torrent.handle_new_peer(peerdata);
                    if (added) {
                        this.set('pex_peers', this.get('pex_peers')+1);
                    }
                }
            }
            mylog(LOGMASK.peer, 'handle pex',info);
        },
        notify_closed: function(data, conn) {
            this.set('conn',undefined);
            if (! conn._remote_handshake) {
                // never even gave me a handshake!
                this.set('unresponsive', true);
            }
            mylog(LOGMASK.peer, this.repr(),'peer closed',data, data.reason);
            this.set('last_closed', new Date());
            
            if (data.reason) {
                if (this.get('closereason')) {
                    mylog(LOGMASK.error,'two close reasons', this.get('closereason'), data.reason);
                    this.set('closereason', this.get('closereason') + ', ' + data.reason);
                } else {
                    this.set('closereason', data.reason);
                }
            }
            if (data.reason == 'dpoint closed') {
                this._reconnect_in = new Date() + 1000;
            } else if (data.reason == 'dpoint timeout') {
                this._reconnect_in = new Date() + 5000;
            }
        },
        is_self: function() {
            if (this.get('is_self')) {
                return true;
            }
            return false;
        },
        can_reconnect: function() {
            if (this.torrent.get('complete') == 1000 && this.get('complete')) {
                return false;
            } else if (this.get('banned')) { 
                return false;
            } else if (! this.get('last_closed')) {
                return true;
            } else if (this.get('unresponsive') && this.collection.length > 10) {
                // never even handshook
                return false;
            } else if (this._reconnect_in && new Date() > this._reconnect_in) {
                this._reconnect_in = null;
                return true;
            } else {
                return new Date() - this._last_closed > 5 * 1000;
            }
        }
    });

})();
