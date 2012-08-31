function TorrentFile(torrent, num) {
    this.torrent = torrent;
    this.num = num;
    this.size = this.get_size();
    this.start_byte = this.torrent._file_byte_accum[this.num];
    this.end_byte = this.start_byte + this.size - 1;
    this._data = null;
    this._reading = false;
    this.info = this.get_info();
    this._cache = {};
    this.filesystem_entry = null;

    this._read_queue = [];
    this._processing_read_queue = false;
    this._write_queue = [];

    this.read_callback = null;
}

TorrentFile.prototype = {
    get_data_from_piece: function(piecenum) {
        // returns the file data that intersects a specific piece
    },
    get_data: function(callback, byte_range) {
        // check if it's in the cache...
        this._read_queue.push({'callback':callback,'byte_range':byte_range});
        this.process_read_data_queue();
    },
    get_path: function() {
        var path = [];
        if (this.torrent.is_multifile()) {
            path.push( this.torrent.get_infodict().name );
            var filepaths = this.get_info().path;
            for (var i=0; i<filepaths.length; i++ ) {
                path.push(filepaths[i]);
            }
            return path;
        } else {
            return this.get_info().path;
        }
    },
    get_filesystem_entry: function(callback) {
        if (this.filesystem_entry) {
            callback(this.filesystem_entry);
        } else {
            jsclient.get_filesystem().get_file_by_path(this.get_path(), _.bind(function(file) {
                this.filesystem_entry = file;
                callback(file);
            },this));
        }
    },
    write_piece_data: function(piece, byte_range) {
        // TODO -- handle filesystem errors.
        this._write_queue.push( [piece, byte_range] );
        this.process_write_queue();
    },
    process_write_queue: function() {
        if (! this._write_queue_active ){
            if (this._write_queue.length > 0) {
                var item = this._write_queue.shift(1);
                this._write_queue_active = true;
                var piece = item[0];
                var byte_range = item[1];
                // writes piece's data. byte_range is relative to this file.
                var _this = this;
                this.get_filesystem_entry( function(entry) {

                    entry.getMetadata( function(metadata) {
                        entry.createWriter( function(writer) {
                            _this.handle_write_piece_data(piece, entry, metadata, writer, byte_range);
                        });
                    });

                });
            }
        }
    },
    handle_write_piece_data: function(piece, entry, file_metadata, writer, file_byte_range) {
        // write the data, when done process the queue
        var _this = this;
        writer.onerror = function(evt) {
            debugger;
        }

        if (file_byte_range[0] < file_metadata.size) {
            // need first to pad beginning of the file with null bytes
            this._write_queue = [ [piece, file_byte_range] ].concat( this._write_queue ); // put this job back onto the write queue.
            writer.seek( file_metadata.size );
            writer.onwrite = function(evt) {
                _this._write_queue_active = false;
                _this.process_write_queue();
            }
            var zeroes = new Uint8Array( file_metadata.size - file_byte_range[0] );
            writer.write( new Blob([zeroes]) );
        } else {

            var i = 0;
            
            function write_next(evt) {
                if (i == piece.numchunks) {
                    mylog(1,'write all chunks',piece);
                    _this._write_queue_active = false;
                    _this.process_write_queue();
                    return;
                }
                var chunk = piece._chunk_responses[i];
                var chunk_a = piece.start_byte + constants.chunk_size * i;
                var chunk_b = chunk_a + constants.chunk_size;

                var file_a = _this.start_byte;
                var file_b = _this.end_byte;

                /*

                        |--------------------------|  piece

                        |---------|---------|------|  piece chunks

                        -----|----------------|----|  files


                 */

                // need to intersect...

                var intersection = intersect([chunk_a,chunk_b],[file_a,file_b])

                var data = new Uint8Array(chunk.buffer,
                                          chunk.byteOffset + (intersection[0] - chunk_a),
                                          intersection[1] - intersection[0] + 1);
                if (chunk_a > file_a) {
                    writer.seek( chunk_a - file_a ); // seek into the file a little
                }
                mylog(1,'piece',piece.num,'write chunk',i);
                writer.write( new Blob([data]) );
                i++;
            }

            writer.onwrite = write_next;
            write_next();

        }

    },
    process_read_data_queue: function() {
        if (this._processing_read_queue) {
            return;
        } else {
            if (this._read_queue.length > 0) {
                this._processing_read_queue = true;
                var item = this._read_queue.shift();
                var dndfile = this.torrent.get_by_path(this.info.path);
                assert(dndfile);
                var filereader = new FileReader(); // todo - re-use and seek!
                filereader.onload = _.bind(this.got_queue_data, this, item);
                var byte_range = item.byte_range;
                var offset = byte_range[0] - this.start_byte;
                var bytesRemaining = byte_range[1] - byte_range[0];
                assert(bytesRemaining > 0);
                var blob = dndfile.file.slice(offset, offset + bytesRemaining);
                //item.slice = [offset, bytesRemaining];
                //mylog(1,'reading blob',offset,bytesRemaining);
                filereader.readAsArrayBuffer(blob);
            }
        }
    },
    got_queue_data: function(item, evt) {
        this._processing_read_queue = false;
        var binary = evt.target.result;
        assert(binary.byteLength == (item.byte_range[1] - item.byte_range[0]));
        var callback = item.callback;
        callback(binary);
        this.process_read_data_queue();
    },
/*
    read_data_old: function(callback, byte_range) {
        // enqueue if already reading...
        assert(!this._reading);
        this._reading = true;
        this.dndfile = this.torrent.get_by_path(this.info.path);
        this.filereader = new FileReader();
        this.read_callback = callback;
        this.filereader.onload = _.bind(this.got_data, this, byte_range);
        // start reading
        //this.hasher = new Digest.SHA1();
        this._data = [];
        this.readBufferSize = Math.pow(2,14);

        if (byte_range) {
            //mylog(1, 'read data w byte range',byte_range);
            this.read_byte_range = byte_range
            // relative to torrent bytes
            this.offset = byte_range[0] - this.start_byte;
            this.bytesRemaining = byte_range[1] - byte_range[0];
        } else {
            this.offset = 0; // need to go to a piece offset !!!! tricky....
            this.bytesRemaining = this.size;
        }
        this.read_some();
    },
*/
    read_some: function() {
        if (this.read_byte_range) {
            var readmax = Math.min(this.read_byte_range[1], this.offset + this.readBufferSize);
        } else {
            var readmax = this.offset + this.readBufferSize; // bother explicitly limiting to file boundary?
        }
        var blob = this.dndfile.file.slice(this.offset,readmax);
        this.filereader.readAsArrayBuffer(blob);
    },
    got_data: function(range, evt) {
        var binary = evt.target.result;
        if (binary.byteLength == 0) {
            assert(false, 'should not have tried to read, bytesRemaining computation bad');
            this.got_all_data();
        } else {
            this.bytesRemaining -= binary.byteLength;
            //this.hasher.update(binary);
            this._data.push(binary);
            this._cache[JSON.stringify(range)] = binary;
            //mylog(1,'read some more data',this.get_name(),binary.byteLength);
            this.offset += this.readBufferSize;
            if (this.bytesRemaining > 0) {
                this.read_some();
            } else {
                this.got_all_data();
            }
        }
    },
    got_all_data: function() {
        this._reading = false;
        var callback = this.read_callback;
        this.read_callback = null;
        callback(this);
    },
    get_name: function() {
        return this.info.path[this.info.path.length-1];
    },
    get_size: function() {
        if (this.torrent.is_multifile()) {
            return this.torrent.get_infodict()['files'][this.num]['length'];
        } else {
            return this.torrent.get_size();
        }
    },
    get_info: function() {
        if (this.torrent.is_multifile()) {
            return this.torrent.get_infodict()['files'][this.num];
        } else {
            return {length: this.get_size(),
                    path: [this.torrent.get_infodict().name]};
        }
    },
};
