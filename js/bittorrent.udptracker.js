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

    jstorrent.UDPTrackerConnection = jstorrent.TrackerConnection.extend({
        initialize: function(opts) {
            FIRST = this;
            this.client = opts.torrent.collection.client;
            this.torrent = opts.torrent;
            this.url = opts.url;
            var hostport = this.url.split('/')[2].split(':');
            this.host = hostport[0];
            this.port = parseInt(hostport[1],10);
            this.set('announces',0);
            this.set('responses',0);
            this.set('errors',0);
            this.set('timeouts',0);
            this.set('peers',0);
            //this.dws = new DWebSocket(opts.url);
            mylog(LOGMASK.udp,'INIT UDP TRACKER CONN');
        },
        create_request_connection_data: function() {
            var protocol_id = [0, 0, 4, 23, 39, 16, 25, 128];
            var conn_req_action = 0;
            var transaction_id = get_transaction_id();
            var packed = jspack.Pack(">II", [conn_req_action, transaction_id]);
            var payload = protocol_id.concat(packed);
            return {payload:payload, tid:transaction_id};
        },
        get_connection: function(callback) {
            if (config.packaged_app) {
                chrome.socket.create('udp', {}, _.bind(function(info) {
                    var sockno = info.socketId;
                    var reqdata = this.create_request_connection_data();
                    chrome.socket.connect( sockno, this.host, this.port, _.bind(function(result){
                        chrome.socket.write( sockno, new Uint8Array(reqdata.payload).buffer, _.bind(function(result) {
                            chrome.socket.read( sockno, null, _.bind(function(response) {
                                var rdata = this.parse_connection_response(reqdata.tid, ab2arr(new Uint8Array(response.data)));
                                callback({connid:rdata.connid, sock:sockno});
                            },this));
                        },this));

                    },this));
                },this));
            } else {
                this.proxy_get_connection(callback);
            }
        },
        parse_connection_response: function(intid, asarr) {
            assert(asarr.length == 16);
            var parts = jspack.Unpack(">II",asarr);
            var action = parts[0];
            var tid = parts[1];
            var connid = asarr.slice(8);
            assert(intid == tid);
            return {action:action,tid:tid,connid:connid};
        },
        proxy_get_connection: function(callback) {
            var addr = [this.host, this.port];
            var res = {};
            var _this = this; // XXX -- await is making "this" into window
            this.client.udp_proxy.newsock_connect(addr, res).then( _.bind(function() {
                mylog(LOGMASK.udp,'got sock id',res, res.message.newsock);
                var reqdata = this.create_request_connection_data();
                var res2 = {};
                this.client.udp_proxy.socksendrecv(res.message.newsock, arr2str(reqdata.payload), res2).then( _.bind(function() {
                    if (res2.message.error) {
                        callback({error:res2.message.error, sock:res.message.newsock});
                    } else {
                        var asarr = str2arr(res2.message.data);
                        var rdata = this.parse_connection_response(reqdata.tid, asarr);
                        callback({connid:rdata.connid, sock:res.message.newsock});
                    }
                },this));
            }, this));
        },
        on_announce_response: function(sockno, res3) {
            mylog(LOGMASK.udp,'announce res',res3);

            if (res3.message && res3.message.error && res3.message.error == 'timeout') {
                this.set('timeouts',this.get('timeouts')+1);
                return;
            }

            if (res3.message) {
                var data = res3.message.data;
                var arrdata = str2arr(res3.message.data)
            } else {
                var data = res3.data;
                var arrdata = new ab2arr(new Uint8Array(res3.data));
            }

            if (true) {
                this.set('responses',this.get('responses')+1);
                assert(arrdata.length >= 20);
                //res.message.data.slice(0,20);
                var parts = jspack.Unpack(">IIIII", arrdata);
                var rdata = { raction: parts[0],
                              rtid: parts[1],
                              interval: parts[2],
                              leechers: parts[3],
                              seeders: parts[4] };
                mylog(LOGMASK.udp,'announce res data',rdata);

                var remain = arrdata.length - 20;
                assert(remain % 6 == 0);
                var peers = [];
                var peer;
                for (var i=0; i<remain/6; i++) {
                    peer = jstorrent.decode_peer( arrdata.slice( 20+i * 6, 20+(i+1) * 6 ) );

                    peers.push( peer );
                    this.trigger('newpeer',peer);
                }
                this.set('peers',this.get('peers')+peers.length);
                mylog(LOGMASK.udp,'GOT PEERS',peers);
                //this.client.udp_proxy.sock_close(conn.sock);
                //payload = payload.concat(jspack.Pack(">L",params.tid));
            }
            if (config.packaged_app) {
                chrome.socket.disconnect(sockno);
                chrome.socket.destroy(sockno);
            } else {
                this.client.udp_proxy.sock_close(sockno);
            }

        },
        announce: function() {
            //this.trigger('newpeer', {ip:'67.180.11.105',port:14098});
            if (false && this.torrent.hash_hex == '3797389d4797c10ff318374ec2de5b54491ec279' && window.location.pathname.indexOf('grid.html') == -1) {
                this.trigger('newpeer', {ip:'127.0.0.1',port:8030});
                return;
            }

            //if (FIRST != this) { return; }
            if (! this.can_announce()) { return; }
            this._last_announce = new Date();
            this.set('announces',this.get('announces')+1);
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
                if (conn && conn.error) {
                    this.set('timeouts',this.get('timeouts')+1);
                    return;
                }

                var payload = [];
                var tid = get_transaction_id();
                this._connection = conn;
                mylog(LOGMASK.udp,'got udp tracker connection',conn);

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
                var res3 = {};

                if (config.packaged_app) {
                    chrome.socket.write( conn.sock, new Uint8Array(payload).buffer, _.bind(function(result) {
                        // bother checking check result.bytesWritten ?
                        chrome.socket.read( conn.sock, null, _.bind(this.on_announce_response, this, conn.sock) );
                    },this));
                } else {
                    this.client.udp_proxy.socksendrecv(conn.sock, arr2str(payload), res3).then( _.bind(this.on_announce_response,this, conn.sock) )
                }

            },this));
        }
    });
})();
