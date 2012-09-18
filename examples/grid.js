function try_register_protocol() {
    try {
        mylog(1,'registering prot handler');
        //var hostpart = config.jstorrent_host;
        var hostpart = '';
        var result = navigator.registerProtocolHandler('web+magnet', hostpart + '/static/kzahel/jstorrent/examples/client.html?q=%s', 'JSTorrent');
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

var CommandsView = BaseView.extend({
    initialize: function(opts) {
        this.template = _.template( $('#commands_template').html() );
        this.$el.html( this.template() );
        this.bind_actions();
    },
    bind_actions: function() {
        _.each(['play','remove','upload','refresh','bell'], _.bind(function(tabname) {
            this.$('.' + tabname).click( _.bind(function() {
                //mylog(1,'click on action',tabname);
                this.options.table.notify_action(tabname);
                //jsclientview.set_tab(tabname);
            },this));
        },this));
    }
});

var AddView = BaseView.extend({
    initialize: function(opts) {
        this.template = _.template( $('#add_template').html() );
        this.$el.html( this.template() );
        this.bind_actions();
    },
    bind_actions: function() {
        this.$('.add').click( _.bind(this.do_add,this) );
        this.$('.url').keypress( _.bind(function(evt) {
            if (evt.keyCode == 13) {
                this.do_add();
            }
        },this));
    },
    do_add: function() {
        var url = this.$('.url').val();
        this.$('.url').val('');
        jsclient.add_unknown(url);
    }
});

var SuperTableView = Backbone.View.extend({
    initialize: function(opts) {
        var columns = opts.columns;
        this.columnByAttribute = {};
        for (var i=0; i<columns.length; i++) {
            this.columnByAttribute[columns[i].field] = i;
        }
        this.dependentAttributes = this.dependentAttributes || {};

        // how to handle update dependent attributes???... (i.e. non-attribute rendered columns like percent complete that don't fire change events but depend on something else...

        var options = {
            enableCellNavigation: true,
            enableColumnReorder: false,
            formatterFactory: opts.makeformatter,
            autoEdit: true,
            editDontDeselect: true,
            editable: true,
            enableAsyncPostRender: true
        };

        this.grid = new Slick.Grid(this.options.el, this.model, columns, options);
        this.grid.setSelectionModel(new Slick.RowSelectionModel());
        //this.grid.setSelectionModel(new Slick.CellSelectionModel());

        this.model.on('add', _.bind(function(m) {
            this.grid.updateRowCount(); // do other stuff to make selection work correctly...
            this.grid.invalidateAllRows();
            this.grid.render();
        },this));

        this.model.bind('change',_.bind(function(model,attributes) {
            var idx = this.model.indexOf(model);
            for (var key in attributes.changes) {

                if (this.dependentAttributes[key]) {
                    for (j=0; j<this.dependentAttributes[key].length; j++) {
                        var i = this.columnByAttribute[this.dependentAttributes[key][j]];
                        this.grid.updateCell(idx, i);
                    }
                }

                var i = this.columnByAttribute[key];
                this.grid.updateCell(idx, i);
            }
        },this));


        this.grid.onSort.subscribe(function(e, msg) {
            var collection = this.getData();
            collection.setSort({
                order:     msg.sortCol.field,
                direction: (msg.sortAsc ? 'ASC' : 'DESC')
            });
        });

    },
    destroy: function() {
        this.model.off('add');
        this.model.off('change');
        this.grid.destroy();
    }
});


var TorrentTableView = SuperTableView.extend({
    initialize: function(opts) {
        opts.columns = [
            {id: "#", name: "num", field: "num", sortable:true, width:30 },
//            {id: "hash", name: "infohash", field: "hash", sortable:true, width:50 },
            {id: "name", name: "name", field: "name", sortable: true, width:500 },
            {id: "size", unit: 'bytes', name: "size", field: "size", sortable: true, width:80 },
            {id: "state", name: "state", field: "state", sortable: true },
            {id: "storage", name: "storage", field: "storage_area", sortable: true },
            {id: "%", name: "% Complete", field: "complete", sortable: true },
            {id: "bytes_sent", unit:'bytes',name: "bytes sent", field: "bytes_sent", sortable: true},
            {id: "send_rate", unit:'bytes',name: "send_rate", field: "send_rate", sortable: true},
            {id: "bytes_received", unit:'bytes',name: "bytes received", field: "bytes_received", sortable: true},
            {id: "receive_rate", unit:'bytes',name: "receive_rate", field: "receive_rate", sortable: true},
            {id: "numpeers", name: "numpeers", field: "numpeers", sortable: true},
            {id: "numswarm", name: "numswarm", field: "numswarm", sortable: true}
        ];
        var progress_template = jstorrent.tmpl("progress_template");
        this.dependentAttributes = { 'bytes_sent': ['send_rate'],
                                     'bytes_received': ['receive_rate']
                                   };
        opts.makeformatter = {
            getFormatter: function(column) {
/*
                if (column.field == 'name') {
                    return function(row,cell,value,col,data) { return data.get_name(); }
*/
                if (column.field == 'hash') {
                    return function(row,cell,value,col,data) { return data.get_infohash('hex'); }
/*                } else if (column.field == 'numswarm') {
                    return function(row,cell,value,col,data) { return data.swarm.models.length; }
*/
                } else if (column.field == 'num') {
                    return function(row,cell,value,col,data) { 
                        return row;
                    }
                } else if (column.field == 'send_rate') {
                    return function(row,cell,value,col,data) { 
                        var val = data.bytecounters.sent.avg();
                        if (val > 0) {
                            return to_file_size(val) + '/s';
                        }
                    }
                } else if (column.field == 'receive_rate') {
                    return function(row,cell,value,col,data) { 
                        var val = data.bytecounters.received.avg();
                        if (val > 0) {
                            return to_file_size(val) + '/s';
                        }
                    }
                } else if (column.unit == 'bytes') {
                    return function(row,cell,value,col,data) { 
                        var val = data.get(col.field)
                        if (val > 0) {
                            return to_file_size(val);
                        } else {
                            return '';
                        }
                    }
                } else if (column.field == 'complete') {
                    return function(row,cell,value,col,data) {
                        return progress_template({'percent':data.get('complete')/10,
                                                  'isactive':(data.get('state') == 'started')?'active':''
                                                 });
                    }
                } else {
                    return function(row,cell,value,col,data) {
                        return data.get(col.field);
                    };
                }
            }
        };
        SuperTableView.prototype.initialize.apply(this,[opts]);
        this.bind_events();
    },
    bind_events: function() {
        this.grid.onClick.subscribe( _.bind(function(evt, data) {
            var torrent = this.grid.getDataItem(data.row);
            mylog(LOGMASK.ui,'click on torrent',torrent);
            jsclientview.set_subview_context(torrent);
        },this));
        this.grid.onSelectedRowsChanged.subscribe( _.bind(function(evt,data) {
            var selected = data.rows;
            var torrents = [];
            for (var i=0; i<selected.length; i++) {
                var torrent = this.grid.getDataItem(selected[i]);
                torrents.push(torrent);
            }
            mylog(LOGMASK.ui,'selection changed',torrents);
            //window.filetableview.notify_selection(torrents);
        },this));
    },
    notify_action: function(action) {
        if (action == 'remove') {
            var rows = this.grid.getSelectedRows();
            var models = [];
            for (var i=0; i<rows.length; i++) {
                //models.push(  );
                models.push( this.grid.getDataItem(rows[i]) );
                //jsclient.remove_torrent(model);
                //this.grid.invalidateRow(i);
            }
            for (var i=0; i<models.length; i++) {
                jsclient.remove_torrent(models[i]);
            }

            var invalid = [];
            var m = Math.min.apply(Math,rows);
            var M = this.grid.getRenderedRange().bottom;
            for (var i=m; i<M; i++) {
                invalid.push(i);
            }

            //this.grid.invalidateRows(invalid);
            this.grid.setSelectedRows([]);            
            this.grid.invalidate();
            this.grid.updateRowCount();
            this.grid.scrollRowIntoView(m); // ?
            this.grid.render();
        } else if (action == 'refresh') {
            // removes associated files...
            var rows = this.grid.getSelectedRows();
            var models = [];
            for (var i=0; i<rows.length; i++) {
                var torrent = this.grid.getDataItem(rows[i]);
                torrent.reset_attributes();
                torrent.save();
            }
        } else if (action == 'play') {
            var rows = this.grid.getSelectedRows();
            var models = [];
            for (var i=0; i<rows.length; i++) {
                var torrent = this.grid.getDataItem(rows[i]);
                if (torrent.started()) {
                    torrent.stop();
                } else {
                    torrent.start();
                }
            }
        } else {
            mylog(1,'unhandled table action',action);
        }
    }
});


var FileTableView = SuperTableView.extend({
    initialize: function(opts) {
        function renderLink(cellNode, row, data, colDef) {
            data.get_filesystem_entry( function() {
                if (data.filesystem_entry && ! data.filesystem_entry.error) {
                    $(cellNode).empty().html( '<a href="' + data.filesystem_entry.toURL() + '" target="_blank">open</a>' + 
                                              ' <a href="' + data.filesystem_entry.toURL() + '" download="'+data.filesystem_entry.name+'">download</a>' +
                                         ' <a href="player.html?url=' + encodeURIComponent(data.filesystem_entry.toURL()) + '">play</a>'
                                            );
                } else if (data.filesystem_entry && data.filesystem_entry.error) {
                    $(cellNode).text(data.filesystem_entry.error);
                } else {
                    $(cellNode).empty();
                }
            }, {create:false});
        }
        function waitingFormatter() {
            return 'loading...';
        }

        this.torrent = opts.torrent;
        //var editor = Slick.Editors.YesNoSelectEditor;
        var editor = Slick.Editors.SelectCellEditor;
        //var editor = Slick.Editors.Checkbox;
        opts.columns = [
            {id: "#", name: "num", field: "num", sortable:true, width:30 },
            {id: "name", name: "name", field: "name", sortable: true, width:500 },
            {id: "size", unit: 'bytes', name: "size", field: "size", sortable: true, width:80 },
            {id: "pieces", name: "pieces", field: "pieces", sortable: true},
            {id: "first_piece", name: "first_piece", field: "first_piece", sortable: true},
//            {id: "path", unit: 'path', name: "path", field: "path", sortable: true, width:80 },
            {id:'actions', name:'actions', field:'actions', width:120, asyncPostRender: renderLink, formatter: waitingFormatter },
            {id: "%", name: "% Complete", field: "complete", sortable: true, attribute:false },
            {id: "priority", name: "priority", field: "priority", sortable: true, editor: editor, options:'Normal,Skip' }
        ];
        var progress_template = jstorrent.tmpl("progress_template");
        opts.makeformatter = {
            getFormatter: function(column) {
                if (column.field == 'pathaoeu') {
                    return function(row,cell,value,col,data) {
                        return '<a href="' + data.filesystem_entry + '">open</a>';
                    };
                } else if (column.unit == 'bytes') {
                    return function(row,cell,value,col,data) { 
                        var val = data.get(col.field)
                        if (val > 0) {
                            return to_file_size(val);
                        } else {
                            return '';
                        }
                    }
                } else if (column.field == 'complete') {
                    return function(row,cell,value,col,data) {
                        return progress_template({'percent':data.get_percent_complete()*100,
                                                  'isactive':(data.torrent.get('state') == 'started' && data.get_percent_complete() != 1)?'active':''
                                                 });
                    };
                } else {
                    return function(row,cell,value,col,data) {
                        return data.get(col.field);
                    };
                }
            }
        };
        SuperTableView.prototype.initialize.apply(this,[opts]);
        this.bind_events();
    },
    bind_events: function() {
        this.grid.onDblClick.subscribe( _.bind(function(evt, data,c) {
            var file = this.grid.getDataItem(data.row);
            mylog(1,'click file!!!',file,evt,data,c);
            //file.open();
        },this));
    }
});


var PeerTableView = SuperTableView.extend({
    initialize: function(opts) {
        this.torrent = opts.torrent;
        opts.columns = [
            {id: "client", name: "client", field: "client", sortable: true, width:140 },
            {id: "country", name: "country", field: "country", sortable: true, width:140 },
            {id: "host", name: "host", field: "host", sortable: true, width:130 },
            {id: "port", name: "port", field: "port", sortable: true, width:60 },
//            {id: "dht_port", name: "dht_port", field: "dht_port", sortable: true, src:'conn',width:80 },
            {id: "bytes_sent", name: "bytes_sent", field: "bytes_sent", unit: 'bytes', sortable: true },
            {id: "bytes_received", name: "bytes_received", field: "bytes_received", unit: 'bytes', sortable: true },
            {id: "outbound_chunks", name: "outbound_chunks", field: "outbound_chunks", sortable: true, width:40, src:'conn' },
            {id: "chunks_received", name: "chunks_received", field: "chunks_received", sortable: true, width:40, src:'conn' },
            {id: "timeouts", name: "timeouts", field: "timeouts", sortable: true, src:'conn' },
            {id: "max_down", name: "max_down", field: "max_down", sortable: true, src:'conn' },
            {id: "max_up", name: "max_up", field: "max_up", sortable: true, src:'conn' },
            {id: "state", name: "state", field: "state", sortable: true, src:'conn' },
            {id: "last_message", name: "last_message", field: "last_message", sortable: true, src:'conn', width:190 },
            {id: "%", name: "% Complete", field: "complete", src:'conn',sortable: true }
        ];
        opts.makeformatter = {
            getFormatter: function(column) {
                if (column.field == 'pathaoeuaoue') {
                    return function(row,cell,value,col,data) {
                        return '<a href="' + data.filesystem_entry + '">open</a>';
                    };
                } else if (column.unit == 'bytes') {
                    return function(row,cell,value,col,data) { 
                        var val = data.get(col.field)
                        if (val > 0) {
                            return to_file_size(val);
                        } else {
                            return '';
                        }
                    }
                } else if (column.field == 'client') {
                    return function(row,cell,value,col,data) {
                        if (data._remote_extension_handshake) {
                            return data._remote_extension_handshake['v'];
                        }
                    };
                } else if (column.src == 'conn') {
                    return function(row,cell,value,col,data) {
                        return data.get(col.field);
                    };
                } else {
                    return function(row,cell,value,col,data) {
                        return data.peer.get(col.field);
                    };
                }
            }
        };
        SuperTableView.prototype.initialize.apply(this,[opts]);
        this.bind_events();
    },
    bind_events: function() {
        this.grid.onDblClick.subscribe( _.bind(function(evt, data,c) {
            var peerconn = this.grid.getDataItem(data.row);
            mylog(1,'click thing!!!!!',file,evt,data,c,peerconn,peerconn.peer);
            //file.open();
        },this));
    }
});


var SwarmTableView = SuperTableView.extend({
    initialize: function(opts) {
        this.torrent = opts.torrent;
        opts.columns = [
            {id: "country", name: "country", field: "country", sortable: true, width:140 },
//            {id: "id", name: "id", field: "id" },
            {id: "host", name: "host", field: "host", sortable: true, width:130 },
            {id: "port", name: "port", field: "port", sortable: true, width:60 },
            {id: "conn", name: "conn", field: "conn" },
            {id: "last_closed", name: "last_closed", field: "last_closed", width:140 },
            {id: "unresponsive", name: "unresponsive", field: "unresponsive" },
            {id: "banned", name: "banned", field: "banned" },
            {id: "ever_connected", name: "ever_connected", field: "ever_connected" },
        ];
        opts.makeformatter = {
            getFormatter: function(column) {
                if (column.field == 'pathaoeuaoue') {
                    return function(row,cell,value,col,data) {
                        return '<a href="' + data.filesystem_entry + '">open</a>';
                    };
                } else if (column.field == 'conn') {
                    return function(row,cell,value,col,data) {
                        if (data.get('conn')) {
                            return 'yes'
                        } else {
                            return '';
                        }
                    };
                } else {
                    return function(row,cell,value,col,data) {
                        return data.get(col.field);
                    };
                }
            }
        };
        SuperTableView.prototype.initialize.apply(this,[opts]);
    }
});



var TrackerTableView = SuperTableView.extend({
    initialize: function(opts) {
        this.torrent = opts.torrent;
        opts.columns = [
            {id: "#", name: "num", field: "num", sortable:true, width:30 },
            {id: "url", name: "url", field: "url", sortable: true, width:400 },
            {id: "state", name: "state", field: "state", sortable: true, width:200 },
            {id: "announces", name: "announces", field: "announces", sortable: true, width:100 },
            {id: "peers", name: "peers", field: "peers", sortable: true, width:100 },
        ];
        opts.makeformatter = {
            getFormatter: function(column) {
                if (column.field == 'pathaoeuaoue') {
                    return function(row,cell,value,col,data) {
                        return '<a href="' + data.filesystem_entry + '">open</a>';
                    };
                } else {
                    return function(row,cell,value,col,data) {
                        return data.get(col.field);
                    };
                }
            }
        };
        SuperTableView.prototype.initialize.apply(this,[opts]);
        this.bind_events();
    },
    bind_events: function() {
        this.grid.onDblClick.subscribe( _.bind(function(evt, data,c) {
            var thing = this.grid.getDataItem(data.row);
            mylog(1,'click thing!!!!!',thing);
        },this));
    }
});

var TabsView = BaseView.extend({
    initialize: function(opts) {
        this.template = _.template( $('#tabs_template').html() );
        this.$el.html( this.template() );
        this.bind_actions();
    },
    bind_actions: function() {
        _.each(['peers','general','files','trackers','swarm'], _.bind(function(tabname) {
            this.$('.' + tabname).click( function() {
                jsclientview.set_tab(tabname);
            });
        },this));
    }
});

var GeneralDetailView = BaseView.extend({
    initialize: function(opts) {
        this.template = _.template( $('#general_detail_template').html() );
        this.$el.html( this.template() );
        this.bind_actions();
        this.render();
    },
    render: function() {
        this.$('.infohash').text( this.model.hash_hex );
        this.$('.magnet').text( this.model.get_magnet_link() );
    },
    bind_actions: function() {
        
    }
});

var JSTorrentClientViewSettings = Backbone.Model.extend({
    localStorage: new Store('JSTorrentClientViewSettings'),
    initialize: function() {
    },
    
});

var JSTorrentClientView = BaseView.extend({
    initialize: function(opts) {
        this.settings = new JSTorrentClientViewSettings();
        this.settings.id = 'client';
        this.settings.fetch();
        this.template = _.template( $('#client_template').html() );
        this.$el.html( this.template() );
        this.addview = new AddView({el:this.$('.addview')});
        this.torrenttable = new TorrentTableView({ model: jsclient.torrents, el: this.$('.torrentGrid') });
        this.detailview = null;
        this.commands = new CommandsView({el:this.$('.commands'), table:this.torrenttable});
        this.tabs = new TabsView({el:this.$('.tabs')});
    },
    init_detailview: function() {
        if (this.detailview) { this.detailview.destroy(); }
        var ctxid = this.settings.get('subview_context');
        var torrent = jsclient.torrents.get(ctxid);
        var curtab = this.settings.get('tab');
        if (curtab == 'files') {
            if (torrent.get_infodict()) {
                torrent.init_files();
                jsclientview.detailview = new FileTableView({ model: torrent.files, torrent: torrent, el: this.$('.fileGrid')});
            }
        } else if (curtab == 'peers') {
            jsclientview.detailview = new PeerTableView({ model: torrent.connections, torrent: torrent, el: this.$('.fileGrid')});
        } else if (curtab == 'swarm') {
            jsclientview.detailview = new SwarmTableView({ model: torrent.swarm, torrent: torrent, el: this.$('.fileGrid')});
        } else if (curtab == 'trackers') {
            jsclientview.detailview = new TrackerTableView({ model: torrent.trackers, torrent: torrent, el: this.$('.fileGrid')});
        } else if (curtab == 'general') {
            jsclientview.detailview = new GeneralDetailView({ model: torrent, el: this.$('.fileGrid') });
        }
    },
    set_subview_context: function(ctx) {
        var old = this.settings.get('subview_context');
        if (old != ctx) {
            this.settings.set('subview_context', ctx.id);
            this.settings.save();
            this.init_detailview();
        }
    },
    set_tab: function(tabtype) {
        this.settings.set('tab',tabtype);
        this.settings.save();
        this.init_detailview();
        
        //this.detailview.set_type( tabtype );
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
    function copy_success(model, entry) {
        mylog(1,'copy success',model,entry);
        if (entry instanceof FileError) {
            log_file_error(entry);
        }

        function do_create() {
            
            //var container = entry;
            if (entry.isFile) {
                //var container = new jstorrent.DNDDirectoryEntry({parent:null, entry:null});;
                //container.files.push( new jstorrent.DNDFileEntry({entry:entry, directory: container}) );
                var container = new jstorrent.DNDFileEntry({entry:entry, directory: null});
            } else if (entry.isDirectory) {
                var container = new jstorrent.DNDDirectoryEntry({entry:entry, parent: null})
            }

            var fired = false;
            function check_populated() {
                //mylog(1,'check populated...');
                if (! fired && container.populated()) {
                    fired = true;
                    //var althash = jstorrent.get_althash(container);
                    var l = jsclient.torrents.models.length;
                    var torrent = new jstorrent.Torrent( { container: container }, { collection: jsclient.torrents } );
                    assert(!torrent.id);
                    assert(jsclient.torrents.models.length == l);
                    jsclient.torrents.add(torrent);
                    torrent.set('state','hashing');
                    torrent.save();
                    assert(torrent.id);
                    assert( torrent.collection._byId[torrent.id] );
                    assert(jsclient.torrents.models.length == l+1);

                    torrent.hash_all_pieces( function() {
                        torrent.container = null;
                        mylog(1, 'torrent ready!');
                        torrent.start();
                    });
                }
            }

            container.populate( check_populated );
        }

        if (model instanceof jstorrent.DNDDirectoryEntry) {
            do_create();
        } else {
            var fe_compat = new jstorrent.FileEntry({entry:entry});
            
            fe_compat.check_is_torrent( function(result) {
                if (result) {
                    jsclient.add_torrent( { metadata: result } );
                } else {
                    // lazy torrent creation with althash -- client still
                    // sending invalid packet length (likely only for
                    // multi-file torrents. ktorrent handles it fine)
                    do_create();
                }
            });
        }

    }
    $(document).on('paste', function(evt) {
        return; // doesn't work in my chrome... returns a prefab image, always a PNG
        var data = evt.originalEvent.clipboardData;
        
        var a = [];
        console.log(JSON.stringify(data.items))
        // doesn't really work... paste only pastes a single file!
        for (var i=0; i<data.items.length; i++) {
            var d = { type:data.items[i].type, 
                      kind:data.items[i].kind, 
                      blob:data.items[i].getAsFile() };
            a.push(d);

            if (d.blob) {
                var fr = new FileReader();
                fr.onload = function(e) {
                    debugger;
/*
                    var buf = e.target.result;
                    mylog(1,'pasted--',ab2str(new Uint8Array(e.target.result,0,50)))
*/
                    var img = document.createElement('img');
                    img.src = e.target.result;
                    document.body.appendChild(img);

                };
                //fr.readAsArrayBuffer(d.blob);
                fr.readAsDataURL(d.blob);

                
            }
        }


    });
    $(document.body).on("dragenter", function(evt){mylog(1,'dragenter');});
    $(document.body).on("dragleave", function(evt){mylog(1,'dragleave');});
    $(document.body).on("dragover", function(evt){mylog(1,'dragover');});
    $(document.body).on('drop', function(evt) {
        mylog(1,'DROP!');
        evt.originalEvent.stopPropagation();
        evt.originalEvent.preventDefault();

        var files = evt.originalEvent.dataTransfer.files;
        var items = evt.originalEvent.dataTransfer.items;
        if (items) {
            for (var i=0; i<items.length; i++) {
                if (items[i].webkitGetAsEntry) {
                    var item = items[i].webkitGetAsEntry();
                    var fs = jsclient.get_filesystem().fss['temporary'];
                    mylog(LOGMASK.disk,'dropped entry',item);
                    if (item.isFile) {
                        var entry = new jstorrent.DNDFileEntry({entry:item});
                        entry.set('status','copying');
                        //jsclient.get_filesystem().entries.add(entry);
                        item.copyTo( fs.root, null, _.bind(copy_success, this, entry), _.bind(copy_success, this, entry) );
                    } else {
                        var _this = this;
                        function copy_error(entry) {
                            if (entry instanceof FileError) {
                                log_file_error(entry);
                            } else {
                                mylog(LOGMASK.error,'copy error',entry);
                            }
                        }

                        function dir_ready() {
                            var entry = new jstorrent.DNDDirectoryEntry({entry:item});
                            entry.set('status','copying');
                            //jsclient.get_filesystem().entries.add(entry);
                            item.copyTo( fs.root, null, _.bind(copy_success, _this, entry), _.bind(copy_success, _this, entry), copy_error );
                        }
                        fs.root.getDirectory(item.name, null, _.bind(function(entry) {
                            if (entry instanceof FileError) {
                                log_file_error(entry);
                            } else {
                                entry.removeRecursively(function() {
                                    dir_ready();
                                });
                            }
                        },this), dir_ready);
                    }
                }
            }
        }

    });

    $('#magnet').click( function() {
        try_register_protocol();
    });

    // 12E3AAA7F2F36137CCE9978824BCF156A339FF76

    //jsclient.add_torrent({magnet:"magnet:?xt=urn:btih:88b2c9fa7d3493b45130b2907d9ca31fdb8ea7b9&dn=Big+Buck+Bunny+1080p&tr=udp%3A%2F%2Ftracker.openbittorrent.com%3A80&tr=udp%3A%2F%2Ftracker.publicbt.com%3A80&tr=udp%3A%2F%2Ftracker.istole.it%3A6969&tr=udp%3A%2F%2Ftracker.ccc.de%3A80"});

    jsclient.on('ready', function() {
        window.jsclientview = new JSTorrentClientView({el:$('#client')});
    });


    var url_args = decode_url_arguments('hash');
    if (url_args.hash) {
        jsclient.add_unknown(url_args.hash);
    }
    //jsclient.add_random_torrent();
});
