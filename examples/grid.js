function try_register_protocol() {
    try {
        mylog(1,'registering prot handler');
        //var hostpart = config.jstorrent_host;
        var hostpart = '';
        var result = navigator.registerProtocolHandler('web+magnet', hostpart + window.location.pathname + '?q=%s', 'JSTorrent');
    } catch(e) {
        var errmsg = e.message;
        mylog(1,'error registering prot handler', errmsg, e);
    }
    mylog(1,'result register',result);
}


function setup_chrome_context_menu() {
    /* ah fuck, this only creates a context menu in the app itself.
       I was hoping to add one to the browser.

       So I'll have to do something like this in an extension and hope
       people install that. */

    var menu = chrome.contextMenus.create({
	"title": "Download with JSTorrent",
	"contexts": ["all"],
	"id": "JSTorrent"
    }, function(ondone) {
	console.log("setup chrome context menu result", ondone, "error?", chrome.runtime.lastError);
    });

    chrome.contextMenus.onClicked.addListener(function(info, tab) {
	console.log('user clicked on context menu',info,tab);
    });


}

function check_is_torrent(buf) {
    var s = arr2str(new Uint8Array(buf));
    try {
        var decoded = bdecode(s);
    } catch(e) {
        return false
    }
    return decoded
}


//if (config.packaged_app) { setup_chrome_context_menu(); }

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
        //this.template = _.template( $('#commands_template').html() );
        this.$el.html( $('#commands_template').html() );
        this.bind_actions();
    },
    update_play_action: function(selected) {
        var action = 'stop';
        for (var i=0; i<selected.length; i++) {
            var torrent = jsclientview.torrenttable.grid.getDataItem(selected[i]);
            if (torrent) {
                if (torrent.get('state') == 'stopped') {
                    action = 'start';
                }
            } else {
                mylog(1,'update play action on',selected,'couldnt find model');
            }
        }
        this.set_play_action(action);
    },
    set_play_action: function(action) {
        if (action == 'start') {
            this.$('.play-i').removeClass('icon-stop');
            this.$('.play-i').addClass('icon-play');

            this.$('.play').removeClass('btn-warning');
            this.$('.play').addClass('btn-success');
        } else {
            this.$('.play-i').removeClass('icon-play');
            this.$('.play-i').addClass('icon-stop');

            this.$('.play').removeClass('btn-success');
            this.$('.play').addClass('btn-warning');
        }
            
    },
    bind_actions: function() {
        _.each(['play','remove','upload','refresh','bell'], _.bind(function(tabname) {
            this.$('.' + tabname).click( _.bind(function() {
                //mylog(1,'click on action',tabname);
                this.options.table.notify_action(tabname);

                //_gaq.push(['_trackEvent', 'CommandClick', tabname]);
                gatracker.sendEvent('CommandClick', tabname);

                //jsclientview.set_tab(tabname);
            },this));
        },this));
    }
});

var AddView = BaseView.extend({
    initialize: function(opts) {
        //this.template = _.template( $('#add_template').html() );
        this.$el.html( $('#add_template').html() );
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

        //_gaq.push(['_trackEvent', 'do_add', 'AddView']);
        gatracker.sendEvent('do_add', 'AddView');

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
            rowHeight: 22,
            //headerRowHeight: 18,
            //topPanelHeight: 16,
            editable: true,
            enableAsyncPostRender: true
        };

        this.grid = new Slick.Grid(this.options.el, this.model, columns, options);
        this.grid.setSelectionModel(new Slick.RowSelectionModel());
        //this.grid.setSelectionModel(new Slick.CellSelectionModel());

        this.model.on('flash', _.bind(this.flash_model, this));

        this.model.on('add', _.bind(function(m) {
            this.grid.updateRowCount(); // do other stuff to make selection work correctly...
            this.grid.invalidateAllRows();
            this.grid.render();
            if (this instanceof TorrentTableView) {
                this.flash_model(m);
            }
        },this));

        this.model.on('remove', _.bind(function(m) {
            this.grid.updateRowCount(); // do other stuff to make selection work correctly...
            this.grid.invalidateAllRows();
            this.grid.render();
        },this));


        this.model.bind('change:state', _.bind(function(model, attributes) {
            var idx = this.model.indexOf(model); // XXX - slow??
            if (_.contains(this.grid.getSelectedRows(),idx)) {
                jsclientview.commands.update_play_action(this.grid.getSelectedRows());
            }
        }, this));
            

        this.model.bind('change',_.bind(function(model,attributes) {
            var idx = this.model.indexOf(model); // XXX - slow??

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
    flash_model: function(m) {
        var idx = this.model.indexOf(m); // XXX - slow??
        this.grid.scrollRowIntoView(idx);
        this.grid.flashCell(idx, this.grid.getColumnIndex("name"), 400);
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
//            {id: "#", name: "num", field: "num", sortable:true, width:30 },
//            {id: "hash", name: "infohash", field: "hash", sortable:true, width:50 },
            {id: "name", name: "Name", field: "name", sortable: true, width:500 },
            {id: "size", unit: 'bytes', name: "Size", field: "size", sortable: true, width:80 },
            {id: "state", name: "State", field: "state", sortable: true },
//            {id: "%", name: "% Complete", field: "complete", sortable: true },
            {id: "%", name: "% Complete", field: "complete", sortable: true },
            {id: "bytes_sent", unit:'bytes',name: "Bytes sent", field: "bytes_sent", sortable: true},
            {id: "send_rate", unit:'bytes',name: "Up Speed", field: "send_rate", sortable: true},
            {id: "bytes_received", unit:'bytes',name: "bytes received", field: "bytes_received", sortable: true},
            {id: "receive_rate", unit:'bytes',name: "Down Speed", field: "receive_rate", sortable: true},
            {id: "numpeers", name: "Peers", field: "numpeers", sortable: true},
            {id: "numswarm", name: "Swarm", field: "numswarm", sortable: true},
            {id: "storage", name: "Storage", field: "storage_area", sortable: true }
        ];
        this.default_height = 200;
        this.options.el.height(this.default_height);
        //var progress_template = jstorrent.tmpl("progress_template");
        var progress_template = $('#progress_template')

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
                } else if (column.field == 'numpeers') {
                    return function(row,cell,value,col,data) { 
                        var val = data.get('numpeers');
                        if (val > 0) {
                            return val;
                        }
                        return '';
                    }
                } else if (column.field == 'numswarm') {
                    return function(row,cell,value,col,data) { 
                        var val = data.get('numswarm');
                        if (val > 0) {
                            return val;
                        }
                        return '';
                    }
                } else if (column.field == 'send_rate') {
                    return function(row,cell,value,col,data) { 
                        var val = data.bytecounters.sent.avg();
                        if (val > 0) {
                            return to_file_size(val) + '/s';
                        }
                        return '';
                    }
                } else if (column.field == 'receive_rate') {
                    return function(row,cell,value,col,data) { 
                        var val = data.bytecounters.received.avg();
                        if (val > 0) {
                            return to_file_size(val) + '/s';
                        }
                        return '';
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
                        var isactive = (data.get('state') == 'started')?'active':'';
                        if (data.get('complete') !== undefined) {
                            var percent = data.get('complete')/10;
/*
                        if (isactive) $('.js-isactive', progress_template).addClass('active');
                        $('.js-percent', progress_template).width(percent+'%');
*/

                            return percent + '%';
                        } else {
                            return ''
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
        this.grid.onClick.subscribe( _.bind(function(evt, data) {

            //_gaq.push(['_trackEvent', 'TorrentClickRow', data.row]);
            gatracker.sendEvent('TorrentClickRow', data.row);


            var torrent = this.grid.getDataItem(data.row);
            mylog(LOGMASK.ui,'click on torrent',torrent);
            // slickgrid bug -- sometimes this does not trigger
            //selected rows change (have to click on another column
            //for it to happen)

            //jsclientview.set_subview_context(torrent);
        },this));
        this.grid.onSelectedRowsChanged.subscribe( _.bind(function(evt,data) {
            var selected = data.rows;
            var torrents = [];
            var action = 'stop';
            for (var i=0; i<selected.length; i++) {
                var torrent = this.grid.getDataItem(selected[i]);
                torrents.push(torrent);
                if (torrent.get('state') == 'stopped' || ! torrent.get('state')) {
                    action = 'start';
                }
            }

            jsclientview.commands.set_play_action(action);

            mylog(LOGMASK.ui,'selection changed',torrents);

            if (torrents.length == 1) {
                jsclientview.set_subview_context(torrents[0]);
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



function renderFileDownload(cellNode, row, data, colDef) {
    var file = data;
    var torrent = file.torrent;

    if (torrent.get_storage_area() == 'gdrive') {
        file.get_cloud_filesystem_entry( function(fe) {
            // altlink opens in gdrive

            // webContentLink is for just downloadin

            if (fe.alternateLink) {
                var openlink = '<a href="' + fe.alternateLink + '" target="_blank"><i class="icon-arrow-down"></i>Open</a>';
                var dllink = '<a href="' + fe.webContentLink + '" target="_blank" download="'+file.get('name')+'"><i class="icon-arrow-down"></i>Download</a>'
                //$(cellNode).html( '<a href="' + fe.alternateLink + '" download="'+file.get('name')+'">Download</a>' );
                $(cellNode).html(  openlink + dllink);
                //console.log('got gdrive data',fe);
            } else {
                $(cellNode).text( JSON.stringify(fe) );
            }
        });
    } else if (jsclient.get_filesystem().unsupported) {
        return 'no filesystem';
    } else {
        $(cellNode).empty()
        data.get_filesystem_entry( function() {
            // SPAGHETTI!!!!!
            if (data.filesystem_entry && ! data.filesystem_entry.error) {
                if (data.stream_parseable_type() && ! data.complete() && ! config.packaged_app) {// broken for packaged apps for some reason...
                    $(cellNode).empty().html('<a class="stream" href="#"><i class="icon-play"></i>Stream</a>');
                    $('.stream', cellNode).click( function(evt) {
                        jsclient.stream(data.torrent.hash_hex, data.num);
                    });
                } else {
                    if (config.packaged_app) {
                        var openstr = '';
                    } else {
                        var openstr = '<a class="js-newwin" href="#"><i class="icon-arrow-down"></i>Open</a>';
                    }
                    $(cellNode).empty().html(
                        '<a class="js-download" href="' + data.filesystem_entry.toURL() + '" download="'+data.filesystem_entry.name+'"><i class="icon-arrow-down"></i>Download</a>'
                            + openstr
                    )
                    $('.js-download', cellNode).click( function(evt) {
                        if (config.packaged_app) {
                            data.save_as();
                            evt.preventDefault();
                        }
                        //jsclient.stream(data.torrent.hash_hex, data.num);
                    });
                    $('.js-newwin', cellNode).click( function(evt) {
                        if (config.packaged_app) {
                            debugger;
                            chrome.app.window.create( data.filesystem_entry.toURL(), {frame:'none'}, function(r){
                                console.log('open windown result',r);
                                evt.preventDefault();
                                evt.stopPropagation();
                            });
                        } else {
                            window.open( data.filesystem_entry.toURL() );
                            //mylog(1,'clicked js-newwin, but not packaged app');
                        }
                    });
                }
            } else if (data.filesystem_entry && data.filesystem_entry.error) {
                $(cellNode).text(data.filesystem_entry.error);
            } else {
                if (data.complete()) {
                    $(cellNode).empty().html(
                        '<a href="' + data.filesystem_entry.toURL() + '" download="'+data.filesystem_entry.name+'"><i class="icon-arrow-down"></i>Download</a>'
                            +
                            '<a href="' + data.filesystem_entry.toURL() + '"><i class="icon-arrow-down"></i>Open</a>'
                    )
                } else if (data.stream_parseable_type() && ! config.packaged_app) {
                    $(cellNode).empty().html('<a class="stream" href="#"><i class="icon-play"></i>Stream</a>');
                    $('.stream', cellNode).click( function(evt) {
                        jsclient.stream(data.torrent.hash_hex, data.num);
                    });
                } else {
                    $(cellNode).empty()
                }
            }
        }, {create:false});
    }
}




var FileTableView = SuperTableView.extend({
    initialize: function(opts) {
        function waitingFormatter() {
            return 'loading...';
        }

        function showupload(cellNode, row, data, colDef) {
        }

        this.torrent = opts.torrent;
        //var editor = Slick.Editors.YesNoSelectEditor;
        var editor = Slick.Editors.SelectCellEditor;
        //var editor = Slick.Editors.Checkbox;
        opts.columns = [
            {id: "#", name: "num", field: "num", sortable:true, width:30 },
            {id: "name", name: "name", field: "name", sortable: true, width:500 },

//            {id: "upload", name: "upload", field: "upload", sortable: false, width:500 },
            {id: "%", name: "% Complete", field: "percent_complete", sortable: true, attribute:false },
            {id:'actions', name:'actions', field:'actions', width:120, asyncPostRender: renderFileDownload, formatter: waitingFormatter },
            {id: "size", unit: 'bytes', name: "size", field: "size", sortable: true, width:80 },
            {id: "gdrive_uploaded", name: "gdrive_uploaded", field: "gdrive_uploaded", width:80 },
            {id: "pieces", name: "pieces", field: "pieces", sortable: true},
            {id: "first_piece", name: "first_piece", field: "first_piece", sortable: true},
//            {id: "path", unit: 'path', name: "path", field: "path", sortable: true, width:80 },


            {id: "priority", name: "priority", field: "priority", sortable: true, editor: editor, options:'Normal,Skip' }
        ];
        //var progress_template = jstorrent.tmpl("progress_template");
        var progress_template = $('#progress_template')
        opts.makeformatter = {
            getFormatter: function(column) {
                if (column.field == 'pathaoeu') {
                    return function(row,cell,value,col,data) {
                        return '<a href="' + data.filesystem_entry + '">open</a>';
                    };
                } else if (column.field == 'upload') {
                    return function(row,cell,value,col,data) { 
                        var session = data.get_cloud_upload_session()
                        if (session) {
                            return 'have session!';
                        } else {
                            return '';
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
                } else if (column.field == 'percent_complete') {
                    return function(row,cell,value,col,data) {
                        //var isactive = (data.torrent.get('state') == 'started' && data.get_percent_complete() != 1)?'active':''
                        return data.get_percent_complete()*100 + '%';
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
//            {id: "country", name: "country", field: "country", sortable: true, width:140 },
            {name: "strurl", field: "conntype", width:30 },
            {id: "host", name: "host", field: "host", sortable: true, width:130 },
            {id: "port", name: "port", field: "port", sortable: true, width:60 },
            {id: "eport", name: "eport", field: "eport", sortable: true, width:60 },
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
                } else if (column.field == 'conntype') {
                    return function(row,cell,value,col,data) {
                        return data.strurl
                    };
                } else if (column.field == 'country') {
                    return function(row,cell,value,col,data) {
                        if (!data.peer){return;}
                        var code = data.peer.get('country');
                        if (window.geoip_country_name) {
                            var name = geoip_country_name[code];
                            return '<img src="flags/blank.gif" class="flag flag-'+code.toLowerCase()+'" alt="'+name+'" />' + name;
                        } else {
                            return code;
                        }
                    };
                } else if (column.src == 'conn') {
                    return function(row,cell,value,col,data) {
                        return data.get(col.field);
                    };
                } else {
                    return function(row,cell,value,col,data) {
                        if (!data.peer){return;}
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
            mylog(LOGMASK.ui,'click conn!!!!!',peerconn);
            peerconn.close('user closed')
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
            { name: "is_self", field: "is_self" },
            {id: "banned", name: "banned", field: "banned" },
            {id: "closereason", name: "closereason", field: "closereason", width:200 },
            {id: "ever_connected", name: "ever_connected", field: "ever_connected" },
            {id: "pex_peers", name: "pex_peers", field: "pex_peers" },
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
                            return data.get('conn').get('state');
                        } else {
                            return '';
                        }
                    };
                } else {
                    return function(row,cell,value,col,data) {
                        var val = data.get(col.field);
                        if (val === false) {
                            return '';
                        } else {
                            return val;
                        }
                    };
                }
            }
        };
        SuperTableView.prototype.initialize.apply(this,[opts]);
        this.bind_events()
    },
    bind_events: function() {
        this.grid.onDblClick.subscribe( _.bind(function(evt, data,c) {
            var peer = this.grid.getDataItem(data.row);
            mylog(LOGMASK.ui,'click peer!!!!!',peer);
            var torrent = peer.get('torrent');
            if (torrent.connections.get(peer.id)) {
                peer.get('conn').close('user closed')
            } else {
                torrent.connections.add_peer(peer);
            }
        },this));
    }
});


var IncomingTableView = SuperTableView.extend({
    initialize: function(opts) {
        this.torrent = opts.torrent;
        opts.columns = [
            {name: "id", field: "id" },
            {name: "state", field: "state", width: 200 },
            {name: "remote_port", field: "remote_port" },
            {name: "remote_peer", field: "remote_peer", width: 200 },
            {name: "peer", field: "peer" },
            {name: "token", field: "token" }
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
                            return data.get('conn').get('state');
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
        this.bind_events()
    },
    bind_events: function() {
        this.grid.onDblClick.subscribe( _.bind(function(evt, data,c) {
            var conn = this.grid.getDataItem(data.row);
            mylog(LOGMASK.ui,'click inc conn!!!!!',conn);
        },this));
    }
});


var PieceTableView = SuperTableView.extend({
    initialize: function(opts) {
        this.torrent = opts.torrent;
        opts.columns = [
            {id: "num", name: "Number", field: "num" },
            {id: "start_byte", name: "Start byte", field: "start_byte", type:'attr' },
            {id: "end_byte", name: "End byte", field: "end_byte", type:'attr' },
            {id: "sz", name: "Size", field: "sz", type:'attr' },
            {id: "numchunks", name: "Chunks", field: "numchunks", type:'attr' },
            {id: "hashed", name: "hashed", field: "hashed" },
            {id: "complete", name: "complete", field: "complete" },
            {id: "current_request", name: "current_request", field: "current_request" },
            {id: "requests_out", name: "requests_out", field: "requests_out" },
            {id: "responses_in", name: "responses_in", field: "responses_in" },

            {id: "timeouts", name: "timeouts", field: "timeouts" },

            {id: "requests_in", name: "requests_in", field: "requests_in" },
            {id: "responses_out", name: "responses_out", field: "responses_out" }
        ];
        opts.makeformatter = {
            getFormatter: function(column) {
                if (column.field == 'pathaoeuaoue') {
                    return function(row,cell,value,col,data) {
                        return '<a href="' + data.filesystem_entry + '">open</a>';
                    };
                } else if (column.type == 'attr') {
                    return function(row,cell,value,col,data) {
                        return data[col.field];
                    };
                } else if (column.field == 'current_request') {
                    return function(row,cell,value,col,data) {
                        var req = data.get(col.field)
                        if (req) { return req.piece + ',' + req.original[0]; } else { return ''; }
                    };
                } else if (column.field == 'complete') {
                    return function(row,cell,value,col,data) {
                        return data.complete() ? true : '';
                    };
                } else {
                    return function(row,cell,value,col,data) {
                        return data.get(col.field);
                    };
                }
            }
        };
        SuperTableView.prototype.initialize.apply(this,[opts]);
        this.bind_events()
    },
    bind_events: function() {
        this.grid.onDblClick.subscribe( _.bind(function(evt, data,c) {
            var piece = this.grid.getDataItem(data.row);
            piece.cancel_all_requests();
            mylog(LOGMASK.ui,'click thing!!!!!',piece);
        },this));
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
            {id: "responses", name: "responses", field: "responses", sortable: true },
            {id: "errors", name: "errors", field: "errors", sortable: true },
            { name: "timeouts", field: "timeouts" },
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
            var tracker = this.grid.getDataItem(data.row);
            mylog(1,'click tracker!!!!!',tracker);
            tracker.force_announce();
        },this));
    }
});

var TabsView = BaseView.extend({
    initialize: function(opts) {
        this.$el.html( $('#tabs_template').html() );
        this.bind_actions();
    },
    bind_actions: function() {
        _.each(['peers','general','files','trackers','swarm','pieces','incoming'], _.bind(function(tabname) {
            this.$('.' + tabname).click( _.bind(function() {
                jsclientview.set_tab(tabname);
            },this));
        },this));
    }
});

var GeneralDetailView = BaseView.extend({
    initialize: function(opts) {
        this.$el.html( $('#general_detail_template').html() );
        this.bind_actions();
        this.render();
    },
    render: function() {
        this.$('.infohash').text( this.model.hash_hex );
        this.$('.magnet').val( this.model.get_magnet_link() );
        this.$('.jstorrent').html( '<a href="'+this.model.get_jstorrent_link()+'">jstorrent web link</a>' );
        this.$('.js-embed').html( '<a href="'+this.model.get_embed_link()+'">embedded player link</a>' );
        //this.$('.js-torrentfile').html( '<a href="'+this.model.get_torrentfile_link()+'">embedded player link</a>' );



    },
    bind_actions: function() {
        
    }
});


var JSTorrentClientView = BaseView.extend({
    initialize: function(opts) {
        this.settings = new JSTorrentClientViewSettings();
        this.settings.set('id','client');
        this.settings.fetch();
        //this.template = _.template( $('#client_template').html() );
        this.$el.html( $('#client_template').html() );
        setup_drive_action(); // setup click for setup cloud drive storage
        this.addview = new AddView({el:this.$('.addview')});
        this.torrenttable = new TorrentTableView({ model: jsclient.torrents, el: this.$('.torrentGrid') });
        this.detailview = null;
        this.commands = new CommandsView({el:this.$('.commands'), table:this.torrenttable});
        this.tabs = new TabsView({el:this.$('.tabs')});

        jsclient.get_cloud_storage().on('need_user_authorization', function() {
            // show a dialog for user authorization
            debugger;
            gapi.auth.init( function() {
                myalert('please click on "setup storage" to allow access to saving to google drive');
            });
        });

        $('.js-add-example-torrent').click( _.bind(function(evt) {

            jsclient.add_unknown("magnet:?xt=urn:btih:0e876ce2a1a504f849ca72a5e2bc07347b3bc957&tr=http%3A%2F%2Ftracker001.legaltorrents.com%3A7070%2Fannounce&dn=Blender_Foundation_-_Big_Buck_Bunny_720p")

            jsclient.add_unknown(
"magnet:?xt=urn:btih:f463bfded35ef84c06b5d51df51856076b97059b&dn=DJ+Shadow+-+Hidden+Transmissions+Bundle+BitTorrent+Edition&tr=udp%3A%2F%2Ftracker.openbittorrent.com%3A80&tr=udp%3A%2F%2Ftracker.publicbt.com%3A80&tr=udp%3A%2F%2Ftracker.istole.it%3A6969&tr=udp%3A%2F%2Ftracker.ccc.de%3A80"
            );

        },this));

        this.$('.dragbar').mousedown(_.bind(function(e){
            e.preventDefault();
            //console.log('mousedown',e.pageY, e.screenY, e.offsetY);

            var click_start = e;
            var offset_top = this.$('.pane-top').offset();
            var offset_bottom = this.$('.pane-bottom').offset();

            $(document).mousemove(_.bind(function(e){

                //console.log(e.pageY, e.screenY);


                //var newht = Math.max(0,e.screenY - this.torrenttable.default_height);
                //$('#position').html(e.pageX +', '+ e.pageY);
                //$('#sidebar').css("width",e.pageX+2);

                //this.torrenttable.$el.height(newht);
/*
                this.torrenttable.grid.resizeCanvas();

                if (this.detailview && this.detailview.grid) {
                    this.detailview.grid.resizeCanvas();
                }
*/

                //this.torrenttable.resize(e.pageY);
                //$('#main').css("left",e.pageX+2);
            },this))
        },this));
        $(document).mouseup(function(e){
            $('#clickevent').html('in another mouseUp event' + i++);
            $(document).unbind('mousemove');
        });



        $('#magnet').click( function() {
            try_register_protocol();
        });

        $('#filesystem_open').click( function() {
            filesystem_window = chrome.app.window.create('html5_filesystem_explorer/popup.html',
                                                   { defaultWidth: 300,
                                                     id:'filesystem',
                                                     minHeight: 500,
                                                     defaultHeight: 500 }
                                                  );
            
        });

        $('#option-button').click( function() {
            filesystem_window = chrome.app.window.create('examples/options.html',
                                                   { defaultWidth: 600,
                                                     id:'options',
                                                     minHeight: 400,
                                                     defaultHeight: 400 }
                                                  );

        });

/*
  // look in bittorrent.clouddrive
        $('#setup-storage').click( function() {
            debugger;
        });
*/


        this.init_detailview();
    },
    get_dim: function(elt) {
        if (elt == 'header') {
            return 140;
        } else {
            var el = this.$('.' + elt);
            debugger;
        }
    },
    init_detailview: function() {
        if (this.detailview) { this.detailview.destroy(); }
        var ctxid = this.settings.get('subview_context');
        var torrent = jsclient.torrents.get(ctxid);
        if (!torrent) {
            console.log("init detailview couldn't get torrent");
            return; // torrent was deleted but subview_context was not saved..
        }
        assert(torrent);
        var curtab = this.settings.get('tab');
        if (curtab == 'files') {
            if (torrent.get_infodict()) {
                torrent.init_files();
                this.detailview = new FileTableView({ model: torrent.files, torrent: torrent, el: this.$('.fileGrid')});
            }
        } else if (curtab == 'peers') {
            this.detailview = new PeerTableView({ model: torrent.connections, torrent: torrent, el: this.$('.fileGrid')});
        } else if (curtab == 'swarm') {
            this.detailview = new SwarmTableView({ model: torrent.swarm, torrent: torrent, el: this.$('.fileGrid')});
        } else if (curtab == 'pieces') {
            this.detailview = new PieceTableView({ model: torrent.pieces, torrent: torrent, el: this.$('.fileGrid')});
        } else if (curtab == 'trackers') {
            this.detailview = new TrackerTableView({ model: torrent.trackers, torrent: torrent, el: this.$('.fileGrid')});
        } else if (curtab == 'incoming') {
            this.detailview = new IncomingTableView({ model: torrent.collection.client.incoming_connections, el: this.$('.fileGrid')});
        } else if (curtab == 'general') {
            this.detailview = new GeneralDetailView({ model: torrent, el: this.$('.fileGrid') });
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
        //_gaq.push(['_trackEvent', 'set_tab', 'DetailView', tabtype]);
        gatracker.sendEvent('set_tab', 'DetailView', tabtype);
        this.tabs.$('li').removeClass('active')
        this.tabs.$('.' + tabtype).addClass('active');
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


function main() {
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


                    // asynchronous save now...
                    //assert(torrent.id);
                    //assert( torrent.collection._byId[torrent.id] );
                    //assert(jsclient.torrents.models.length == l+1);

                    torrent.hash_all_pieces( function() {
                        torrent.start();
                        torrent.save();
                        torrent.container = null;
                        mylog(1, 'torrent ready!');

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

    // paste?? huh

    function onpaste(evt) {
        return; // doesn't work in my chrome... returns a prefab image, always a PNG
        var data = evt.originalEvent.clipboardData;
        
        var a = [];
        //console.log(JSON.stringify(data.items))
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

                
            }
        }


    }    


    $(document).on('paste', onpaste);
    $(document.body).on("dragenter", function(evt){mylog(1,'dragenter');});
    $(document.body).on("dragleave", function(evt){mylog(1,'dragleave');});

    // isValid taken from chrome sample app
    var isValid = function(dataTransfer) {
        return dataTransfer && dataTransfer.types 
            && ( dataTransfer.types.indexOf('Files') >= 0 
                 || dataTransfer.types.indexOf('text/uri-list') >=0 )
    }

    function onDropPackagedApp(evt) {
        mylog(1,'ondroppackagedapp');
        var e = evt.originalEvent;
        var fs = jsclient.get_filesystem().fss['temporary'];

        e.preventDefault();
        e.stopPropagation();
        if (isValid(e.dataTransfer)) {
            mylog(1,'ondroppackagedapp isvalid');


            function oncopy(a,b,c) {
            }


            if (e.dataTransfer.types.indexOf('Files') >= 0) {
                mylog(1,'ondroppackagedapp had files ...');
                //var item=evt.originalEvent.dataTransfer.items[0]
                //var entry = item.webkitGetAsEntry() // when i grab the entry, i lose the file~!! lame
                //entry.copyTo( fs.root, null, _.bind(copy_success, this, entry), _.bind(copy_success, this, entry) );

                var file = evt.originalEvent.dataTransfer.files[0]
                var fr = new FileReader
                fr.onload = function(evt) {
                    var ab = evt.target.result
                    var result = check_is_torrent(ab)
                    if (result) {
                        jsclient.add_torrent( { metadata: result } );
                    }
                }
                fr.readAsArrayBuffer(file)



            }

/*
                var files = e.dataTransfer.files;
                for (var i = 0; i < files.length; i++) {
                    mylog(1,'ondroppackged app had files iter files',i);
                    var text = files[i].name+', '+files[i].size+' bytes';

                    debugger;

                    //model.addTodo(text, false, {file: files[i]});
                }
            } else { // uris
                mylog(1,'no files yet');
                var uri=e.dataTransfer.getData("text/uri-list");
                model.addTodo(uri, false, {uri: uri});
            }
*/
        }


    }


    function onDrop(evt) {

        var files = evt.originalEvent.dataTransfer.files;
        var items = evt.originalEvent.dataTransfer.items;

        if (config.packaged_app) {
            // they changed the interface several times aurgh

            var file = files[0]

            

        }



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

    }


    $(document.body).on("dragover", function(evt){
        evt.stopPropagation();
        evt.preventDefault();

        if (isValid(evt.originalEvent.dataTransfer) && config.packaged_app) {
            //_gaq.push(['_trackEvent', 'DropFiles', 'body']);
            gatracker.sendEvent('DropFiles', 'body');
            mylog(1,'dragover had file?',evt.originalEvent.dataTransfer);

            onDropPackagedApp(evt);
        } else {
            mylog(1,'dragover');
        }
    });
    $(document.body).on('drop', function(evt) {

        //_gaq.push(['_trackEvent', 'DropFiles', 'body']);
        gatracker.sendEvent('DropFiles', 'body');

        mylog(1,'DROP!');
        evt.originalEvent.stopPropagation();
        evt.originalEvent.preventDefault();

        if (config.packaged_app) {
            onDropPackagedApp(evt)
        } else {
            onDrop(evt);
        }

    });


    // 12E3AAA7F2F36137CCE9978824BCF156A339FF76

    //jsclient.add_torrent({magnet:"magnet:?xt=urn:btih:88b2c9fa7d3493b45130b2907d9ca31fdb8ea7b9&dn=Big+Buck+Bunny+1080p&tr=udp%3A%2F%2Ftracker.openbittorrent.com%3A80&tr=udp%3A%2F%2Ftracker.publicbt.com%3A80&tr=udp%3A%2F%2Ftracker.istole.it%3A6969&tr=udp%3A%2F%2Ftracker.ccc.de%3A80"});

    jsclient.on('ready', function() {
        //jstorrent.database.clean('torrent', function(k) { return k.length != 40; });


        gatracker.sendAppView('ClientViewInit');
        window.jsclientview = new JSTorrentClientView({el:$('#client')});


        var url_args = decode_url_arguments('hash');
        var q_url_args = decode_url_arguments('search');
        if (url_args.q) {
            jsclient.add_unknown(url_args.q);
        } else if (url_args.hash) {
            jsclient.add_unknown(url_args.hash);
        } else if (q_url_args.q) {
            // via protocol handler!
            jsclient.add_unknown(q_url_args.q);
        } else if (window.packaged_app_launch_url) {
            jsclient.add_unknown(packaged_app_launch_url)
        }


        // horrible hack :_)
        setInterval( function() {
            //console.log('1 sec tick on ready')
            if (window._please_load_this_as_a_torrent) {
                console.log('located _please_load_this_as_a_torrent!')
                var data = window._please_load_this_as_a_torrent
                window._please_load_this_as_a_torrent = undefined;

                var result = check_is_torrent(data)
                if (result) {
                    jsclient.add_torrent( { metadata: result } );
                    window._please_load_this_as_a_torrent
                } else {
                    console.log('unable to add torrent, wasnt valid')
                }
            }

        }, 1000);



        function updatePct() {
            navigator.webkitTemporaryStorage.queryUsageAndQuota( function(used, avail) {
                //console.log('disk usage now',used, avail, used/avail)
                var pct = (used/avail * 100).toFixed(4)
                $('#disk-usage').width(pct +'%');
                $('#disk-usage-str').text( pct +'%')

            });
        }
        setInterval( function() {
            updatePct()
        }, 20000)
        updatePct()

    });

    if (config.packaged_app) {
        chrome.runtime.onMessage.addListener( function(evt, source, cb) {
            console.log('got chrome runtime message',evt, cb)
            if (evt.event == 'query_setting') {
                cb({name:'default_storage_area', value:jsclient.get('default_storage_area')})
            } else if (evt.event == 'set_setting') {
                jsclient.set(evt.name, evt.value)
                jsclient.save()
            }
        })
    }


    jsclient.on('slightly_supported', function() {
        var msg = 'This website requires a browser implementing the HTML5 FileSystem APIs. Yours does not support these features and you will not be able to view the files after downloading them. Please try using Google Chrome. Or continue with crippled functionality.'
        console.warn(msg);
    });

    jsclient.on('unsupported', function() {
        if (navigator.userAgent.match('iPad')) {
            alert('Sorry. Your iPad is not compatible. Please upgrade your Safari browser, if possible.');
        } else {
            alert('This website requires a modern web browser (WebSockets, Filesystem API, Binary arrays). Please try again after installing one.')
            window.location = 'http://www.google.com/chrome';
        }

    });

    $('#js-add_example').click( function() { 
        //_gaq.push(['_trackEvent', 'add_example_torrent']);
        gatracker.sendEvent('add_example_torrent');
        jsclient.add_example_torrent(); 
    } );
    //jsclient.add_random_torrent();

}


jQuery(document).ready( main );

document.addEventListener('visibilitychange', function(e) {
  console.log('hidden:' + document.hidden,
              'state:' + document.visibilityState)
}, false);
window.addEventListener('online', function(e) {
  // Re-sync data with server.
    console.log('online')
}, false);

window.addEventListener('offline', function(e) {
  // Queue up events for server.
    console.log('offline')
}, false);

if (! config.packaged_app) {
  var _gaq = _gaq || [];
  _gaq.push(['_setAccount', 'UA-35025483-1']);
  _gaq.push(['_trackPageview']);

  (function() {
    var ga = document.createElement('script'); ga.type = 'text/javascript'; ga.async = true;
    ga.src = (('https:' == document.location.protocol || window.chrome) ? 'https://ssl' : 'http://www') + '.google-analytics.com/ga.js';
    var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ga, s);
  })();
} else {



    var _gaq = _gaq || [];
    _gaq.push(['_setAccount', 'UA-35025483-1']);
    _gaq.push(['_setDomainName', 'jstorrent.com']);
    _gaq.push(['_trackPageview']);
}
