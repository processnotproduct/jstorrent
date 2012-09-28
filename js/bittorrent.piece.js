(function() {

    function PieceHasher() {
        this.queue = []; // a mixed queue of pieces to hash and callback functions.
        // [callback, piece, piece, piece] will hash 3 pieces and then call callback...
        this.pieces_computing = [];
        this.torrent = null;
    }

    PieceHasher.prototype = {
        enqueue: function(torrent, pieces, callback) {
            this.torrent = torrent;
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
            piece.set('hashed',true);
            this.pieces_computing.shift();
            //mylog(1,'piece finished hashing');
            //piece.torrent.trigger('piece_hashed', piece);
            piece.torrent.hashed_single_piece(piece);
            piece.free();
            this.process_queue();
        },
        process_queue: function() {
            if (this.queue.length > 0 && this.pieces_computing.length == 0) {
                var item = this.queue.shift();
                if (typeof item == 'function') {
                    // mylog(1,'computed end of pieces chunk');
                    item();
                    this.torrent = null;
                    _.defer(_.bind(this.process_queue,this));
                } else {
                    var piecenum = item;
                    var piece = this.torrent.get_piece(piecenum);
                    if (piece.get('hashed')) {
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


    jstorrent.Piece = Backbone.Model.extend({
        initialize: function(opts) {
            assert(typeof opts.num == 'number');
            this.torrent = opts.torrent;
            this.num = opts.num;
            this.sz = this.torrent.get_piece_len(this.num)
            this.start_byte = this.torrent.get_piece_len() * this.num
            this.end_byte = this.start_byte + this.sz - 1
            this.set('hashed',false);
            this.set('requests_out', 0);
            this.set('responses_in', 0);

            this.set('responses_out', 0);
            this.set('requests_in', 0);

            this.set('timeouts', 0);
            //this.set('last_activity', null); // free memory when no activity..
            this.set('hashfail', 0);
            this.numchunks = Math.ceil( this.sz / constants.chunk_size );

            this._data = [];
            this._requests = [];
            this.set('current_request',null);

            this._peers_contributing = []; // peers contributing to our download

            //this._outbound_requests = []; // requests to other peers
            this._outbound_request_offsets = {}; // holds just the offset, for testing containment
            this._chunk_responses = [];

            assert(this.num < this.torrent.get_num_pieces());
            assert(this.start_byte >= 0)
            assert(this.end_byte >= 0)
        },
        try_free: function(reason) {
            // what are the possible ways a piece can be used?

            // pending inbound requests...(check)
            // 

            if (! this.get('current_request')) {
                this.free(reason);
            }
        },
        free: function(reason) {
            if (this._check_request_timeout) {
                clearTimeout(this._check_request_timeout)
            }
            mylog(LOGMASK.mem,this.num,'piece free',reason);
            assert(this.collection);
            this.collection.remove(this);
            for (var key in this) {
                delete this[key];
            }
        },
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
            for (var j=0; j<this.numchunks; j++) {
                if (this._chunk_responses[j]) {
                    i++;
                }
            }
            assert (i <= this.numchunks);
            return (i >= this.numchunks);
        },
        check_downloaded_hash: function(callback) {
            var hasher = new Digest.SHA1();
            mylog(LOGMASK.hash, 'hashing...',this.repr());
            jsclient.threadhasher.send({msg:'hashplease', chunks: this._chunk_responses}, callback);
        },
        repr: function() {
            return '<Piece '+this.num+'>';
        },
        handle_data: function(conn, offset, data) {
            mylog(LOGMASK.network, 'piece',this.num,'handle data with offset',offset);
            if (this._outbound_request_offsets[offset]) {

                delete this._outbound_request_offsets[offset];
                this._chunk_responses[Math.floor(offset/constants.chunk_size)] = data;
                this.set('responses_in', this.get('responses_in')+1);

                var complete = this.check_responses_complete();
                if (complete) {
                    mylog(LOGMASK.disk,'piece download complete',this.repr());
                    // hash check it, then write to disk

                    this.check_downloaded_hash( _.bind(function(response) {
                        var arr = response.hash;
                        var hash = new Uint8Array(arr);
                        var metahash = str2arr(this.torrent.get_infodict().pieces.slice( this.num*20, (this.num+1)*20 ))

                        for (var i=0; i<hash.length; i++) {
                            if (hash[i] != metahash[i]) {
                                mylog(LOGMASK.error,'hash mismatch!',this)
                                this.set('hashfail',this.get('hashfail')+1);
                                return
                            }
                        }
                        this.set('hashed',true);
                        if (this.torrent.collection.client.get_filesystem().unsupported) {
                            this.torrent.notify_have_piece(this);
                        } else {
                        //mylog(1,'downloaded piece hash match!')
                            this.write_data_to_filesystem();
                        }

                    },this));

                }
                return true;
            } else {
                mylog(1, "didn't ask for this piece!", this.num,offset)
                return false;
                //debugger; // didn't ask for this data!
            }
        },
        cleanup: function(reason) {
            mylog(LOGMASK.mem,this.num,'piece cleanup',reason);
            //this.torrent = null;
            this._data = [];
            this._requests = [];
            this.set('current_request',null);
            this._peers_contributing = []; 
            this._outbound_request_offsets = {};
            this._chunk_responses = [];
        },
        wrote_but_not_stored: function() {
            return this.torrent.piece_wrote_but_not_stored(this.num);
        },
        complete: function() {
            return this.torrent.piece_complete(this.num);
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
        create_chunk_requests: function(conn, num) {
            // piecenum, offset, sz
            var requests = [];
            for (var i=0; i<this.numchunks; i++) {
                if (! this._outbound_request_offsets[i*constants.chunk_size]
                    && ! this._chunk_responses[i]
                   ) {
                    var offset = constants.chunk_size * i;
                    if (offset + constants.chunk_size >= this.sz) {
                        var sz = this.sz - offset;
                    } else {
                        var sz = constants.chunk_size;
                    }

                    var data = [this.num, offset, sz];
                    this._outbound_request_offsets[offset] = data;
                    this.set('requests_out', this.get('requests_out')+1);
                    requests.push(data);
                    if (requests.length >= num) {
                        break;
                    }
                }
            }
            // set timeouts for all these requests
            assert(requests.length > 0);
            this._check_request_timeout = setTimeout( _.bind(this.check_chunk_request_timeouts, this, conn, requests), this.torrent._chunk_request_timeout );
            return requests;
        },
        check_chunk_request_timeouts: function(conn, requests) {
            if (! this.collection) { mylog(LOGMASK.error,'check timeout on piece that was freed'); return; } // piece was "freed"
            for (var i=0; i<requests.length; i++) {
                var offset = requests[i][1];
                if (this._outbound_request_offsets[offset]) {
                    if (conn._connected) {
                        this.set('timeouts', this.get('timeouts')+1);
                        conn.set('timeouts', conn.get('timeouts')+1);
                        conn.do_send_cancel(this._outbound_request_offsets[offset]);
                        conn.adjust_chunk_queue_size();
                        conn._outbound_chunk_requests--;
                    }
                    mylog(LOGMASK.queue,'timing out piece w offset',this.num, offset);
                    delete this._outbound_request_offsets[offset];
                }
            }
        },
        got_data_for_compute_hash: function(callback, piece, request, responses) {
            // todo -- make work on multiple threads better
            jsclient.threadhasher.send({msg:'hashplease', chunks: responses}, _.bind(function(result) {
                assert(result.hash);
                this.cleanup(); // don't need the actual piece data anymore
                this.hash = result.hash;
                this.set('hashed',true); // used in DND case?
                //mylog(LOGMASK.hash, 'hashed a piece');
                callback();
            },this));
        },
        skipped: function() {
            var file_info = this.get_file_info(0, this.sz);
            var skip = true;
            for (var i=0; i<file_info.length; i++) {
                var file = this.torrent.get_file(file_info[i].filenum);
                if (! file.skipped()) {
                    skip = false;
                    break;
                }
            }
            return skip;
        },
        get_file_info: function(offset, size) {
            // returns file objects + offsets needed to serially read from them
            var info = [];
            var my_range = [ this.start_byte + offset, this.start_byte + offset + size - 1]; // ranges are endpoint-inclusive, so subtract one!

            for (var i=0; i<this.torrent._file_byte_accum.length; i++) {

                if (i == this.torrent._file_byte_accum.length - 1) {
                    var high_byte = this.torrent.get_size() - 1;
                } else {
                    var high_byte = this.torrent._file_byte_accum[i+1] - 1;
                }
                assert(high_byte);
                // ASSERT high byte does not pass file boundary

                var file_range = [this.torrent._file_byte_accum[i], high_byte];

                // TODO speed this up using binary search and terminate once no more intersections found
                var intersection = intersect( file_range, my_range );
                if (intersection) {
                    //assert(intersection[1] < this.torrent.get_size());
                    info.push( {filenum:i, filerange:intersection} );
                }
            }
            return info
        },
        get_data: function(offset, size, callback) {
            // gives data needed to service piece requests
            var file_info = this.get_file_info(offset, size);
            assert(file_info.length > 0);
            var request = {'piece':this.num, 'original':[offset,size],'info':file_info,'callback':callback};
            this._requests.push(request);
            this.process_requests();
        },
        got_file_data: function(file, data, payload) {
            var request = this.get('current_request');
            data.response = payload;
            this.continue_processing();
        },
        continue_processing: function() {
            var request = this.get('current_request');
            var data;
            var found_unread = false;
            for (var i=0; i<request.info.length; i++) {
                // look for more file data to read...
                data = request.info[i];
                if (! data.response) {
                    found_unread = true;
                    break;
                }
            }
            if (found_unread) {
                var file = this.torrent.get_file(data.filenum);
                file.get_data( _.bind(this.got_file_data, this, file, data),
                               data.filerange );
            } else {
                var callback = request['callback'];
                // should we format out the responses?
                var responses = [];
                for (var i=0; i<request.info.length; i++) {
                    responses.push( request.info[i].response );
                }
                callback(this, request, responses);
                this.set('current_request', null)
                var piece = this.torrent.get_piece(request.piece);
                if (this._requests.length > 0) {
                    this.process_requests();
                }
            }
        },
        process_requests: function() {
            if (this.get('current_request')) {
                //mylog(,'already processing request');
            } else if (this._requests.length > 0) {
                var request = this._requests.pop();
                this.set('current_request', request);
                this.continue_processing();
            }
        }
    });
    jstorrent.PieceCollection = jstorrent.Collection.extend({
        //getFormatter: function(col) { debugger; },
        model: jstorrent.Piece,
        className: 'PieceCollection'
    });


})();
