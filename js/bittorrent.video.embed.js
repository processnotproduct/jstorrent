(function(){

    var FileLoadingView = Backbone.View.extend({
        initialize: function(opts) {
            this.$el.html( $('#file_loading_template').html() );
            _.bindAll(this,'update_canvas','update_info','die');
            this._dead = false;
            this.model.on('newpiece', this.update_canvas)
            this.update_canvas();
            this.model.on('newpiece', this.update_canvas)
            this.model.on('change', this.update_info);
            this.model.on('change:mp4file', this.die);
            this.model.torrent.on('change', this.update_info);
        },
        die: function() {
            this._dead = true;
            this.$el.html('');
        },
        update_info: function() {
            if (this._dead) { return; }
            this.$('.info').text( this.model.get_loading_state() );
        },
        update_canvas: function() {
            if (this._dead) { return; }
            var canvas = this.$('.canvas')[0];
            var ctx = canvas.getContext('2d');
            var w = $(window).width();
            var h = 80;
            if (! this._setcanvas != w) {
                this._setcanvas=w;
                canvas.setAttribute('width',w);
                canvas.setAttribute('height',h);
            }

            var ranges = this.model.get_complete_ranges();

            ctx.fillStyle = "rgb(50,50,50)";
            var ctx = canvas.getContext('2d');
            ctx.fillRect(0,0,canvas.width,canvas.height);
            ctx.fillStyle = "rgb(180,200,180)";

            for (var i=0; i<ranges.length; i++) {

                var start = ranges[i][0] / file.get_size() * canvas.width;
                var end = ranges[i][1] / file.get_size() * canvas.width;
                //console.log('fill',i,start,end);
                ctx.fillRect(start, 0, Math.max(2, end-start), h);
            }


        }
    });


    function notify(data) {
        window.parent.postMessage(data, "*");
    }


    console.log('embedded video player loadin');

    var win_args = decode_url_arguments('hash');
    console.log('win args',win_args);


    window.client = new jstorrent.JSTorrentClient;
    var hash = win_args.hash;
    var scalevideo = (win_args.scalevideo !== undefined) ? win_args.scalevideo : true;
    var autostart = (win_args.autostart !== undefined) ? win_args.autostart : false;

    if (scalevideo == 'false' || scalevideo == '0') {
        scalevideo = false;
    }
    if (autostart == 'false' || autostart == '0') {
        autostart = false;
    }

    function canplay() {
        notify({state:'canplay'});
        //vm.play();
    }

    function onentry() {
        notify({state:'entry'});
        var entry = file.filesystem_entry
        window.vm = new jstorrent.FileSystemVideoModel( {entry: entry, file: file} );
        vm.on('canplay', canplay);
        window.vv = new jstorrent.VideoView( { el: $("#video_view"), model: vm, scalevideo: scalevideo, autostart:autostart } );
        vm.on('change:has_metadata', function() {
            notify({state:'loadedmetadata',
                    width: vm.video.width,
                    height: vm.video.height,
                    duration: vm.video.duration
                   });
        });
        //torrent._chunk_request_timeout = 10; // reduce timeout for chunk requests
        //torrent.set('maxconns',4);
        torrent.announce();
    }

    function onmetadata() {
        $('.js-start').hide();
        notify({state:'metadata'});
        var file = torrent.get_main_media(); // OR if optional file argument, use that.
        $('#js-video_name').text( file.get_name() );
        window.file = file;

        window.flv = new FileLoadingView({model:file, el:$("#file_loading_view")});

        file.get_filesystem_entry( function(entry) {
            if (entry && !entry.error) {
                onentry()
            } else {
                file.on('newpiece', function() {
                    file.get_filesystem_entry( onentry );
                });
            }
            
        });
/*            
        window.vm = new jstorrent.FileSystemVideoModel( {entry: entry, file: file} );
        window.vv = new jstorrent.VideoView( { el: $("#video_view"), model: vm } );
        debugger;
*/
    }

    function onadd() {
        window.torrent = client.torrents.get_by_hash(hash);
        torrent.start();
        if (torrent.get_infodict()) {
            onmetadata()
        } else {
            console.log('wait for metadata')
            torrent.announce();
            torrent.on('metadata_processed', onmetadata);
        }
        
    }

    window.addEventListener('message', function(msg) {
        console.log('msg',msg.data,msg.origin);
        //debugger;
    });


    function go() {
        if (client.torrents.contains(hash)) {
            onadd();
        } else {
            client.torrents.on('add', function(m) {
                onadd();
            });
            client.add_unknown(hash);
        }
    }

    if (autostart) {
        client.on('ready', go)
    } else {
        $(document).ready( function() {
            $('.js-start').show();
            $('.js-start').click( function() {
                $('.js-start').html('<h2>getting video metadata... (this could take a bit)</h2>');
                //$('.js-start').hide();
                if (client.get('ready')) {
                    go()
                } else {
                    client.on('ready', go);
                }
            });
        });
        
    }

    
        //new jstorrent.VideoModel(


})();
