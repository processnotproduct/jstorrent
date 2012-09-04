var TorrentView = Backbone.View.extend({
    initialize: function(opts) {
        this.template = _.template( $('#torrent_template').html() );
        this.$el.html( this.template() );
        this.render();
        this.model.bind('change',_.bind(this.render,this));
    },
    bind_actions: function() {
        this.$('.start-stop').click( _.bind(function(evt) {
            if (this.model.started()) {
                this.model.stop();
            } else {
                this.model.start();
            }
            this.model.save();
            evt.preventDefault();
        },this));

        this.$('.name').click( _.bind(function(evt) {
            jsclientview.select(this.model);
            evt.preventDefault();
        },this));

        this.$('.icon-remove').click( _.bind(function(evt) {
            jsclient.remove_torrent(this.model);
            evt.preventDefault();
        },this));

    },
    render: function() {
        this.$('.name').text( this.model.get_name() );
        this.$('.peers').text( this.model.get('numpeers') + ' peers' );
        
        if (this.model.get('complete')) {
            this.$('.complete').text( this.model.get('complete')/10 + '%' );
        }

        if (this.model.get('state') == 'started') {
            this.$('.start-stop').removeClass('icon-play');
            this.$('.start-stop').addClass('icon-stop');
        } else {
            this.$('.start-stop').addClass('icon-play');
            this.$('.start-stop').removeClass('icon-stop');
        }

    }
});

var TorrentsView = Backbone.View.extend({
    initialize: function(opts) {
        this.model.on('remove',_.bind(this.removed,this));
        this.model.on('add',_.bind(this.added,this));
        this.views = [];
    },
    added: function(model) {
        var view = new TorrentView({model:model});
        this.views.push(view);
        this.$el.append( view.el );
        view.bind_actions();
    },
    removed: function(model) {
        for (var i=0; i<this.views.length; i++) {
            var view = this.views[i];
            if (view.model == model) {
                this.el.removeChild(view.el);
                break;
            }
        }
    },
    render: function() {
        for (var i=0; i<this.model.models.length; i++) {
            var model = this.model.models[i];
            this.added(model);
        }
    }
});

var PeerView = Backbone.View.extend({
    initialize: function(opts) {
        this.template = _.template( $('#peers_template').html() );
        this.$el.html( this.template() );
    }
});

var DetailView = Backbone.View.extend({
    initialize: function(opts) {
        this.template = _.template( $('#detail_template').html() );
        this.$el.html( this.template() );
        this.subview = null;
    },
    set_model: function(model) {
        if (this.subview) {
            this.subview.destroy({parent:this.el});
        }
        this.subview = new PeerView({model:model});
        
    }
});

var JSTorrentClientView = Backbone.View.extend({
    initialize: function(opts) {
        this.template = _.template( $('#client_template').html() );
        this.$el.html( this.template() );
        this.torrentsview = new TorrentsView({model:this.model.torrents, el: this.$('.torrents')});
        this.torrentsview.render();
        //this.detailview = new DetailView({el: this.$('.details')});
    },
    select_torrent: function(torrent) {
        //this.detailview.set_model( torrent );
    },
    render: function() {

    }
});

jQuery(function() {

    window.jsclient = new JSTorrentClient();
    window.jsclientview = new JSTorrentClientView({model:jsclient, el: $('#client')});


    function copy_success(model, entry) {
        model.check_is_torrent( function(result) {
            mylog(1,'copy success',model,entry);
            if (result) {
                jsclient.add_torrent( { metadata: result } );
            } else {
                // lazy torrent creation with althash -- client still
                // sending invalid packet length (likely only for
                // multi-file torrents. ktorrent handles it fine)

                var container = new DNDDirectoryEntry({parent:null, entry:null});;
                //var container = entry;
                if (entry.isFile) {
                    container.files.push( new DNDFileEntry({entry:entry, directory: container}) );
                    container.populate( function() {
                        var althash = get_althash(container);
                        var torrent = new Torrent( {container: container, althash: althash} );
                        jsclient.torrents.add(torrent);
                        torrent.hash_all_pieces( function() {
                            mylog(1, 'torrent ready!');
                            torrent.start();
                        });
                    });
                } else {
                    debugger;
                }
                //}
                
            }
        });
    }
    $(document.body).on("dragenter", function(evt){mylog(1,'dragenter');});
    $(document.body).on("dragleave", function(evt){mylog(1,'dragleave');});
    $(document.body).on("dragover", function(evt){mylog(1,'dragover');});
    $(document.body).on('drop', function(evt) {
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
                    //jsclient.get_filesystem().entries.add(entry);
                    item.copyTo( jsclient.get_filesystem().fs.root, null, _.bind(copy_success, this, entry) );
                }
            }
        }

    });


    jsclient.add_torrent({infohash:"E182045B9360D995F08F88382544763DD0A9DD25"})

});
