function PieceHasher() {
    this.queue = []; // a mixed queue of pieces to hash and callback functions.
    // [callback, piece, piece, piece] will hash 3 pieces and then call callback...
    this.pieces_computing = [];
}

PieceHasher.prototype = {
    enqueue: function(pieces, callback) {
        // throw a bunch of items on the queue
        for (var i=0;i<pieces.length; i++) {
            var piece = pieces[i];
            this.queue.push(pieces[i]);
        }
        this.queue.push(callback);
        this.process_queue()
    },
    piece_computed: function(piece) {
        // want to send HAVE to all connections...
        this.pieces_computing.shift();
        //mylog(1,'piece finished hashing');
        piece.torrent.trigger('piece_hashed', piece);
        this.process_queue();
    },
    process_queue: function() {
        if (this.queue.length > 0 && this.pieces_computing.length == 0) {
            var item = this.queue.shift();
            var piece = item;
            if (typeof item == 'function') {
                // mylog(1,'computed end of pieces chunk');
                item();
                _.defer(_.bind(this.process_queue,this));
            } else {
                if (piece.hashed) {
                    // this piece has already been hashed, skip to the next piece
                    this.process_queue();
                } else {
                    // this.pieces_computing.push( piece.file_info );
                    this.pieces_computing.push( piece );
                    piece.compute_hash( _.bind(this.piece_computed, this, piece) );
                    // gets array of file numbers and byte offsets
                }
            }
        }
    }
};

window.piecehasher = new PieceHasher;


function Piece(torrent, num) {
    assert(typeof num == 'number');
    this.torrent = torrent;
    this.num = num;
    this.sz = this.torrent.get_piece_len(this.num)
    this.start_byte = this.torrent.get_piece_len() * this.num
    this.end_byte = this.start_byte + this.sz - 1
    this.hashed = false;
    this.numchunks = Math.ceil( this.sz / constants.chunk_size );

    this._data = [];
    this._requests = [];
    this._processing_request = false;

    this._peers_contributing = []; // peers contributing to our download

    //this._outbound_requests = []; // requests to other peers
    this._outbound_request_offsets = {}; // holds just the offset, for testing containment
    this._chunk_responses = [];

    assert(this.num < this.torrent.get_num_pieces());
    assert(this.start_byte >= 0)
    assert(this.end_byte >= 0)
}

Piece.prototype = {
    compute_hash: function(callback) {
        this.get_data(0, this.sz, _.bind(this.got_data_for_compute_hash, this, callback));
    },
    all_chunks_requested: function() {
        // returns whether all chunks have outbound requests right now
        // todo -- keep track of this instead of counting
        var i=0;
        for (var k in this._outbound_request_offsets) {
            i++;
        }
        return (i == this.numchunks);
    },
    check_downloaded_hash: function() {
        var hasher = new Digest.SHA1();
        for (var i=0; i<this._chunk_responses.length; i++) {
            hasher.update( this._chunk_responses[i] );
        }
        var hash = hasher.finalize();
        return hash;
    },
    handle_data: function(conn, offset, data) {
        //mylog(1, 'piece',this.num,'handle data with offset',offset);
        if (this._outbound_request_offsets[offset]) {
            this._chunk_responses[offset] = data;
            var complete = this.check_responses_complete();
            if (complete) {
                // hash check it, then write to disk

                var hash = new Uint8Array(this.check_downloaded_hash());
                var metahash = str2arr(this.torrent.get_infodict().pieces.slice( this.num*20, (this.num+1)*20 ))
                
                for (var i=0; i<hash.length; i++) {
                    if (hash[i] != metahash[i]) {
                        mylog(1,'hash mismatch!')
                        debugger;
                    }
                }

                //mylog(1,'downloaded piece hash match!')
                this.torrent.notify_have_piece(this);
                this.write_data_to_filesystem();
            }
        } else {
            debugger; // didn't ask for this data!
        }
    },
    write_data_to_filesystem: function() {
        this.torrent.write_data_from_piece(this);
    },
    check_responses_complete: function() {
        for (var i=0; i<this.numchunks; i++) {
            if (! this._chunk_responses[i]) {
                return false;
            }
        }
        return true;
    },
    create_chunk_requests: function(num) {
        // piecenum, offset, sz
        var requests = [];
        for (var i=0; i<this.numchunks; i++) {
            if (! this._outbound_request_offsets[i]) {
                var offset = constants.chunk_size * i;
                if (offset + constants.chunk_size >= this.sz) {
                    var sz = this.sz - offset;
                } else {
                    var sz = constants.chunk_sz;
                }

                var data = [this.num, offset, sz];
                this._outbound_request_offsets[offset] = true;
                requests.push(data);
                if (requests.length >= num) {
                    break;
                }
            }
        }
        return requests;
    },
    got_data_for_compute_hash: function(callback, piece, request, responses) {
        var hasher = new Digest.SHA1();
        for (var i=0; i<responses.length; i++) {
            hasher.update( responses[i] );
        }
        this.hash = hasher.finalize();
        this.hashed = true;
        callback();
    },
    get_file_info: function(offset, size) {
        // returns file objects + offsets needed to serially read from them
        var info = [];
        var my_range = [ this.start_byte + offset, this.start_byte + offset + size ];

        for (var i=0; i<this.torrent._file_byte_accum.length; i++) {

            if (i == this.torrent._file_byte_accum.length - 1) {
                var high_byte = this.torrent.get_size();
            } else {
                var high_byte = this.torrent._file_byte_accum[i+1];
            }
            assert(high_byte);

            var file_range = [this.torrent._file_byte_accum[i], high_byte];

            // TODO speed this up using binary search and terminate once no more intersections found
            var intersection = intersect( file_range, my_range );
            if (intersection) {
                info.push( [i, intersection] );
            }
        }
        return info
    },
    get_data: function(offset, size, callback) {
        // gives data needed to service piece requests
        var file_info = this.get_file_info(offset, size);
        assert(file_info.length > 0);
        this._requests.push({'original':[offset,size],'info':file_info,'callback':callback});
        this.process_requests();
    },
    got_file_data: function(request, file, data, payload) {
        //file._cache[JSON.stringify(data[1])] = 
        data.response = payload;
        //request.results.push( payload );
        this.process_requests();
    },
    process_requests: function() {
        if (this._processing_request) {
            return;
        } else {
            if (this._requests.length > 0) {
                var request = this._requests[ this._requests.length - 1 ];

                var found = null;

                for (var i=0; i<request.info.length; i++) {
                    var data = request.info[i];
                    if (! data.response) {
                        found = data;
                        break;
                    }
                }
                if (found) {
                    var file = this.torrent.get_file(data[0]);
                    file.get_data( _.bind(this.got_file_data, this, request, file, data),
                                   data[1] );
                } else {
                    var callback = request['callback'];
                    // should we format out the responses?
                    var responses = [];
                    for (var i=0; i<request.info.length; i++) {
                        responses.push( request.info[i].response );
                    }
                    callback(this, request, responses);
                }
            }
        }
    }
};
