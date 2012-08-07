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
        mylog(1,'piece finished hashing');
        this.process_queue();
    },
    process_queue: function() {
        if (this.queue.length > 0 && this.pieces_computing.length == 0) {
            var item = this.queue.shift();
            if (typeof item == 'function') {
                mylog(1,'computed end of pieces chunk');
                item();
                _.defer(_.bind(this.process_queue,this));
            } else {
                var piece = item;
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

    this._data = [];
    this._requests = [];
    this._processing_request = false;

    assert(this.num < this.torrent.get_num_pieces());
    assert(this.start_byte >= 0)
    assert(this.end_byte >= 0)
}

Piece.prototype = {
    compute_hash: function(callback) {
        this.get_data(0, this.sz, _.bind(this.got_data_for_compute_hash, this, callback));
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

        for (var i=0; i<this.torrent._file_byte_accum.length-1; i++) {
            var file_range = [this.torrent._file_byte_accum[i], this.torrent._file_byte_accum[i+1]];

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
