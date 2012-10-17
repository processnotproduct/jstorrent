(function() {
    jstorrent.JSTorrentClient = Backbone.Model.extend({
        database: jstorrent.storage,
        storeName: 'client',
        initialize: function() {
            window.jspack = new JSPack();
            this.filesystem = new jstorrent.FileSystem();
            this.threadhasher = new jstorrent.ThreadHasher();
            this.streamparser = null;
            //this.worker.postMessage();
            this.set('id',"DefaultClient");
            this.fetch();
            //this.torrents = {};
            this.bytecounters = { sent: new jstorrent.ByteCounter({}),
                                  received: new jstorrent.ByteCounter({}) };
            this.torrents = new jstorrent.TorrentCollection();
            this.incoming_connections = null;

            this.incoming_connections = new jstorrent.IncomingConnectionProxyCollection();
            if (!config.packaged_app) {
                this.udp_proxy = new jstorrent.UDPProxy({client:this});
            } else {
                this.incoming_connections = new jstorrent.TCPSocketServer();
            }
            this.incoming_connections.client = this;
            this.incoming_connections.establish();

            this.torrents.client = this;

            /*
             */

            //mylog(1,'torrents synced', this.torrents.models);

            this.tick_interval = 300;
            this.long_tick_interval = 10000;

            this.requests_per_tick = 10;
            //this.filesystem.on('initialized', _.bind(this.tick,this));

            function ready(data) {
                if (data && data.error) {
                    if (! window.WebSocket && ! window.ArrayBuffer) {
                        this.trigger('unsupported');
                        return;
                    } else {
                        this.trigger('slightly_supported');
                    }
                    
                    mylog(LOGMASK.error,'filesystem init error');
                }
                this.torrents.fetch({success:_.bind(function(){

                    this.incoming_connections.on('established', _.bind(function() {
                        this.incoming_connections.current().on('change:remote_port', _.bind(function(){
                            for (var i=0; i<this.torrents.models.length; i++) {
                                var torrent = this.torrents.models[i];
                                if (torrent.started()) {
                                    this.torrents.models[i].announce(); // move announce into .tick()
                                }
                            }
                        },this));
                    },this));
                    this.set('ready',true);
                    this.trigger('ready');
                    this.tick();
                    this.long_tick();

                    
                },this),
                                     error:function(a,b,c){debugger;}});



            }
            /*
              this.filesystem.on('initialized', _.bind(ready, this));
              this.filesystem.on('unsupported', _.bind(ready, this));
              this.filesystem.request_fs();
            */
            this.filesystem.init_filesystems(_.bind(ready,this));
        },
        get_streamparser: function() {
            if (! this.streamparser) {
                this.streamparser = new jstorrent.StreamParser;
            }
            return this.streamparser;
        },
        get_external_ip: function() {
            // TODO: figure this out when we accidentally connect to ourself
            return config.external_ip;
        },
        get_external_port: function() {
            if (this.incoming_connections.current()) {
                return this.incoming_connections.current().get('remote_port');
            } else if (this.incoming_connections._last) {
                return this.incoming_connections._last.get('remote_port');
            } else {
                return 0;
            }
        },
        get_my_hostports: function() {
            // returns a list of my host/port combos... (prevent from connecting to self)
            var port = this.get_external_port();
            var addrs = [];
            addrs.push( '127.0.0.1:' + port );
            addrs.push( this.get_external_ip() + ':' + port );
            return addrs;
        },
        get_username: function() {
            if (this.get('username')) {
                return this.get('username');
            } else {
                return "anonymous";
            }
        },
        incoming_closed: function(model) {
            debugger;

        },
        incoming_taken: function(model) {
            debugger;

        },
        handle_incoming_connection: function(incoming, address) {
            mylog(1,"new incoming connection at",address)
            var conn = new jstorrent.WSPeerConnection({incoming: incoming, client:this, host:address[0], port:address[1]});
            return conn;
        },
        get_filesystem: function() {
            return this.filesystem;
        },
        stream: function(hash, filenum) {
            var torrent = jsclient.torrents.get_by_hash(hash);
            var file = torrent.files.get(filenum);
            file.get_filesystem_entry( _.bind(function(entry) {
                this.videomodel = new jstorrent.FileSystemVideoModel( {entry: entry, file: file} );
                $('#video_view').show();
                this.videoview = new jstorrent.VideoView( { el: $("#video_view"), model: this.videomodel } );

            },this));
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
                //torrent.save(); // have to save so that id gets set
                //assert( this.torrents._byId[torrent.id] );
                if (opts && opts.dontstart) {
                } else {
                    torrent.start();
                }
                torrent.save();
                //torrent.announce();
            } else {
                var existing_torrent = this.torrents.get_by_hash(torrent.hash_hex);
                existing_torrent.trigger('flash', existing_torrent);
                mylog(1,'already had this torrent');
            }
        },
        add_unknown: function(str, opts) {

            assert( _.keys(this.torrents._byId).length == this.torrents.models.length );

            if (str.slice(0,'magnet:'.length) == 'magnet:') {
                this.add_torrent({magnet:str}, opts);
            } else if (str.slice(0,'http://'.length) == 'http://') {
                // also checks endswith
                window.location = str;
            } else if (str.slice(0,'web+magnet:'.length) == 'web+magnet:') {
                this.add_torrent({magnet:str}, opts);
            } else if (str.slice(0,'http://'.length) == 'http://') {
                //debugger; // use a proxy service to download and serve back
                alert('Please download the torrent and drag it into the window.');
                window.location = str;
            } else if (str.length == 40) {
                this.add_torrent({infohash:str}, opts);
            } else {
                debugger;
            }

            // asynchronous now
            //assert( _.keys(this.torrents._byId).length == this.torrents.models.length );
        },
        add_consec_torrent: function(num) {
            num = num | 1;
            for (j=0;j<num;j++) { 
                arr = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0].concat( jspack.Pack(">I", [j*16]) );
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
                    fns.push( { fn: torrent.move_storage_area, fnthis: torrent, arguments: ['persistent'], callbacks: [1] } );
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
        remove_torrent: function(torrent, callback) {
            torrent.stop({silent:true});
            torrent.cleanup();
            torrent.remove_files( _.bind(function() {
                torrent.destroy();
                this.torrents.remove(torrent);
                if (callback)callback();
            },this));
        },
        run_tests: function() {
        },
        add_example_torrent: function() {
            var example = "magnet:?xt=urn:btih:7165F4B29DCEFA4715D34D5CF000287022A5EA60&dn=bones+brigade+bundle" // bones brigade
            //var example = "magnet:?xt=urn:btih:3HDQCCOLAXAYD6PMSNZ35B3KBVAMJV5Q&tr=http://tracker.vodo.net:6970/announce";
            this.add_unknown(example)
        },
        tick: function() {
            var now = (new Date()).getTime();
            for (var j=0; j<this.torrents.models.length; j++) {
                var torrent = this.torrents.models[j];
                if (torrent.get('state') == 'started') {
                    if (this.get('stop_all_torrents') && ! torrent.get('streaming')) {
                        continue
                    }

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
                            //conn.adjust_max_outbound();
                            var numchunks = torrent.make_chunk_requests(conn, Math.min(this.requests_per_tick, conn.get('outbound_chunk_requests_limit')));
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
        long_tick: function() {
            var torrent;
            var conn;
            var lowest;
            for (var i=0; i<this.torrents.models.length; i++) {
                torrent = this.torrents.models[i];
                if (torrent.get('complete') == 1000) {
                    continue;
                }
                lowest = null;
                for (var j=0; j<torrent.connections.models.length; j++) {
                    conn = torrent.connections.models[j];
                    if (conn._remote_interested || conn.get('state') == 'connecting' || conn.get('state') == 'handshaking') {
                        continue;
                    }
                    conn.compute_max_rates();
                    if (! lowest) {
                        lowest = conn;
                    } else if (conn.get('max_down') < lowest.get('max_down')) {
                        lowest = conn;
                    }
                }
                // got conn with lowest rate, drop that fucker!
                if (torrent.swarm.healthy() && conn && torrent.connections.models.length == torrent.get('maxconns')) {
                    // also count number in connecting state... dont close if everyone's still connecting
/*
                    var num_connecting = 0;
                    for (var i=0; i<torrent.connections.models.length; i++) {
                        if (torrent.connection.models[i].get('state') == 'connecting') {
                            num_connecting++;
                        }
                    }
                    if (torrent.connection.models.length - num_connecting > 239823) {
                        conn.close('slowest');
                    }
*/
                    conn.close('slowest');
                }
            }

            this._next_long_tick = setTimeout( _.bind(this.long_tick, this), this.long_tick_interval );
        }
    });



})();
