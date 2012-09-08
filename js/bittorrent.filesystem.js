var FileEntry = Backbone.Model.extend({
    initialize: function() {
        _.bindAll(this,'got_metadata');
        this.get('entry').getMetadata( this.got_metadata, this.got_metadata );
    },
    got_metadata: function(data) {
        this.set('metadata',data);
    },
    create_torrent: function() {
        var container = new DNDDirectoryEntry({parent:null, entry:null});
        var file = new DNDFileEntry({entry:this.get('entry')});
        container.files = [file];
        file.populate( function() {
            var upload_session = new UploadSession({client:curclient});
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

var FileEntryCollection = Backbone.Collection.extend({
    localStorage: new Store('FileSystemEntryCollection'),
    initialize: function() {
        if (this.models.length == 0) {

        }
    }
});

var FileSystem = Backbone.Model.extend({
    initialize: function() {
        this.entries = new FileEntryCollection();
        //this.entries.on('add', this.entry_added);
        _.bindAll(this, 'fs_success', 'request_fs', 'read_entries','on_read_entries','queried_storage');
    },

    get_file_by_path: function(path, callback) {
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

        next(this.fs.root);
    },
    write_piece: function(piece) {
        // writes piece data to disk

        // sparse files not supported, so we may need to seek to the end of a file by writing null bytes...
        // use torrent piece information to determine if this is necessary.

        


        debugger;

    },

    update_quota: function() {
        window.webkitStorageInfo.queryUsageAndQuota(window.TEMPORARY,
                                                    this.queried_storage,
                                                    this.queried_storage);

    },
    queried_storage: function(result, result2) {
        if (result && result.code) {
            debugger;
        } else {
            //mylog(1,'queried storage',result,result2);
            this.set('quota',[result,result2]);
        }
    },
    request_fs: function() {
        if (window.webkitRequestFileSystem) {
            window.webkitRequestFileSystem(window.TEMPORARY, 1024 * 1024, this.fs_success, this.fs_error);
        } else {
            console.error('no fs support');
        }
    },
    fs_success: function(filesystem) {
        this.fs = filesystem;
        //mylog(1, 'got filesystem',filesystem);
        this.update_quota();
        this.read_entries();
    },
    fs_error: function(err) {
        mylog(1, 'error');
        this.trigger('error', {error:err});
    },
    read_entries: function() {
        var reader = this.fs.root.createReader();
        reader.readEntries( this.on_read_entries );
    },
    on_read_entries: function(results) {
        for (var i=0; i<results.length; i++) {
            var entry = results[i];
            this.entries.add( new FileEntry({entry:entry}) );
        }
        this.trigger('initialized');
    }

});

