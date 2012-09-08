(function() {

    window.get_althash = function(container) {
        var l = [];
        entries = container.items();
        for (var i=0; i<entries.length; i++) {
            entries[i].serialize_meta(l, {include_modified_time:true});
        }

        var hex = hex_sha1(arr2str(bencode( l )));
        var arr = [];
        for (var i=0; i<hex.length/2; i++) {
            arr.push( parseInt(hex[2*i] + hex[2*i+1],16) );
        }
        return arr;

    }


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
            _.bindAll(this, 'completed', 'upload_progress', 'hash_progress');
            this.btapp = opts.btapp;
            this.client = opts.client; // non-btapp style client object
            this.entries = null;
        },
        destroy: function() {
            mylog(1,'please garbage collect me, uploadsession');
        },
        ready: function(container) {
/*
            window.onbeforeunload = function() {
                return "Still uploading... If you leave, your upload will be canceled.";
            }
*/
            if (this.client) {
                var host = '127.0.0.1';
                var port = this.client.get('data').port; // not the same as the client's actual port...
                var connection_port = 64399; // TODO -- grab from settings...
            } else {
                if (!this.btapp.client.get('port')) {
                    console.error('update btapp to give port');
                }
                if (!this.btapp.client.get('host')) {
                    console.error('update btapp to give host');
                }
                var host = this.btapp.client.get('host');
                var port = this.btapp.client.get('port');
                var connection_port = port;
            }

            this.container = container
            var althash = get_althash(this.container);
            mylog(1,'althash is', ab2hex(althash));

            if (this.client) {

                // fetch settings to get connection port
                this.client.doreq( 'action=getsettings', _.bind(function(sett) {
                    var connection_port = null;
                    for (var i=0; i<sett.settings.length; i++) {
                        var key = sett.settings[i][0];
                        if (key.match('bind_port')) {
                            connection_port = sett.settings[i][2];
                        }
                    }

                    assert(connection_port);
                    this.client.doreq( 'action=add-url&s=' + encodeURIComponent('magnet:?xt=urn:alth:' + ab2hex( althash ) ), _.bind(function() {
                        mylog(1,'told client to add, waiting 1 sec before connecting');
                        _.delay(_.bind(function(){
                            this.torrent = new Torrent({container:this.container, althash:althash});
                            this.connection = new WSPeerConnection({host:host, port:connection_port, hash:althash, torrent:this.torrent});
                            this.connection.bind('handle_have', this.upload_progress);
                            this.connection.bind('hash_progress', this.hash_progress);
                            this.connection.bind('completed', this.completed);
                        },this), 1000);
                    },this) );


                }, this));
                // should be done in a different file

            } else {
                var defer = this.btapp.get('add').torrent( ab2hex( althash ) );
                defer.then( _.bind(function() {
                    // get this from backbone
                    this.torrent = new Torrent({container:this.container, althash:althash});
                    this.connection = new WSPeerConnection({host:host, port:connection_port, hash:althash, torrent:this.torrent});
                    this.connection.bind('handle_have', this.upload_progress);
                    this.connection.bind('hash_progress', this.hash_progress);
                    this.connection.bind('completed', this.completed);

                }, this) );
            }


            // this.connection.bind('connected', this.connected);
        },
        hash_progress: function(data) {
            this.trigger('progress', {'hash':data});
            //mylog(1,'upload session hash progress',data);
        },
        upload_progress: function(index) {
            var frac = this.connection.fraction_complete(this.connection._remote_bitmask);
            //mylog(1,'upload session upload progress', frac);
            this.trigger('progress', {'upload': frac});
        },
        completed: function() {
            mylog(1,'upload session FINISHED!!! woot!');
            this.trigger('oncomplete');
            window.onbeforeunload = null;
        }
    });

    var DNDFileEntry = Backbone.Model.extend({
        initialize: function(opts) {
            this.entry = opts.entry;
            this.directory = opts.directory;
            this.file = null;
        },
        populated: function() {
            return !! this.file;
        },
        get_name: function() {
            return this.file.name;
        },
        serialize_meta: function(l, opts, stack) {
            if (stack === undefined) {
                stack = [];
            }

            var d = {};
            //d['name'] = this.file.name;
            d['length'] = this.file.size;
            //d['path'] = this.get_path(); // fullPath parsing kind of janky... path is passed in now.
            var mypath = _.clone(stack);
            mypath.push( this.file.name );
            d['path'] = mypath;
            if (opts && opts.include_modified_time) {
                d['modified'] = this.get_modified();
            }

            l.push(d);
            return d;
        },
        get_modified: function() {
            return this.file.lastModifiedDate.getTime();
        },
        get_by_path: function(path) {
            assert(path.length == 1);
            if (path[0] == this.file.name) {
                return this;
            }
        },
        get_path: function() {
            if (this.directory) { // have a parent directory!
                console.log('file',this.directory.entry.fullPath);
                var parts = this.directory.entry.fullPath.split('/'); // should we remove the root directory?
                debugger;
                parts.shift(1);
                //parts.shift(1); // also remove root directory! -- TODO -- only do this if only a single directory was dragged in
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

    var DNDDirectoryEntry = Backbone.Model.extend({
        initialize: function(opts) {
            this.entry = opts.entry;
            this.parent = opts.parent;
            this.files = [];
            this.directories = [];
            this._reading = false;
        },
        destroy: function() {
            mylog(1,'please garbage collect me!, directory');
        },
        items: function() {
            var arr = [];
            for (var i=0; i<this.directories.length; i++) {
                arr.push(this.directories[i]);
            }
            for (var i=0; i<this.files.length; i++) {
                arr.push(this.files[i]);
            }
            return arr;
        },
        get_by_path: function(sarr) {
            var arr = _.clone(sarr);
            if (arr.length == 1) {
                for (var i=0; i<this.files.length; i++) {
                    if (this.files[i].entry.name == arr[0]) {
                        return this.files[i];
                    }
                }
            } else {
                var part = arr.shift();
                for (var i=0; i<this.directories.length; i++) {
                    if (this.directories[i].entry.name == part) {
                        return this.directories[i].get_by_path(arr);
                    }
                }
            }
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
        serialize_meta: function(arr, opts, stack) {
            if (stack === undefined) {
                var cloned = [];
            } else {
                var cloned = _.clone(stack);
            }
            if (this.entry && this.entry.name) {
                cloned.push(this.entry.name);
            }
            // not working properly!
            _.each(this.files, function(file) {
                file.serialize_meta(arr, opts, cloned);
            });

            // better -- explicitly include current directory name
            _.each(this.directories, function(dir) {
                dir.serialize_meta(arr, opts, cloned);
            });
        },
        get_name: function() {
            return this.entry.name;
        },
        populate: function(cb) {
            // reads & populates all DNDFileEntry+File objects
            this._reading = true;
            var item = this.entry;
            if (item) {
                var _this = this;
                var reader = item.createReader();
                reader.readEntries( function(result) {
                    _this._reading = false;
                    // gets FileEntries
                    if (result.length) {
                        for (var j=0; j<result.length; j++) {
                            var it = result[j];
                            if (it.isDirectory) {
                                var dir = new DNDDirectoryEntry( { entry: it, parent: _this } );
                                _this.directories.push( dir );
                                dir.populate(cb); // XXX callbacks being fired before directories are populated!
                            } else {
                                var file = new DNDFileEntry({entry:it, directory:_this});
                                _this.files.push( file );
                                file.populate(cb);
                            }
                        }
                    } else {
                        cb({error: 'no file entries'});
                    }
                });
            } else {
                // empty container (not sure if this works correctly)
                var iterkeys = ['directories','files'];
                for (var j=0; j<2; j++) {
                    var entries = this[iterkeys[j]];
                    for (var i=0; i<entries.length; i++) {
                        var entry = entries[i];
                        entry.populate( cb );
                    }
                    
                }
                
            }
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
            _.bindAll(this, 'dragenter', 'dragleave', 'drop','oncomplete','onprogress','reset');
            var dropbox = opts.el;
            this.btapp = opts.btapp;

            dropbox.on("dragenter", this.dragenter);
            dropbox.on("dragleave", this.dragleave);
            dropbox.on("dragover", this.dragover);
            dropbox.on("drop", this.drop);
            this.reset();
        },
        reset: function() {
            this._triggered = false;
            if (this.container) {
                this.container.destroy();
            }
            if (this.model) {
                this.model.destroy();
            }

            this.container = new DNDDirectoryEntry({parent:null, entry:null});;
            this.model = new UploadSession( {btapp:this.btapp} );
        },
        dragover: function(evt) {
            // console.log('dragover'); // triggered when mouse moves over drop zone
            evt.originalEvent.stopPropagation();
            evt.originalEvent.preventDefault();
        },
        dragenter: function(evt) {
            //console.log('dragenter');
            evt.originalEvent.stopPropagation();
            evt.originalEvent.preventDefault();
            this.$el.css('border','4px dashed yellow');
        },
        dragleave: function(evt) {
            //console.log('dragleave');
            evt.originalEvent.stopPropagation();
            evt.originalEvent.preventDefault();
            this.$el.css('border','3px dashed black');
        },
        error: function(data) {
            console.log('drag widget fail:',data);
        },
        try_trigger_ready: function() {
            var iterkeys = ['directories','files'];
            for (var j=0; j<2; j++) {
                var entries = this.container[iterkeys[j]];
                for (var i=0; i<entries.length; i++) {
                    var entry = entries[i];
                    if (! entry.populated()) {
                        return false;
                    }
                }
            }
            this.trigger_ready();
        },
        trigger_ready: function() {
            if (! this._triggered) {
                mylog(1,'ready to upload', this.container);
                this.model.ready(this.container);
            }
            this._triggered = true;
            this.model.on('oncomplete', this.oncomplete);
            this.model.on('progress', this.onprogress);
        },
        oncomplete: function() {
            mylog(1, 'upload view handle complete!!! :-)')
            this.$('.info').text('all done uploadin!!');
            //this.reset();
        },
        onprogress: function(data) {
            this.$('.info').text(JSON.stringify(data));
        },
        drop: function(evt) {
            mylog(1,'uploadview DROP!');
            // TODO -- option to not create on drop, but create after button pressed.
            var _this = this;
            evt.originalEvent.stopPropagation();
            evt.originalEvent.preventDefault();
            
            var files = evt.originalEvent.dataTransfer.files;
            var items = evt.originalEvent.dataTransfer.items;
            if (items) {
                for (var i=0; i<items.length; i++) {
                    if (items[i].webkitGetAsEntry) {
                        var item = items[i].webkitGetAsEntry();

                        if (item.isDirectory) {
                            // need this to happen recursively...
                            var dir = new Directory({entry:item});
                            // this.entries.push(dir);
                            this.container.directories.push(dir);
                        } else {
                            var file = new File({entry:item, directory:null}); // XXX DNDFile?
                            this.container.files.push(file);
                        }

                    }
                }
                _this.$('.info').text('dropped some things!');
                // populate all the directory entries
                var iterkeys = ['directories','files'];
                for (var j=0; j<2; j++) {
                    var entries = this.container[iterkeys[j]];
                    for (var i=0; i<entries.length; i++) {
                        var entry = entries[i];
                        entry.populate( function(data) {
                            if (data && data.error) {
                                _this.error(data);
                            } else {
                                if (entry.populated()) {
                                    _this.try_trigger_ready();
                                }
                            }
                        });
                    }
                    
                }


            } else if (files) {
                debugger;
                // notify that dropping in directories is not supported.
                var count = files.length;
            } else {
                debugger;
                // notify that drag and drop doesn't work, have to browse to upload
            }
        }
    });

    window.UploadSession = UploadSession;
    window.DNDDirectoryEntry = DNDDirectoryEntry;
    window.DNDFileEntry = DNDFileEntry;

}).call(this);
