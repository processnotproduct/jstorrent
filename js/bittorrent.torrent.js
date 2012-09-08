var Torrent = Backbone.Model.extend({
    // misnomer -- not just a new torrent anymore.
    initialize: function(opts) {
        _.bindAll(this, 'process_meta_request', 'handle_new_peer', 'on_connection_close');

        this.availability = []; // sits alongside the bitmask, stores how many distributed copies of each piece for connected peers.

        /*
          for a given piece, how do we quickly find a peer that has it?

          perhaps we may assume we have a limited # of connections... (say 20)

          store {piece->[conns...]} ?

         */

        this.connections = new TorrentPeerCollection();
        this.pieces = [];
        this.files = [];
        this._metadata_requests = {};
        this._chunk_request_timeout = 1000 * 60; // 60 seconds

        if (opts.metadata) {
            // initialize a torrent from torrent metadata
            this.metadata = opts.metadata;
            //this.set('metadata',undefined); // save path to the torrent metadata!
            // TODO -- save path to torrent metadata instead of saving it in localstorage
            this.process_metadata();
            this.process_post_metadata();
            //mylog(1,'new torrent with hash',this.hash_hex);
        } else if (opts.infohash) {
            // initialization via infohash (i.e. magnet link) {
            this.hash_hex = opts.infohash;
            this.hash = str2arr(hex2str(this.hash_hex));
            return;
        } else if (opts.magnet) {
            var url = opts.magnet;
            var uri = url.slice(url.indexOf(':')+2)
            var parts = uri.split('&');
            var d = {}
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
            this.hash_hex = xtparts[xtparts.length-1];
            this.hash = hex2arr(this.hash_hex);
            assert (this.hash.length == 20);
            this.magnet_info = d;
            // set stuffs
            return;
        } else if (opts.container) {
            this.container = opts.container;
            this.set('container',undefined); // make sure doesn't store on model.save
            this.althash = opts.althash;
            this.althash_hex = ab2hex(this.althash);
            this.piece_size = constants.new_torrent_piece_size;
            this.fake_info = this.get_fake_infodict();
            mylog(1,'created fake infodict',this.fake_info);
            this.real_info = {'pieces':[]};
            this.process_post_metadata();
        } else {
            throw Error('unrecognized initialization options');
            debugger;
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
        this.num_pieces = this.get_num_pieces();
        this.num_files = this.get_num_files();
        if (this.get('bitmask')) {
            //assert(this.get('bitmask').length == this.num_pieces);
            if (this.get('bitmask').length != this.num_pieces) {
                this.set('bitmask',undefined);
                this.save();
            }
        } else {
            if (! this.metadata) {
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
    },
    set_metadata: function(metadata) {
        this.metadata = metadata;
        this.set('metadata',this.metadata);
        this.process_metadata();
        this.process_post_metadata();
    },
    process_metadata: function() {
        // TODO -- move into method
        this.piece_size = this.metadata['info']['piece length'];
        var hasher = new Digest.SHA1();
        hasher.update( new Uint8Array(bencode(this.metadata['info'])) );
        this.hash = new Uint8Array(hasher.finalize());
        this.hash_hex = ab2hex(this.hash);
    },
    get_magnet_link: function() {
        if (this.container) {
            var s = 'magnet:?xt=urn:alth:' + this.althash_hex;
        } else {
            var s = 'magnet:?xt=urn:btih:' + this.hash_hex;
        }
        s += '&tr=' + encodeURIComponent('http://192.168.56.1:6969/announce');
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
            if (conn._remote_bitmask) {
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

                        if (conn._outbound_chunk_requests >= conn._outbound_chunk_requests_limit) {
                            //mylog(1,'cannot make chunk requests, outbound',conn._outbound_chunk_requests);
                            return;
                        }
                        // select piece i'm missing but they have

                        var piece = this.choose_incomplete_piece(conn._remote_bitmask);
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
        piece.handle_data(conn, offset, data);
    },
    choose_incomplete_piece: function(remote_bitmask) {
        // selects a piece... (what is a more efficient way to do this?)
        for (var i=0; i<this.num_pieces; i++) {
            if (! this.piece_complete(i) && remote_bitmask[i]) {
                var piece = this.get_piece(i);
                if (! piece.all_chunks_requested()) {
                    return piece;
                }
            }
        }
    },
    magnet_only: function() {
        return ! (this.fake_info || this.metadata);
    },
    has_infodict: function() {
        return !! this.metadata;
    },
    get_infodict: function(opts) {
        if (opts && opts == 'bencoded') {
            // TODO -- store bencoded version
            return this.metadata ? bencode(this.metadata['info']) : bencode(this.fake_info);
        } else {
            return this.metadata ? this.metadata['info'] : this.fake_info;
        }
    },
    get_tracker: function() {
        if (this.magnet_info && this.magnet_info.tr) {
            return this.magnet_info.tr[0];
        } else if (this.get('metadata')) {
            var metadata = this.get('metadata');
            if (metadata['announce-list']) {
                var tier1 = metadata['announce-list'][0];
                return tier1[0];
            } else if (metadata['announce']) {
                if (typeof metadata.announce == 'string') {
                    return metadata.announce
                } else {
                    debugger;
                }
            }
        } else {
            return 'http://192.168.56.1:6969/announce';
        }
    },
    announce: function() {
        // TODO -- announce to all trockers!
        var tracker = this.get_tracker();
        assert(tracker);
        this.tracker = new TrackerConnection(tracker, this);
        this.tracker.bind('newpeer', this.handle_new_peer);
        this.tracker.announce()
        //setTimeout( _.bind(this.tracker.announce,this.tracker) , 1000 );
    },
    handle_new_peer: function(data) {
        if (data.port && data.port > 0) {
            var key = data.ip + ':' + data.port;
            if (this.connections.contains(key)) {
                // already have this peer..
                mylog(1,'already have this peer',this.connections,key);
            } else {
                var conn = new WSPeerConnection({id: key, host:data.ip, port:data.port, hash:this.get_infohash(), torrent:this});

                this.connections.add(conn);

                //this.connections[key] = conn

                conn.on('connected', _.bind(function() {
                    // this.connections[key] = conn
                    this.set('numpeers', this.connections.models.length);
                },this));

                conn.bind('onclose', this.on_connection_close);

                // TODO -- figure out correct remove on error or close
            }
        }
    },
    on_connection_close: function(conn) {
        var key = conn.get_key();
        this.connections.remove(conn)
        this.set('numpeers', this.connections.models.length);
    },
    get_num_files: function() {
        if (this.is_multifile()) {
            this.get_infodict()['files'].length;
        } else {
            return 1;
        }
    },
    get_num_pieces: function() {
        return Math.ceil( this.size / this.piece_size );
    },
    register_meta_piece_requested: function(num, callback) {
        if (this._hashing_all_pieces) {
            debugger; // already hashing all pieces... simply return data when done
            return;
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
    notify_have_piece: function(piece) {
        this.get('bitmask')[piece.num] = 1;
        var complete = Math.floor(this.get_complete()*1000);
        this.set('complete',complete);

        //this.set('complete', 
        this.save();
        // sends have message to all connections
        for (var i=0; i<this.connections.models.length; i++) {
            var conn = this.connections.models[i];
            if (conn.can_send_messages()) {
                conn.send_have(piece.num);
            }
        }
    },
    is_multifile: function() {
        return !! this.get_infodict().files;
    },
    get_file: function(n) {
        if (this.files[n]) {
            return this.files[n]
        } else {
            var file = new TorrentFile(this, n);
            this.files[n] = file;
            return file;
        }
    },
    get_piece: function(n) {
        if (this.pieces[n]) {
            return this.pieces[n]
        } else {
            var piece = new Piece(this, n);
            this.pieces[n] = piece;
            return piece;
        }
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
        this.announce();
    },
    cleanup: function() {
        // assist garbage collection on things
        for (var i=0; i<this.num_pieces; i++) {
            if (this.pieces[i]) {
                var piece = this.get_piece(i)
                piece.cleanup();
            }
        }
        this.pieces = {};
    },
    stop: function() {
        this.set('state','stopped');
        this.connections.each( function(conn) {
            conn.stream.close();
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
    finished_a_file: function(file) {
        var result = file.hasher.finalize();
        mylog(1,'got a sha hash',ab2hex(new Uint8Array(result)));
        this.process_meta_request(); // pass in index of completed file...
    },
    hash_all_pieces: function(callback) {
        this._hashing_all_pieces = true;
        // hash check everything... (used to create torrent metadata from dropped in files)
        assert( ! this.has_infodict() );
        var pieces = [];
        for (var i = 0; i < this.num_pieces; i++) {
            pieces.push(this.get_piece(i));
        }
        mylog(LOGMASK.hash, 'hashing all pieces',pieces.length);
        piecehasher.enqueue( pieces, _.bind(this.hashed_all_pieces, this, callback) );
    },
    hashed_all_pieces: function(callback) {
        mylog(LOGMASK.hash, 'hashed all pieces!');
        this._hashing_all_pieces = false;
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
        var s = '';
        for (var i=0; i<this.real_info.pieces.length; i++) {
            s += String.fromCharCode(this.real_info.pieces[i]);
        }
        this.fake_info.pieces = s;
        this.metadata = { 'info': _.clone(this.fake_info) };
        this.metadata['announce'] = "udp://tracker.openbittorrent.com:80/announce";
        this.metadata['announce-list'] = [
            ["udp://tracker.openbittorrent.com:80/announce"],
            ["udp://tracker.publicbt.com:80/announce"]
        ];
        this.set('metadata',this.metadata);
        this.process_metadata();
        this.fake_info = null;
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
            metadata['announce-list'] = [this.magnet_info.tr];
            //metadata['announce'] = this.magnet_info.tr;
        }
        this.set_metadata(metadata);
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

        if (this.container) {
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
                jsclient.get_filesystem().get_file_by_path( path, callback )
            } else {
                jsclient.get_filesystem().get_file_by_path( path, callback )
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
        info['files'] = [];
        //info['announce-list'] = [['http://127.0.0.1:6969']]
        info['althash'] = arr2str(this.althash);
        var entries = this.container.items();
        for (var i=0; i<entries.length; i++) {
            entries[i].serialize_meta(info['files']);
        }
        info['piece length'] = this.piece_size;
        info['name'] = this.get_name_from_entries();
        //info['pieces'] = this.get_fake_pieces().join('');
        return info;
    },
    get_name_from_entries: function() {
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
            if (this.magnet_info.dn) {
                return 'magnet: ' + this.magnet_info.dn[0];
            } else {
                return 'magnet:' + this.hash_hex;
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

var TorrentCollection = Backbone.Collection.extend({
    localStorage: new Store('TorrentCollection'),
    model: Torrent,
    contains: function(torrent) {
        for (var i=0; i<this.models.length; i++) {
            if (torrent.hash_hex.toLowerCase() == this.models[i].hash_hex.toLowerCase()) {
                return true;
            }
        }
        return false;
    }
});

