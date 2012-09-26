(function() {
    jstorrent.Torrent = Backbone.Model.extend({
        className: "Torrent",
        // misnomer -- not just a new torrent anymore.
        initialize: function(opts) {
            //mylog(1,'init torrent',this.id);
            _.bindAll(this, 'process_meta_request', 'handle_new_peer', 'on_connection_close');

            this.availability = []; // sits alongside the bitmask, stores how many distributed copies of each piece for connected peers.

            /*
              for a given piece, how do we quickly find a peer that has it?

              perhaps we may assume we have a limited # of connections... (say 20)

              store {piece->[conns...]} ?

            */

            this.connections = new jstorrent.TorrentPeerCollection();
            this.swarm = new jstorrent.Swarm();
            this.swarm.set_torrent(this);
            this.set('numswarm',0);
            this.swarm.on('add', _.bind(function() {
                this.set('numswarm', this.get('numswarm')+1);
            },this));
            this.pieces = new jstorrent.PieceCollection();
            this.bytecounters = { sent: new jstorrent.ByteCounter({parent:this.collection.client.bytecounters.sent}),
                                  received: new jstorrent.ByteCounter({parent:this.collection.client.bytecounters.received}) };
            this.files = new jstorrent.TorrentFileCollection();
            this.trackers = new jstorrent.TrackerCollection();
            this.set('bytes_received',0);
            this.set('maxconns',20);
            this.set('bytes_sent',0);
            this.set('numpeers', 0);
            this.set('size',0);
            this._trackers_initialized = false;
            this._metadata_requests = {};
            this._chunk_request_timeout = 1000 * 60; // 60 seconds

            if (opts.metadata) {
                // initialize a torrent from torrent metadata
                this.set('metadata',opts.metadata);
                //this.set('metadata',undefined); // save path to the torrent metadata!
                // TODO -- save path to torrent metadata instead of saving it in localstorage
                this.process_metadata();
                this.process_post_metadata();
                //mylog(1,'new torrent with hash',this.hash_hex);
            } else if (opts.infohash) {
                // initialization via infohash (i.e. magnet link) {
                this.hash_hex = opts.infohash;
                this.hash = str2arr(hex2str(this.hash_hex));
                this.set('name',this.get_name());
                return;
            } else if (opts.magnet) {
                var url = opts.magnet;
                var uri = url.slice(url.indexOf(':')+2)
                var parts = uri.split('&');
                var d = {};
                mylog(1,'init torrent from magnet',d);
                for (var i=0; i<parts.length; i++) {
                    var kv = parts[i].split('=');
                    var k = decodeURIComponent(kv[0]);
                    var v = decodeURIComponent(kv[1]);
                    if (! d[k]) {
                        d[k] = [];
                    }
                    d[k].push(v);
                }
                var xtparts = d.xt[0].split(':');

                var encodedhash = xtparts[xtparts.length-1];
                if (encodedhash.length == 40) {
                    this.hash_hex = encodedhash.toLowerCase();
                    this.hash = hex2arr(this.hash_hex);
                } else if (encodedhash.length == 32) {
                    var output = b32decode(encodedhash);
                    this.hash = str2arr(output);
                    this.hash_hex = ab2hex(this.hash);
                }

                assert (this.hash_hex.length == 40);
                assert (this.hash.length == 20);
                this.magnet_info = d;
                this.set('name',this.get_name());
                // set stuffs
                return;
            } else if (opts.container) {
                this.container = opts.container;
                this.set('container',undefined); // make sure doesn't store on model.save
                //this.althash = opts.althash;
                //this.althash_hex = ab2hex(this.althash);
                this.piece_size = constants.new_torrent_piece_size; // TODO -- calculate based on entire torrent size
                this.fake_info = this.get_fake_infodict();
                this.set('fake_info',this.fake_info);
                mylog(1,'created fake infodict',this.fake_info);
                this.real_info = {'pieces':[]};
                this.process_post_metadata();
            } else if (opts.fake_info) {
                mylog(LOGMASK.error,'torrent didnt finish hashing!... (but have fake info---continue...)');
                this.piece_size = constants.new_torrent_piece_size;
                this.fake_info = this.get('fake_info');
                this.unset('fake_info');
                this.real_info = {'pieces':[]};
                this.process_post_metadata();
                this.hash_all_pieces( _.bind(function() {
                    mylog(1,'torrent ready!');
                    this.start();
                    // woo hoo!
                },this));
            } else if (opts.state == 'hashing') {
                mylog(LOGMASK.error,'torrent didnt finish hashing!... eeeeeee');
                debugger;
            } else {
                mylog(LOGMASK.error,'unrecognized initialization options',opts);
                debugger;
            }
            this.set('name',this.get_name());

        },
        get_client: function() {
            return this.collection.client;
        },
        get_storage: function(callback, area) {
            area = area || 'temporary';
            if (this.is_multifile()) {
                this.get_directory( callback );
            } else {
                this.get_client().get_filesystem().fss[area].root.getFile( this.get_name(), null, callback, callback );
            }
        },
        move_storage_area: function(target_fs_type, callback) {
            var _this = this;

            this.get_storage( _.bind(function(res) {
                if (res instanceof FileError) {
                    log_file_error(res);
                    callback({error:true});
                } else {

                    function onremove(remres) {
                        if (res && res.code) {
                            log_file_error(res);
                            callback({error:true})
                        } else {
                            callback(true);
                        }
                    }

                    function oncopy(copyres) {
                        if (res && res.code) {
                            log_file_error(res);
                            callback({error:true})
                        } else {
                            _this.set('storage_area','persistent');
                            _this.save();
                            mylog(1,'remove',res); // removerecursively?
                            res.remove(onremove, onremove);
                        }
                    }
                    var newroot = this.get_client().get_filesystem().fss['persistent'].root;
                    mylog(LOGMASK.disk,'copy',res,'to',newroot);
                    res.copyTo( newroot,
                                null,
                                oncopy,
                                oncopy );
                    
                    //res.moveTo( //XXX
                }
            },this), this.get_storage_area());
        },
        get_directory: function(callback, area) {
            area = area || 'temporary';
            this.get_client().get_filesystem().fss[area].root.getDirectory( this.get_name(), null, callback, callback );
        },
        remove_files: function() {
            if (this.magnet_only()) {
                return;
            }

            if (this.is_multifile()) {
                this.get_directory( _.bind(function(dir) {
                    if (dir instanceof FileError) {
                        log_file_error(dir);
                        return; // TODO -- remove
                    }
                    dir.removeRecursively(function() {
                        mylog(1,'recursively removed directory');
                    });
                }, this));
/*
                // better remove recursively torrent's directory...?
                for (var i=0; i<this.num_files; i++) {
                    var file = this.get_file(i);
                    file.remove_from_disk();
                }
*/
            } else {
                this.get_file(0).remove_from_disk();
            }
        },
        process_post_metadata: function() {
            this._file_byte_accum = [];
            if (this.is_multifile()) {
                var b = 0;
                for (var i=0; i<this.get_infodict()['files'].length; i++) {
                    this._file_byte_accum.push(b);
                    b += this.get_infodict()['files'][i]['length']
                }
                this.size = b;
            } else {
                this._file_byte_accum.push(0);
                this.size = this.get_infodict().length;
            }
            assert(this.size);
            this.num_pieces = this.get_num_pieces();
            this.num_files = this.get_num_files();
            if (this.get('bitmask')) {
                //assert(this.get('bitmask').length == this.num_pieces);
                if (this.get('bitmask').length != this.num_pieces) {
                    this.set('bitmask',undefined);
                    this.save(); // ?
                }
            } else {
                if (! this.get('metadata')) {
                    this.fake_info['pieces'] = this.get_fake_pieces().join('');
                    var bitmask = this.create_bitmask({full:true});
                } else {
                    var bitmask = this.create_bitmask({empty:true})
                }
                this.set('bitmask', bitmask); // XOXOXOXOXXX!!!!! BAD!!! bad bad bad ?
                assert(bitmask.length == this.num_pieces);
            }
            this.meta_requests = [];
            this._processing_meta_request = false;
            this.set('name',this.get_name());
            this.set('size',this.get_size());
            this.metadata_size = bencode(this.get_infodict()).length
        },
        set_metadata: function(metadata) {
            var metadata = metadata;
            this.set('metadata',metadata);
            this.process_metadata();
            this.process_post_metadata();
        },
        process_metadata: function() {
            // TODO -- move into method
            this.piece_size = this.get('metadata')['info']['piece length'];
            var hasher = new Digest.SHA1();
            hasher.update( new Uint8Array(bencode(this.get('metadata')['info'])) );
            this.hash = new Uint8Array(hasher.finalize());
            this.hash_hex = ab2hex(this.hash);
        },
        set_file_priority: function(num, prio) {
            var fp = this.get('file_priorities');
            if (! fp) {
                fp = {};
            }
            fp[num] = prio;
            this.set('file_priorities',fp);
            this.save();
        },
        get_jstorrent_link: function() {
            //return window.location.origin + window.location.pathname + '#hash=' + this.hash_hex;
            return window.location.origin + window.location.pathname + '#q=' + encodeURIComponent(this.get_magnet_link());
        },
        get_magnet_link: function() {
            if (this.container && ! this.hash_hex) {
                var s = 'magnet:?xt=urn:alth:' + this.althash_hex;
            } else {
                var s = 'magnet:?xt=urn:btih:' + this.hash_hex;
            }
            //s += '&tr=' + encodeURIComponent(config.default_tracker);
            if (! this._trackers_initialized) {
                this.initialize_trackers();
            }

            if (this.trackers.models.length > 0) {
                for (var i=0; i< Math.min(this.trackers.models.length,2); i++) {
                    s += '&tr=' + encodeURIComponent(this.trackers.models[i].url);
                }
            } else {
                s += '&tr=' + encodeURIComponent(config.public_trackers[0]);
            }
            if (this.get_name()) {
                s += '&dn=' + encodeURIComponent(this.get_name());
            }
            return s;
        },
        get_infohash: function(format) {
            if (format == 'hex') {
                return this.hash_hex ? this.hash_hex : this.althash_hex;
            } else {
                assert( this.hash.length == 20 );
                return this.hash ? this.hash : this.althash;
            }
        },
        get_complete: function() {
            var bitmask = this.get_bitmask();
            var l = bitmask.length
            var c = 0;
            for (var i=0; i<l; i++) {
                if (bitmask[i]) {
                    c++
                }
            }
            return c / this.num_pieces;
        },
        make_chunk_requests: function(conn, num_to_request) {
            // need to store a data structure of availability...

            // creates a number of chunk requests to pass onto connections
            // (can only pass onto connection that has it in their bitmask)

            // maybe need to have "availability" of pieces already determined.
            // rarest first is a neat way to do this.

            /*
              if (conn._requests_outbound > conn._maximum_requests_outbound) {
              return;
              }
            */

            //mylog(1,conn.repr(),'make chunk requests');
            if (! conn.handshaking) {
                if (conn.has_metadata()) {
                    if (! conn._interested) {
                        // XXX -- only send when we're not 100% complete
                        conn.send_message('INTERESTED');
                    } else if (this.magnet_only()) {
                        //mylog(1,conn.repr(),'magnet wants metadata!');
                        var hs = conn._remote_extension_handshake;
                        if (hs) {
                            if (hs['m'] && hs['m']['ut_metadata']) {
                                var metasize = hs['metadata_size'];
                                conn.request_metadata();
                            }
                        }
                    } else {
                        if (! conn._choked) {
                            if (! conn._remote_bitmask) {
                                mylog(LOGMASK.error,'not magnet only, but no remote bitmask')
                                return;
                            }

                            if (conn._outbound_chunk_requests >= conn._outbound_chunk_requests_limit) {
                                //mylog(1,'cannot make chunk requests, outbound',conn._outbound_chunk_requests);
                                return;
                            }
                            // select piece i'm missing but they have

                            var piece = this.choose_incomplete_piece(conn._remote_bitmask);
                            // XXX -- choose a piece that doesn't make us go to far into a file ( filling up zeros sucks...?)
                            if (piece) {
                                var requests = piece.create_chunk_requests(conn, num_to_request);
                                if (requests.length > 0) {
                                    // all were already in-flight?
                                    for (var i=0; i<requests.length; i++) {
                                        var payload = new JSPack().Pack('>III', requests[i]);
                                        conn.send_message("REQUEST", payload);
                                    }
                                    return requests.length;
                                } else {
                                    debugger;
                                }
                            }
                        }
                    }
                }
            }
        },
        piece_complete: function(i) {
            return this.get('bitmask')[i] == 1;
        },
        handle_piece_data: function(conn, piecenum, offset, data) {
            var piece = this.get_piece(piecenum);
            return piece.handle_data(conn, offset, data);
        },
        is_file_skipped: function(filenum) {
            var fp = this.get('file_priorities');
            if (fp) {
                return fp[filenum] && fp[filenum].toLowerCase() == 'skip';
            } else {
                return false;
            }
        },
        get_piece_dims: function(num) {
            var sz = this.get_piece_len(num)
            var start_byte = sz * num
            var end_byte = start_byte + sz - 1
            return [start_byte, end_byte];
        },
        piece_wrote_but_not_stored: function(num) {
            var skip = this.get('bitmask_skip');
            if (skip && skip[num]) {
                return true;
            }
            return false;
        },
        choose_incomplete_piece: function(remote_bitmask) {
            // TODO -- have my own pieces sorted by completed or not
            var startindex = 0;
            var toreturn;
            if (this.get('first_incomplete')) {
                startindex = this.get('first_incomplete');
            }

            // selects a piece... (what is a more efficient way to do this?)
            var first_incomplete = null;
            for (var i=startindex; i<this.num_pieces; i++) {
                //console.log('startindex',startindex);
                if (! this.piece_complete(i)) {
                    if (first_incomplete == null) {
                        first_incomplete = i;
                    }
                    if (remote_bitmask[i]) {
                        var piece = this.get_piece(i);

                        // check if piece, when written, would cause the
                        // file to have to be filled in with a bunch of
                        // sparse zeros (sucks), and don't return the piece

                        if (! piece.all_chunks_requested() && ! piece.skipped() && ! piece.wrote_but_not_stored()) {
                            toreturn = piece;
                            break;
                        }
                    }
                }
            }

            if (first_incomplete != null && startindex != first_incomplete) {
                this.set('first_incomplete', first_incomplete);
            }
            return toreturn;
        },
        magnet_only: function() {
            return ! (this.fake_info || this.get('metadata'));
        },
        has_infodict: function() {
            return !! this.get('metadata');
        },
        get_infodict: function(opts) {
            if (opts && opts == 'bencoded') {
                // TODO -- store bencoded version
                return this.get('metadata') ? bencode(this.get('metadata')['info']) : bencode(this.fake_info);
            } else {
                return this.get('metadata') ? this.get('metadata')['info'] : this.fake_info;
            }
        },
        initialize_trackers: function() {
            var strs = [];
            if (this.magnet_info && this.magnet_info.tr) {
                for (var i=0; i<this.magnet_info.tr.length; i++) {
                    strs.push( this.magnet_info.tr[i] );
                }
            } else if (this.get('metadata')) {
                var metadata = this.get('metadata');
                if (metadata['announce-list']) {
                    for (var tn=0; tn<metadata['announce-list'].length; tn++) {
                        var tier = metadata['announce-list'][tn];
                        for (var i=0; i<metadata['announce-list'][tn].length; i++) {
                            strs.push( metadata['announce-list'][tn][i] );
                        }
                    }
                } else if (metadata['announce']) {
                    if (typeof metadata['announce'] == 'string') {
                        strs.push(metadata['announce']);
                    } else {
                        debugger;
                    }
                }
            } else if (config.default_tracker) {
                // kind of silly!
                strs.push(config.public_trackers[0]);
                strs.push(config.public_trackers[1]);
            } else {
                debugger;
            }
            this._trackers_initialized = true;
            for (var i=0; i<strs.length; i++) {
                var tracker = new jstorrent.TrackerConnection( { url: strs[i], torrent: this } );
                tracker.bind('newpeer', this.handle_new_peer);
                this.trackers.add( tracker );
            }
        },
        announce: function() {
            if (! this._trackers_initialized) {
                this.initialize_trackers();
            }
            for (var i=0; i<this.trackers.models.length; i++) {
                this.trackers.models[i].announce();
            }
        },
        try_announce: function() {
            if (config.debug_torrent_client) {
                // bypass tracker and always connect to a debug torrent client (ktorrent)
                this.handle_new_peer(config.debug_torrent_client);
                return;
            }

            for (var i=0; i<this.trackers.models.length; i++) {
                var tracker = this.trackers.models[i];
                tracker.announce(); // checks it didn't do it too recently
            }
        },
        get_storage_area: function() {
            return this.get('storage_area') || 'temporary';
        },
        try_add_peers: function() {

            //&& this.get('complete') != 1000 // try to seed!

            if (this.connections.models.length < this.get('maxconns')) {
                for (var i=0; i<this.swarm.models.length; i++) {
                    var peer = this.swarm.models[i];
                    assert(peer.id);
                    if (! peer.is_self() && peer.can_reconnect()) {
                        if (! this.connections.get(peer.id)) {
                            this.connections.add_peer(peer);
                            if (this.connections.models.length >= this.get('maxconns')) {
                                return;
                            }

                        }
                    }
                }
            }
        },
        handle_new_peer: function(data) {
            //mylog(LOGMASK.network,this.repr(),'handle new peer',data);
            if (data.port && data.port > 0) {
                var key = data.ip + ':' + data.port;
                if (! this.swarm.get(key)) {
                    var peer = new jstorrent.Peer({id: key, host:data.ip, port:data.port, hash:this.get_infohash(), torrent:this, incoming:data.incoming?data.incoming:false});
                    this.swarm.add(peer);
                    return true;
                }
            }
            return false;
        },
        on_connection_close: function(conn) {
            var key = conn.get_key();
            this.connections.remove(conn)
            this.set('numpeers', this.connections.models.length);
        },
        get_num_files: function() {
            if (this.is_multifile()) {
                return this.get_infodict()['files'].length;
            } else {
                return 1;
            }
        },
        get_num_pieces: function() {
            var val = Math.ceil( this.size / this.piece_size );
            assert(val > 0);
            return val;
        },
        register_meta_piece_requested: function(num, conn, callback) {
            if (this._hashing_all_pieces) {
                debugger; // already hashing all pieces... simply return data when done
                return;
            }
            if (! this.get_infodict()) {
                // someone requested metadata even though we don't have it
                mylog(LOGMASK.error,'they requested metadata even though we dont got it!',this.repr(), conn.repr())
                return;
                // TODO -- send reject
            }
            // other end has requested a metadata piece. determine which
            // pieces this corresponds to and read them and hash them.
            var data = {'time':new Date(), 'metapiece':num, 'callback': callback};
            var piece_range = this.get_pieces_range_from_metadata_request_num(num);
            mylog(1,'register meta piece requested',num,data);
            data.piece_range = piece_range;
            this.meta_requests.push(data); // perhaps before inserting check that we don't have redundant piece ranges in meta_requests ?
            this.process_meta_request();
        },
        write_data_from_piece: function(piece) {
            // writes this piece's data to the filesystem
            var files_info = piece.get_file_info(0, piece.sz);
            for (var i=0; i<files_info.length; i++) {
                var filenum = files_info[i].filenum;
                var filebyterange = files_info[i].filerange;
                var file = this.get_file(filenum);
                file.write_piece_data( piece, filebyterange );
            }

        },
        notify_have_piece: function(piece, opts) {
            if (opts && opts.skipped) {
                var skip = this.get('bitmask_skip') || {};
                skip[piece.num] = 1;
                this.set('bitmask_skip',skip);
            } else {
                this.get('bitmask')[piece.num] = 1;
                var complete = Math.floor(this.get_complete()*1000);
                this.set('complete',complete);
                for (var i=0; i<this.connections.models.length; i++) {
                    var conn = this.connections.models[i];
                    if (conn.can_send_messages()) {
                        conn.send_have(piece.num);
                    }
                }
            }
            //piece.free(); // cannot free yet!
            this.save();
        },
        is_multifile: function() {
            return !! this.get_infodict().files;
        },
        get_file: function(n) {
            var file = this.files.get(n);
            if (file) {
                assert (file.num == n)
                return file
            } else {
                var file = new jstorrent.TorrentFile({id:n, torrent:this, num:n});
                var fp = this.get('file_priorities');
                if (fp && fp[n]) {
                    file.set('priority',fp[n]);
                }
                assert(file.num == n);
                //this.files.add(file, {at:n}); // does not work!
                this.files.add(file);
                assert(this.files.get(n) == file);
                return file;
            }
        },
        get_piece: function(n) {
            var piece = this.pieces.get(n);
            if (piece) {
                assert (piece.num == n)
                return piece
            } else {
                var piece = new jstorrent.Piece({id:n, torrent:this, num:n});
                assert(piece.num == n);
                this.pieces.add(piece);
                assert(this.pieces.get(n) == piece);
                return piece;
            }
/*
            if (this.pieces[n]) {
                return this.pieces[n]
            } else {
                var piece = new jstorrent.Piece(this, n);
                this.pieces[n] = piece;
                return piece;
            }
*/
        },
        get_piece_len: function(piecenum) {
            if (piecenum === undefined) {
                return this.get_infodict()['piece length'];
            } else {
                if (piecenum == this.get_num_pieces() - 1) {
                    return this.get_size() - this.get_piece_len() * piecenum;
                } else {
                    return this.get_infodict()['piece length'];
                }
            }
        },
        started: function() {
            return this.get('state') == 'started';
        },
        start: function() {
            this.set('state','started');
            this.save();
            this.announce();
        },
        cleanup: function() {
            // assist garbage collection on things
            for (var i=0; i<this.pieces.models.length; i++) {
                var piece = this.pieces.models[i]
                //piece.cleanup();
                this.pieces.remove(piece);
                //piece.free();
            }
        },
        stop: function(opts) {
            this.set({'state':'stopped'}, opts);
            this.save();
            this.connections.each( function(conn) {
                conn.close('torrent stopped');
            });
        },
        get_files_spanning_bytes: function(start_byte, end_byte) {
            var filenums = [];
            for (var i=0; i<this._file_byte_accum.length; i++) {
                if (this._file_byte_accum[i] > end_byte) {
                    break;
                } else if (this._file_byte_accum[i] >= start_byte) {
                    filenums.push(i);
                }
            }
            return filenums;
        },
        init_files: function() {
            for (var i=0; i<this.get_num_files(); i++) {
                this.get_file(i);
            }
        },
        finished_a_file: function(file) {
            var result = file.hasher.finalize();
            mylog(LOGMASK.hash,'got a sha hash',ab2hex(new Uint8Array(result)));
            this.process_meta_request(); // pass in index of completed file...
        },
        hash_all_pieces: function(callback) {
            this._hashing_all_pieces = true;
            // hash check everything... (used to create torrent metadata from dropped in files)
            assert( ! this.has_infodict() );
            var pieces = [];
            for (var i = 0; i < this.num_pieces; i++) {
                pieces.push(i);
            }
            mylog(LOGMASK.hash, 'hashing all pieces');
            piecehasher.enqueue( this, pieces, _.bind(this.hashed_all_pieces, this, callback) );
        },
        hashed_single_piece: function(piece) {
            var arr = new Uint8Array(piece.hash);
            assert (arr.byteLength == 20);
            var offset = piece.num*20
            for (var j=0; j<20; j++) {
                this.real_info['pieces'][offset+j] = arr[j]
            }
        },
        hashed_all_pieces: function(callback) {
            mylog(LOGMASK.hash, 'hashed all pieces!');
            this._hashing_all_pieces = false;
/*
            for (var i = 0; i < this.num_pieces; i++) {
                var piece = this.get_piece(i);
                //var s = ab2hex();
                var arr = new Uint8Array(piece.hash);
                assert (arr.byteLength == 20);
                var offset = piece.num*20
                for (var j=0; j<20; j++) {
                    this.real_info['pieces'][offset+j] = arr[j]
                }
            }
*/
            var s = '';
            for (var i=0; i<this.real_info.pieces.length; i++) {
                s += String.fromCharCode(this.real_info.pieces[i]);
            }
            this.fake_info.pieces = s;
            var metadata = { 'info': _.clone(this.fake_info) };
            metadata['announce'] = config.public_trackers[0];
            metadata['announce-list'] = [[config.public_trackers[0]],[config.public_trackers[1]]];
            this.set('metadata',metadata);
            this.set('complete',1000);
            this.process_metadata();
            this.process_post_metadata();
            this.fake_info = null;
            this.save();
            callback();
        },
        pieces_hashed: function(request) {
            // can service meta request because we hashed all the pieces
            for (var i=request.piece_range[0]; i<=request.piece_range[1]; i++) {
                var piece = this.get_piece(i);
                //var s = ab2hex();
                var arr = new Uint8Array(piece.hash);
                assert (arr.byteLength == 20);
                var offset = piece.num*20
                for (var j=0; j<20; j++) {
                    this.real_info['pieces'][offset+j] = arr[j]
                    // this.fake_info['pieces'][offset+j] = s[j];
                }
                // request.metapiece
            }

            var callback = request.callback;
            if (callback) {
                _.defer( function(){callback(request);} );
            }

            this.current_meta_request = null;
            this.process_meta_request();
        },
        process_meta_request: function() {
            var request = null;
            if (! this._processing_meta_request) {
                // determine where we need to read from...
                if (this.meta_requests) {
                    request = this.meta_requests.shift();
                }
            }
            if (request) {
                // better to use piece ranges instead...?
                var pieces = [];
                for (var piecenum = request.piece_range[0]; 
                     piecenum <= request.piece_range[1];
                     piecenum ++) {
                    pieces.push(this.get_piece(piecenum));
                }
                piecehasher.enqueue( pieces, _.bind(this.pieces_hashed, this, request) );
            }
        },
        get_bitmask: function() {
            return this.get('bitmask');
        },
        create_bitmask: function(opts) {
            var bitmask = [];
            for (var i=0; i<this.num_pieces; i++) {
                if (opts && opts.full) {
                    bitmask.push(1);
                } else if (opts && opts.empty) {
                    bitmask.push(0)
                } else {
                    bitmask.push( this.has_piece(i)?1:0 );
                }
            }
            return bitmask;
        },
        metadata_download_complete: function(infodict) {
            var metadata = {'info':infodict};
            if (this.magnet_info) {
                if (this.magnet_info.tr) {
                    metadata['announce-list'] = [this.magnet_info.tr];
                } else {
                    metadata['announce-list'] = [[config.public_trackers[0]],[config.public_trackers[1]]];
                }
                //metadata['announce'] = this.magnet_info.tr;
            } else {
                metadata['announce-list'] = [[config.public_trackers[0]],[config.public_trackers[1]]];
            }
            this.set_metadata(metadata);
            this.save();

            for (var i=0; i<this.connections.models.length; i++) {
                this.connections.models[i].metadata_download_complete()
            }
        },
        create_bitmask_payload: function(opts) {
            var bitfield = [];
            var curval = null;
            var total_pieces = this.get_num_pieces();
            assert(total_pieces > 0);
            var total_chars = Math.ceil(total_pieces/8);
            var have_all = true;
            for (var i=0; i<total_chars; i++) {
                curval = 0;
                for (var j=0; j<8; j++) {
                    var idx = i*8+j;
                    if (idx < total_pieces) {
                        if (opts && opts.empty) {
                            // new torrent, option to make empty bitmask
                            have_all = false;
                        } else if (opts && opts.full) {
                            curval += Math.pow(2,7-j);
                        } else if (this.has_piece(idx)) {
                            curval += Math.pow(2,7-j);
                        } else {
                            have_all = false;
                        }
                    }
                }
                bitfield.push( curval );
            }
            this.have_all = have_all;
            return bitfield;            
        },
        parse_bitmask: function(arr) {
            var pieces = [];
            for (var i=0; i<arr.length; i++) {
                var s = arr[i].toString(2)
                for (var j=0; j<8-s.length; j++) {
                    pieces.push(0); // left pad
                }
                for (var j=0; j<s.length; j++) {
                    pieces.push(s[j]=='1'?1:0);
                }
            }
            var extra_pad = pieces.length - this.get_num_pieces();
            for (var i=0; i<extra_pad; i++) {
                pieces.pop();
            }
            return pieces;
        },
        has_piece: function(piecenum) {
            assert(piecenum < this.num_pieces);
            // XXX !!!!!!
            //var piece = this.get_piece(piecenum);
            return this.get_bitmask()[piecenum];
        },
        get_by_path: function(spath, callback) {
            var path = _.clone(spath); // don't accidentally modify our argument

            if (this.container && false ) { // it was already copied to the filesystem
                var entries = this.container.items();
                for (var i=0; i<entries.length; i++) {
                    if (entries[i].entry.isDirectory) {
                        if (entries[i].entry.name == path[0]) {
                            path.shift();
                            var item = entries[i].get_by_path(path);
                            if (item) {
                                callback(item);
                                return
                            }
                        }
                    } else {
                        if (path.length == 1) {
                            if (path[0] == entries[i].entry.name) {
                                callback(entries[i]);
                                return;
                            }
                        } else {
                            // does not apply...
                        }
                    }
                }
                callback(null);
            } else {
                // get from html5 filesystem
                if (this.is_multifile()) {
                    var path = [this.get_infodict().name];
                    var path = path.concat(spath);
                    this.get_client().get_filesystem().get_file_by_path( path, callback, this.get_storage_area() )
                } else {
                    this.get_client().get_filesystem().get_file_by_path( path, callback, this.get_storage_area() )
                }
            }
        },
        repr: function() {
            return "<Torrent:"+this.hash_hex+">";
        },
        reset_attributes: function() {
            for (var key in this.attributes) {
                if (key != 'id' && key != 'metadata') {
                    this.unset(key)
                }
            }
            this.process_post_metadata();
            mylog(1,'reset attributes',this.repr(),this.attributes);
        },
        get_metadata_piece: function(metapiecenum, request) {
            // lazy piece generation
            var sz = constants.metadata_request_piece_size; // metadata requests 
            var index = null;
            bencode( this.fake_info, function(stack, r) {
                if (stack && stack[0] == "pieces") {
                    index = r.length;
                }
            });
            var bytes = bencode( this.fake_info );
            //var piecedata = bdecode(utf8.parse(bytes.slice(index)));
            var piecedata = bdecode(arr2str(bytes.slice(index)));
            var piecedata_a = index + piecedata.length.toString().length + 1;

            for (var piecenum=request.piece_range[0]; piecenum<=request.piece_range[1]; piecenum++) {
                for (var j=0; j<20; j++) {
                    bytes[piecedata_a + piecenum*20 + j] = this.real_info.pieces[piecenum*20 + j];
                }
            }
            var start_byte = metapiecenum * constants.metadata_request_piece_size;
            var serve_bytes = bytes.slice(start_byte, start_byte + constants.metadata_request_piece_size);
            return serve_bytes;

        },
        get_pieces_range_from_metadata_request_num: function(piece) {
            // returns [start_piece, end_piece], end_piece inclusive
            var index = null;
            bencode( this.fake_info, function(stack, r) {
                if (stack && stack[0] == "pieces") {
                    index = r.length;
                }
            });

            /*
              need to determine whether piece req intersects piece data, and indexes a,b 
              
              metadata piece req
              |------------------------|
              a       b
              |-------|

              d4:blah........5:pieces{len}:{piece data .... }
              ^
              |
              index
            */

            var sz = constants.metadata_request_piece_size; // metadata requests 
            var req_a = piece * sz;
            var req_b = (piece+1) * sz - 1;

            var bytes = bencode( this.fake_info );
            //var piecedata = bdecode(utf8.parse(bytes.slice(index)));
            var piecedata = bdecode(arr2str(bytes.slice(index)));
            var piecedata_a = index + piecedata.length.toString().length + 1; // move forward a ':'
            var piecedata_b = piecedata_a + this.get_num_pieces() * 20 - 1; // piecedata_b is used as an inclusive interval, so don't include the boundary

            var intersection = intersect( [req_a, req_b], [piecedata_a, piecedata_b] );
            var a = intersection[0], b = intersection[1];
            if (intersection) {
                // spanning indicies relative to the piece data
                var p_a = a - piecedata_a;
                var p_b = b - piecedata_a;

                // now need to figure out which actual pieces (20 byte hash each) these intersect
                // |-------20-byte---|-------20-byte--|---
                //          p_a---------p_b
                // i.e. here it needs both these pieces

                var start_piece = Math.floor(p_a/20);
                var end_piece = Math.floor(p_b/20);

                // so need [start_piece, end_piece], inclusive.
                assert(end_piece < this.get_num_pieces());
                return [start_piece, end_piece];
            } else {
                return [];
            }
        },
        get_fake_infodict: function() {
            // creates a fake infodict with emptied out pieces that will
            // help us in determining piece boundaries on requests
            var info = {};
            if (this.container instanceof jstorrent.DNDFileEntry) {
                info['name'] = this.container.file.name;
                info['length'] = this.container.file.size;
                assert(info['length']);
            } else {
                info['files'] = [];
                //info['althash'] = arr2str(this.althash);
                var entries = this.container.items();
                for (var i=0; i<entries.length; i++) {
                    entries[i].serialize_meta(info['files']);
                }
                info['name'] = this.get_name_from_entries();
            }
            info['piece length'] = this.piece_size;
            
            //info['pieces'] = this.get_fake_pieces().join('');
            return info;
        },
        get_name_from_entries: function() {
            if (this.container.entry) {
                return this.container.entry.name; // each folder gets its own torrent now
            } else if (this.container.files.length == 1) {
                debugger;
                return this.container.files[0].get_name();
            } else {
                debugger;
                return 'bundle ... etc files';
            }
            
            
            var entries = this.container.items();
            if (entries.length > 1) {
                var s = 'Bundle, ';
                var files = 0;
                var folders = 0;
                for (var i=0; i<entries.length; i++) {
                    if (entries[i].entry.isDirectory) {
                        folders++;
                    } else {
                        files++;
                    }
                }

                if (files > 0) {
                    s += (files + ' files');
                }
                if (folders > 0) {
                    s += (files>0?', ':'') + (folders + ' folders.');
                } else {
                    s += '.'
                }
                s += ' ';
                s += new Date();
                return s;

            } else {
                return entries[0].get_name(); // TODO -- improve this!
            }
        },
        get_size: function() {
            return this.size;
        },
        get_name: function() {
            if (this.magnet_only()) {
                if (this.magnet_info) {
                    if (this.magnet_info.dn) {
                        return 'magnet: ' + this.magnet_info.dn[0];
                    } else {
                        return 'magnet:' + this.hash_hex;
                    }
                } else {
                    return 'magnet: ' + this.hash_hex;
                }
            } else {
                return this.get_infodict().name;
            }
        },
        get_fake_pieces: function() {
            // returns the fake pieces byte array
            var bytes = [];
            var num_pieces = this.get_num_pieces();
            for (var i=0; i<num_pieces; i++) {
                bytes.push('aaaaaaaaaaaaaaaaaaaa'); // a fake piece hash
            }
            return bytes;
        }
        
    });

    /*
      _.extend(Backbone.Collection, {
      });
    */

    jstorrent.TorrentCollection = jstorrent.Collection.extend({

        //getFormatter: function(col) { debugger; },

        localStorage: new Store('TorrentCollection'),
        model: jstorrent.Torrent,
        className: 'TorrentCollection',

        contains: function(torrent_or_hash) {
            var hash = (torrent_or_hash instanceof jstorrent.Torrent ? torrent_or_hash.hash_hex.toLowerCase() : torrent_or_hash.toLowerCase());

            for (var i=0; i<this.models.length; i++) {
                if (hash == this.models[i].hash_hex.toLowerCase()) {
                    return this.models[i];
                }
            }
            return false;
        }

    });

})();
