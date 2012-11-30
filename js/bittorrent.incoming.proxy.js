(function() {
    jstorrent.IncomingConnectionProxy = Backbone.Model.extend({
        initialize: function(opts) {
            _.bindAll(this, 
                      'onopen', 
                      'onclose', 
                      'onmessage', 
                      'onerror', 
                      'on_connect_timeout');
            this.client = opts.client;
            this.strurl = 'ws://' + config.bittorrent_incoming_proxy + '/wsincomingproxy';

            var username = this.client.get_username();
            this.strurl += '?username=' + encodeURIComponent(username);
            this.strurl += '&v=' + encodeURIComponent(constants.client_version);

            if (opts.last) {
                this.set('resuming',true);
                this.set('token', opts.last.get('token'));
                this.set('remote_port', opts.last.get('remote_port'));
                this.strurl += '&token=' + encodeURIComponent(this.get('token')) + '&port=' + encodeURIComponent(this.get('remote_port'));
            } else if (this.client.get('incoming.token')) {
                this.set('token',this.client.get('incoming.token'));
                this.strurl += '&token=' + encodeURIComponent(this.get('token'));
            }


            this.set('state','establishing');
            if (config.packaged_app) {
                this.stream = {};
                this.trigger('established');
            } else {
                mylog(1,'establish incoming ws',this.strurl);
                this.stream = new WebSocket(this.strurl);
                this.stream.binaryType = "arraybuffer";
                this.stream.onerror = this.onerror;
                this.stream.onopen = this.onopen;
                this.stream.onclose = this.onclose;
                this.stream.onmessage = this.onmessage;
                this.connect_timeout = setTimeout( this.on_connect_timeout, 2000 );
            }
        },
        repr: function() {
            return "<IncomingProxy " + this.id + ">";
        },
        establish_new: function() {
            this.collection.incoming_taken(this)
        },
        onerror: function(evt) {
            mylog(1,this.repr(),'incoming conn stream err',evt);
            this.trigger('error');
        },
        onopen: function(evt) {
            clearTimeout( this.connect_timeout );
            this.connect_timeout = null;
            //mylog(1,this.repr(),'incoming conn established');
            this.trigger('established');
            if (this.get('resuming')) {
                this.set('state','resumed listening')
            } else {
                this.set('state','connecting');
            }
        },
        onclose: function(evt) {
            if (this.connect_timeout) {
                clearTimeout( this.connect_timeout );
            }
            mylog(LOGMASK.network,this.repr(),'incoming conn stream close',evt, evt.reason);
            this.collection.incoming_closed(this, evt)
        },
        onmessage: function(evt) {
            //mylog(1,this.repr(),'inc conn onmessage',evt.data);
            if (! this.get('remote_port')) {
                try {
                    var notification = JSON.parse(evt.data);
                    assert(notification.port);
                    assert(notification.token);
                    this.set('state','listening');
                    this.set('token', notification.token);
                    // also save token to settings
                    this.client.set('incoming.token', notification.token);
                    this.set('remote_port', notification.port);
                    mylog(1,this.repr(),'listening on port',this.get('remote_port'));
                } catch(e) {
                    mylog(1,this.repr(),'error parsing port/token',evt.data);
                    this.close('error parsing port/token');
                }
            } else if (! this.incoming) {
                try {
                    this.incoming = JSON.parse(evt.data);
                    assert (this.incoming.address)
                    this.set('state','got incoming');
                    this.set('remote_peer', JSON.stringify(this.incoming.address));
                    this.establish_new();
                } catch(e) {
                    mylog(1,this.repr(),'error parsing conn notif',evt.data);
                    this.close('error parsing connection notification', true)
                }
                this.conn = this.client.handle_incoming_connection(this, this.incoming.address);
            } else {
                mylog(1,this.repr(),'cant change callback so fast!');
                this.conn.onmessage(evt);
            }
        },
        on_connect_timeout: function() {
            this.connect_timeout = null;
            this.close('timeout');
        },
        close: function(reason) {
            mylog(1,this.repr(),'incoming conn proxy close,',reason);
            this.stream.close();
        },
        notify_closed: function(evt, conn) {
            // WSPeerConnection has closed
            mylog(1,this.repr(),'listening conn closed',evt, conn);
            this.collection.incoming_closed(this, evt);
        }
    });
    var connid = 0;

    jstorrent.IncomingConnectionProxyCollection = jstorrent.Collection.extend({
        model: jstorrent.IncomingConnectionProxy,
        establish: function() {
            if (this._establishing || this._established) { 
                //mylog(1,'already establishing or established'); 
                return;
            }
            //mylog(1,'attempt re-establish incoming');

            var inc_conn = new jstorrent.IncomingConnectionProxy({id: connid, client: this.client, collection:this, last: this._last});
            this._establishing = inc_conn;
            inc_conn.on('established', _.bind(this.established,this,inc_conn));
            inc_conn.on('error', _.bind(this.not_established,this,inc_conn));
            connid++;
            this.add(inc_conn);
        },
        not_established: function(conn) {
            this._establishing = null;
            setTimeout( _.bind(function() {
                this.establish();
            },this), 1000 );
        },
        established: function(conn) {
            this._establishing = null;
            this._established = conn;
        },
        incoming_taken: function(old) {
            old.set('state','taken');
            this._last = old;
            this._established = null;
            this.establish()
        },
        current: function() {
            return this._established;
        },
        incoming_closed: function(old, evt) {
            if (evt.reason == 'not a valid token') {
                this._last = null;
                this.client.set('incoming.token',null); // unset?
            }

            if (old == this._established) {
                this._established = null;
            } else if (old == this._establishing) {
                this._establishing = null;
            }
            old.set('state','closed');
            this.remove(old);
            setTimeout( _.bind(function() {
                this.establish();
            },this), 1000 );
        },
    });
})();
