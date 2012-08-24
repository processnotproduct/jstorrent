_.extend(Backbone.Model.prototype, {
    started: function() {
        return this.get('properties').get('status') && 1;
    },
    isCompleted: function() {
        return true;
    },
    doreq: function(s) {
        if (s == 'remove') {
            this.remove();
        } else if (s == 'stop') {
            this.stop();
        } else if (s == 'start') {
            this.start();
        } else {
            console.error('unsupported request',s);
        }
    },
    download: function() {
        window.open( this.get('properties').get('streaming_url') );

    }
});

function custom_track(evt) {
    // console.log('custom track',evt);
}

function to_file_size(size) {
  var precision = 1;
  var sz = ['b', 'kb', 'Mb', 'Gb', 'Tb', 'Pb', 'Eb'];
  var szmax = sz.length-1;

  // Force units to be at least kB
  var unit = 1;
  size /= 1024;

  while ((size >= 1024) && (unit < szmax)) {
    size /= 1024;
    unit++;
  }
  return (size.toFixed(precision || 1) + " " + sz[unit]);
}


var TorrentView = Backbone.View.extend({
    destroy: function() {
        this.unbind(); // does this actually do anything?
        //this.el.parentNode.removeChild( this.el ); // equivalent to this.remove()?
        this.remove();
        // do the parent insert element back thing... ?
    },
    bind_action_events: function() {
        var _this = this;
        this.$('.bt_button_x').click( function(evt) {
            console.log('remove torrent',_this.model);
            custom_track('remove_torrent');
            _this.model.doreq('remove');
        });

        this.$('.bt_button_play').click( function(evt) {
            console.log('play torrent',_this.model);
            custom_track('start_torrent');
            _this.model.doreq('start');
        });

        this.$('.bt_button_pause').click( function(evt) {
            console.log('pause torrent',_this.model);
            custom_track('stop_torrent');
            _this.model.doreq('stop');
        });

        this.$('.torrent_name').dblclick( function(evt) {
            _this.model.trigger('dblclick', _this.model);
            return
        });


    },
    bind_events: function() {
        var _this = this;
        this.bind_action_events();

        this.model.get('properties').on('change', function(m,e) {
            //console.log('torrent change',_this.model.attributes,_this.model.changedAttributes());

            if (_this.model.get('properties')) {
                _this.render();
            } else {
                console.log('model has no props but trigger changed')
            }
        });

        this.el.draggable = true;
        this.el.addEventListener('dragstart', function(e) {
            //e.dataTransfer.setData('DownloadURL', 'http://12312');
            // fake this out for now
            var blob = uploadview.model.container.files[0].file.slice()
            var url = window.webkitURL.createObjectURL(blob);
            e.dataTransfer.setData('DownloadURL', url);
            debugger;
            window.open(url);
        });

        this.$('.torrent_name').click( function(evt) {
            custom_track('select_torrent');
            _this.model.trigger('selected');
        });
    },
    initialize: function(opts) {
        this.template = _.template( $('#torrent_template').html() );
        this.$el.html( this.template() );
        this.$el.data( {id:this.model.id} );
        this.render();
        var _this = this;
        this.model.bind('removed', function(m) {
            // remove from dom
            _this.destroy();
        });
        //this.bind_events();
    },
    render: function() {
        if (this.model) {
            var progress_width = Math.floor(this.model.get('properties').get('progress')/10) + '%';

            if (this.model.get('selected')) {
                this.$('.bt_torrent_list').addClass('selected_torrent');
            } else {
                this.$('.bt_torrent_list').removeClass('selected_torrent');
            }

            var text = this.model.get('properties').get('name');
            if (this.model.get('properties').get('down_speed') > 0) {
                text = text + ' ' + to_file_size(this.model.get('properties').get('down_speed')) + '/s';
            }
            this.$('.torrent_info').html( text );
            this.$('.torrent_info_percent_complete').html( progress_width );

            // format the down speed
            var speed = this.model.get('down_speed') + this.model.get('up_speed'); 
            if (speed > 1) {
                this.$('.torrent_info_speed').html( to_file_size(speed) + '/s' );
            } else {
                this.$('.torrent_info_speed').html( '' );
            }
            this.$('.color_calc').css('width', progress_width);

            if (this.model.started()) {
                this.$('.bt_button_play').css('display','none');
                this.$('.bt_button_pause').css('display','block');
            } else {
                this.$('.bt_button_pause').css('display','none');
                this.$('.bt_button_play').css('display','block');
            }
            if (this.model.started()) {
                if (this.model.isCompleted()) {
                    this.$('.torrent_dl_color').css('background-color','#86c440');
                } else {
                    this.$('.torrent_dl_color').css('background-color','#84c2ff');
                }
            } else {
                this.$('.torrent_dl_color').css('background-color','#cecece');
            }

            /*
              if (this.model.get('message').match(/error/i)) { 
              this.$('.torrent_dl_color').css('background-color','#8d1c10');
              }
            */


        } else {
            this.$('.torrent_info').html( 'No Torrents' );
        }
        return this.$el;
    }
});

var TorrentsView = Backbone.View.extend({
    destroy: function() {
        this.unbind(); // does this actually do anything?
        //this.el.parentNode.removeChild( this.el ); // equivalent to this.remove()?
        this.remove();
        // do the parent insert element back thing... ?
    },
    initialize: function() {
        var _this = this;

        this.model.bind('firstupdate', function() {
            _this.render();
        });

        this.model.on('selected', function(t,c) {
            console.log('trigger selected',t,c);
        });

        this.model.on('dblclick', function(t,c) {
            console.log('trigger dblclick',t,c);
            //window.location = window.location.pathname + '?hash=' + t.get('hash') + (url_args.ktorrent ? '&ktorrent=1' : '');
            var loc = window.location.pathname + '?hash=' + t.get('hash') + (url_args.ktorrent ? '&ktorrent=1' : '');
            window.open(loc);
        });

        this.model.bind('new_torrent', function(t) {
            console.log('add new torrent',t);
            if (! t.view) {
                t.view = new TorrentView( { model: t } );
                t.view.bind_events();
            }
            _this.$el.prepend( t.view.render() );
        });

    },
    render: function() {
        this.$el.html('');
        var _this = this;
        this.model.torrents = this.model.models;

        if (this.model && this.model.torrents) {
            if (this.model.torrents.length == 0) {
                this.$el.html('no torrents');
                // $('#torrents_container').html( 'No torrents' );
            } else {
                _.each( this.model.torrents, function(t) {
                    if (! t.view) {
                        t.view = new TorrentView( { model: t } );
                    }
                    _this.$el.append( t.view.$el );
                    t.view.bind_events();
                });
            }
        }
    }
});

var FileView = Backbone.View.extend({
    destroy: function() {
        this.unbind(); // does this actually do anything?
        //this.el.parentNode.removeChild( this.el ); // equivalent to this.remove()?
        this.remove();
        // do the parent insert element back thing... ?
    },
    bind_action_events: function() {
        var _this = this;
        this.$('.bt_button_x').click( function(evt) {
            console.log('remove torrent',_this.model);
            custom_track('remove_torrent');
            _this.model.doreq('remove');
        });

        this.$('.bt_button_play').click( function(evt) {
            console.log('play torrent',_this.model);
            custom_track('start_torrent');
            _this.model.doreq('start');
        });

        this.$('.bt_button_pause').click( function(evt) {
            console.log('pause torrent',_this.model);
            custom_track('stop_torrent');
            _this.model.doreq('stop');
        });
    },
    bind_events: function() {
        var _this = this;
        this.bind_action_events();
        this.model.bind('change', function(m) {
            console.log('files change',_this.model.get('name'),_this.model.changedAttributes());
            _this.render();
        });
        this.$('.torrent_name').click( function(evt) {
            custom_track('select_torrent');
            _this.model.trigger('selected');
        });

        this.$('.torrent_name').dblclick( function(evt) {
            // open up file view
            // _this.model.download();

            // do different shiz for different types...

            if (true) {
                window.location = _this.model.get('properties').get('streaming_url');
            } else {
                window.name = _this.model.get('properties').get('streaming_url');
                window.location = 'player.html';
            }
        });

    },
    initialize: function(opts) {
        this.template = _.template( $('#torrent_template').html() );
        this.$el.html( this.template() );
        this.$el.data( {id:this.model.id} );

        this.el.addEventListener('dragstart', function(e) {
            debugger;
            e.dataTransfer.setData('DownloadURL', 'http://12312');
        });

        this.render();
        var _this = this;
        this.model.bind('removed', function(m) {
            // remove from dom
            _this.destroy();
        });
        this.bind_events();
    },
    render: function() {
        if (this.model) {

            var progress_width = Math.floor(this.model.get('properties').get('downloaded') / this.model.get('properties').get('size') * 100) + '%';

            if (this.model.get('selected')) {
                this.$('.bt_torrent_list').addClass('selected_torrent');
            } else {
                this.$('.bt_torrent_list').removeClass('selected_torrent');
            }
            //this.$('.torrent_info').html( this.model.get('properties').get('name') );
            this.$('.torrent_info').html( this.model.get('properties').get('path') );
            this.$('.torrent_info_percent_complete').html( progress_width );

            // format the down speed
            var speed = this.model.get('down_speed') + this.model.get('up_speed'); 
            if (speed > 1) {
                this.$('.torrent_info_speed').html( to_file_size(speed) + '/s' );
            } else {
                this.$('.torrent_info_speed').html( '' );
            }
            this.$('.color_calc').css('width', progress_width);

            if (this.model.started()) {
                this.$('.bt_button_play').css('display','none');
                this.$('.bt_button_pause').css('display','block');
            } else {
                this.$('.bt_button_pause').css('display','none');
                this.$('.bt_button_play').css('display','block');
            }
            if (this.model.started()) {
                if (this.model.isCompleted()) {
                    this.$('.torrent_dl_color').css('background-color','#86c440');
                } else {
                    this.$('.torrent_dl_color').css('background-color','#84c2ff');
                }
            } else {
                this.$('.torrent_dl_color').css('background-color','#cecece');
            }



        } else {
            this.$('.torrent_info').html( 'No Torrents' );
        }
        return this.$el;
    }
});

var FilesView = Backbone.View.extend({
    initialize: function() {
        var _this = this;

        this.model.bind('add', function(t) {
            if (! t.view) {
                t.view = new FileView( { model: t } );
            }
            _this.$el.append( t.view.render() );
        });
    },
    render: function() {
        this.$el.html('');
        var _this = this;
        this.model.files = this.model.models;

        if (this.model && this.model.files) {
            if (this.model.files.length == 0) {
                this.$el.html('no torrents');
                // $('#torrents_container').html( 'No torrents' );
            } else {
                _.each( this.model.files, function(t) {
                    if (! t.view) {
                        t.view = new FileView( { model: t } );
                    }
                    _this.$el.append( t.view.$el );
                    t.view.bind_events();
                });
            }
        }
    }

});

function decode_url_arguments() {
    var query = window.location.search;
    var parts = query.slice(1, query.length).split('&');
    var d = {};
    for (var i=0; i<parts.length; i++) {
        var kv = parts[i].split('=');
        d[kv[0]] = decodeURIComponent(kv[1]);
    }
    return d;
}

var url_args = decode_url_arguments();



jQuery(function() {
    function notice(event) {
	$('body').append('<div class="alert alert-success">' + event + '</div>');
    }


    if (url_args.ktorrent) {
        //var attrs = {'product':'ktorrent', 'plugin':false, 'host':'kzahel.dyndns.org', 'port':31226};
        var attrs = {'product':'ktorrent', 'plugin':false};
    } else {
        //var attrs = {'product':'Torque', 'plugin':false};
        var attrs = {'product':'uTorrent', 'plugin':false};
    }
    window.btapp = new Btapp(attrs);

    btapp.connect(attrs);



    if (url_args.hash) {
        btapp.on('add:torrent', function(torrent_list,m) {
            var torrent = torrent_list.get(url_args.hash);
            var files = torrent.get('file');
            window.filesview = new FilesView( { el: $('#filesview'), model: files } )
            filesview.render();
        });
        
        $('#add_torrent_global').hide();

    } else {
        btapp.on('add:add', function(add) {
	    //add.torrent('http://featuredcontent.utorrent.com/torrents/CountingCrows-BitTorrent.torrent')
	    //add.torrent('magnet:?xt=urn:btih:2110C7B4FA045F62D33DD0E01DD6F5BC15902179&dn=CountingCrows-BitTorrent&tr=udp://tracker.openbittorrent.com:80/announce')
	    notice('ready to add torrents');
        });

        btapp.on('add:settings', function(settings) {
	    notice('ready to play with settings');
        });

        btapp.on('add:torrent', function(torrent_list,m) {
            // first update only?
            console.log('add torrent event',torrent_list,m)
            if (! torrent_list._caught) {
                torrent_list._caught = true;
                torrent_list.on('add', function(m,c) {
                    console.log('model',m,'added to collection',c);
                    torrent_list.trigger('new_torrent',m);
                });

                torrent_list.on('remove', function(m,c) {
                    console.log('model',m,'removed from collection',c);
                    m.trigger('removed');
                });
            }

            
            var view = new TorrentsView( { model: torrent_list, el: $("#torrentsview") } );
            view.render();
	    notice('we have ' + torrent_list.length + ' torrents');
        });

        function do_add() {
            console.log('do add..');
            var url = $('#url_input').val()
            $('#url_input').val('');

            var df = btapp.get('add').torrent(url)
            console.log('added url, got def',df);

        }

        $('#button_upload').click( do_add );
        $('#url_input').keydown( function(evt) {
            if (evt.keyCode == 13) {
                do_add()
            }
        });



        /* drag and drop stuff */
        var dropbox = document.getElementById("dropbox");

        window.uploadview = new UploadView( { el: $(dropbox), btapp: btapp } );

    }

    btapp.on('add:dht', function(dht) {
	notice('we have access to the dht');
    });
/*
    btapp.live('torrent * file * properties name', function(name) {
	notice('we have a file in a torrent: ' + name);
    });
*/


});

