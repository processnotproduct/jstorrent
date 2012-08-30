var NewTorrent = Backbone.Model.extend({
    initialize: function(opts) {
        _.bindAll(this, 'process_meta_request', 'handle_new_peer');
        this.connections = [];
        this.pieces = [];
        this.files = [];

        if (opts.metadata) {
            // initialize a torrent from torrent metadata
            this.metadata = opts.metadata;
            this.piece_size = opts.metadata['info']['piece length'];
            var hasher = new Digest.SHA1();
            hasher.update( new Uint8Array(bencode(this.metadata['info'])) );
            this.hash = new Uint8Array(hasher.finalize());
            this.hash_hex = ab2hex(this.hash);
            mylog(1,'new torrent with hash',this.hash_hex);

        } else {

            this.container = opts.container;
            this.althash = opts.althash;
            this.piece_size = constants.new_torrent_piece_size;
            this.fake_info = this.get_fake_infodict();
            mylog(1,'created fake infodict',this.fake_info);
            this.real_info = {'pieces':[]};
        }


        this._file_byte_accum = [];
        var b = 0;
        for (var i=0; i<this.get_infodict()['files'].length; i++) {
            this._file_byte_accum.push(b);
            b += this.get_infodict()['files'][i]['length']
        }
        this.size = b;

        if (! this.metadata) {
            this.fake_info['pieces'] = this.get_fake_pieces().join('');
            this.bitmask = this.create_bitmask({full:true});
        } else {
            this.bitmask = this.create_bitmask({empty:true});
        }

        this.meta_requests = [];
        this.num_pieces = this.get_num_pieces();
        this._processing_meta_request = false;
    },
    get_infodict: function() {
        return this.metadata ? this.metadata['info'] : this.fake_info;
    },
    announce: function() {
        this.tracker = new TrackerConnection('http://192.168.56.1:6969/announce', this.hash_hex);
        this.tracker.bind('newpeer', this.handle_new_peer);
        this.tracker.announce()
    },
    handle_new_peer: function(data) {
        if (data.port && data.port > 0) {
            new WSPeerConnection({host:data.ip, port:data.port, hash:this.hash, torrent:this});
        }
    },
    get_num_pieces: function() {
        return Math.ceil( this.size / this.piece_size );
    },
    register_meta_piece_requested: function(num, callback) {
        // other end has requested a metadata piece. determine which
        // pieces this corresponds to and read them and hash them.
        var data = {'time':new Date(), 'metapiece':num, 'callback': callback};
        var piece_range = this.get_pieces_range_from_metadata_request_num(num);
        mylog(1,'register meta piece requested',num,data);
        data.piece_range = piece_range;
        this.meta_requests.push(data); // perhaps before inserting check that we don't have redundant piece ranges in meta_requests ?
        this.process_meta_request();
    },
    get_file: function(n) {
        if (this.files[n]) {
            return this.files[n]
        } else {
            var file = new File(this, n);
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
        return this.bitmask;
    },
    create_bitmask: function(opts) {
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
    get_by_path: function(spath) {
        var path = _.clone(spath); // don't accidentally modify our argument
        var entries = this.container.items();
        for (var i=0; i<entries.length; i++) {
            if (entries[i].entry.isDirectory) {
                if (entries[i].entry.name == path[0]) {
                    path.shift();
                    var item = entries[i].get_by_path(path);
                    if (item) {
                        return item;
                    }
                }
            } else {
                if (path.length == 1) {
                    if (path[0] == entries[i].entry.name) {
                        return entries[i];
                    }
                } else {
                    // does not apply...
                }
            }
        }
    },
    get_metadata_piece: function(metapiecenum, request) {
        var sz = constants.metadata_request_piece_size; // metadata requests 
        var index = null;
        bencode( this.fake_info, function(stack, r) {
            if (stack && stack[0] == "pieces") {
                index = r.length;
            }
        });
        var bytes = bencode( this.fake_info); 
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
