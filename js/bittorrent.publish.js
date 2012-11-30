(function() {

    function IFramePublishWidget(opts) {

        this.id = 0;
        this.curcontainer = null;
        this.curready = false;
        this.curtorrent = null;

        this.uploadview = new jstorrent.UploadView({
            el: $('#' + opts.elid)
        });

        this.uploadview.model.on('ready', _.bind(function() {
            var l = [];
            this.curcontainer = this.uploadview.container;
            this.uploadview.container.serialize_meta(l)
            var data = {event:'drop', data:l, id:this.id};
            //this.id++;
            this.send_message(data);
        },this));

        window.addEventListener('message', _.bind(function(msg) {
            this.handle_message(msg);
            //debugger;
        },this));

    }
    IFramePublishWidget.prototype = {
        send_message: function(msg) {
            window.parent.postMessage(msg, '*');
        },
        handle_message: function(msg) {
            assert( this.curcontainer );
            if (msg.data.command == 'create') {
                // hash this torrent YO!
debugger;
                var torrent = new jstorrent.Torrent( { container: this.curcontainer }, { collection: jsclient.torrents } );
                jsclient.torrents.add(torrent);
                torrent.save = function(){} // disable storage?
                torrent._disable_filesystem = true;
                torrent.hash_all_pieces( _.bind(function() {
                    torrent.container = null;
                    this.curready = true;
                    this.curtorrent = torrent;
                    this.send_message({event:'hashed',hash:torrent.hash_hex});
                    mylog(1, 'torrent ready!');
                    //torrent.start();
                },this));
            } else if (msg.data.command == 'connect') {
                assert( this.curtorrent );
                assert( msg.data.host );
                assert( msg.data.port );
                this.curtorrent.handle_new_peer( { ip: msg.data.host,
                                                   disable_proxy: true,
                                                   port: msg.data.port } );
                this.curtorrent.set('disable_trackers',true);
                this.curtorrent.start();
                jsclient.tick();
                jsclient.long_tick();
            } else {
                mylog(LOGMASK.error,'unknown command');
            }

        }
    }

    jstorrent.IFramePublishWidget = IFramePublishWidget;

})();
