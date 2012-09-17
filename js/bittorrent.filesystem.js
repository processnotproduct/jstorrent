(function() {
    jstorrent.FileEntry = Backbone.Model.extend({
        /* XXX HOW is this distinct from DNDFileEntry */
        initialize: function() {
            _.bindAll(this,'got_metadata');
            this.get('entry').getMetadata( this.got_metadata, this.got_metadata );
        },
        got_metadata: function(data) {
            this.set('metadata',data);
        },
        create_torrent: function() {
            var container = new jstorrent.DNDDirectoryEntry({parent:null, entry:null});
            var file = new jstorrent.DNDFileEntry({entry:this.get('entry')});
            container.files = [file];
            file.populate( function() {
                var upload_session = new jstorrent.UploadSession({client:curclient});
                upload_session.on('progress', onprogress);
                upload_session.ready(container);
            });
        },
        check_is_torrent_onread: function(callback, data) {
            var buf = data.target.result;
            var s = arr2str(new Uint8Array(buf));
            try {
                var decoded = bdecode(s);
            } catch(e) {
                return callback(false);
            }
            callback(decoded);
        },
        check_is_torrent: function(callback) {
            var filereader = new FileReader(); // todo - re-use and seek!
            filereader.onload = _.bind(this.check_is_torrent_onread, this, callback);
            var entry = this.get('entry');
            var name = entry.name;
            if (name.slice(name.length - '.torrent'.length, name.length) == '.torrent') {
                entry.file( function(file) {
                    var blob = file.slice(0, file.size);
                    filereader.readAsArrayBuffer(blob);
                });
            } else {
                callback(false);
            }


        },

    });

    jstorrent.FileEntryCollection = Backbone.Collection.extend({
        localStorage: new Store('FileSystemEntryCollection'),
        initialize: function() {
            if (this.models.length == 0) {

            }
        }
    });

    jstorrent.FileSystem = Backbone.Model.extend({
        initialize: function() {
            this.entries = new jstorrent.FileEntryCollection();
            //this.entries.on('add', this.entry_added);
            this.fss = {};
            this.fs_sizes = {persistent: 10 * 1024*1024*1024,
                             temporary: 20 * 1024*1024*1024 };// doesn't matter at all

            _.bindAll(this, 'read_entries','on_read_entries');
        },
        init_filesystems: function(callback) {
            if (window.webkitRequestFileSystem) {

                var types = ['persistent','temporary'];

                var fns = [ { fn: window.webkitRequestFileSystem, arguments: [webkitStorageInfo.PERSISTENT, this.fs_sizes['persistent']], callbacks: [2,3], error:3 },
                            { fn: window.webkitRequestFileSystem, arguments: [webkitStorageInfo.TEMPORARY, this.fs_sizes['temporary']], callbacks: [2,3], error:3 } ];
                
                new Multi(fns).sequential( _.bind(function(result) {
                    if (result.error) {
                        callback({error:true})
                    } else {
                        for (var i=0; i<result.called.length; i++) {
                            this.fss[types[i]] = result.called[i].data[0];
                        }

                        this.get_quotas( callback )

                        //callback(this.fss);
                    }
                }, this))
                              
            } else {
                this.trigger('unsupported');
                mylog(LOGMASK.error,'no fs support');
            }
        },
        get_quotas: function(callback) {
            var fns = [ { fn: webkitStorageInfo.queryUsageAndQuota, this:webkitStorageInfo, arguments: [webkitStorageInfo.PERSISTENT], callbacks: [1,2], error:2 },
                        { fn: webkitStorageInfo.queryUsageAndQuota, this:webkitStorageInfo,arguments: [webkitStorageInfo.TEMPORARY], callbacks: [1,2], error:2 } ];
            new Multi(fns).sequential( _.bind(function(result) {
                if (result.error) {
                    callback({error:true})
                } else {
                    var quotas = {'persistent': {used:result.called[0].data[0], capacity:result.called[0].data[1]},
                                  'temporary': {used:result.called[1].data[0], capacity:result.called[1].data[0]}};
                    mylog(LOGMASK.disk, 'got quotas', quotas);
                    this.set('quotas',quotas);
                    callback(quotas);
                }
            },this));

        },
        get_file_by_path: function(path, callback, area) {
            assert(area);
            // returns file entry for given path, recursively creating directories as necessary
            var curpath = path.slice();
            var _this = this;
            
            function next(result) {
                if (result && result.isDirectory) {
                    var cur = curpath.shift(1);
                    if (curpath.length == 0) { // no more paths, it's to be a file
                        result.getFile(cur, {create:true}, next, next);
                    } else {
                        result.getDirectory(cur, {create:true}, next, next);
                    }
                } else if (result && result.isFile) {
                    callback(result)
                } else {
                    callback({error:'error getting file by path'});
                }
            }
            next(this.fss[area].root);
        },
        read_entries: function(area) {
            area = area || 'temporary'
            var reader = this.fss[area].root.createReader();
            reader.readEntries( this.on_read_entries );
        },
        on_read_entries: function(results) {
            for (var i=0; i<results.length; i++) {
                var entry = results[i];
                this.entries.add( new jstorrent.FileEntry({entry:entry}) );
            }
            this.trigger('initialized');
        },
        request_persistent_storage: function(callback) {
            webkitStorageInfo.requestQuota( 
                webkitStorageInfo.PERSISTENT,
                this.fs_sizes.persistent, // multiply current by 1.5 or something
                function(quota) {
                    mylog(LOGMASK.disk, 'user allowed quota',quota);
                    if (quota > 0) {
                        callback( {bytes:quota} )
                    } else {
                        callback( {error:'zero quota returned'} );
                    }
                },
                function(a,b,c) {
                    debugger;
                    callback( { error: 'unknown error' } )
                });
        }
    });

})();
