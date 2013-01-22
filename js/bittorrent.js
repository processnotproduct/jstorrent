(function(){

    var DHT = parseInt('0x01');
    var UTORRENT = parseInt('0x10');
    var NAT_TRAVERSAL = parseInt('0x08');
    //var LAST_BYTE = DHT;
    //LAST_BYTE |= NAT_TRAVERSAL;
    var LAST_BYTE = 0;

    var FLAGS = [0,0,0,0,0,0,0,0];
    FLAGS[5] = UTORRENT;
    FLAGS[7] = LAST_BYTE;

    window.constants = {
        client_version: 'jstorrent 0.4.0',
        protocol_name: 'BitTorrent protocol',
        handshake_length: 1 + 'BitTorrent protocol'.length + 8 + 20 + 20,
        std_piece_size: Math.pow(2,14),
        new_torrent_piece_size: Math.pow(2,18),
        //new_torrent_piece_size: Math.pow(2,14),
        chunk_size: Math.pow(2,14),
        metadata_request_piece_size: Math.pow(2,14),
        max_packet_size: Math.pow(2,15),
        keepalive_interval: 60 * 1000,
        messages: [
            'CHOKE',
            'UNCHOKE',
            'INTERESTED',
            'NOT_INTERESTED',
            'HAVE',
            'BITFIELD',
            'REQUEST',
            'PIECE',
            'CANCEL',
            'PORT',
            'WANT_METAINFO',
            'METAINFO',
            'SUSPECT_PIECE',
            'SUGGEST_PIECE',
            'HAVE_ALL',
            'HAVE_NONE',
            'REJECT_REQUEST',
            'ALLOWED_FAST',
            'HOLE_PUNCH',
            '--',
            'UTORRENT_MSG'
        ],
        handshake_flags: FLAGS,
        handshake_code: 0,
        tor_meta_codes: { 0: 'request',
                          1: 'data',
                          2: 'reject' },
        tor_meta_codes_r: {'request':0,
                           'data':1,
                           'reject':2}
    };
    constants.message_dict = {};
    for (var i=0; i<constants.messages.length; i++) {
        constants.message_dict[ constants.messages[i] ] = i;
    }

    function parse_message(ba) {
        // var msg_len = new Uint32Array(ba, 0, 1)[0] - 1; // not correct endianness
        var msg_len = new DataView(ba).getUint32(0); // equivalent to jspack... use that?
        if (msg_len == 0) {
            return {'msgtype':'keepalive'};
        }

        var msgval = new Uint8Array(ba, 4, 1)[0]; // endianness seems to work ok
        var msgtype = constants.messages[msgval];

        if (ba.byteLength != msg_len + 4) {
            throw Error('bad message length');
        }
        
        return { 'msgtype': msgtype,
                 'msgcode': msgval,
                 'payload': new Uint8Array(ba, 5) };
    }


    function parse_handshake(bytearray) {
        var protocol_str_len = new Uint8Array(bytearray, 0, 1)[0];
        var protocol_str = arr2str(new Uint8Array(bytearray, 1, protocol_str_len));
        var i = 1 + protocol_str_len;

        var reserved = new Uint8Array(bytearray, i, 8);
        i += 8;
        var infohash = new Uint8Array(bytearray, i, 20);
        i += 20;
        var peerid = new Uint8Array(bytearray, i, 20);

        if (bytearray.byteLength != 1 + protocol_str_len + 8 + 20 +20) {
            throw Error('bad handshake '+ data);
        } else {
            return { protocol: protocol_str,
                     reserved: reserved,
                     infohash: ab2hex(infohash),
                     peerid: ab2hex(peerid) };
        }
    }

    var my_peer_id = [];
    window.my_peer_id = my_peer_id;
    for (var i=0; i<20; i++) {
        my_peer_id.push( Math.floor( Math.random() * 256 ) );
    }
    if (my_peer_id.length != 20) { throw Error('bad peer id'); }
    function create_handshake(infohash, peerid) {
        // use binary buffer
        var parts = [constants.protocol_name.length];
        parts = parts.concat( str2arr(constants.protocol_name) );
        parts = parts.concat( constants.handshake_flags );
        parts = parts.concat( infohash )
        parts = parts.concat( peerid )
        assert(parts.length == 68, 'invalid handshake length');
        return parts
    }

    function IOStream(host, port) {
        this.host = host;
        this.port = port;
        this.sockno = null;
        this._closed = null;
        this._connected = false;
        this._created = false;

        chrome.socket.create('tcp', {}, _.bind(this.oncreate, this));


/*
        this.stream.onerror = this.onerror;
        this.stream.onopen = this.onopen;
        this.stream.onclose = this.onclose;
        this.stream.onmessage = this.onmessage;
*/
    }
    IOStream.prototype = {
        oncreate: function(data) {
            this.sockno = data.socketId;
            _.bindAll(this, 'onconnect','do_read','send','onsend','got_read');
            chrome.socket.connect( this.sockno, this.host, this.port, this.onconnect );
        },
        onconnect: function(data) {
            if (this._closed) {
                return;
                // BUG in implementation
            } else {
                this.onopen(data);
                this.do_read();
            }
        },
        do_read: function() {
            assert(! this._closed)
            assert(! this._connecting);
            chrome.socket.read( this.sockno, 4096, this.got_read );
        },
        got_read: function(data) {
            if (this._closed) {
                return;
                // BUG in implementation
            } else if (data.resultCode < 0) {
                this.doclose();
            } else {
                this.onmessage({data:data.data});
                // somehow onmessage can close the connection... (bad data?)
                if (! this._closed) {
                    this.do_read();
                }
            }
        },
        send: function(data) {
            chrome.socket.write( this.sockno, data, this.onsend );
        },
        onsend: function(result) {
            if (result.bytesWritten > 0) {
            } else {
                this.doclose('did not write all data');
            }
        },
        doclose: function(reason) {
            this.onclose({});
            if (this._connected) {
                chrome.socket.disconnect(this.sockno);
            }
            chrome.socket.destroy(this.sockno);
        },
        close: function(reason) {
            this._closed = true;
            // cancel pending read?
            this.doclose('called close');
        },
    }


    jstorrent.WSPeerConnection = Backbone.Model.extend({
        className: 'WSPeerConnection',
        handlers: {
            'UTORRENT_MSG': 'handle_extension_message',
            'PORT': 'handle_port',
            'HAVE': 'handle_have',
            'CHOKE': 'handle_choke',
            'UNCHOKE': 'handle_unchoke',
            'INTERESTED': 'handle_interested',
            'NOT_INTERESTED': 'handle_not_interested',
            'HAVE_ALL': 'handle_have_all',
            'PIECE': 'handle_piece',
            'BITFIELD': 'handle_bitfield',
            'REQUEST': 'handle_request',
            'CANCEL': 'handle_cancel',
            'keepalive': 'handle_keepalive'
        },
        /* 
           connection that acts like a bittorrent connection, wrapped just inside a websocket
        */
        get_client: function() {
            var hs = this._remote_extension_handshake;
            if (hs) {
                return hs.v;
            }
        },
        get_host: function() {
            if (config.ip_aliases && config.ip_aliases[this._host]) {
                var usehost = config.ip_aliases[this._host];
            } else {
                var usehost = this._host
            }

            if (! this.peer.get('disable_proxy') && config.bittorrent_proxy) {
                var uri = '/wsproxy';
                var strurl = 'ws://' + config.bittorrent_proxy + uri + '?target=' + encodeURIComponent(usehost+':'+this._port) + '&username=' + encodeURIComponent(this.torrent.collection.client.get_username()) + '&timeout=' + encodeURIComponent(this.connect_timeout_ms);
                if (this.using_flash()) {
                    this.torrent.set('maxconns',1);
                    strurl += '&flash=1';
                }
            } else {
                var uri = '/wsclient';
                var strurl = 'ws://'+usehost+':'+this._port+uri;
                if (this.using_flash()) {
                    strurl += '?flash=1';
                }
            }
            return strurl;
        },
        using_flash: function() {
            return window.WEB_SOCKET_FORCE_FLASH || window.Modernizr && ! Modernizr.websockets;
        },
        reconnect: function() {
            this.strurl = this.get_host();
            this.inittime = new Date();

            if (config.packaged_app) {
                this.stream = new IOStream(this._host, this._port);
            } else {
                this.stream = new WebSocket(this.strurl);
            }

            mylog(LOGMASK.network,'initializing stream to',this._host + ':' + this._port);
            if (this.using_flash()) {
                // this.stream.binaryType = "array";
                // send string mofo b64 encoded
            } else {
                this.stream.binaryType = "arraybuffer";
            }
            this.stream.onerror = this.onerror;
            this.stream.onopen = this.onopen;
            this.stream.onclose = this.onclose;
            this.stream.onmessage = this.onmessage;
        },
        can_send_messages: function() {
            return ! this.handshaking && this._connected && ! this._closed && ! this._error;
        },
        initialize: function(opts) {
            _.bindAll(this, 'onopen', 'onclose', 'onmessage', 'onerror', 'on_connect_timeout',
                      'onerror',
                      'handle_extension_message',
                      'send_handshake',
                      'send_extension_handshake',
                      'handle_bitfield',
                      'send_bitmask',
                      'handle_request',
                      'on_handle_request_data',
                      'handle_unchoke',
                      'handle_choke',
                      'handle_have',
                      'handle_have_all',
                      'handle_interested',
                      'handle_not_interested',
                      'handle_keepalive',
                      'handle_piece',
                      'handle_cancel',
                      'handle_port'
                     );
            //mylog(LOGMASK.network,'initialize wspeerconn');
            this._host = opts.host;
            this._port = opts.port;
            this.connect_timeout_ms = config.packaged_app ? 8000 : 2000;
            this.connect_timeout_ms = 10000;

            if (opts && opts.incoming) {
                // incoming connection
                this.set('state','incoming');
                this.strurl = this._host + ':' + this._port;
                this.id = this.strurl;
                this._was_incoming = true;
                mylog(LOGMASK.network,'initialize peer connection without infohash (incoming)')
                this.inittime = new Date();
                this.client = opts.client;
                this.incoming = opts.incoming;
                this.stream = opts.incoming.stream;
                this.stream.onerror = this.onerror;
                this.stream.onopen = this.onopen;
                this.stream.onclose = this.onclose;
                this.stream.onmessage = this.onmessage;
                this.bytecounters = { sent: new jstorrent.ByteCounter({}),
                                      received: new jstorrent.ByteCounter({}) }
                this._connected = true;
                this._connecting = false;
            } else {
                this._connected = false;
                this._connecting = true;

                this._was_incoming = false;
                this.connect_timeout = setTimeout( this.on_connect_timeout, this.connect_timeout_ms );
                this.set('state','connecting');
                assert(opts.peer);
                this.peer = opts.peer;
                this.peer.set('conn',this);
                assert(opts.hash.length == 20);
                var infohash = [];
                for (var i=0; i<opts.hash.length; i++) {
                    infohash.push( opts.hash[i] );
                }
                this.infohash = infohash;
                assert(this.infohash.length == 20, 'input infohash as array of bytes');
                this.torrent = opts.torrent;
                assert(this.torrent);
                mylog(LOGMASK.network,'initialize peer connection with infohash',ab2hex(this.infohash));
                this.bytecounters = { sent: new jstorrent.ByteCounter({parent:this.torrent.bytecounters.sent}),
                                      received: new jstorrent.ByteCounter({parent:this.torrent.bytecounters.received}) };

            }

            //this.message_history = new jstorrent.RingBuffer(20); // for debugging messages
            assert( typeof opts.port == 'number' );
            this.read_buffer = []; // utorrent does not send an entire message in each websocket frame
            this.set('bytes_received',0);
            this.set('bytes_sent',0);
            this.set('chunks_received',0);
            this.set('max_down',0);
            this.set('max_up',0);
            this.set('timeouts',0);
            this.set('outbound_chunk_requests_limit',8);
            //var infohash = opts.hash; // array buffers and stuff no bueno... just want simple array
            this._handle_after_metadata = [];
            this._outbound_chunk_requests = 0;

            this.handshaking = true;

            this._remote_bitmask = null;
            this._remote_extension_handshake = null;
            this._my_extension_handshake = null;
            this._sent_extension_handshake = false;

            this._remote_choked = true;
            this._remote_interested = false;

            this._interested = false;
            this._choked = true;

            this._sent_bitmask = false;

            if (this._was_incoming) {
                // wait for handshake message. (send ours now?)
                //this._manual_assert = true;
            } else {
                this.reconnect();
            }
        },
        adjust_max_outbound: function() {
            var maxdown = this.get('max_down');
            mylog(1,this.repr(),'maxdown',maxdown);
            
            var tick_interval = this.torrent.collection.client.tick_interval // we choose new pieces every tick interval
            var ticks_per_sec = 1000 / tick_interval;

            var chunks_per_sec = maxdown/constants.chunk_size;

            var chunks_last_tick = chunks_per_sec / ticks_per_sec * 2;
            var newval = Math.ceil(chunks_last_tick);

            mylog(1,'choosing new max outbound',newval);
            this.set('outbound_chunk_requests_limit',newval);
        },
        compute_max_rates: function() {
            this.set('max_up', Math.max(this.bytecounters.sent.avg({noparent:true}), this.get('max_up')));
            this.set('max_down', Math.max(this.bytecounters.received.avg({noparent:true}), this.get('max_down')));
        },
        adjust_chunk_queue_size: function() {
            if (this.get('timeouts') > this.get('chunks_received')) {
                this.set('outbound_chunk_requests_limit', 1);
            }
        },
        record_message: function(msg) {
            this.set('last_message',msg);
            //this.message_history.push(msg);
        },
        do_send_cancel: function(data) {
            // offset/constants.chunk_size
            var payload = new JSPack().Pack('>III', data);
            this.send_message("CANCEL", payload);
        },
        handle_piece: function(data) {
            var view = new DataView(data.payload.buffer, data.payload.byteOffset);
            var index = view.getUint32(0);
            var offset = view.getUint32(4);
            this.record_message(data.msgtype + ' ' + index + ','+(offset/constants.chunk_size));
            var chunk = new Uint8Array(data.payload.buffer, data.payload.byteOffset + 8);
            //mylog(LOGMASK.network,'got piece idx',index,'offset',offset,'len',chunk.byteLength);
            var handled = this.torrent.handle_piece_data(this, index, offset, chunk);
            if (handled) {
                this.set('chunks_received',this.get('chunks_received')+1);
                this._outbound_chunk_requests --;
                this.set('outbound_chunks',this._outbound_chunk_requests);
            }
        },
        handle_keepalive: function() {
            mylog(LOGMASK.network,'got keepalive');
            this.send_keepalive();
        },
        send_extension_handshake: function() {
            if (this._sent_extension_handshake) { debugger; return; }
            // woo!!
            var ext_port = this.torrent.collection.client.get_external_port();
            var resp = {'v': constants.client_version,
                        'm': {}}
            if (ext_port) {
                resp.p = ext_port;
            }

            if (! this.torrent.magnet_only()) {
                resp['metadata_size'] = this.torrent.metadata_size;
            }
            resp['m']['ut_metadata'] = 2; // totally arbitrary number, but UT needs 2???
            resp['m']['ut_pex'] = 3; // do clients snub us if we advertise but dont respond??
            this._my_extension_handshake = resp;
            this._my_extension_handshake_codes = reversedict(resp['m']);
            mylog(LOGMASK.network_verbose, 'sending extension handshake with data',resp);
            var payload = bencode(resp);
            this._sent_extension_handshake = true;
            this.send_message('UTORRENT_MSG', [constants.handshake_code].concat(payload));
        },
        ready: function() {
            return ! this.handshaking && ! this._remote_choked
        },
        send_message: function(type, payload) {
            if (this._closed) {
                mylog(1,'cannot send message, connection closed',type);
            }
            if (this._error) {
                mylog(1,'cannot send message, connection error',type);
            }
            if (this._connecting) {
                mylog(1,'cannot send message, still connecting',type);
            }

            // if payload is already an array buffer, what to do???
            var args = [];
            for (var i=0; i<arguments.length; i++) {
                args.push(arguments[i]);
            }
            if (args.length > 2) {
                // convenience method for concatenating payload...
                debugger;
            }

            //mylog(1, 'send message of type',type, payload?payload.length:'');
            if (type == 'UNCHOKE') {
                this._remote_choked = false;
                this.set('is_choked', false);
            } else if (type == 'CHOKE') {
                this._remote_choked = true;
                this.set('is_choked', true);
            } else if (type == 'REQUEST') {
                this._outbound_chunk_requests ++;
                this.set('outbound_chunks',this._outbound_chunk_requests);
            } else if (type == 'BITFIELD') {
                this._sent_bitmask = true;
            } else if (type == 'INTERESTED') {
                this._interested = true;
                this.set('am_interested',true);
            } else if (type == 'NOT_INTERESTED') {
                this._interested = false;
                this.set('am_interested',false);
            }

            if (payload) {
                var len = jspack.Pack('>I', [payload.length+1]);
            } else {
                var len = jspack.Pack('>I', [1]);
            }
            var msgcode = constants.message_dict[type]
            if (payload) {
                var packet = new Uint8Array( len.concat([msgcode]).concat(payload) );
            } else {
                var packet = new Uint8Array( len.concat([msgcode]) );
            }
            mylog(LOGMASK.network, 'sending message',type,payload);
            var buf = packet.buffer;
            this.send(buf);
        },
        serve_metadata_piece: function(metapiece, request, piecedata) {
            // optional piecedata
            mylog(1,'serve metadata piece');

            if (piecedata === undefined) {
                piecedata = this.torrent.get_metadata_piece(metapiece, request);
            }

            var total_size = this.torrent.get_infodict('bencoded').length;
            
            var meta = { 'total_size': total_size,
                         'piece': metapiece,
                         'msg_type': constants.tor_meta_codes_r.data};
            mylog(LOGMASK.network_verbose,'responding to metadata request with meta',meta,piecedata.length);
            var payload = [this._remote_extension_handshake['m']['ut_metadata']];
/*
            var bencoded = bencode(meta);
            for (var i=0; i<bencoded.byteLength; i++) {
                payload.push(bencoded[i]);
            }
*/
            payload = payload.concat( bencode(meta) );
            payload = payload.concat(piecedata);
            this.send_message('UTORRENT_MSG', payload);
        },
        has_metadata: function() {
            return this._remote_bitmask || 
                this._remote_extension_handshake && this._remote_extension_handshake.metadata_size;
        },
        request_metadata: function() {
            if (this.torrent._requesting_metadata) { return; }

            this.set('state','request metadata');
            this.torrent._requesting_metadata = true;
            var hs = this._remote_extension_handshake;
            var total_size = hs['metadata_size'];
            var numrequests = Math.ceil(total_size/constants.metadata_request_piece_size);
            for (var i=0; i<numrequests; i++) {
                var req = { 'total_size': total_size,
                            'piece': i,
                            'msg_type': constants.tor_meta_codes_r.request
                          };
                this.torrent._metadata_requests[i] = { conn: this,
                                                       time: new Date().getTime(),
                                                       num: i };
                mylog(1,'requesting metadata',i);
                var payload = [this._remote_extension_handshake['m']['ut_metadata']];
                payload = payload.concat( bencode(req) );
                this.send_message('UTORRENT_MSG', payload);
            }
        },
        check_have_all_metadata: function() {
            var size = this._remote_extension_handshake.metadata_size;
            var numchunks = Math.ceil(size/constants.metadata_request_piece_size);
            for (var i=0; i<numchunks; i++) {
                if (this.torrent._metadata_requests[i] && this.torrent._metadata_requests[i].data) {
                    // continue
                } else {
                    return false;
                }
            }
            var metadata = [];
            for (var i=0; i<numchunks; i++) {
                for (var j=0; j<this.torrent._metadata_requests[i].data.length; j++) {
                    metadata.push( this.torrent._metadata_requests[i].data[j] );
                }
            }
            var result = new Uint8Array(metadata);
            // TODO -- maybe do in thread?
            var hasher = new Digest.SHA1();
            hasher.update( result );
            var hash = new Uint8Array(hasher.finalize());
            assert( ab2hex(hash) == ab2hex(this.torrent.hash) );
            return result;
        },
        metadata_download_complete: function() {
            for (var i=0; i<this._handle_after_metadata.length; i++) {
                this._handle_after_metadata[i]();
            }
        },
        handle_extension_message: function(data) {
            var ext_msg_type = data.payload[0];
            if (ext_msg_type == constants.handshake_code) {
                this.record_message(data.msgtype + ' ' + 'handshake');
                //var braw = new Uint8Array(data.payload.buffer.slice( data.payload.byteOffset + 1 ));
                var info = bdecode( arr2str( new Uint8Array(data.payload), 1 ) )
                mylog(LOGMASK.network, 'decoded extension message stuff',info);

                this._remote_extension_handshake = info;
                this._remote_extension_handshake_codes = reversedict(info['m']);
                if (this._remote_extension_handshake.p !== undefined) {
                    this.peer.set('eport', this._remote_extension_handshake.p);
                }
                if (! this._sent_extension_handshake) {
                    this.send_extension_handshake();
                }
            } else if (this._my_extension_handshake_codes[ext_msg_type]) {
                var ext_msg_str = this._my_extension_handshake_codes[ext_msg_type];
                var their_ext_msg_type = this._remote_extension_handshake['m'][ext_msg_str];

                this.record_message(data.msgtype + ' ' + ext_msg_str);

                assert(their_ext_msg_type !== undefined);

                mylog(LOGMASK.network, 'handling', ext_msg_str, 'extension message');
                if (ext_msg_str == 'ut_metadata') {

                    // prioritize metadata more!!! (pause all other downloads)

                    var arr = new Uint8Array(data.payload.buffer, data.payload.byteOffset+1);
                    var str = arr2str(arr);
                    var info = bdecode(str);
                    if (constants.tor_meta_codes[info.msg_type] == 'data') {
                        var data = new Uint8Array(data.payload.buffer, data.payload.byteOffset + bencode(info).length+1);
                        if (this.torrent._metadata_requests) {
                            var reqdata = this.torrent._metadata_requests[info.piece];
                            mylog(1, 'received metadata piece', info.piece);
                            this.set('state',info.piece + ' metadata');
                            reqdata.data = data;
                            var meta = this.check_have_all_metadata();
                            if (meta) {
                                mylog(1, 'have all metadata', meta, this.repr());
                                var decoded = bdecode(arr2str(meta));
                                this.torrent.metadata_download_complete(decoded);
                            } else {
                                mylog(1,'dont have all metadata yet');
                            }
                        }
                    } else {
                        var tor_meta_type = constants.tor_meta_codes[ info['msg_type'] ];
                        if (tor_meta_type == 'request') {
                            var metapiece = info.piece;
                            if (! this.torrent.has_infodict()) { // remove check for container, move into torrent
                                // this is javascript creating the torrent from a file selection or drag n' drop.
                                mylog(1, 'they are asking for metadata pieces!',metapiece);
                                this.torrent.register_meta_piece_requested(metapiece, this, _.bind(this.serve_metadata_piece, this, metapiece) );
                                // figure out which pieces this corresponds to...
                                // this.bind('close', function() { this.torrent.register_disconnect(metapiece) } );
                            } else {
                                // simply serve from the already completed infodict
                                var bencoded = this.torrent.get_infodict('bencoded');

                                var sliced = bencoded.slice( metapiece * constants.metadata_request_piece_size,
                                                             (metapiece + 1) * constants.metadata_request_piece_size );
                                this.serve_metadata_piece( metapiece, null, sliced );
                            }
                        } else {
                            mylog(LOGMASK.error,'tor meta requset response',tor_meta_type);
                            this.torrent._requesting_metadata = false;
                            this.close();
                        }
                    }
                } else {
                    var arr = new Uint8Array(data.payload.buffer, data.payload.byteOffset+1);
                    var str = arr2str(arr);
                    var info = bdecode(str);
                    this.peer.handle_pex(info);
                    mylog(LOGMASK.network, 'receive ut_pex extension message',info);
                }
            } else {
                this.shutdown('invalid extension message',data);
                debugger;
            }
        },
        shutdown: function(reason) {
            mylog(1, 'shutting down connection:',reason);
        },
        handle_interested: function(data) {
            this._remote_interested = true;
            this.send_message('UNCHOKE'); // unchoke everybody
            this.set('is_interested',true);
        },
        handle_not_interested: function(data) {
            this._remote_interested = false;
            this.set('is_interested',false);
        },
        handle_choke: function(data) {
            // if swarm is healthy and we don't need this peer... just drop this connection
            this._choked = true;
            this.set('am_choked',true);
            if (this.torrent.swarm.healthy()) {
                this.close('choked, find another')
            }
        },
        handle_unchoke: function(data) {
            this._choked = false;
            this.set('am_choked',false);
        },
        update_remote_complete: function(n) {
            n = n || 1;
            this._remote_bitmask_complete = null;
            this._remote_bitmask_count += n;
            this.get_remote_complete();
        },
        get_remote_complete: function(update) {
            if (this._remote_bitmask_complete) {
                return this._remote_bitmask_complete;
            } else if (this._remote_bitmask_count) {
                this._remote_bitmask_complete = Math.floor(1000 * this._remote_bitmask_count / this.get_num_pieces());
                return this._remote_bitmask_complete;
            } else if (this._remote_bitmask) {
                var count = 0;
                for (var i=0; i<this._remote_bitmask.length; i++) {
                    count += this._remote_bitmask[i];
                }
                return this._remote_bitmask_count = count;
                return this.get_remote_complete()
            }
        },
        handle_have_all: function(data) {
            mylog(1, 'handle have all');
            if (this.torrent.magnet_only()) {
                this._handle_after_metadata.push( _.bind(this.handle_have_all, this, data) );
                // dont know bitmask n shit... handle later...
            } else {
                this._remote_bitmask = [];
                for (var i=0; i<this.torrent.get_num_pieces(); i++) {
                    this._remote_bitmask[i] = 1;
                }
                this.trigger('handle_have');
                this.set('complete', this.fraction_complete(this._remote_bitmask));
                this.trigger('completed'); // XXX -- make "remote_completed" event instead
            }
        },
        handle_have: function(data) {
            var index = jspack.Unpack('>i', data.payload);
            //mylog(3, 'handle have index', index);
            if (! this._remote_bitmask) {
                this._handle_after_metadata.push( _.bind(this.handle_have, this, data) );
                return;
            }
            this._remote_bitmask[index] = 1;
            this.trigger('handle_have', index);

            // update torrent piece availability...
            this.set('complete', this.fraction_complete(this._remote_bitmask));
            if (this.get('complete') == 1000) {
                this.peer.set('complete',true);
            }
            if (this.seeding()) {
                if (this.remote_complete()) {
                    this.trigger('completed');
                }
            }
        },
        seeding: function() {
            return this.bitmask_complete(this.torrent.get_bitmask());
        },
        fraction_complete: function(bitmask) {
            // todo -- optimize
            var s = 0;
            for (var i=0; i<bitmask.length; i++) {
                if (bitmask[i] == 1) {
                    s++;
                }
            }
            var val = s/bitmask.length;
            assert(bitmask.length);
            return val;
        },
        bitmask_complete: function(bitmask) {
            // TODO -- keep a count of zeros and keep it up to date
            if (! bitmask) {
                return false;
            } else {
                for (var i=0; i<bitmask.length; i++) {
                    if (bitmask[i] == 0) {
                        return false;
                    }
                }
            }
            return true;
        },
        remote_complete: function() {
            return this.bitmask_complete(this._remote_bitmask);
        },
        handle_cancel: function(data) {
            var index = jspack.Unpack('>I', new Uint8Array(data.payload.buffer, data.payload.byteOffset + 0, 4))[0];
            var offset = jspack.Unpack('>I', new Uint8Array(data.payload.buffer, data.payload.byteOffset + 4, 4))[0];
            var size = jspack.Unpack('>I', new Uint8Array(data.payload.buffer, data.payload.byteOffset + 8, 4))[0];
            mylog(LOGMASK.network,'CANCEL piece request',index,'offset',offset,'of size',size);

            var piece = this.torrent.get_piece(index);
            // TODO -- cancel the read job if pending, don't send the packet
        },
        handle_request: function(data) {
            var index = jspack.Unpack('>I', new Uint8Array(data.payload.buffer, data.payload.byteOffset + 0, 4))[0];
            var offset = jspack.Unpack('>I', new Uint8Array(data.payload.buffer, data.payload.byteOffset + 4, 4))[0];
            var size = jspack.Unpack('>I', new Uint8Array(data.payload.buffer, data.payload.byteOffset + 8, 4))[0];
            mylog(LOGMASK.network,'handle piece request for piece',index,'offset',offset,'of size',size);
            //mylog(1,'handle piece request for piece',index,'offset',offset);

            if (this.torrent.has_piece(index)) {
                var piece = this.torrent.get_piece(index);
                piece.set('requests_in', piece.get('requests_in')+1 );
                piece.get_data(offset, size, this.on_handle_request_data);
            } else {
                var payload = jspack.Pack(">III", [index, offset, size]);
                this.send_message("REJECT_REQUEST", payload);
                mylog(LOGMASK.error,'connection asked for incomplete piece',index,offset,size);
            }
        },
        on_handle_request_data: function(piece, request, responses) {
            // TODO -- assert matches original request offsets !
            if (! this._connected) {
                mylog(LOGMASK.error,'got piece data to send but conn closed');
                return;
            }
            var payload = jspack.Pack('>II', [piece.num, request.original[0]]);
            // use blob builder?
            for (var i=0; i<responses.length; i++) {
                var response = new Uint8Array(responses[i]);
                for (var j=0; j<response.byteLength; j++) {
                    // inefficient!!!!
                    payload.push(response[j]);
                }
            }
            //mylog(1,'respond piece',piece.num, request.original[0]);
            piece.set('responses_out', piece.get('responses_out')+1 );
            this.send_message('PIECE', payload);
        },
        handle_bitfield: function(data) {
            mylog(LOGMASK.network, 'handle bitfield message');
            if (this.torrent.magnet_only()) {
                this._handle_after_metadata.push( _.bind(this.handle_bitfield, this, data) );
                // store payload for later
            } else {
                this._remote_bitmask = this.torrent.parse_bitmask(data.payload);
                this.set('complete', this.fraction_complete(this._remote_bitmask));
                mylog(LOGMASK.network,'parsed bitmask',this._remote_bitmask);
                if (! this._sent_bitmask && ! this.torrent.magnet_only()) {
                    this.send_bitmask();
                }
            }
        },
        send_bitmask: function() {
            var bitfield = this.torrent.create_bitmask_payload();
            // payload is simply one bit for each piece
            this.send_message('BITFIELD', bitfield);
/*
            if (this.torrent.have_all) {
                this.send_message('HAVE_ALL');
            }
*/
        },
        handle_port: function(data) {
            mylog(LOGMASK.network, 'handle port message');
            this.set('dht_port',data.payload[0] * 256 + data.payload[1]);
        },
        on_connect_timeout: function() {
            if (! this._connected && !this._error && !this._closed) {
                this.close('connection timeout');
                this.trigger('timeout');
            }
        },
        onopen: function(evt) {
            this.set('state','connected');
            this._connecting = false;
            clearTimeout( this.connect_timeout );
            // Web Socket is connected, send data using send()
            this._connected = true;
            mylog(LOGMASK.network, this.repr(), "connected!");
            this.trigger('connected'); // send HAVE, unchoke
            //_.delay( this.send_handshake, 100 );

            // XXX!
            this.send_handshake();
        },
        send_have: function(num) {
            var payload = jspack.Pack('>I',[num]);
            this.send_message('HAVE', payload);
        },
        send_handshake: function() {
            assert(! this._sent_handshake);
            this.set('state','handshaking');
            var handshake = create_handshake(this.infohash, my_peer_id);
            mylog(LOGMASK.network, this.repr(), 'sending handshake of len',handshake.length,[handshake])
            var s = new Uint8Array(handshake);
            this._sent_handshake = true;
            this.send( s.buffer );
        },
        send_keepalive: function() {
            if (new Date() - this._keepalive_sent < 30 * 1000) {
                return;
            }

            this._keepalive_sent = new Date();
            mylog(LOGMASK.network,'send keepalive');
            var s = new Uint8Array(4);
            this.send( s.buffer );
        },
        send: function(msg) {
            this._last_message_out = new Date().getTime();
            this.bytecounters.sent.sample(msg.byteLength);
            this.bytecounters.sent._expect_nonzero=true;
            this.set('bytes_sent', this.get('bytes_sent') + msg.byteLength);
            if (this.torrent) {
                this.torrent.set('bytes_sent', this.torrent.get('bytes_sent') + msg.byteLength);
            }
            if (this.using_flash()) {
/*
                var arr = [];
                var src = new Uint8Array(msg);
                for (var i=0; i<msg.byteLength; i++) {
                    arr.push(src[i]);
                }

                this.stream.send(arr);
*/
                this.stream.send( btoa(arr2str(new Uint8Array(msg))) );
                //this.stream.send(
            } else {
                this.stream.send(msg);
            }
        },
        close: function(reason) {
            this._manually_closed = true;
            if (reason) {
                if (this.peer) {
                    this.peer.set('closereason',reason);
                }
                mylog(LOGMASK.network,'close connection',this.repr(),reason);
            }
            // cleanup shizzzz!
            if (config.packaged_app) {
                this.stream.close(reason)
            } else {
                this.stream.close()
            }
        },
        handle_message: function(msg_len) {
            var msg = this.read_buffer_consume(msg_len);
            var data = parse_message(msg);
            this._last_message_in = new Date().getTime();
            mylog(LOGMASK.network,'handle message',data.msgtype,data);
            if (data.msgtype != 'PIECE' && data.msgtype != 'UTORRENT_MSG') this.record_message(data.msgtype);
            var handler = this[this.handlers[data.msgtype]];
            if (handler) {
                handler(data);
                //handler.apply(this, [data]);
                _.defer( _.bind(this.check_more_messages_in_buffer, this) );
            } else {
                var err = 'unhandled message ' + data.msgtype
                mylog(LOGMASK.error,err);
                this.close(err);
            }
        },
        handle_handshake: function(handshake_len) {
            this.handshaking = false;
            var blob = this.read_buffer_consume(handshake_len);
            this._remote_handshake = blob;
            var data = parse_handshake(blob);
            this._remote_handshake_parsed = data;
            if (data.protocol == constants.protocol_name) {
                mylog(LOGMASK.network,'parsed handshake',data)

                if (this._was_incoming) {

                    if (data.peerid == ab2hex(my_peer_id)) {
                        mylog(LOGMASK.error,'connected to own peer id');
                        this.close('connected to own peer id');
                        return;
                    }

                    // first time finding out about infohash ... set this.torrent, peer, etc.
                    var torrent = this.client.torrents.contains( data.infohash );
                    if (! torrent) {
                        mylog(1,'incoming connection for torrent which we dont have', data.infohash)
                        this.close('no torrent');
                        return;
                    } else if (torrent.get('state') != 'started') {
                        mylog(1,'incoming connection for torrent which is not started', data.infohash,torrent.get('state'))
                        this.close('torrent not started');
                        return;
                    } else {
                        this.torrent = torrent;

                        if (! this.bytecounters.sent.parent) {
                            this.bytecounters.sent.set_parent( this.torrent.bytecounters.sent );
                            this.bytecounters.received.set_parent( this.torrent.bytecounters.received );
                        }

                        this.bind('onclose', torrent.on_connection_close);
                        this.infohash = ab2arr(this.torrent.hash);
                        this.torrent.connections.add(this);
                        this.torrent.handle_new_peer({ip:this._host, port:this._port, incoming:true});
                        var key = this._host + ':' + this._port;
                        var peer = this.torrent.swarm.get(key);
                        this.peer = peer;
                        this.peer.set('conn',this);
                    }
                }
                this.set('state','active');
                this.peer.set('ever_connected',true);
                if (! this._sent_handshake) {
                    this.send_handshake();
                }
                if (! this._sent_extension_handshake) {
                    this.send_extension_handshake();
                }
                if (! this._sent_bitmask && ! this.torrent.magnet_only()) {
                    this.send_bitmask();
                }
                this.check_more_messages_in_buffer();
            } else {
                this.close('invalid handshake ' + escape(data.protocol));
            }
        },
        read_buffer_consume: function(bytes, peek) {
            var start_size = this.read_buffer_size();
            var retbuf = new Uint8Array(bytes);
            var consumed = 0;
            var tearoff = 0;
            var i = 0;
            while (i < this.read_buffer.length && consumed < bytes) {
                var sz = Math.min( bytes - consumed, this.read_buffer[i].byteLength );
                if (this.read_buffer[i].buffer) {
                    // in case earlier was torn off
                    retbuf.set( new Uint8Array(this.read_buffer[i].buffer, this.read_buffer[i].byteOffset, sz), consumed );
                } else {
                    retbuf.set( new Uint8Array(this.read_buffer[i], 0, sz), consumed );
                }
                consumed += sz;
                if (! peek) {
                    if (sz < this.read_buffer[i].byteLength) {
                        // tearoff moar........

                        var sznow = this.read_buffer[i].byteLength;
                        var old = this.read_buffer[i];
                        if (this.read_buffer[i].buffer) {
                            this.read_buffer[i] = new Uint8Array( this.read_buffer[i].buffer, this.read_buffer[i].byteOffset + sz );
                        } else {
                            this.read_buffer[i] = new Uint8Array( this.read_buffer[i], sz );
                        }
                        assert(this.read_buffer[i].byteLength == sznow - sz);
                        // mylog(1, 'tearing off partially consumed data');
                        // tear off anything partially consumed...
                    } else {
                        tearoff++;
                    }
                }

                i ++;
            }

            if (! peek) {
                for (var j=0;j<tearoff;j++){
                    this.read_buffer.shift(); // tear off everything completely
                }
            }

            if (! peek) {
                assert( start_size - bytes == this.read_buffer_size() );
            }

            return retbuf.buffer;
        },
        read_buffer_size: function() {
            var s = 0;
            for (var i=0; i<this.read_buffer.length; i++) {
                s += this.read_buffer[i].byteLength;
            }
            return s;
        },
        check_more_messages_in_buffer: function() {
            if (this._connected && ! this._closed) {
                var bufsz = this.read_buffer_size();
                if (bufsz >= 4) {
                    var msg_len = new DataView(this.read_buffer_consume(4,true)).getUint32(0);
                    if (msg_len > constants.max_packet_size) {
                        this.close('packet too large');
                        debugger;
                    } else {
                        if (bufsz >= msg_len + 4) {
                            this.handle_message(msg_len + 4);
                        }
                    }
                }
            }
        },
        onmessage: function(evt) {
            if (this._manual_assert) {
                debugger;
            }
            if (this._manually_closed) {
                return;
            }
            if (this.using_flash()) {
                var strmsg = atob(evt.data)
                var msg = new Uint8Array(str2arr(strmsg)).buffer
            } else {
                var msg = evt.data;
            }
            this.bytecounters.received.sample(msg.byteLength);
            this.set('bytes_received', this.get('bytes_received') + msg.byteLength);
            if (this.torrent) {
                this.torrent.set('bytes_received', this.torrent.get('bytes_received') + msg.byteLength);
            }
            assert(msg instanceof ArrayBuffer);
            this.read_buffer.push(msg);
            //mylog(LOGMASK.network, 'receive new packet', msg.byteLength);
            if (this.handshaking) {
                var bufsz = this.read_buffer_size();
                var protocol_str_len = new Uint8Array(this.read_buffer_consume(1,true), 0, 1)[0];
                var handshake_len = 1 + protocol_str_len + 8 + 20 +20;
                if (bufsz < handshake_len) {
                    // can't handshake yet... need to read more data
                    mylog(LOGMASK.network,'cant handshake yet',bufsz, handshake_len);
                } else {
                    this.handle_handshake(handshake_len);
                }
            } else {
                this.check_more_messages_in_buffer();
            }
        },
        repr: function() {
            var client = this._remote_extension_handshake ? this._remote_extension_handshake['v'] : '';
            return '<Conn:' + this._host+':'+this._port +', '+client+', '+ (this.peer?this.peer.repr():'nopeer') + '>';
        },
        onclose: function(evt) {
            // websocket is closed.
            // trigger cleanup of pending requests etc
            if (this._error) {
                //mylog(1,this.repr(),'onclose, already triggered error',evt.code, evt, 'clean:',evt.wasClean, evt.reason?('reason:'+evt.reason):'','delta',(new Date() - this.inittime)/1000);
            } else {
                this._closed = true;
                this.trigger('onclose', this);
                this.handle_close(evt, this);
                //mylog(1,this.repr(),'onclose',evt.code, evt, 'clean:',evt.wasClean, evt.reason?('reason:'+evt.reason):'','delta',(new Date() - this.inittime)/1000);
                //_.delay( _.bind(this.reconnect, this), 2000 );
            }
        },
        get_key: function() {
            return this._host + ':' + this._port;
        },
        onerror: function(evt) {
            clearTimeout( this.connect_timeout );
            if (this._closed) {
                //mylog(1,this.repr(),'onerror, already triggered onclose',evt);
            } else {
                //this.close();
                this._error = true;
                this.trigger('onerror',this);
                //mylog(1,this.repr(),'onerror', evt);

                if (! this._closed) {
                    this.trigger('onclose', this);
                    this.handle_close(evt, this);
                }
            }
        },
        handle_close: function(data) {
            // gets called 
            // clean up variables...
            if (this.peer) {
                this.peer.notify_closed(data, this);
            }
            if (this.incoming) {
                this.incoming.notify_closed(data, this);
            }
            if (this.connect_timeout) {
                clearTimeout(this.connect_timeout);
            }
            for (var k in this) {
                delete this[k];
            }
            // cleanup/cancel outbound piece requests etc!...
        }
    });

    jstorrent.TorrentPeerCollection = jstorrent.Collection.extend({
        //localStorage: new Store('TorrentCollection'),
        model: jstorrent.WSPeerConnection,
/*
        contains: function(key) {
            for (var i=0; i<this.models.length; i++) {
                var conn = this.models[i];
                if (conn.get_key == key) {
                    return true;
                }
            }
            return false;
        }
*/
        add_peer: function(peer) {
            mylog(LOGMASK.network,'adding peer',peer);
            var torrent = peer.get('torrent');
            var conn = new jstorrent.WSPeerConnection({id: peer.id, 
                                                       host:peer.get('host'), 
                                                       port:peer.get('port'), 
                                                       hash:peer.get('hash'),
                                                       peer:peer,
                                                       torrent:peer.get('torrent')});
            this.add(conn);

            conn.on('connected', _.bind(function() {
                // this.connections[key] = conn
                this.set('numpeers', this.connections.models.length);
            },torrent));

            conn.bind('onclose', torrent.on_connection_close);
        },
        dump_idle_peers: function() {
            // if swarm is sufficiently large, and we are holding onto
            // idle connections, dump them and try out some others.
            
        }

    });

})();
