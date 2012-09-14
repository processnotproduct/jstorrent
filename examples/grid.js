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

        var options = {
            enableCellNavigation: true,
            enableColumnReorder: false,
            formatterFactory: opts.makeformatter,
            enableAsyncPostRender: true
        };

        this.grid = new Slick.Grid(this.options.elid, this.model, columns, options);
        this.grid.setSelectionModel(new Slick.RowSelectionModel());

        this.model.on('add', _.bind(function(m) {
            this.grid.updateRowCount();
            this.grid.render();
        },this));

        this.model.bind('change',_.bind(function(model,attributes) {
            var idx = this.model.indexOf(model);
            for (var key in attributes.changes) {
                var i = this.columnByAttribute[key];
                this.grid.updateCell(idx, i);
            }
        },this));

/*
        grid.onSort.subscribe(function(e, msg) {
            var collection = this.getData();
            collection.extendScope({
                order:     msg.sortCol.field,
                direction: (msg.sortAsc ? 'ASC' : 'DESC')
            });
            collection.fetchWithScope(); // NOTE: resetting pagination
        });
*/
    },
    destroy: function() {
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
            {id: "%", name: "% Complete", field: "complete", sortable: true },
            {id: "bytes_sent", unit:'bytes',name: "bytes sent", field: "bytes_sent", sortable: true},
            {id: "bytes_received", unit:'bytes',name: "bytes received", field: "bytes_received", sortable: true},
            {id: "numpeers", name: "numpeers", field: "numpeers", sortable: true},
            {id: "numswarm", name: "numswarm", field: "numswarm", sortable: true}
        ];
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
                } else if (column.unit == 'bytes') {
                    return function(row,cell,value,col,data) { 
                        var val = data.get(col.field)
                        if (val > 0) {
                            return to_file_size(val);
                        } else {
                            return '';
                        }
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

        this.grid.onDblClick.subscribe( _.bind(function(evt, data) {
            var torrent = this.grid.getDataItem(data.row);
            if (window.filetableview) {
                window.filetableview.destroy();
            }
            torrent.init_files();
            window.filetableview = new FileTableView({ model: torrent.files, elid: '#fileGrid' });
        },this));
        this.grid.onSelectedRowsChanged.subscribe( _.bind(function(evt,data) {
            var selected = data.rows;
            window.detail
            var torrents = [];
            for (var i=0; i<selected.length; i++) {
                var torrent = this.grid.getDataItem(selected[i]);
                torrents.push(torrent);
            }
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
                if (data.filesystem_entry) {
                    $(cellNode).empty().html( '<a href="' + data.filesystem_entry.toURL() + '" target="_blank">open</a>' + ' <a href="' + data.filesystem_entry.toURL() + '" download="'+data.filesystem_entry.name+'">download</a>' );
                } else {
                    $(cellNode).empty();
                }
            });
        }
        function waitingFormatter() {
            return 'fetch...';
        }

        this.torrent = opts.torrent;
        opts.columns = [
            {id: "#", name: "num", field: "num", sortable:true, width:30 },
            {id: "name", name: "name", field: "name", sortable: true, width:500 },
            {id: "size", unit: 'bytes', name: "size", field: "size", sortable: true, width:80 },
//            {id: "path", unit: 'path', name: "path", field: "path", sortable: true, width:80 },
            {id:'actions', name:'actions', field:'actions', width:120, asyncPostRender: renderLink, formatter: waitingFormatter },
            {id: "%", name: "% Complete", field: "complete", sortable: true }
        ];
        opts.makeformatter = {
            getFormatter: function(column) {
                if (column.field == 'pathaoeu') {
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
            var file = this.grid.getDataItem(data.row);
            mylog(1,'click file!!!',file,evt,data,c);
            file.open();
        },this));
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
            var container = new jstorrent.DNDDirectoryEntry({parent:null, entry:null});;
            //var container = entry;
            if (entry.isFile) {
                container.files.push( new jstorrent.DNDFileEntry({entry:entry, directory: container}) );
            } else if (entry.isDirectory) {
                container.directories.push( new jstorrent.DNDDirectoryEntry({entry:entry, parent: null}) );
            }

            var fired = false;
            function check_populated() {
                mylog(1,'check populated...');
                if (! fired && container.populated()) {
                    fired = true;
                    var althash = jstorrent.get_althash(container);
                    var torrent = new jstorrent.Torrent( {container: container, althash: althash} );
                    jsclient.torrents.add(torrent);
                    torrent.hash_all_pieces( function() {
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
                        function dir_ready() {
                            var entry = new jstorrent.DNDDirectoryEntry({entry:item});
                            entry.set('status','copying');
                            //jsclient.get_filesystem().entries.add(entry);
                            item.copyTo( fs.root, null, _.bind(copy_success, _this, entry), _.bind(copy_success, _this, entry) );
                        }

                        fs.root.getDirectory(item.name, null, _.bind(function(entry) {
                            if (entry instanceof FileError) {
                                log_file_error(entry);
                            } else {
                                entry.removeRecursively(function() {
                                    dir_ready();
                                });
                            }
                        },this));
                    }
                }
            }
        }

    });

    $('#magnet').click( function() {
        try_register_protocol();
    });

    //jsclient.add_torrent({magnet:"magnet:?xt=urn:btih:88b2c9fa7d3493b45130b2907d9ca31fdb8ea7b9&dn=Big+Buck+Bunny+1080p&tr=udp%3A%2F%2Ftracker.openbittorrent.com%3A80&tr=udp%3A%2F%2Ftracker.publicbt.com%3A80&tr=udp%3A%2F%2Ftracker.istole.it%3A6969&tr=udp%3A%2F%2Ftracker.ccc.de%3A80"});

    window.addview = new AddView({el:$('#addview')});
    window.torrenttable = new TorrentTableView({ model: jsclient.torrents, elid: '#torrentGrid' });
    //window.filetableview = new FileTableView({ elid: '#fileGrid' });
    window.commands = new CommandsView({el:$('#commands'), table:window.torrenttable});


    var url_args = decode_url_arguments('hash');
    if (url_args.hash) {
        jsclient.add_unknown(url_args.hash);
    }
    //jsclient.add_random_torrent();
});
