(function() {
    /*
      - entry point: torrent.write_data_from_piece( piece )
          
      This ended up being a pretty gdrive specific implementation. That's OK for now.

     */

    jstorrent.GoogleDriveUploadSession = Backbone.Model.extend({
        initialize: function(opts) {
            this._creation = new Date;
            this.file = opts.file;
            this.drive = opts.drive;
            this.url_base = "https://www.googleapis.com";
            /*
              Chunk size restriction: There are some chunk size restrictions based on the size of the file you are uploading. Files larger than 256 KB (256 x 1024 bytes) must have chunk sizes that are multiples of 256 KB.  For files smaller than 256 KB, there are no restrictions. In either case, the final chunk has no limitations; you can simply transfer the remaining bytes. If you use chunking, it is important to keep the chunk size as large as possible to keep the upload efficient.
            */
            this._chunk_size = 256 * 1024;
            this._uploaded_bytes = 0;
            this._current_upload = null;
            this._checking_status = false;
            this._create_callback = null;
            this.loc = null; // gdrive upload location
            this.loc_raw = null;
            this.error = null;

            this._service_unavailable = null;
            this._service_unavailable_count = 0;

            this._pieces = [];
            this._bytes_written = 0; // file bytes uploaded
            //this.on('chunkuploaderror', _.bind( this.on_chunk_upload_error, this ) );
        },
        cleanup: function() {
            // called when file was destroyed or deleted, so need to cancel whatever we were doing.
        },
        on_chunk_upload_error: function() {
            // start exponential fallback, etc, detect unrecoverable errors
            this.set_error('chunk upload error');
        },
        get_current_piece_uploading: function() {
            // returns piece index with respect to this._uploaded_bytes
            return this.get_piece_for_filebytes( this._uploaded_bytes );
        },
        get_piece_for_filebytes: function(bytes) {
            var piecenum = Math.floor( (this.file.start_byte + bytes) / this.file.torrent.piece_size );
            return piecenum
        },
        has_session: function() {
            return this.loc && ! this.error;
        },
        create_session: function(callback) {
            if (! this.drive.get_token()) {
                // multiple create session overwriting others...
                this.drive.add_to_queue( _.bind( function() {
                    this.create_session(callback);
                },this) );
                return;
            }
            assert(callback);
            this._create_callback = callback;
            var filename = utf8.parse(str2arr(this.file.get('name')));
            var bodydata = { 'title': filename,
                             'description': 'from torrent ' + this.file.torrent.get_infohash('hex'),
                             'mimeType': mime_map(filename)
                           };
            if (config.packaged_app) {
                var token = this.drive.get_token();
                var xhr = new XMLHttpRequest;
                //xhr.withCredentials = true;
                var url = this.url_base + '/upload/drive/v2/files' + '?uploadType=resumable'; //&access_token=' + encodeURIComponent( token );
                xhr.open("POST", url, true)
                xhr.setRequestHeader('Authorization',
                                     'Bearer ' + token);
                xhr.setRequestHeader('Content-Type','application/json');
                xhr.onload = _.bind(this.oncreated, this, true, {error:false});
                xhr.onerror = _.bind(this.oncreated, this, true, {error:true});
                mylog(LOGMASK.cloud,'create session with data',bodydata);
                xhr.send( JSON.stringify(bodydata) );
            } else {
                // RAW xhr not working, get a 403 on the OPTIONS preflight
                var req = gapi.client.request({
                    'path': '/upload/drive/v2/files',
                    'method': 'POST',
                    'params': {'uploadType': 'resumable'},
                    'body': bodydata
                });
                req.execute( _.bind(this.oncreated, this, false, req) );
            }
        },
        oncreated: function(israw,req,a,b) {
            // got lazy with function argument names because gapi
            // essentially gives me random crap anyway

            //console.log('created session!',req,a,b,this.file.get('name'));
            mylog(LOGMASK.cloud,'created session!',this.file.get('name'));
            this._creating_session = false;
            var loc;

            if (israw) {
                var loc = a.target.getResponseHeader("Location")
            } else if (typeof b == 'string') {
                var data = JSON.parse(b)
                var loc = data.gapiRequest.data.headers.location || data.gapiRequest.data.headers.Location;
            }

            this.file.set('gdrive:upload_location', loc);
            this.file.save();

            var callback = this._create_callback;
            this._create_callback = null;

            if (loc) {
                // safari has upper-case. motherfuckers
                this.loc_raw = loc;
                this.loc = loc.slice(loc.indexOf('/upload'), loc.length);
                callback(true);
            } else {
                callback(false);
            }
        },
        check_status: function(callback) {
            mylog(LOGMASK.cloud,'check upload session status!', this.file.get('name'));
            this._checking_status = true;

            if (config.packaged_app) {
                // not working?

                var token = this.drive.get_token();
                var xhr = new XMLHttpRequest;
                //xhr.withCredentials=true;
                var url = this.loc_raw;
                xhr.open("PUT", url, true)
                xhr.setRequestHeader( 'Content-Range', 'bytes ' + '*' + '/' + this.file.size );
                xhr.setRequestHeader('Authorization',
                                     'Bearer ' + token);
                xhr.onload = _.bind(this.checked_status, this, {error:false}, callback);
                xhr.onerror = _.bind(this.checked_status, this, {error:true}, callback);
                xhr.send();
            } else {
                var req = gapi.client.request({
                    'path': this.loc,
                    'method': 'PUT',
                    'headers': {
                        'Content-Range': 'bytes ' + '*' + '/' + this.file.size,
                    }
                });
                req.execute( _.bind(this.checked_status, this, {gapiclient:true}, callback) );
            }
        },
        checked_status: function(info,callback,evt,x,y) {
            this._checking_status = false;
            var fileId;

            if (info && info.gapiclient) {
                if (evt && evt.fileSize == this.file.size) {
                    mylog(LOGMASK.cloud,'checked upload session status, complete!', this.file.get('name'));
                    this.file.set('gdrive_uploaded', 1);
                    fileId = evt.id;
                    this.file.set('gdrive:fileId', fileId);
                    this.file.save();
                    callback( { finished: true }, null, evt )
                } else {
                    // incomplete or some crap
                    var data = JSON.parse(x);
                    console.error('check status: code',data.gapiRequest.data.status, data);
                    // cannot read range header ! lame
                    this.set_error('unable to check status');
                }
            } else {
                var headers = evt.target.getAllResponseHeaders();
                var range = evt.target.getResponseHeader('range');
                debugger;
                if (range) {
                    var parts = range.split('=')[1].split('-')
                    var last_byte = parseInt( parts[1] );
                    this._uploaded_bytes = last_byte - 1;
                    callback({range:range}, headers, evt);
                } else {
                    callback({}, headers, evt);
                }
            }
        },
        upload_chunk: function(blob) {
            assert( blob.size == this._chunk_size ||
                    this._uploaded_bytes + blob.size == this.file.size
                  );

            var _this = this;
            assert(! this._current_upload);
            this._current_upload = true;

            assert(this.loc);
            var _this = this;
            assert(this === _this);

            var url = this.loc_raw;
            //url = 'http://192.168.56.1:9090/drive/v2/files'; // debug (found out safari does not upload typed array views)
            var headers = {
                'Content-Range': 'bytes ' + this._uploaded_bytes + '-' + (this._uploaded_bytes + blob.size-1) + '/' + this.file.size,
            }
            var nocors = false
            if (this._uploaded_bytes + blob.size == this.file.size) {
                nocors =true;
            }
            //mylog(LOGMASK.cloud, 
            console.log('uploading chunk of sz',blob.size );
            this.drive.request( { method: "PUT",
                                  path_full: this.loc_raw,
                                  headers: headers,
                                  rawxhr: true,
                                  nocors: nocors,
                                  callback: _.bind(this.uploaded_chunk, this, {error:false}, blob.size),
                                  progress: function(evt) {
                                      console.log('chunk readystate',evt);
                                  },
                                  body: blob
                                });

        },
        uploaded_chunk: function(req,size, resp, evt) {
            // note that even though OPTIONS succeeds (gives header
            // saying allowing access) the response to the chunk
            // upload does NOT include the header that lets use read
            // the XHR response. Therefore it LOOKS like an error.
            
            // we will assume it worked? and use an out of band
            // status-check API call to see how many bytes were
            // uploaded...
            this._current_upload = null;

            var haderr = false;
            if (! _.contains([200,308], evt.target.status) ) {
                haderr = true;
            }

            if ((req && req.error) || haderr) { 

                //console.error('error uploading chunk?');
                console.error('upload chunk failed');
                //if (config.debug_asserts) { debugger; }
                // chrome returning status code 0, firefox seems to get the 503. on 503 we're supposed to re-try.
                analyze_xhr_event( evt );

                // if 503 error code, do something totally different...
                if (evt.target.status == 503) {
                    this._service_unavailable = new Date();
                    this._service_unavailable_count++;
                    console.warn('service unavailable, block upload attempts for a while');
                }

                this.check_status( _.bind( function(info,h,evt) {
                    if (info && info.finished) {
                        // CORS issue, but file did indeed finish uploading.
                    } else {
                        if (evt.target.status == 308) {
                            // connection error or something, status tells us 308, so can resume uploading! yay!!!

                            // the check_status reset the this._uploaded_bytes data for us
                            this.try_write();
                        } else if (evt.target.status == 404) {
                            var elapsed = new Date - this._creation;
                            console.error('404 error!!! resumable upload fail :-(', Math.floor(elapsed/( 60 * 1000)),'seconds');
                        } else {
                            this.set_error('chunk upload error');
                        }
                    }
                },this) );
            } else {
                this._uploaded_bytes += size;

                this.file.set('gdrive_uploaded', this._uploaded_bytes / this.file.size);

                //console.log('uploaded chunk!',req,size,a,b, this.file.get('name'));
                mylog(LOGMASK.cloud, 'uploaded chunk!',this.file.get('name'), this._uploaded_bytes);

                if (this._uploaded_bytes == this.file.size) {
                    mylog(LOGMASK.cloud, this.file.get('name'), 'upload done, status code', evt.target.status);
                    // parse meta info
                    if (evt.target.status == 308) {
                        // why on earth does it send 308 when we uploaded all the bytes??
                        debugger;

                    } else if (evt.target.responseText) {
                        var gdrivedata = JSON.parse( evt.target.responseText )
                        this.file.set('gdrive:fileId',gdrivedata.id);
                        this.file.save();
                        this.uploaded_chunk_success(this._uploaded_bytes, true);
                    } else {
                        this.set_error('unexpected final chunk upload response');
                    }
                } else if (this._uploaded_bytes > this.file.size) {
                    console.error('huh? uploaded too much stuffs');
                    debugger;
                } else {
                    this.uploaded_chunk_success(this._uploaded_bytes);
                    this.try_write();
                    //                this.check_status( _.bind(function() {
                    //                    this.try_write();
                    //                }, this));
                }
            }
        },
        service_currently_unavailable: function() {
            // do this globally on Drive.request instead

            // checks whether we can issue an upload request right now
            if (this._service_unavailable) {
                var elapsed = new Date() - this._service_unavailable;
                var backoff = this._get_backoff_time( this._service_unavailable_count )
                if (elapsed > backoff) {
                    this._service_unavailable = null;
                    return true;
                }
            }
            return false;
        },
        _get_backoff_time: function(count) {
            return 1 + Math.pow(2, count) + 2 * Math.random();
        },
        set_error: function(err) {
            this.error = err;
            this.trigger('error', err);
        },
        uploaded_chunk_success: function(bytesnow, done) {
            // call piece.unregister_consumer for any piece below this range so that these pieces can be freed from memory
            var bounds = this.file.get_piece_boundaries();
            var piece_a = bounds[0];
            var piece_b = bounds[1];
            var piece;

            for (var i=piece_a; i<=piece_b; i++) {
                piece = this.file.torrent.get_piece(i, {nocreate:true});
                if (piece && (done || piece.end_byte < bytesnow)) {
                    //console.log('unregistering piece',piece.num,'consumer',this.file.num);
                    piece.unregister_consumer( this );
                }
            }
        },
        creating_session: function() {
            return this._create_callback;
        },
        uploading: function() {
            if (this._current_upload) { return true; }
        },
        enqueue_write: function(piece, byterange) {
            if (this.error) { return true; }
            //this.files_first_piece = this.get_piece_for_filebytes(0);
            this._pieces[piece.num] = [ piece, byterange ];
            //console.log('piece',piece.num,'register consumer',this.file.num);
            piece.register_consumer( this );
            this.try_write();
        },
        try_write: function() {
            console.log('try write!')
            if (this.error) { 
                console.error('try write fail - error');
                return; 
            }
            if (this.uploading()) { 
                console.log('cant write - uploading')
                return; 
            }
            if (this._checking_status) { 
                console.log('cant write checkin status')
                return; 
            }

            if (this.can_consume( this._chunk_size )) {
                console.log('can consume!');
                if (! this.drive.have_valid_token()) {
                    this.drive.trigger('need_user_authorization');
                    // set lock until authorized
                    return;
                }

                if (this.service_currently_unavailable()) {
                    console.log('service unavailable');
                    return;
                }

                if (this.creating_session()) {
                    // 
                    return;
                } else if (! this.has_session()) {
                    this.create_session( _.bind( function() {
                        this.try_write();
                    }, this) );
                    return;
                }

                // consume the data here!
                var data = this.consume( this._chunk_size );

                var sum = 0;
                for (var i=0; i<data.length; i++) {
                    // this computation is wrong... (typed array has offset+len)
                    sum += data[i].length;
                    //sum += (data[i].byteLength - data[i].byteOffset)
                }

                //console.log(this.file.get('name'), 'consume data', [arr2str(data[0])] );
                //var blob = new Blob(data);
                var blob = FixSafariBuggyBlob(data);
                assert( sum == blob.size );

                this.upload_chunk( blob );
            }
        },
        can_consume: function(sz) {
            // returns whether we have piece data for in the interval
            // [this._uploaded_bytes, this._uploaded_bytes + sz]

            var piece_a = this.get_piece_for_filebytes( this._uploaded_bytes );
            var piece_b = this.get_piece_for_filebytes( Math.min(this._uploaded_bytes + sz - 1, this.file.size) );

            for (var i=piece_a; i<=piece_b; i++) {
                if (! this._pieces[i]) {
                    return false;
                }
            }
            return true;
        }, 
        consume: function(sz) {
            // returns an array of the actual data to upload
            var arr = [];

            var piece_a = this.get_piece_for_filebytes( this._uploaded_bytes );
            var piece_b = this.get_piece_for_filebytes( Math.min(this._uploaded_bytes + sz - 1, this.file.size) );

            var pp;
            var sliced;
            var piece;
            var piecerange;

            var ab;
            var consumed = 0;

            for (var i=piece_a; i<=piece_b; i++) {

                /*

                  more index nonsense to sort out. torrent piece sizes
                  could actually be larger than upload chunk sizes,
                  though the diagram shows the opposite.

                  |---|---|---|---|---|---|---|---|---|---| torrent pieces
                                          |                 _uploaded_bytes                   
                  |------------------|------------------|   files
                  |-------|-------|-------|-------|-----|   upload_chunk_size

                 */
                pp = this._pieces[i];
                assert( pp[0] );
                piece = pp[0];

                var data = piece.get_response_data(this.file, { from: this.file.start_byte + this._uploaded_bytes });
                // gives us all file data that intersects with this
                // piece. we may need to omit from the beginning based
                // on _uploaded_bytes, and omit from the end based on
                // the amount we are consuming (sz)

                //console.log('piecenum',piece.num, 'get resp data',data);

                for (var j=0; j<data.length; j++) {
                    if (consumed == sz) {
                        break; // all done yea! (but why did we come to this piece?)
                    } else if (data[j].length + consumed > sz) {
                        assert( sz - consumed > 0 );
                        // need to splice off
                        sliced = new Uint8Array(data[j].buffer, data[j].byteOffset, sz - consumed);
                        arr.push( sliced )
                        //console.log('too big; sliced to len',sliced.length)
                        consumed += sliced.length;
                    } else {
                        arr.push( data[j] );
                        consumed += data[j].length;
                    }
                    assert( consumed <= sz );
                }
            }


            return arr;
        }
        
    });


    jstorrent.CloudDrive = Backbone.Model.extend({
        initialize: function() {
            this.CLIENT_ID = '432934632994.apps.googleusercontent.com';
            this.url_base = 'https://www.googleapis.com';
            if (config.packaged_app) {
                this.url_base = this.url_base + '/';
            }
            this.SCOPES = [
                'https://www.googleapis.com/auth/drive.file',
            ];
            this.API_KEY = 'AIzaSyBrXfDSEzTxpwaEfqPg1qCPAOT_fzHRVz4'; // needed for "referer" html apps?

            this._fetching_token = false;
            this._token = null;
            this._token_expires = null;
            this._token_revoked = false; // set this to true when we had access but then we lost it (due to user destroying the app's access)

            this._gdrive_loaded = false;

            this._after_auth_queue = [];

            if (jstorrent.state.gdriveloaded) {
                // google api loaded BEFORE we loaded
                this.gdrive_onload();
            }

            this.on('authorized', function() { 
                this.list_files( function(result) {
                    if (result.error) {
                        console.error('check hostname, likely not authorized in developer console');
                    } else {
                        console.log('authorized, show files list',result);
                    }
                });
            });
        },
        list_files: function(callback) {
            this.request( { method: "GET", 
                            path: 'drive/v2/files',
                            callback: function(resp) {
                                console.log('list files resp',resp);
                                if (callback){callback(resp)}
                            } } );
        },
        gdrive_onload: function() {
            this._gdrive_loaded = true;
            var _this = this;

            // firefox is not authorizing. fuck you firefox.
            this.get_new_token( { immediate: true }, function(resp) {
                console.log('gdrive onload immediate auth result',resp);
                if ((resp && resp.error) || ! resp) {
                    _this.trigger('need_user_authorization');
                }
            });
        },
        token_expired: function() {
            if (this._token_expires) {
            }
        },
        have_valid_token: function() {
            return this._token && ! this.token_expired() && ! this._token_revoked;
        },
        request: function(opts) {
            /*
              all requests to google's api go through this method,
              EXCEPT the chunk piece uploads. These are slightly
              different... but I should put them in here to simplify
              things.
             */
            var _this = this;
            if (! this._gdrive_loaded) {
                console.warn('made request to drive api before drive client was loaded', opts);
                opts.callback({error:'gdrive api not loaded'});
                return;
            }
            if (! this.have_valid_token()) {
                if (this._fetching_token) {
                    opts.callback({error:'currently fetching a token'});
                    return;
                }
                console.log('drive request, token not valid, fetching new one');
                this.get_new_token( null, function(resp) {
                    console.log('request auto token fetch resp',resp);
                    if (resp.error && resp.data === null) {
                        // need to do non-immediate mode
                        _this.trigger('need_user_authorization')
                    }
                    opts.callback({error:'had to fetch a token'});
                });
                return;
            }
            console.log('makin request');
            // what to do when token is expired? fail quickly.
            if (this.token_expired()) {
                callback({error:'token expired'}, null);
                return;
            }
            var path = opts.path;
            var callback = opts.callback;

            if (config.packaged_app || opts.rawxhr) {
                if (opts.path_full) {
                    var xhrurl = opts.path_full;
                } else {
                    var xhrurl = this.url_base + path;
                }
                var xhr = new XMLHttpRequest;
                xhr.open(opts.method || "GET", xhrurl);
                if (opts.headers) {
                    for (var key in opts.headers) {
                        xhr.setRequestHeader(key, opts.headers[key]);
                    }
                }
                xhr.setRequestHeader('Authorization', 'Bearer ' + this.get_token());
                xhr.onload = function(evt) {
                    if (xhr.responseText) {
                        callback(JSON.parse(xhr.responseText), evt);
                    } else {
                        callback(null, evt);
                    }
                };
                xhr.onerror = function(evt) {
                    if (xhr.status == 0 && opts.nocors) {
                        // was expecting server to fuck up with CORS,
                        // though this error could also be due to
                        // something else. having no CORS headers is
                        // supposed to behave exactly like a failed
                        // network request, etc, due to JS security
                        // XHR architecture nonsense.
                        callback(null, evt);
                    } else if (xhr.status == 401) {
                        // token expired
                        console.warn('token expired?')
                        callback({error:true}, evt);
                    } else if (xhr.status == 503) {
                        // start exponential random backoff shit
                        debugger;
                    } else {
                        callback({error:true}, evt);
                    }
                };
                if (opts.body) {
                    xhr.send(opts.body);
                } else {
                    xhr.send();
                }
            } else {
                var req = gapi.client.request({
                    method: 'GET',
                    path: path
                });
                req.execute( function(obj, text) {
                    // check for expired token
                    if (obj && obj.error) {
                        if (obj.error.code == 401) {
                            console.warn('drive request returned 401',obj,text);
                            if (obj.error.message == "Invalid Credentials") {
                                this.trigger('need_user_authorization'); // does this happen with token expried too?
                                // credentials were revoked via deleting the app from gdrive
                            } else {
                            }
                            _this._token_revoked = true;
                        }
                    }
                    callback(obj, text);
                } );
            }
        },
        get: function(path, callback) {
            this.request( { method:"GET",
                            headers: {
                                // auth header gets put in automagically
                            },
                            path: path,
                            callback: callback } );
        },
        process_after_auth_queue: function() {
            for (var i=0; i<this._after_auth_queue.length; i++) {
                this._after_auth_queue[i]();
            }
            this._after_auth_queue = [];
        },
        add_to_queue: function(callback) {
            this._after_auth_queue.push(callback);
        },
        get_new_token: function(opts, callback) {
            this._fetching_token = true;
            // if access was revoked through another method, need to do user triggered token, in non-immediate mode.
            var immediate = true;
            var _this = this;
            if (opts && opts.immediate === false) {
                immediate = false;
            }

            var _this = this;
            if (config.packaged_app) {

                var identity = chrome.experimental.identity || chrome.identity;

                identity.getAuthToken( {interactive: true}, function(token) {
                    _this._fetching_token = false;
                    console.log('got gdrive token', token);
                    if (token) {
                        _this._token = token;
                        _this._token_expires = new Date() + (1000 * 60 * 24 * 365); // one year.
                        _this.trigger('authorized');
                        // expires in?
                        callback({success:true});
                    } else {
                        callback({error:true})
                    }
                });
            } else {
                gapi.client.setApiKey(this.API_KEY);
                gapi.auth.authorize(
                    {'client_id': _this.CLIENT_ID, 'scope': _this.SCOPES.join(' '), immediate:immediate},
                    function(result) {
                        _this._fetching_token = false;
                        if (result) { 
                            _this._token_expires = result.expires_in;
                            _this._token = result.access_token;
                            _this.trigger('authorized');
                            //_this.process_after_auth_queue();
                            callback({success:true});
                        } else {
                            callback({error:true, data:result});
                        }
                    }
                );
            }
        },
        get_token: function() {
            assert (this._token);
            return this._token;
        },
        write_torrent_piece: function(piece) {
            var torrent = piece.torrent;
            var haderr;
            // don't actually need actual filebyterange
            var files_info = piece.get_file_info(0, piece.sz);
            for (var i=0; i<files_info.length; i++) {
                var filenum = files_info[i].filenum;
                var filebyterange = files_info[i].filerange;
                var file = torrent.get_file(filenum);
                haderr = haderr || this.enqueue_write_file_piece( file, piece, filebyterange )
            }
            return haderr;
        },
        enqueue_write_file_piece: function(file, piece, byterange) {
            // the write queue in bittorrent.file.js has complicated
            // logic to determine when it can clean out the
            // data. perhaps something simpler can be done here... ?
            // (have "needed" counter and release "needed" when we are
            // done, if reaches 0, delete piece data)

            var filesession;

            if (! file._cloud_upload_session) {
                filesession = new jstorrent.GoogleDriveUploadSession( { drive: this, file: file } );
                file._cloud_upload_session = filesession;

                // need to persist this so that when
                // reload/resume/restart it can continue where it left
                // off. Also be smarter about storing bitmask_complete
                // as "cloud" bitmask_complete.
            } else {
                filesession = file._cloud_upload_session;
            }

            var haderr = filesession.enqueue_write( piece, byterange );
            return haderr;
        }
    });

    // move into grid.js
    window.setup_drive_action = function() {
        document.getElementById('setup-storage').addEventListener('click',function(evt) {
                // immediate false means iframe can pop up
/*
            dropbox.authenticate( function(error, client) {
                debugger;
            });
*/
            jsclient.get_cloud_storage().get_new_token( { immediate: false }, function(result) {
                console.log('user clicked on setup drive and got result',result);
            } );



        });
    }


})();
