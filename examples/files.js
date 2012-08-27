function show(str) {
    $('#showplace').text(str);
}

function onprogress(data) {
    show('upload session progress ' + JSON.stringify(data));
}

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
});

var FileEntryView = Backbone.View.extend({
    tagName: 'div',
    initialize: function() {
        _.bindAll(this,'render', 'on_click_remove','remove_callback','on_click_upload');
        this.template = _.template( $('#file_entry_template').html() );
        this.$el.html( this.template() );
        this.model.on('change:metadata', this.render);
        this.model.on('change:status', this.render);
    },
    bind_events: function() {
        this.$('.commands .icon-remove').click( this.on_click_remove );
        this.$('.commands .icon-upload').click( this.on_click_upload );
    },
    on_click_upload: function() {
        this.model.create_torrent();
    },
    on_click_remove: function() {
        this.$('.name').text('removing...');
        var entry = this.model.get('entry');
        // this.model.set('entry',null);
        if (entry.isDirectory) {
            entry.removeRecursively( this.remove_callback, this.remove_callback );
        } else {
            entry.remove( this.remove_callback, this.remove_callback );
        }
    },
    remove_callback: function(evt) {
        filesystem.update_quota();
        if (evt && evt.code) {
            for (var k in FileError) { // deprecated
                if (FileError[k] == evt.code) {
                    this.$('.name').text('FileError ... '+k);
                    return;
                }
            }
            this.$('.name').text('FileError ... '+evt.code);
        } else {
            this.model.collection.remove( this );
            this.el.parentNode.removeChild(this.el);
        }
    },
    render: function() {
        this.$('.name').text( this.model.get('entry').name );
        if (this.model.get('status')) {
            this.$('.status').text( this.model.get('status') );
        }
        if (this.model.get('metadata')) {
            this.$('.size').text( this.model.get('metadata').size + ' bytes' );
        }
    }
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
    update_quota: function() {
        window.webkitStorageInfo.queryUsageAndQuota(window.TEMPORARY,
                                                    this.queried_storage,
                                                    this.queried_storage);

    },
    queried_storage: function(result, result2) {
        if (result && result.code) {
            debugger;
        } else {
            mylog(1,'queried storage',result,result2);
            this.set('quota',[result,result2]);
        }
    },
    request_fs: function() {
        window.webkitRequestFileSystem(window.TEMPORARY, 1024 * 1024, this.fs_success, this.fs_error);
    },
    fs_success: function(filesystem) {
        this.fs = filesystem;
        mylog(1, 'got filesystem',filesystem);
        this.update_quota();
        this.trigger('initialized');
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
    }
});

var FileSystemView = Backbone.View.extend({
    initialize: function() {
        this.subviews = [];
        _.bindAll(this,'update', 'entry_added');

        this.model.on('initialized', this.update);
        this.model.on('error', this.update);
        this.model.entries.on('add', this.entry_added);
        this.model.on('change:quota', this.update);
    },
    entry_added: function(entry) {
        var view = new FileEntryView( {model:entry} );
        view.render();
        this.subviews.push( view );
        this.$('.list').append( view.$el );
        view.bind_events();
        // new entry was added...
    },
    update: function(args) {
        if (args && args.error && args.error.code) {
            this.$('.error').text('Error: '+args.error.code);
        } else {
            // filesystem name
            this.$('.filesystem-name').text(this.model.fs.name);
        }
        if (this.model.get('quota')) {
            this.$('.quota').text(JSON.stringify(this.model.get('quota')));
        }
    }
});


var DropView = Backbone.View.extend({
    initialize: function() {
        _.bindAll(this, 'dragenter', 'dragleave', 'dragover', 'drop');
        this.$el.on("dragenter", this.dragenter);
        this.$el.on("dragleave", this.dragleave);
        this.$el.on("dragover", this.dragover);
        this.$el.on("drop", this.drop);
    },
    dragenter: function() {
        mylog(1,'dragenter');
    },
    dragleave: function() {
        this.$el.removeClass('hover');
        mylog(1,'dragleave');
    },
    dragover: function() {
        this.$el.addClass('hover');
        mylog(1,'dragover');
    },
    drop: function(evt) {
        this.$el.removeClass('hover');
        evt.originalEvent.stopPropagation();
        evt.originalEvent.preventDefault();
        var files = evt.originalEvent.dataTransfer.files;
        var items = evt.originalEvent.dataTransfer.items;
        if (items) {
            for (var i=0; i<items.length; i++) {
                if (items[i].webkitGetAsEntry) {
                    var item = items[i].webkitGetAsEntry();
                    mylog(1,'dropped entry',item);
                    var entry = new FileEntry({entry:item});
                    entry.set('status','copying');
                    filesystem.entries.add(entry);
                    item.copyTo( this.model.fs.root, null, _.bind(this.copy_success, this, entry), _.bind(this.copy_error, this, entry) );
                }
            }
        }

    },
    copy_success: function(model, entry) {
        mylog(1,'copy success',model,entry);
        model.set('status','copied');
        filesystem.update_quota();
        model.create_torrent();
    },
    copy_error: function(evt) {
        mylog(1,'copy error',evt);
    }
});


jQuery(function() {
    var filesystem = new FileSystem();
    var filesystemview = new FileSystemView( { model: filesystem, el: $('#filesystemview') } );

    filesystem.request_fs();
    var dropview = new DropView({el: $('#dropview'), model:filesystem });

    window.filesystem = filesystem;


    var btclients = new BTClients();
    window.btclients = btclients;
    btclients.find_local_clients(function(){
        console.log('found clients',btclients);
    });

    window.curclient = null;

    btclients.on('add', function(client) {
        console.log('added client',client);
        if (!curclient) { 
            curclient = client; 
            if (! client.get('data').key) {
                client.pair_jsonp( function() {
                    client.save();
                    client.start_updating();
                })
            } else {
                client.start_updating();
            }
        }
        
    });

})
