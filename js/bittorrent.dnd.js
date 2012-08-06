(function() {


    function random_hash() {
        var b = [];
        for (var i=0; i<20; i++) {
            var c = Math.floor(Math.random() * 256);
            b.push( c )
        }
        return b;
    }

    var UploadSession = Backbone.Model.extend({
        initialize: function(opts) {
            //_.bindAll(this, 'connected', 'create_session');
            this.btapp = opts.btapp;
            this.entry = null;
        },
        ready: function(entry) {
            if (!this.btapp.client.port) {
                console.error('update btapp to give port');
            }
            this.entry = entry
            this.connection = new WSPeerConnection('127.0.0.1', this.btapp.client.port, entry.get_althash(), this.entry);
            // this.connection.bind('connected', this.connected);
        }
    });

    var File = Backbone.Model.extend({
        initialize: function(opts) {
            this.entry = opts.entry;
            this.directory = opts.directory;
            this.file = null;
        },
        populated: function() {
            return !! this.file;
        },
        serialize_meta: function(opts) {
            var d = {};
            //d['name'] = this.file.name;
            d['length'] = this.file.size;
            d['path'] = this.get_path();
            if (opts && opts.include_modified_time) {
                d['modified'] = this.get_modified();
            }
/*            
            var fr = new FileReader();
            fr.onload = function(evt) {
                console.log('read some stuff',[evt.currentTarget.result]);
            }
            fr.readAsBinaryString(this.file.slice(0,256));
*/
            return d;
        },
        get_modified: function() {
            return this.file.lastModifiedDate.getTime();
        },
        get_path: function() {
            if (this.directory) {
                var parts = this.directory.entry.fullPath.split('/'); // should we remove the root directory?
                parts.shift(1);
                parts.shift(1); // also remove root directory!
                parts.push(this.file.name);
                return parts;
            } else {
                return [this.file.name];
            }
        },
        populate: function(cb) {
            var _this = this;
            this.entry.file( function(r) {
                _this.file = r;
                if (cb) {
                    cb();
                }
            });
        }
    });

    var Directory = Backbone.Model.extend({
        initialize: function(opts) {
            this.entry = opts.entry;
            this.parent = opts.parent;
            this.files = [];
            this.directories = [];
            this._reading = false;
        },
        get_by_path: function(arr) {
            if (arr.length == 1) {
                for (var i=0; i<this.files.length; i++) {
                    if (this.files[i].entry.name == arr[0]) {
                        return this.files[i];
                    }
                }
            } else {
                debugger;
                // locate in directories...
                
            }
        },
        get_althash: function() {
            var l = [];
            this.serialize_meta(l, {include_modified_time:true});
            var hex = hex_sha1(utf8.parse(bencode( l )));
            var arr = [];
            for (var i=0; i<hex.length/2; i++) {
                arr.push( parseInt(hex[2*i] + hex[2*i+1],16) );
            }
            return arr;
        },
        get_metadata_size: function(piecelen) {
            // returns the number of pieces
            return 999;
        },
        get_all_files: function(arr) {
            // gets all the files
            _.each(this.files, function(file) {
                arr.push(file);
            });
            _.each(this.directories, function(dir) {
                dir.get_all_files(arr);
            });
        },
        serialize_meta: function(arr, opts) {
            _.each(this.files, function(file) {
                arr.push(file.serialize_meta(opts))
            });
            _.each(this.directories, function(dir) {
                dir.serialize_meta(arr, opts);
            });
        },
        get_name: function() {
            return this.entry.name;
        },
        populate: function(cb) {
            // reads & populates all FileEntry+File objects
            var item = this.entry;
            var _this = this;
            var reader = item.createReader();
            reader.readEntries( function(result) {
                _this._reading = false;
                // gets FileEntries
                if (result.length) {
                    for (var j=0; j<result.length; j++) {
                        var it = result[j];
                        if (it.isDirectory) {
                            var dir = new Directory( { entry: it, parent: _this } );
                            _this.directories.push( dir );
                            dir.populate(cb);
                        } else {
                            var file = new File({entry:it, directory:_this});
                            _this.files.push( file );
                            file.populate(cb);
                        }
                    }
                } else {
                    cb({error: 'no file entries'});
                }
            });
        },
        populated: function() {
            // there's a bunch of asynchronous calls, this will check
            // if all child directories are done and all files have
            // fetched their File objects
            if (this._reading) {
                return false;
            }

            for (var i=0; i<this.files.length; i++) {
                if (! this.files[i].populated()) {
                    return false;
                }
            }

            for (var i=0; i<this.directories.length; i++) {
                if (! this.directories[i].populated()) {
                    return false;
                }
            }

            return true;
        }
    });

    UploadView = Backbone.View.extend({
        initialize: function(opts) {
            _.bindAll(this, 'dragenter', 'dragleave', 'dropped_files', 'handle_read', 'drop');
            var dropbox = opts.el;
            var btapp = opts.btapp;

            dropbox.on("dragenter", this.dragenter);
            dropbox.on("dragleave", this.dragleave);
            dropbox.on("dragover", this.dragover);
            dropbox.on("drop", this.drop);
            this.entries = [];

            this.model = new UploadSession( {btapp:btapp} );
        },
        dragover: function(evt) {
            // console.log('dragover'); // triggered when mouse moves over drop zone
            evt.originalEvent.stopPropagation();
            evt.originalEvent.preventDefault();
        },
        dragenter: function(evt) {
            console.log('dragenter');
            evt.originalEvent.stopPropagation();
            evt.originalEvent.preventDefault();
            this.$el.css('border','4px dashed yellow');
        },
        dragleave: function(evt) {
            console.log('dragleave');
            evt.originalEvent.stopPropagation();
            evt.originalEvent.preventDefault();
            this.$el.css('border','3px dashed black');
        },
        error: function(data) {
            console.log('drag widget fail:',data);
        },
        trigger_ready: function() {
            if (! this._triggered) {
                mylog(1,'ready to upload', this.entries[0]);
                this.model.ready(this.entries[0]);
            }
            this._triggered = true;
        },
        drop: function(evt) {
            var _this = this;
            evt.originalEvent.stopPropagation();
            evt.originalEvent.preventDefault();
            
            var files = evt.originalEvent.dataTransfer.files;
            var items = evt.originalEvent.dataTransfer.items;
            if (items) {
                for (var i=0; i<items.length; i++) {
                    if (items[0].webkitGetAsEntry) {
                        var item = items[0].webkitGetAsEntry();

                        if (item.isDirectory) {

                            // need this to happen recursively...
                            var dir = new Directory({'entry':item});
                            this.entries.push(dir);

                        } else {
                            this.entries.push(item);
                        }

                        var entry = this.entries[0];

                        entry.populate( function(data) {
                            if (data && data.error) {
                                _this.error(data);
                            } else {
                                // console.log('callback, something finished...');
                                if (entry.populated()) {
                                    _this.trigger_ready();
                                }
                            }
                        });
                    }
                }
            } else if (files) {
                // notify that dropping in directories is not supported.
                var count = files.length;
	        this.dropped_files(files);
            } else {
                // notify that drag and drop doesn't work, have to browse to upload
            }
        },
        dropped_files: function(files) {
            var file = files[0];
            document.getElementById("droplabel").innerHTML = "Processing " + file.name;
            var reader = new FileReader();
            // init the reader event handlers

            var currentChunk = 0;
            var blockSize = 1024 * 1024;
            var transferLength = blockSize; // reduce for last blob
            if(file.slice) {
                var blob = file.slice(currentChunk*blockSize, transferLength);
            } else if (file.mozSlice) {
                var blob = file.mozSlice(currentChunk*blockSize, currentChunk*blockSize+transferLength);
            } else if(file.webkitSlice) {
                var blob = file.webkitSlice(currentChunk*blockSize, currentChunk*blockSize+transferLength);
            }


            reader.onload = this.handle_read;
            // begin the read operation
            reader.readAsBinaryString(file);
            //reader.readAsDataURL(file);
        },
        handle_read: function(evt) {
            var img = document.getElementById("preview");
            var binary = evt.target.result;
            debugger;
            //img.src = evt.target.result;
        }
    });


}).call(this);
