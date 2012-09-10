(function() {
    jstorrent.JSTorrentClient = function() {
        this.filesystem = new jstorrent.FileSystem();
        this.filesystem.request_fs();
        this.threadhasher = new jstorrent.ThreadHasher();
        //this.worker.postMessage();

        //this.torrents = {};
        this.torrents = new jstorrent.TorrentCollection();
        this.torrents.fetch();
        /*
         */

        //mylog(1,'torrents synced', this.torrents.models);

        this.tick_interval = 200;
        this.requests_per_tick = 5;
        //this.filesystem.on('initialized', _.bind(this.tick,this));
        this.filesystem.on('initialized', _.bind(function() {

            for (var i=0; i<this.torrents.models.length; i++) {
                var torrent = this.torrents.models[i];
                if (torrent.started()) {
                    this.torrents.models[i].announce();
                }
            }
            this.tick();

        }, this));
    }

    jstorrent.JSTorrentClient.prototype = {
        get_filesystem: function() {
            return this.filesystem;
        },
        add_torrent: function(args) {
            // check if already in models...

            if (args && args.metadata) {
                var torrent = new jstorrent.Torrent( { metadata: args.metadata } );
            } else if (args && args.infohash) {
                assert( args.infohash.length == 40 );
                var torrent = new jstorrent.Torrent( { infohash: args.infohash } );
            } else if (args && args.magnet) {
                var torrent = new jstorrent.Torrent( { magnet: args.magnet } );
            }
            if (! this.torrents.contains(torrent)) {
                this.torrents.add(torrent);
                torrent.start();
                torrent.save();
                //torrent.announce();
            } else {
                mylog(1,'already had this torrent');
            }
            

        },
        remove_torrent: function(torrent) {
            torrent.stop();
            torrent.cleanup();
            //this.torrents.remove(torrent);
            torrent.destroy();
            this.torrents.remove(torrent);
            //this.torrents.save();
        },
        tick: function() {
            var now = (new Date()).getTime();
            for (var j=0; j<this.torrents.models.length; j++) {
                var torrent = this.torrents.models[j];
                if (torrent.get('state') == 'started') {
                    torrent.try_add_peers();
                    torrent.try_announce();

                    // if torrent in streaming mode, need to complete pieces in sequential order...
                    // otherwise, make some requests for each connected peer.
                    for (var i=0; i<torrent.connections.models.length; i++) {
                        var conn = torrent.connections.models[i];
                        if (conn.can_send_messages()) {
                            var numchunks = torrent.make_chunk_requests(conn, this.requests_per_tick);
                            if (! numchunks) {
                                if (now - conn._last_message_in > constants.keepalive_interval ||
                                    now - conn._last_message_out > constants.keepalive_interval) {
                                    conn.send_keepalive();
                                }

                            }
                        }
                    }
                }
            }

            this._next_tick = setTimeout( _.bind(this.tick, this), this.tick_interval );
            // called every once an a while
        },
    };

})();
