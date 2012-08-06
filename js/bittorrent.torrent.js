var NewTorrent = Backbone.Model.extend({
    initialize: function(opts) {
        _.bindAll(this, 'process_meta_request');
        this.entry = opts.entry;
        this.piece_size = constants.std_piece_size;
        this.fake_info = this.get_fake_infodict();

        this._file_byte_accum = [];
        var b = 0;
        for (var i=0; i<this.fake_info['files'].length; i++) {
            this._file_byte_accum.push(b);
            b += this.fake_info['files'][i]['length']
        }
        this.size = b;
        this.fake_info['pieces'] = this.get_fake_pieces().join('');
        this.meta_requests = [];
        this.pieces = [];
        this.files = [];
        this.current_meta_request = null;
    },
    get_num_pieces: function() {
        return Math.ceil( this.size / this.piece_size );
    },
    register_meta_piece_requested: function(num) {
        // other end has requested a metadata piece. determine which
        // pieces this corresponds to and read them and hash them.
        var data = {'time':new Date(), 'piece':num};
        var range = this.get_pieces_range_from_metadata_request_num(num);
        data.range = range;
        this.meta_requests.push(data);
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
            return this.fake_info['piece length'];
        } else {
            if (piecenum == this.get_num_pieces() - 1) {
                return this.get_size() - this.get_piece_len() * piecenum;
            } else {
                return this.fake_info['piece length'];
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
    set_new_meta_request: function() {
        this.current_meta_request = this.meta_requests.shift();
        var start_piece = this.get_piece(this.current_meta_request.range[0]);
        var end_piece = this.get_piece(this.current_meta_request.range[1]);

        var nums = this.get_files_spanning_bytes( start_piece.start_byte,
                                                  end_piece.end_byte
                                                );
        this.current_meta_request.filenums = nums;
        this.current_meta_request.files = [];
        for (var n=nums[0]; n<nums[nums.length-1]+1; n++) {
            this.current_meta_request.files.push( this.get_file(n) );
        }
    },
    finished_a_file: function(file) {
        var result = file.hasher.finalize();
        mylog(1,'got a sha hash',ab2hex(new Uint8Array(result)));
        this.process_meta_request(); // pass in index of completed file...
    },
    process_meta_request: function() {
        if (! this.current_meta_request) {
            // determine where we need to read from...
            if (this.meta_requests) {
                this.set_new_meta_request();
            }
        }

        if (this.current_meta_request) {
            // iterate over files, seeing if they're reading
            var files = this.current_meta_request.files;
            for (var i=0; i<files.length; i++) {
                var file = files[i];
                if (! file._data && ! file._reading) {
                    file.get_data( this.current_meta_request.range, _.bind(this.finished_a_file, this) );
                    return;
                } else {
                    if (i == files.length - 1) {
                        console.log('read all files!');
                    }
                }
            }

        }
    },
    get_pieces_range_from_metadata_request_num: function(piece) {
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
        var req_b = (piece+1) * sz;

        var bytes = bencode( this.fake_info );
        var piecedata = bdecode(utf8.parse(bytes.slice(index)));
        var piecedata_a = index + piecedata.length.toString().length + 1;
        var piecedata_b = piecedata_a + this.get_num_pieces() * 20;

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
            return [start_piece, end_piece];
        } else {
            return [];
        }
    },
    get_fake_infodict: function() {
        // creates a fake infodict with emptied out pieces that will
        // help us in determining piece boundaries on requests
        var info = {};
        info['files'] = []
        this.entry.serialize_meta(info['files']);
        info['piece length'] = this.piece_size;
        info['name'] = this.entry.get_name();
        //info['pieces'] = this.get_fake_pieces().join('');
        return info;
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
