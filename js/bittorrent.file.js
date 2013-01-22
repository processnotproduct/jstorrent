(function() {
    TorrentFile = Backbone.Model.extend({
        initialize: function(opts) {
            this.torrent = opts.torrent;
            this.num = opts.num;
            this.size = this.get_size();
            this.start_byte = this.torrent._file_byte_accum[this.num];
            this.end_byte = this.start_byte + this.size - 1;
            this._data = null;
            this._reading = false;
            this._stream_metadata_pieces = {};
            this.info = this.get_info();
            this._cache = {};
            this.filesystem_entry = null;
            this.piece_bounds = this.get_piece_boundaries();
            assert( this.get_complete_array().length == this.get_num_pieces() )
            this._read_queue = [];
            this._processing_read_queue = false;
            //this._write_queue = [];
            this.read_callback = null;
            this.set('name',this.get_name());
            this.set('size',this.get_size());
            this.set('path',this.get_path());
            this.set('pieces',this.get_num_pieces());
            this.set('first_piece',Math.floor(this.start_byte / this.torrent.piece_size));
            this.on('change:priority', function(m,v) {
                this.torrent.set_file_priority(m.num, v);
            });
        },
        get_bytes_for_seek_percent: function(frac) {
            var mp4file = this.get('mp4file');
            var mp4time = mp4file.getTotalTimeInSeconds();
            var seektime = mp4time * frac;
            var data = mp4file.getFileBytesForTimeInSeconds(seektime)
            //mylog(1,'seek, need bytes', data.join(', '));
            return data;
        },
        get_data_url: function() {
            //'data:application/octet-stream;base64,' + b64encoded
        },
        get_piece_boundaries: function() {
            var idx = Math.floor(this.start_byte / this.torrent.piece_size)
            var idx2 = Math.ceil(this.end_byte / this.torrent.piece_size) - 1; // inclusive
            return [idx, idx2];
        },
        get_num_pieces: function() {
            var bounds = this.get_piece_boundaries()
            return bounds[1] - bounds[0] + 1;
        },
        set_pieces_zero: function() {
            var idx = Math.floor(this.start_byte / this.torrent.piece_size);
            while (idx < this.torrent.num_pieces) {
                var piecedims = this.torrent.get_piece_dims(idx);
                if (intersect( piecedims, [this.start_byte, this.end_byte] )) {
                    this.torrent.set_piece_complete(idx,0);
                } else {
                    break;
                }
                idx++;
            }
            this.torrent.save();
        },
        get_complete_array: function() {
            var arr = [];
            var idx = Math.floor(this.start_byte / this.torrent.piece_size);
            //var idx = bisect_left( this.torrent._file_byte_accum, this.start_byte );
            var c = 0;
            var t = 0;
            while (idx < this.torrent.num_pieces) {
                var piecedims = this.torrent.get_piece_dims(idx);
                var inter = intersect( piecedims, [this.start_byte, this.end_byte] );
                if (inter) {
                    if (this.torrent.piece_complete(idx) || (! this.skipped() && this.torrent.piece_wrote_but_not_stored(idx))) {
                        arr.push(1);
                    } else {
                        arr.push(0);
                    }
                    t++;
                } else {
                    break;
                }
                idx++;
            }
            return arr;
        },
        get_percent_complete: function() {
            // returns piece range that this file intersects
            var idx = Math.floor(this.start_byte / this.torrent.piece_size);
            //var idx = bisect_left( this.torrent._file_byte_accum, this.start_byte );
            var c = 0;
            var t = 0;
            while (idx < this.torrent.num_pieces) {
                var piecedims = this.torrent.get_piece_dims(idx);

                if (intersect( piecedims, [this.start_byte, this.end_byte] )) {
                    if (this.torrent.piece_complete(idx) || (! this.skipped() && this.torrent.piece_wrote_but_not_stored(idx))) {
                        c++;
                    }
                    t++;
                } else {
                    break;
                }
                idx++;
            }
            var pct = c/t;
            return pct;
        },
        complete_array_to_own_bytes: function(idx1, idx2) {
            var startpiece = Math.floor(this.start_byte / this.torrent.piece_size);
            var pieceadims = this.torrent.get_piece_dims(startpiece+idx1);
            var piecebdims = this.torrent.get_piece_dims(startpiece+idx2);
            var piecea = this.torrent.get_piece(startpiece+idx1);
            var pieceb = this.torrent.get_piece(startpiece+idx2);
            assert(piecea.start_byte == pieceadims[0]);
            assert(pieceb.start_byte == piecebdims[0]);
            var relstart = Math.max(pieceadims[0] - this.start_byte, 0);
            var relend = Math.min(piecebdims[1] - this.start_byte, this.end_byte);
            return [relstart, relend];
        },
        get_complete_ranges: function() {
            // returns array of byte-ranges for which this file has complete (hashed) data
            var complete_arr = this.get_complete_array();
            var debug_ranges = [];
            var ranges = [];
            var a = 0;
            var b = 0;
            var newrange = false;
            while (true) {
                if (a >= complete_arr.length) {
                    break;
                }
                if (b+1 == complete_arr.length) {
                    debug_ranges.push([a,b])
                    if (newrange) {
                        ranges.push( this.complete_array_to_own_bytes(a,b) )
                    }
                    break;
                }

                if (complete_arr[a]) {
                    newrange = true;
                }

                if (! complete_arr[a]) {
                    a++;
                    b++;
                } else if (! complete_arr[b+1] && newrange) {
                    // end of segment
                    debug_ranges.push([a,b])
                    ranges.push( this.complete_array_to_own_bytes(a,b) )
                    newrange = false;
                    a = b+2;
                    b = b+2;
                } else {
                    b++;
                }
            }
            if (config.unit_tests && this.complete()) {
                assert( ranges.length == 1 && ranges[0][1] == this.size-1 );
            }
            return ranges;
        },
        stream_parseable_type: function() {
            var parts = this.get_name().split('.');
            if (parts.length > 1) {
                var ext = parts[parts.length-1].toLowerCase()
                return _.contains(['mp4','mp3','3gp'], ext);
            }
        },
        try_parse_stream_metadata: function(piecenum, piece) {
            if (! this.stream_parseable_type()) {
                return;
            }
            if (! this.torrent.has_proxy_stream()) return; // TODO -- && specific to this file
            if (! this.get('parsed_stream_metadata')) {
                var mybounds = this.get_piece_boundaries();
                // check if the new piece "fills in" from the outside edges of the file (left or right)
                var newedgeright = true;
                var newedgeleft = true;
                var newedge = false;
                if (piecenum == mybounds[0] || piecenum == mybounds[1]) {
                    newedge = true;
                }

                var i = piecenum+1
                while (i < mybounds[1]) {
                    if (! this.torrent.piece_complete(i)) {
                        newedgeright = false;
                        break;
                    }
                    i++;
                }
                i = piecenum-1;
                while (i > mybounds[0]) {
                    if (! this.torrent.piece_complete(i)) {
                        newedgeleft = false;
                        break;
                    }
                    i--;
                }
                var is_edge = newedge | newedgeleft | newedgeright;
                
                //this._stream_metadata_pieces[piecenum] = piece._chunk_responses;
                //new PieceBytestream(this._stream_metadata_pieces);
                if (is_edge) {
                    this.parse_stream();
                }
            }
        },
        parse_stream: function() {
            if (this._stream_parsing) {
                return
            }
            var client = this.torrent.collection.client;
            var parser = client.get_streamparser();
            var ranges = this.get_complete_ranges();
            // TODO -- when file has a bunch of data or is complete, try parsing from outside, not the whole file...

            mylog(1,'parse stream, ranges',ranges);
            if (ranges.length == 0) {
                return
            }
            var storage_area = this.torrent.get_storage_area()
/*
            this.get_filesystem_entry( function(entry) {
                entry.file( function(file) {
                    var stream = new Bytestream(file)
                    debugger;
                });
            });
*/
            this._stream_parsing = true;
            parser.parse( this, storage_area, this.get_path().join('/'), ranges, _.bind(function(res) {
                this._stream_parsing = false;
                if (res && res.error) {
                    if (res.error == 'unable to parse this type') {
                        this.set('unsupported_stream', res.error);
                    } else {
                        mylog(LOGMASK.error,'error in stream parser',res);
                    }
                } else if (res.file.error) {
                    mylog(1,'metadata not yet parsed',res);
                    if (res.file.error_msg == 'no data' && res.file.error_pos) {
                        //mylog(1,'need to download piece >=',res.file.error_pos / this.torrent.piece_size)
                        // prioritize pieces starting from this pos...
                        
                    }
                } else {
                    mylog(1,'metadata parsed',res);
                    this.set('parsed_stream_metadata', res)
                    var tracks = {};
                    if (res.file.moov && res.file.moov.trak) {
                        for (var i=0; i<res.file.moov.trak.length; i++) {
                            var box = res.file.moov.trak[i];
                            var track = new MP4Track(res.file, box);
                            tracks[box.tkhd.trackId] = track;
                            //track.foo();
                        }
                        var mp4file = new MP4Reader();
                        mp4file.tracks = tracks;
                        mp4file.file = res.file;
                        this.set('mp4file', mp4file);
                    }
                    //this.set('tracks', tracks);
                }
            },this) );
        },
        complete: function() {
            return this.get_percent_complete() == 1;
        },
        on_download_complete: function() {
            var _this = this;
            this.get_filesystem_entry( function(entry) {
                // check size matches metadata!
                entry.getMetadata( function(metadata) {
                    assert(entry);
                    assert( metadata.size == _this.get_size() );
                });
            });
        },
        repr: function() {
            return this.info.path.join('/');
        },
        remove_from_disk: function(callback) {
            this.torrent.set('first_incomplete',null);
            this.get_filesystem_entry( function(entry) {
                if (entry.error) {
                    mylog(LOGMASK.error, 'unable to remove file (error)',entry);
                    if (callback) callback(entry);
                } else {
                    entry.remove( function() {
                        mylog(1,'removed from disk!')
                        if (callback) callback();
                    });
                }
            });
        },
        open: function() {
            this.get_filesystem_entry( function(entry) {
                window.open( entry.toURL() );
            }, {create:false});
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
        remove: function(callback) {
            // removes file and updates torrent pieces
            this.get_filesystem_entry( _.bind(function(entry) {
                this.set_pieces_zero();
                function onremove(res) {
                    callback({removed:true,onremove:res});
                }
                if (entry.error) {
                    callback({removed:true,info:'already removed'});
                } else {
                    entry.remove( onremove )
                }
            },this), {create:false});
        },
        get_loading_state: function() {
            var d = {
                received: this.torrent.bytecounters.received.total(),
                sent: this.torrent.bytecounters.sent.total()
                
            }
            return JSON.stringify( d );
        },
        get_filesystem_entry: function(callback, opts) {
            if (this.filesystem_entry) {
                callback(this.filesystem_entry);
            } else {
                this.collection.client.get_filesystem().get_file_by_path(this.get_path(), _.bind(function(file) {
                    if (file.error) {
                        callback(file);
                        return;
                        //debugger;
                    } else {
                        this.filesystem_entry = file;
                    }
                    callback(file);
                },this), this.torrent.get_storage_area(), opts);
            }
        },
        skipped: function() {
            return this.torrent.is_file_skipped(this.num);
        },
        write_piece_data: function(piece, byte_range) {
            // TODO -- handle filesystem errors.
            TorrentFile._write_queue.push( [piece, byte_range, this] );
            TorrentFile.process_write_queue();
        },
        fs_error: function(evt) {
            TorrentFile._write_queue_action = -1;
            debugger;
        },
        get_data: function(callback, byte_range) {
            // check if it's in the cache...
            // assert byte range matches file!
            assert( intersect( byte_range, [this.start_byte, this.end_byte] ) );

            this._read_queue.push({'callback':callback,'byte_range':byte_range});
            this.process_read_data_queue();
        },
        process_read_data_queue: function() {
            var _this = this;
            if (this._processing_read_queue) {
                return;
            } else {
                if (this._read_queue.length > 0) {
                    this._processing_read_queue = true;
                    var item = this._read_queue.shift();
                    this.torrent.get_by_path(this.info.path, _.bind(function(dndfile) {
                        // XXX -- maybe check file metadata make sure the file is large enough!
                        assert(dndfile);
                        var filereader = new FileReader(); // todo - re-use and seek!
                        
                        var byte_range = item.byte_range;
                        var offset = byte_range[0] - this.start_byte;
                        assert(offset >= 0);
                        var bytesRemaining = byte_range[1] - byte_range[0] + 1;
                        assert(bytesRemaining > 0);

                        function on_file(file) {
                            var blob = file.slice(offset, offset + bytesRemaining);
                            assert( offset + bytesRemaining <= _this.get_size() )
                            assert( offset + bytesRemaining <= file.size )
                            mylog(LOGMASK.disk,'reading blob from',_this,_this.repr(),file,dndfile,'slice',[offset,offset+bytesRemaining]);
                            filereader.onload = _.bind(_this.got_queue_data, _this, file, item);
                            filereader.readAsArrayBuffer(blob);
                        }

                        if (typeof dndfile.file == 'function') {
                            // dndfile came from get from filesystem
                            dndfile.file( on_file );
                        } else {
                            // dndfile came from a drag n drop reference
                            on_file(dndfile.file);
                        }

                    }, this));

                }
            }
        },
        got_queue_data: function(fo, item, evt) {
            this._processing_read_queue = false;
            var binary = evt.target.result;
            mylog(LOGMASK.disk,'read bytes',binary.byteLength,'from range',item.byte_range);
            assert(binary.byteLength == (item.byte_range[1] - item.byte_range[0] + 1));
            var callback = item.callback;
            callback(binary);
            this.process_read_data_queue();
        },
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
        save_as: function() {
            function errorHandler(){console.error('saveas error handler')}
            var _this = this;
            chrome.fileSystem.chooseEntry({type: 'saveFile', suggestedName: this.get_name()}, function(writableFileEntry) {
                if (writableFileEntry) {
                    writableFileEntry.createWriter(function(writer) {
                        writer.onerror = errorHandler;
                        writer.onwriteend = function(e) {
                            console.log('write complete');
                        };
                        _this.filesystem_entry.file( function(f) {
                            writer.write(f);
                        });
                    }, errorHandler);
                } else {
                    console.warn('user canceled save as dialog');
                }
            });
        },
        get_cloud_upload_session: function() {
            var key = this.torrent.get_infohash('hex') + '-' + this.num;
            var store = this.torrent.collection.client.get_cloud_storage();
            if (! store._uploads[key]) {
                return store._uploads[key];
            }
        }
    });

    // static variables, methods
    TorrentFile._write_queue = [];
    TorrentFile._write_queue_active = false;
    TorrentFile.process_write_queue = function() {
        mylog(LOGMASK.disk,'process write queue');
        if (! TorrentFile._write_queue_active ) {
            if (TorrentFile._write_queue.length > 0) {
                var item = this._write_queue.shift(1);
                TorrentFile._write_queue_active = true;
                var piece = item[0];
                var byte_range = item[1];
                var file = item[2];
                if (file.skipped()) {
                    piece._file_was_skipped = true;
                    TorrentFile._write_queue_active = false;
                    TorrentFile.process_write_queue();
                    return;
                }
                // writes piece's data. byte_range is relative to this file.
                TorrentFile._write_queue_action = 1;
                file.get_filesystem_entry( function(entry) {
                    TorrentFile._write_queue_action = 2;
                    //mylog(1,'got entry',entry);
                    // entry.file is a function, that also gives size
                    entry.getMetadata( function(metadata) {
                        TorrentFile._write_queue_action = 3;
                        //mylog(1,'got metadata',metadata);
                        entry.createWriter( function(writer) {
                            TorrentFile._write_queue_action = 4;
                            //mylog(1,'got writer',writer);
                            TorrentFile.handle_write_piece_data(piece, entry, metadata, writer, byte_range, file);
                        }, TorrentFile.fs_error);
                    }, TorrentFile.fs_error);

                });
            }
        }
    }

    TorrentFile.handle_write_piece_data = function(piece, entry, file_metadata, writer, file_byte_range, file) {
        /* TODO -- clean this up. write in a single pass (create blob of all data to be written to file from chunks) */
        // write the data, when done process the queue
        // TODO -- at same time, merge this with cloud upload code
        assert(file_metadata.size <= file.get_size()); // file on disk is too large!
        var _this = file;
        writer.onerror = function(evt) {
            if (evt.target.error.code == FileError.QUOTA_EXCEEDED_ERR) {
                _this.torrent.stop();
                piece.collection.client.notify_filesystem_full();
                debugger;
            } else {
                log_file_error(evt.target.error)
                debugger;
            }
        }

        var infile = (file_byte_range[0] - file.start_byte);

        if (infile > file_metadata.size) {
            // need first to pad beginning of the file with null bytes
            TorrentFile._write_queue = [ [piece, file_byte_range, file] ].concat( TorrentFile._write_queue ); // put this job back onto the write queue.
            writer.seek( file_metadata.size );
            writer.onwrite = function(evt) {
                TorrentFile._write_queue_active = false;
                TorrentFile.process_write_queue();
            }
            sz = infile - file_metadata.size;

            var zerofill = Math.min( Math.pow(2,25), sz )
            if (sz > Math.pow(2,24)) {
                mylog(LOGMASK.error,'WARNING -- need to fill',sz,'zeros',file,'filling',zerofill);
                // XXX -- do in steps!!!
                // filling too many zeroes!
                if (config.debug_asserts) {
                    debugger;
                }
            }
            var zeroes = new Uint8Array( zerofill );
            mylog(LOGMASK.disk,'writing',zerofill,'zeros to',file.repr());
            writer.write( new Blob([zeroes]) );
        } else {

            var i = 0;

            function write_next(evt) {

                function oncomplete(canclean) {
                    file.trigger('newpiece',piece.num);
                    file.try_parse_stream_metadata(piece.num, piece);

                    if (piece._file_was_skipped) {
                        // doesn't send the HAVE messages
                        file.torrent.notify_have_piece(piece, {skipped:true});
                    } else {
                        file.torrent.notify_have_piece(piece);
                    }

                    if (canclean) {
                        mylog(LOGMASK.disk,'piece',piece.num,'wrote out all data',file.repr(),'CLEARING OUT RESPONSES');
                        //piece.cleanup('wrote out all data?'); // causes breaking?
                        piece.try_free('wrote all data to disk');
                        //piece._chunk_responses = [];
                    } else {
                        // file.on_download_complete(); // this simply checks that it got written with the right size
                        mylog(LOGMASK.disk,'piece',piece.num,'done for',file.repr(),'piece continues to next file');
                    }

                    TorrentFile._write_queue_active = false;
                    TorrentFile.process_write_queue();
                }

                if (i == piece.numchunks) {
                    var file_b = file.end_byte;
                    var chunk_b = piece.start_byte + constants.chunk_size * i;
                    if (chunk_b >= file_b) {
                        oncomplete(false); // chunk responses needed for next file!
                    } else {
                        // XXX -- XXX !
                        //; // piece was entirely consumed ( ????? perhaps not????)
                        if (file.start_byte > piece.start_byte) {
                            // cannot safely clear out the piece data because a previous file may need it...
                            var prev = piece.num - 1;
                            var canclean = true;
                            if (prev >= 0) {
                                var prevpiece = piece.torrent.get_piece(prev);
                                if (! prevpiece.complete() && prevpiece.wrote_but_not_stored()) canclean = false;
                            }
                            oncomplete(canclean);
                        } else {
                            oncomplete(true)
                        }
                    }
                    return;
                }

                // writing to disk would probably be much faster if we
                // concatenated these buffers together and THEN wrote
                // the larger blob.
                // thus TODO: create blob and write it instead
                var chunk = piece._chunk_responses[i];
                assert(chunk);
                var chunk_a = piece.start_byte + constants.chunk_size * i;
                var chunk_b = chunk_a + constants.chunk_size - 1;

                var file_a = file.start_byte;
                var file_b = file.end_byte;

                if (chunk_a > file_b) {
                    // piece chunks continue onto another file!
                    mylog(LOGMASK.disk,'piece chunks continue onto another file');
                    oncomplete(false);
                    return;
                }

                /*

                  |--------------------------|  piece

                  |---------|---------|------|  piece chunks

                  -----|----------------|----|  files


                */

                var intersection = intersect([chunk_a,chunk_b],[file_a,file_b])
                if (intersection) {
                    var numbytes = intersection[1] - intersection[0] + 1;
                    var data = new Uint8Array(chunk.buffer,
                                              chunk.byteOffset + (intersection[0] - chunk_a),
                                              numbytes);
                    var seekto = chunk_a - file_a;
                    if (chunk_a > file_a) {
                        writer.seek( seekto ); // seek into the file a little
                    }
                    //mylog(1,'piece',piece.num,'write chunk',i);
                    writer.onwrite = write_next;
                    writer.write( new Blob([data]) );
                    //mylog(LOGMASK.disk,'write to',file.repr(), (seekto>=0)?('seeked at',seekto,'numbytes',numbytes):'');
                    i++;
                } else {
                    mylog(LOGMASK.disk,'piece',piece.num,'writing chunk',i,'does not intersect file',file.repr())
                    i++;
                    write_next();
                }
            }
            write_next();
        }
    };



    var TorrentFileCollection = jstorrent.Collection.extend({
        //getFormatter: function(col) { debugger; },
        model: TorrentFile,
        className: 'TorrentFileCollection'
    });
    jstorrent.TorrentFileCollection = TorrentFileCollection;
    jstorrent.TorrentFile = TorrentFile;
})();

