function try_register_protocol() {
    try {
        mylog(1,'registering prot handler');
        var result = navigator.registerProtocolHandler('web+magnet', config.jstorrent_host + '/static/kzahel/jstorrent/examples/client.html?q=%s', 'JSTorrent');
    } catch(e) {
        var errmsg = e.message;
        mylog(1,'error registering prot handler', errmsg, e);
    }
    mylog(1,'result register',result);
}

var BaseView = Backbone.View.extend({
    destroy: function() {
        this.undelegateEvents();
        this.$el.removeData().unbind();
        this.$el.empty();
        //this.$el.html( this.template() );
        if (this.views) {
            this.views = null;
        }
        //Backbone.View.prototype.remove.call(this);
        if (this.ondestroy) {
            this.ondestroy();
        }
    }
});

var TorrentView = BaseView.extend({
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
            jsclientview.select_torrent(this.model);
            evt.preventDefault();
        },this));

        this.$('.icon-remove').click( _.bind(function(evt) {
            jsclient.remove_torrent(this.model);
            evt.preventDefault();
        },this));

        this.$('.icon-refresh').click( _.bind(function(evt) {
            this.model.reset_attributes();
            evt.preventDefault();
        },this));

        this.$('.icon-upload').click( _.bind(function(evt) {
            this.model.handle_new_peer( config.debug_torrent_client );
            evt.preventDefault();
        },this));

    },
    render: function() {
        this.$('.name').text( this.model.get_name() );
        this.$('.peers').text( this.model.connections.models.length + ' peers' );

        this.$('.bytes_sent').text( this.model.get('bytes_sent') );
        this.$('.bytes_received').text( this.model.get('bytes_received') );

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

var TorrentsView = BaseView.extend({
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

var PeerView = BaseView.extend({
    initialize: function(opts) {
        this.template = _.template( $('#peer_template').html() );
        this.$el.html( this.template() );
        this.render()
        this.model.bind('change',_.bind(this.render,this));
    },
    bind_actions: function() {
        this.$('.host').click( _.bind(function(evt) {
            jsclientview.select_peer(this.model);
            evt.preventDefault();
        },this));
    },
    render: function() {
        this.$('.host').text( this.model.get_key() );
        this.$('.client').text( this.model.get_client() );
        this.$('.outbound-chunks').text( this.model.get('outbound_chunks') );
        this.$('.complete').text( Math.floor(this.model.get('complete') * 1000)/10 + '%' );

        this.$('.bytes_sent').text( this.model.get('bytes_sent') );
        this.$('.bytes_received').text( this.model.get('bytes_received') );

        var state = [];
        var keys = ['am_interested', 'am_choked', 'is_interested', 'is_choked'];
        for (var i=0; i<keys.length; i++) {
            var key = keys[i];
            if (this.model.get(key)) {
                state.push(key);
            }
        }
        this.$('.state').text( JSON.stringify(state) );

        if (this.more_render) {
            this.more_render();
        }
    }
});

var DetailedPeerView = PeerView.extend({
    initialize: function(opts) {
        this.template = _.template( $('#detailed_peer_template').html() );
        this.$el.html( this.template() );
        this.render()
        this.model.bind('change',_.bind(this.render,this));
    },
    more_render: function() {
        if (this.model._remote_extension_handshake) {
            this.$('.handshake').text( JSON.stringify( this.model._remote_extension_handshake ) );
        }
    }
});

var PeersView = BaseView.extend({
    initialize: function(opts) {
        this.template = _.template( $('#peers_template').html() );
        this.$el.html( this.template() );
        this.model.on('remove',_.bind(this.removed,this));
        this.model.on('add',_.bind(this.added,this));
        mylog(LOGMASK.ui, 'init peersview',this.model);
        this.views = [];
    },
    ondestroy: function() {
        this.model.unbind('remove');
        this.model.unbind('add');
    },
    added: function(model) {
        var view = new PeerView({model:model});
        //mylog(LOGMASK.ui, 'peersview add',model);
        this.views.push(view);
        this.$('.peers').append( view.el );
        view.bind_actions();
    },
    removed: function(model) {
        for (var i=0; i<this.views.length; i++) {
            var view = this.views[i];
            if (view.model == model) {
                this.$('.peers')[0].removeChild(view.el);
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

var TabsView = BaseView.extend({
    initialize: function(opts) {
        this.template = _.template( $('#tabs_template').html() );
        this.$el.html( this.template() );
        this.bind_actions();
    },
    bind_actions: function() {
        _.each(['peers','general','files'], _.bind(function(tabname) {
            this.$('.' + tabname).click( function() {
                jsclientview.set_tab(tabname);
            });
        },this));
    }
});

var DetailView = BaseView.extend({
    initialize: function(opts) {
        this.template = _.template( $('#detail_template').html() );
        this.$el.html( this.template() );
        this.subview = null;
    },
    set_type: function(type) {
        mylog(1,'set detail view to type',type);
    },
    set_model: function(model) {
        if (this.subview && this.subview.model == model) {
            mylog(LOGMASK.ui,'this view model already set');
            return
        }
        if (model instanceof Torrent) {
            if (this.subview) {
                this.subview.destroy();
            }
            this.subview = new PeersView({model:model.connections, el: this.$('.detail_container')});
        } else if (model instanceof WSPeerConnection) {
            if (this.subview) {
                this.subview.destroy();
            }

            this.subview = new DetailedPeerView({model:model, el: this.$('.detail_container')});
        } else {
            debugger;
        }
        this.subview.render();
    }
});

var JSTorrentClientView = BaseView.extend({
    initialize: function(opts) {
        this.template = _.template( $('#client_template').html() );
        this.$el.html( this.template() );
        this.torrentsview = new TorrentsView({model:this.model.torrents, el: this.$('.torrents')});
        this.torrentsview.render();
        this.detailview = new DetailView({el: this.$('.details')});
        this.tabsview = new TabsView({el: this.$('.tabs')});
    },
    set_tab: function(tabtype) {
        this.detailview.set_type( tabtype );
    },
    select_torrent: function(torrent) {
        mylog(LOGMASK.ui,'select torrent',torrent.repr());
        this.detailview.set_model( torrent );
    },
    select_peer: function(peer) {
        this.detailview.set_model( peer );
    },
    render: function() {

    }
});

jQuery(function() {

    window.jsclient = new jstorrent.JSTorrentClient();
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
                } else if (entry.isDirectory) {
                    container.files.push( new DNDDirectoryEntry({entry:entry, parent: null}) );
                    debugger;
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

    $('#magnet').click( function() {
        try_register_protocol();
    });

    jsclient.add_torrent({magnet:"magnet:?xt=urn:btih:88b2c9fa7d3493b45130b2907d9ca31fdb8ea7b9&dn=Big+Buck+Bunny+1080p&tr=udp%3A%2F%2Ftracker.openbittorrent.com%3A80&tr=udp%3A%2F%2Ftracker.publicbt.com%3A80&tr=udp%3A%2F%2Ftracker.istole.it%3A6969&tr=udp%3A%2F%2Ftracker.ccc.de%3A80"});

});
