(function() {
/*
    function DWebSocket(url) {
        this.url = url;
    }
    DWebSocket.prototype = {
        connect: function() {
            var deferred = new Deferred;
            this.ws = new WebSocket(this.url);
            this.ws.onopen = function(evt) {
                deferred.callback()
            }
        }
    }
*/
var FIRST = null;

    function get_transaction_id() {
        return Math.floor(Math.random() * Math.pow(2,30));
    }

    jstorrent.UDPTrackerConnection = Backbone.Model.extend({
        initialize: function(opts) {
            FIRST = this;
            this.client = opts.torrent.collection.client;
            this.torrent = opts.torrent;
            this.url = opts.url;
            var hostport = this.url.split('/')[2].split(':');
            this.host = hostport[0];
            this.port = parseInt(hostport[1],10);
            //this.dws = new DWebSocket(opts.url);
            mylog(1,'INIT UDP TRACKER CONN');
        },
        min_announce_interval: function() {
            return 60 * 1000 * 30;
        },
        can_announce: function(t) {
            var now = t || new Date();
            if (this._last_announce && now - this._last_announce < this.min_announce_interval()) {
                return false;
            }
            return true;
        },
        get_connection: function(callback) {
            var addr = [this.host, this.port];
            var res = {};
            var _this = this; // XXX -- await is making "this" into window
            await _this.client.udp_proxy.newsock_connect(addr, res);
            mylog(1,'got sock id',res, res.message.newsock);
            var protocol_id = [0, 0, 4, 23, 39, 16, 25, 128];
            var conn_req_action = 0;
            var transaction_id = get_transaction_id();
            var packed = jspack.Pack(">II", [conn_req_action, transaction_id]);
            var payload = protocol_id.concat(packed);
            var res2 = {};
            await _this.client.udp_proxy.socksendrecv(res.message.newsock, arr2str(payload), res2)
            var asarr = str2arr(res2.message.data);
            assert(asarr.length == 16);
            var rparts = jspack.Unpack(">II",asarr);
            var raction = rparts[0];
            var rtid = rparts[1];
            var connid = asarr.slice(8);
            assert(transaction_id == rtid);
            callback({connid:connid, sock:res.message.newsock});
        },
        announce: function() {
            if (FIRST != this) { return; }
            if (! this.can_announce()) { return; }
            this._last_announce = new Date();

            this._connection = null;

            var inc_conn = this.client.incoming_connections.current();

            var params = {
                action: 1,
                downloaded: this.torrent.bytecounters.received.total(),
                left: 0,
                uploaded: this.torrent.bytecounters.sent.total(),
                event: 0,
                ip: 0,
                key: 0,
                num_want: -1,
                port: inc_conn ? inc_conn.get('remote_port') : 0,
                extensions: 0
            }

            

            var _this = this;
            var conn = {};
            this.get_connection(_.bind(function(conn) {

                var payload = [];
                var tid = get_transaction_id();
                this._connection = conn;
                mylog(1,'got udp tracker connection',conn);

                payload = payload.concat(conn.connid);
                payload = payload.concat(jspack.Pack(">L",[params.action]));
                payload = payload.concat(jspack.Pack(">L",[tid]));
                //ab2arr(this.torrent.hash)
                payload = payload.concat(ab2arr(this.torrent.hash))
                payload = payload.concat(my_peer_id)
                payload = payload.concat([0,0,0,0]); // LONG
                payload = payload.concat(jspack.Pack(">L",[params.downloaded]));
                payload = payload.concat([0,0,0,0]); // LONG
                payload = payload.concat(jspack.Pack(">L",[params.left]));
                payload = payload.concat([0,0,0,0]); // LONG
                payload = payload.concat(jspack.Pack(">L",[params.uploaded]));

                payload = payload.concat(jspack.Pack(">L",[params.event]));
                payload = payload.concat(jspack.Pack(">L",[params.ip]));
                payload = payload.concat(jspack.Pack(">L",[params.key]));
                payload = payload.concat(jspack.Pack(">l",[params.num_want]));
                payload = payload.concat(jspack.Pack(">H",[params.port]));
                payload = payload.concat(jspack.Pack(">H",[params.extensions]));
                assert (payload.length == 100 );
                var res2 = {};
                await _this.client.udp_proxy.socksendrecv(conn.sock, arr2str(payload), res2)
                mylog(1,'announce res',res2);

                assert(res2.message.data.length >= 20);
                //res.message.data.slice(0,20);
                var parts = jspack.Unpack(">IIIII", str2arr(res2.message.data));
                var rdata = { raction: parts[0],
                              rtid: parts[1],
                              interval: parts[2],
                              leechers: parts[3],
                              seeders: parts[4] };
                mylog(1,'announce req/res data',payload,params,rdata);

                var remain = res2.message.data.length - 20;
                assert(remain % 6 == 0);
                var peers = [];
                var peer;
                for (var i=0; i<remain/6; i++) {
                    peer = jstorrent.decode_peer( res2.message.data.slice( 20+i * 6, 20+(i+1) * 6 ) );
                    peers.push( peer );
                    this.trigger('newpeer',peer);
                }
                mylog(1,'GOT PEERS',peers);

                //payload = payload.concat(jspack.Pack(">L",params.tid));

            },this));
        }
    });
})();
