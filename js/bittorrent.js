(function(){

    var DHT = parseInt('0x01');
    var UTORRENT = parseInt('0x10');
    var NAT_TRAVERSAL = parseInt('0x08');
    var LAST_BYTE = DHT;
    LAST_BYTE |= NAT_TRAVERSAL;

    var FLAGS = [0,0,0,0,0,0,0,0];
    FLAGS[5] = UTORRENT;
    FLAGS[7] = LAST_BYTE;

    window.constants = {
        client_version: 'jstorrent 0.0.2',
        protocol_name: 'BitTorrent protocol',
        handshake_length: 1 + 'BitTorrent protocol'.length + 8 + 20 + 20,
        std_piece_size: Math.pow(2,14),
        //new_torrent_piece_size: Math.pow(2,16),
        new_torrent_piece_size: Math.pow(2,14),
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
        var protocol_str = ab2str(new Uint8Array(bytearray, 1, protocol_str_len));
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
        
        parts = parts.concat( _.map(constants.protocol_name.split(''), function(c) { return c.charCodeAt(0); } ) );
        parts = parts.concat( constants.handshake_flags );
        parts = parts.concat( infohash )
        parts = parts.concat( peerid )
        assert(parts.length == 68, 'invalid handshake length');
        return parts
    }

    var jspack = new JSPack();

    jstorrent.WSPeerConnection = Backbone.Model.extend({
        className: 'WSPeerConnection',
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
            if (config.bittorrent_proxy) {
                var uri = '/wsproxy';
                var strurl = 'ws://' + config.bittorrent_proxy + uri + '?target=' + encodeURIComponent(this._host+':'+this._port);
            } else {
                var uri = '/wsclient';
                var strurl = 'ws://'+this._host+':'+this._port+uri;
            }
            return strurl;
        },
        reconnect: function() {
            this.strurl = this.get_host();
            this.inittime = new Date();
            try {
                this.stream = new WebSocket(this.strurl);
            } catch(e) {
                mylog(1,'error creating websocket!');
                debugger;
            }
            mylog(LOGMASK.network,'initializing stream to',this.strurl);
            this.stream.binaryType = "arraybuffer";
            this.stream.onerror = this.onerror;
            this.stream.onopen = this.onopen;
            this.stream.onclose = this.onclose;
            this.stream.onmessage = this.onmessage;
            this.read_buffer = []; // utorrent does not send an entire message in each websocket frame
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
                      'handle_piece_hashed',
                      'handle_keepalive',
                      'handle_piece',
                      'handle_cancel',
                      'handle_port'
                     );
            //mylog(LOGMASK.network,'initialize wspeerconn');
            this.set('state','connecting');
            var host = opts.host;
            var port = opts.port;
            this.peer = opts.peer;
            assert( typeof opts.port == 'number' );
            var torrent = opts.torrent;

            this.set('bytes_received',0);
            this.set('bytes_sent',0);
            this.set('chunks_received',0);
            this.set('timeouts',0);
            //var infohash = opts.hash; // array buffers and stuff no bueno... just want simple array
            assert(opts.hash.length == 20);
            var infohash = [];
            for (var i=0; i<opts.hash.length; i++) {
                infohash.push( opts.hash[i] );
            }

            this._outbound_chunk_requests = 0;
            this._outbound_chunk_requests_limit = 20;

            this._host = host;
            this._port = port;
            this.infohash = infohash;
            assert(this.infohash.length == 20, 'input infohash as array of bytes');
            this.torrent = torrent;
            this.torrent.bind('piece_hashed', this.handle_piece_hashed);
            var infodict = this.torrent.get_infodict();
            if (! this.torrent.magnet_only()) {
                this.torrent._metadata_requests = {};
            }
            mylog(LOGMASK.network,'initialize peer connection with infohash',ab2hex(this.infohash));
            this.connect_timeout = setTimeout( this.on_connect_timeout, 2000 );
            this._connected = false;
            this._connecting = true;
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

            this.handlers = {
                'UTORRENT_MSG': this.handle_extension_message,
                'PORT': this.handle_port,
                'HAVE': this.handle_have,
                'CHOKE': this.handle_choke,
                'UNCHOKE': this.handle_unchoke,
                'INTERESTED': this.handle_interested,
                'NOT_INTERESTED': this.handle_not_interested,
                'HAVE_ALL': this.handle_have_all,
                'PIECE': this.handle_piece,
                'BITFIELD': this.handle_bitfield,
                'REQUEST': this.handle_request,
                'CANCEL': this.handle_cancel,
                'keepalive': this.handle_keepalive
            };
            this.reconnect();
        },
        adjust_chunk_queue_size: function() {
            if (this.get('timeouts') > this.get('chunks_received')) {
                this._outbound_chunk_requests_limit = 1;
            }
        },
        handle_piece: function(data) {
            var view = new DataView(data.payload.buffer, data.payload.byteOffset);
            var index = view.getUint32(0);
            var offset = view.getUint32(4);
            this.set('last_message',data.msgtype + ' ' + index + ','+(offset/constants.chunk_size));
            var chunk = new Uint8Array(data.payload.buffer, data.payload.byteOffset + 8);
            //mylog(LOGMASK.network,'got piece idx',index,'offset',offset,'len',chunk.byteLength);
            var handled = this.torrent.handle_piece_data(this, index, offset, chunk);
            if (handled) {
                this.set('chunks_received',this.get('chunks_received')+1);
                this._outbound_chunk_requests --;
                this.set('outbound_chunks',this._outbound_chunk_requests);
            }
        },
        handle_piece_hashed: function(piece) {
            this.trigger('hash_progress', (piece.num / (this.torrent.num_pieces-1)))
        },
        handle_keepalive: function() {
            this._keepalive_sent = null;
            mylog(LOGMASK.network,'got keepalive');
            this.send_keepalive();
        },
        send_extension_handshake: function() {
            if (this._sent_extension_handshake) { debugger; return; }
            // woo!!
            var resp = {'v': constants.client_version,
                        'm': {},
                        'p': 0}; // we don't have a port to connect to :-(
            if (! this.torrent.magnet_only()) {
                resp['metadata_size'] = this.torrent.metadata_size;
            }
            resp['m']['ut_metadata'] = 2; // totally arbitrary number, but UT needs 2???
            resp['m']['ut_pex'] = 3; // totally arbitrary number, but UT needs 2???
            this._my_extension_handshake = resp;
            this._my_extension_handshake_codes = reversedict(resp['m']);
            mylog(LOGMASK.network_verbose, 'sending extension handshake with data',resp);
            var payload = bencode(resp);
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
            var hasher = new Digest.SHA1();
            hasher.update( result );
            var hash = new Uint8Array(hasher.finalize());
            assert( ab2hex(hash) == ab2hex(this.torrent.hash) );
            return result;
        },
        handle_extension_message: function(data) {
            var ext_msg_type = data.payload[0];
            if (ext_msg_type == constants.handshake_code) {
                this.set('last_message',data.msgtype + ' ' + 'handshake');
                var braw = new Uint8Array(data.payload.buffer.slice( data.payload.byteOffset + 1 ));
                var info = bdecode( ab2str( braw ) )
                mylog(LOGMASK.network, 'decoded extension message stuff',info);

                this._remote_extension_handshake = info;
                this._remote_extension_handshake_codes = reversedict(info['m']);
                if (! this._sent_extension_handshake) {
                    this.send_extension_handshake();
                }
            } else if (this._my_extension_handshake_codes[ext_msg_type]) {
                var ext_msg_str = this._my_extension_handshake_codes[ext_msg_type];
                var their_ext_msg_type = this._remote_extension_handshake['m'][ext_msg_str];

                this.set('last_message',data.msgtype + ' ' + ext_msg_str);

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
                                mylog(1, 'have all metadata', meta);
                                var decoded = bdecode(arr2str(meta));
                                this.torrent.metadata_download_complete(decoded);
                                //this.torrent.set_metadata({'info':decoded});
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
                                this.torrent.register_meta_piece_requested(metapiece, _.bind(this.serve_metadata_piece, this, metapiece) );
                                // figure out which pieces this corresponds to...
                                // this.bind('close', function() { this.torrent.register_disconnect(metapiece) } );
                            } else {
                                // simply serve from the already completed infodict
                                var bencoded = this.torrent.get_infodict('bencoded'); // TODO -- store bencoded version

                                var sliced = bencoded.slice( metapiece * constants.metadata_request_piece_size,
                                                             (metapiece + 1) * constants.metadata_request_piece_size );
                                this.serve_metadata_piece( metapiece, null, sliced );
                            }
                        } else {
                            debugger;
                        }
                    }
                } else {
                    var arr = new Uint8Array(data.payload.buffer, data.payload.byteOffset+1);
                    var str = arr2str(arr);
                    var info = bdecode(str);
                    var decodedpeers = [];
                    if (info.added) {
                        var itermax = info.added.length/6;
                        for (var i=0; i<itermax; i++) {
                            var peerdata = jstorrent.decode_peer( info.added.slice( i*6, (i+1)*6 ) );
                            decodedpeers.push(peerdata);
                            this.torrent.handle_new_peer(peerdata);
                        }
                    }
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
                this.close('looking for another peer')
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
            this._remote_bitmask = [];
            for (var i=0; i<this.torrent.get_num_pieces(); i++) {
                this._remote_bitmask[i] = 1;
            }
            this.trigger('handle_have');
            this.set('complete', this.fraction_complete(this._remote_bitmask));
            this.trigger('completed'); // XXX -- make "remote_completed" event instead
        },
        handle_have: function(data) {
            var index = jspack.Unpack('>i', data.payload);
            //mylog(3, 'handle have index', index);
            if (! this._remote_bitmask) {
                var err = 'client sent HAVE without sending bitmask';
                mylog(1,err);
                this.close(err);
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

            var piece = this.torrent.get_piece(index);
            if (piece.complete()) {

            // read each of these file payloads and respond...
            // var request_info = {'index':index, 'offset':offset, 'size':size};
                piece.get_data(offset, size, this.on_handle_request_data);
            } else {
                var payload = jspack.Pack(">III", [index, offset, size]);
                this.send_message("REJECT_REQUEST", payload);
                mylog(LOGMASK.error,'connection asked for incomplete piece',index,offset,size);
            }
        },
        on_handle_request_data: function(piece, request, responses) {
            var payload = jspack.Pack('>II', [piece.num, request.original[0]]);
            for (var i=0; i<responses.length; i++) {
                var response = new Uint8Array(responses[i]);
                for (var j=0; j<response.byteLength; j++) {
                    // inefficient!!!!
                    payload.push(response[j]);
                }
            }
            this.send_message('PIECE', payload);
        },
        handle_bitfield: function(data) {
            mylog(LOGMASK.network, 'handle bitfield message');
            this._remote_bitmask = this.torrent.parse_bitmask(data.payload);
            this.set('complete', this.fraction_complete(this._remote_bitmask));
            mylog(LOGMASK.network,'parsed bitmask',this._remote_bitmask);
            if (! this._sent_bitmask && ! this.torrent.magnet_only()) {
                this.send_bitmask();
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
            this.send_handshake();
        },
        send_have: function(num) {
            var payload = jspack.Pack('>I',[num]);
            this.send_message('HAVE', payload);
        },
        send_handshake: function() {
            this.set('state','handshaking');
            var handshake = create_handshake(this.infohash, my_peer_id);
            mylog(LOGMASK.network, 'sending handshake of len',handshake.length,[handshake])
            var s = new Uint8Array(handshake);
            this.send( s.buffer );
        },
        send_keepalive: function() {
            this._keepalive_sent = new Date();
            mylog(LOGMASK.network,'send keepalive');
            var s = new Uint8Array(4);
            this.send( s.buffer );
        },
        send: function(msg) {
            this._last_message_out = new Date().getTime();
            this.torrent.bytecounters.sent.sample(msg.byteLength);
            this.set('bytes_sent', this.get('bytes_sent') + msg.byteLength);
            this.torrent.set('bytes_sent', this.torrent.get('bytes_sent') + msg.byteLength);
            this.stream.send(msg);
        },
        close: function(reason) {
            if (reason) {
                mylog(LOGMASK.network,'close connection',reason);
            }
            this.stream.close()
        },
        handle_message: function(msg_len) {
            var msg = this.read_buffer_consume(msg_len);
            var data = parse_message(msg);
            this._last_message_in = new Date().getTime();
            mylog(LOGMASK.network,'handle message',data.msgtype,data);
            if (data.msgtype != 'PIECE' && data.msgtype != 'UTORRENT_MSG') this.set('last_message',data.msgtype);
            var handler = this.handlers[data.msgtype];
            if (handler) {
                handler(data);
            } else {
                throw Error('unhandled message ' + data.msgtype);
            }
            _.defer(_.bind(this.check_more_messages_in_buffer, this));
        },
        handle_handshake: function(handshake_len) {
            this.handshaking = false;
            var blob = this.read_buffer_consume(handshake_len);
            this._remote_handshake = blob;
            var data = parse_handshake(blob);
            if (data.protocol == constants.protocol_name) {
                mylog(LOGMASK.network,'parsed handshake',data)
                this.set('state','active');
                if (! this._sent_bitmask && ! this.torrent.magnet_only()) {
                    this.send_bitmask();
                }
                this.check_more_messages_in_buffer();
            } else {
                debugger;
                this.close('invalid handshake', data.protocol);
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
            var bufsz = this.read_buffer_size();
            if (bufsz >= 4) {
                var msg_len = new DataView(this.read_buffer_consume(4,true)).getUint32(0);
                if (msg_len > constants.max_packet_size) {
                    this.close('packet too large');
                } else {
                    if (bufsz >= msg_len + 4) {
                        this.handle_message(msg_len + 4);
                    }
                }
            }
        },
        onmessage: function(evt) {
            var msg = evt.data;
            this.torrent.bytecounters.received.sample(msg.byteLength);
            this.set('bytes_received', this.get('bytes_received') + msg.byteLength);
            this.torrent.set('bytes_received', this.torrent.get('bytes_received') + msg.byteLength);
            this.read_buffer.push(msg);
            //mylog(LOGMASK.network, 'receive new packet', msg.byteLength);
            if (this.handshaking) {
                var bufsz = this.read_buffer_size();
                var protocol_str_len = new Uint8Array(this.read_buffer_consume(1,true), 0, 1)[0];
                var handshake_len = 1 + protocol_str_len + 8 + 20 +20;
                if (bufsz < handshake_len) {
                    // can't handshake yet... need to read more data
                    mylog(1,'cant handshake yet',bufsz, handshake_len);
                } else {
                    this.handle_handshake(handshake_len);
                }
            } else {
                this.check_more_messages_in_buffer();
            }
        },
        repr: function() {
            return this.strurl;
        },
        onclose: function(evt) {
            // websocket is closed.
            // trigger cleanup of pending requests etc
            if (this._error) {
                //mylog(1,this.repr(),'onclose, already triggered error',evt.code, evt, 'clean:',evt.wasClean, evt.reason?('reason:'+evt.reason):'','delta',(new Date() - this.inittime)/1000);
            } else {
                this._closed = true;
                this.handle_close(evt, this);
                this.trigger('onclose', this);
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
                    this.handle_close(evt, this);
                    this.trigger('onclose', this);
                }
            }
        },
        handle_close: function(data) {
            // gets called 
            this.peer.notify_closed(data);
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
