(function() {
    jstorrent.JSTorrentClient = Backbone.Model.extend({
        initialize: function() {
            this.filesystem = new jstorrent.FileSystem();
            this.threadhasher = new jstorrent.ThreadHasher();
            //this.worker.postMessage();

            //this.torrents = {};
            this.bytecounters = { sent: new jstorrent.ByteCounter({}),
                                  received: new jstorrent.ByteCounter({}) };
            this.torrents = new jstorrent.TorrentCollection();
            this.torrents.client = this;

            /*
             */

            //mylog(1,'torrents synced', this.torrents.models);

            this.tick_interval = 100;
            this.requests_per_tick = 10;
            //this.filesystem.on('initialized', _.bind(this.tick,this));

            function ready(data) {
                if (data && data.error) {
                    mylog(LOGMASK.error,'filesystem init error');
                } else {
                    mylog(1,'filesystems ready!');
                    this.torrents.fetch();
                    for (var i=0; i<this.torrents.models.length; i++) {
                        var torrent = this.torrents.models[i];
                        if (torrent.started()) {
                            this.torrents.models[i].announce();
                        }
                    }
                    this.trigger('ready');
                    this.tick();
                }
                
            }
            /*
              this.filesystem.on('initialized', _.bind(ready, this));
              this.filesystem.on('unsupported', _.bind(ready, this));
              this.filesystem.request_fs();
            */

            this.filesystem.init_filesystems(_.bind(ready,this));
        },
        get_filesystem: function() {
            return this.filesystem;
        },
        add_torrent: function(args, opts) {
            // check if already in models...

            if (args && args.metadata) {
                var torrent = new jstorrent.Torrent( { metadata: args.metadata }, { collection: this.torrents } );
            } else if (args && args.infohash) {
                assert( args.infohash.length == 40 );
                var torrent = new jstorrent.Torrent( { infohash: args.infohash }, { collection: this.torrents } );
            } else if (args && args.magnet) {
                var torrent = new jstorrent.Torrent( { magnet: args.magnet }, { collection: this.torrents } );
            }
            if (! this.torrents.contains(torrent)) {
                this.torrents.add(torrent);
                torrent.save();
                assert( this.torrents._byId[torrent.id] );
                torrent.start();
                torrent.save();
                //torrent.announce();
            } else {
                mylog(1,'already had this torrent');
            }
        },
        add_unknown: function(str, opts) {

            assert( _.keys(this.torrents._byId).length == this.torrents.models.length );

            if (str.slice(0,'magnet:'.length) == 'magnet:') {
                this.add_torrent({magnet:str}, opts);
            } else if (str.slice(0,'http://'.length) == 'http://') {
                debugger; // use a proxy service to download and serve back
            } else if (str.length == 40) {
                this.add_torrent({infohash:str}, opts);
            } else {
                debugger;
            }

            assert( _.keys(this.torrents._byId).length == this.torrents.models.length );
        },
        add_consec_torrent: function(num) {
            num = num | 1;
            jsp = new JSPack();
            for (j=0;j<num;j++) { 
                arr = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0].concat( jsp.Pack(">I", [j*16]) );
                var infohash = ab2hex(arr);
                this.add_torrent( {infohash: infohash} );
            }
        },
        notify_filesystem_full: function() {
            mylog(LOGMASK.error,'filesystem is FULL!!!');
            //var bytes = 1024 * 1024 * 1024; // gigabyte

            // TODO -- request more than before!!
            this.get_filesystem().request_persistent_storage( _.bind(function(data) {

                this.get_filesystem().get_quotas( _.bind(function(quotas) {

                    this.get_filesystem().request_persistent_storage(_.bind(function() {
                        this.free_temporary();
                    },this));
                    //this.get_filesystem().get('quotas');

                },this));

                //this.have_more_persistent_storage(bytes);
            },this) );
        },
        have_more_persistent_storage: function(bytes) {
            // called when more persistent storage is available. migrate some torrents over to persistent storage...


        },
        free_temporary: function() {
            mylog(1,'FREE TEMP');
            // out of temporary space. move some torrent data to persistent storage!
            var quotas = this.get_filesystem().get('quotas');
            var pfree = quotas.persistent.capacity - quotas.persistent.used;
            var movebytes = 0;
            var movetorrents = [];

            for (var i=0; i<this.torrents.models.length; i++) {
                var torrent = this.torrents.models[i];
                if (torrent.get('state') == 'stopped' &&
                    torrent.get_storage_area() == 'temporary' &&
                    movebytes + torrent.get_size() < pfree) {
                    movetorrents.push(torrent)
                }
            }
            mylog(1,'torrents to move',movetorrents);
            if (movetorrents.length > 0) {
                var fns = [];

                for (var i=0; i<movetorrents.length; i++) {
                    var torrent = movetorrents[i];
                    fns.push( { fn: torrent.move_storage_area, this: torrent, arguments: ['persistent'], callbacks: [1] } );
                }
                new Multi(fns).sequential( function(result) {
                    mylog(1,'freed temporary!',result);
                });
            }
        },
        add_random_torrent: function(num) {
            num = num | 1;
            for (j=0;j<num;j++) { 
                var s = '';
                for (i=0;i<20;i++) {
                    s += String.fromCharCode( Math.floor( Math.random() * 256 ) );
                }
                var hasher = new Digest.SHA1();
                hasher.update( s );
                var hash = hasher.finalize();
                this.add_torrent( { infohash: ab2hex(new Uint8Array(hash)) } );
            }
        },
        remove_torrent: function(torrent) {
            torrent.stop();
            torrent.cleanup();
            torrent.remove_files();
            //this.torrents.remove(torrent);
            torrent.destroy();
            this.torrents.remove(torrent);
            //this.torrents.save();
        },
        run_tests: function() {
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
                        if (conn.get('complete') == 1000 && conn.torrent.get('complete') == 1000) {
                            // not interested in this peer anymore
                            conn.peer.ban();
                            conn.close('both seeding');
                        } else if (conn.can_send_messages()) {
                            var numchunks = torrent.make_chunk_requests(conn, Math.min(this.requests_per_tick, conn._outbound_chunk_requests_limit));
                            if (! numchunks) {
                                if (now - conn._last_message_in > constants.keepalive_interval ||
                                    now - conn._last_message_out > constants.keepalive_interval) {
                                    if (! conn._keepalive_sent) {
                                        conn.send_keepalive();
                                    }
                                }

                            }
                        }
                    }
                }
            }

            this._next_tick = setTimeout( _.bind(this.tick, this), this.tick_interval );
            // called every once an a while
        },
    });



})();
