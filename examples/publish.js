(function() {

    function JSPublishWidget(opts) {
        this.opts = opts
        this.elid = this.opts.elid;
        this.el = $('#' + this.opts.elid);
        var iframe = document.createElement('iframe')
        iframe.src = 'publish_window.html';
        iframe.setAttribute('width',200);
        iframe.setAttribute('height',200);
        iframe.setAttribute('style','border: 1px solid red');
        this.el[0].appendChild( iframe );
        this.iframe = iframe;

        window.addEventListener('message', _.bind(function(msg) {
            this.handle_message(msg);
            //debugger;
        },this));
    }
    
    JSPublishWidget.prototype = {
        handle_message: function(msg) {
            if (msg.data.event == 'drop') {
                this.send_message({command:'create', id: msg.data.id});
            } else if (msg.data.event == 'hashed') {
                //btapp.attributes.torrent
                var url = 'magnet:?xt=urn:btih:' + msg.data.hash
                var def = btapp.attributes.add.torrent( url );
                def.then( _.bind(function() {
                    this.send_message({command:'connect', host: '127.0.0.1', port: btapp.bind_port});
                },this));
            } else {
                debugger;
            }
        },
        send_message: function(msg) {
            this.iframe.contentWindow.postMessage(msg,'*');
        }
    }

    window.JSPublishWidget = JSPublishWidget;

    $(document).ready( function() {
        window.widget = new JSPublishWidget( {elid:'jspublish'} )


        window.btapp = new Btapp();
        btapp.connect();

        btapp.live('settings bind_port', function(port) {
            btapp.bind_port = port;
            console.log('btapp on port',port);
        });

    })

})();
