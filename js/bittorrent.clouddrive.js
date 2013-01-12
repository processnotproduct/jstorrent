(function() {
    /*
      abstract cloud drive class.

      trying to decide what the interface looks like. simple interface
      would be it takes pieces. nicer interface would have it already
      split up into files

      perhaps instantiate a "cloudfile" object

      needs to support uploading from the middle of a piece (i.e. skipped files)


      - simplest entry point: torrent.write_data_from_piece( piece )
          concern: what to do when these complete out-of-order?
          perhaps this provides an opportunity to ensure that the
          downloads are done in-order

          
          

     */

    jstorrent.GoogleDriveUploader = Backbone.Model.extend({
        initialize: function() {
            this.url = "https://www.googleapis.com/upload/drive/v2/files?uploadType=resumable"
            /*
              Chunk size restriction: There are some chunk size restrictions based on the size of the file you are uploading. Files larger than 256 KB (256 x 1024 bytes) must have chunk sizes that are multiples of 256 KB.  For files smaller than 256 KB, there are no restrictions. In either case, the final chunk has no limitations; you can simply transfer the remaining bytes. If you use chunking, it is important to keep the chunk size as large as possible to keep the upload efficient.
            */
            var req = gapi.client.request({
                'path': '/upload/drive/v2/files',
                'method': 'POST',
                'params': {'uploadType': 'resumable'},
            });
            req.execute( _.bind(this.oncreated, this, req) );
        }



    });

    jstorrent.CloudFileUploadSession = Backbone.Model.extend({
        initialize: function(opts) {
            this.file = opts.file;
            this.files_first_piece = this.file.start_byte / this.file.torrent.piece_size;
            this._bytes_written = 0; // file bytes uploaded
            this._pieces_written = 0;
            this._pieces = {};

            this.uploader = new jstorrent.GDriveUploader;

            this.chunk_size = 256 * 1024;

            this._current_chunk_upload = null;

            // TODO -- what to do when connection is interrupted/upload errors out?
        },
        enqueue_write: function( piece, byterange ) {
            // piece.register_consumer( byterange );

            // releasing data is complicated by the need to slice
            // these byte ranges into compatibly sized chunks (256 KB
            // multiples)

            // is this the first piece for this file?
            var relpieceindex = piece.num - this.files_first_piece;


            assert( ! this._pieces[ relpieceindex ] );
            this._pieces[ relpieceindex ] = [piece, byterange];
            
            this.try_flush();
        },
        try_flush: function() {
            if (this._current_chunk_upload) { return; }

            if (this.can_consume_bytes( this.chunk_size )) {
                this.consume_bytes( this.chunk_size );
            }

            if ( this._pieces[this._pieces_written] ) {
                debugger;
                //var piecedata = 
            }

        }
    });

    jstorrent.CloudDrive = Backbone.Model.extend({
        initialize: function() {
            this._uploads = {}; // list of file upload sessions
            // keys look like {infohash}-{file index}
        },
        write_torrent_piece: function(piece) {
            var torrent = piece.torrent;
            var files_info = piece.get_file_info(0, piece.sz);
            for (var i=0; i<files_info.length; i++) {
                var filenum = files_info[i].filenum;
                var filebyterange = files_info[i].filerange;
                var file = torrent.get_file(filenum);
                // file.write_piece_data( piece, filebyterange );
                this.enqueue_write_file_piece( file, piece, filebyterange )
            }
        },
        enqueue_write_file_piece: function(file, piece, byterange) {
            // the write queue in bittorrent.file.js has complicated
            // logic to determine when it can clean out the
            // data. perhaps something simpler can be done here... ?
            // (have "needed" counter and release "needed" when we are
            // done, if reaches 0, delete piece data)

            var key = file.torrent.get_infohash('hex') + '-' + file.num;
            var filesession;
            
            if (! this._uploads[key]) {
                filesession = new jstorrent.CloudFileUploadSession( { file: file } );
                this._uploads[key] = filesession;
            } else {
                filesession = this._uploads[key];
            }

            filesession.enqueue_write( piece, byterange );
        }
    });
})();
