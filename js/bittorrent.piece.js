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
    assert(this.num < this.torrent.get_num_pieces());
    assert(this.start_byte >= 0)
    assert(this.end_byte >= 0)
}

Piece.prototype = {
    get_data: function(callback) {
        debugger;
    },
    compute_hash: function(callback) {
        // get files && offsets spanning these files.
        this.hasher = new Digest.SHA1();
        this._compute_hash_callback = callback;
        this._file_info = this.get_file_info(0, this.sz);
        assert(this._file_info.length > 0);
        this.compute_new_file();
    },
    compute_file_complete: function(file) {
        //mylog(1,'compute file complete');
        for (var i=0; i<file._data.length; i++) {
            this.hasher.update( file._data[i] );
        }
        this.compute_new_file(file);
    },
    compute_new_file: function() {
        var file_info = this._file_info.shift();
        if (file_info) {
            var file = this.torrent.get_file(file_info[0]);
            file.get_data( _.bind(this.compute_file_complete, this, file), file_info[1] );
        } else {
            var callback = this._compute_hash_callback;
            this.hash = this.hasher.finalize();
            this.hashed = true;
            this._compute_hash_callback = null;
            callback();
        }
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
    
    get_data_from_file: function(fileno) {
        // returns the data in this piece that intersects a specific file
    },
    get_data: function() {
        // reads through all the files in this piece and hashes it

        // can get data from FileReader is faster than we can hash it...

        // request large blocks from FileReader, (prepare up to say 8 pieces at once)
        // hash them independently inside webworker threads.
    },
};
