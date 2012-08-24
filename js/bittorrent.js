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
        protocol_name: 'BitTorrent protocol',
        handshake_length: 1 + 'BitTorrent protocol'.length + 8 + 20 + 20,
        std_piece_size: Math.pow(2,14),
        //new_torrent_piece_size: Math.pow(2,16),
        new_torrent_piece_size: Math.pow(2,14),
        metadata_request_piece_size: Math.pow(2,14),
        //metadata_request_piece_size: Math.pow(2,10),
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
                          2: 'reject' }

    };
    constants.tor_meta_codes_r = reversedict(constants.tor_meta_codes);
    constants.message_dict = {};
    for (var i=0; i<constants.messages.length; i++) {
        constants.message_dict[ constants.messages[i] ] = i;
    }

    function parse_message(ba) {
        // var msg_len = new Uint32Array(ba, 0, 1)[0] - 1; // not correct endianness
        var msg_len = new DataView(ba).getUint32(0) - 1; // equivalent to jspack... use that?

        var msgval = new Uint8Array(ba, 4, 1)[0]; // endianness seems to work ok
        var msgtype = constants.messages[msgval];

        if (ba.byteLength != msg_len + 5) {
            throw Error('bad message length');
        }
        
        return { 'msgtype': msgtype,
                 'msgcode': msgval,
                 'payload': new Uint8Array(ba, 5) };
    }


    function parse_handshake(bytearray) {
        var protocol_str_len = new Uint8Array(bytearray, 0, 1)[0];
        var protocol_str = ab2str(new Uint8Array(bytearray, 1, protocol_str_len + 1));
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

    BitTorrentMessageHandler = Backbone.Model.extend({
        // create handlers for all types of messages?
    });

    var jspack = new JSPack();

    WSPeerConnection = Backbone.Model.extend({
        /* 

           connection that acts like a bittorrent connection, wrapped just inside a websocket

        */
        reconnect: function() {
            mylog(1,'reconnecting');
            this._port = 64399;
            var uri = '/api/upload/ws';
            var uri = '/wsclient';
            this.stream = new WebSocket('ws://'+this._host+':'+this._port+uri);
            this.stream.binaryType = "arraybuffer"; // blobs dont have a synchronous API?
            this.stream.onopen = this.onopen
            this.stream.onclose = this.onclose
            this.stream.onmessage = this.onmessage
            this.stream.onclose = this.onclose
            this.read_buffer = []; // utorrent does not send an entire message in each websocket frame
        },
        initialize: function(host, port, infohash, container) {
            _.bindAll(this, 'onopen', 'onclose', 'onmessage', 'onerror', 'on_connect_timeout',
                      'handle_extension_message',
                      'send_handshake',
                      'send_extension_handshake',
                      'handle_bitfield',
                      'send_bitmask',
                      'handle_request',
                      'on_handle_request_data',
                      'handle_have',
                      'handle_have_all',
                      'handle_interested',
                      'handle_not_interested',
                      'handle_piece_hashed'
                     );
            this._host = host;
            this._port = port;
            this._closed = true;
/*
            this.stream = new WebSocket('ws://'+this._host+':'+this._port+'/api/upload/ws');
            this.stream.binaryType = "arraybuffer"; // blobs dont have a synchronous API?
*/
            this.infohash = infohash;
            assert(this.infohash.length == 20, 'input infohash as array of bytes');
            this.container = container; // bittorrent.dnd.js gives us this...
            this.newtorrent = new NewTorrent({container:container, althash:infohash});
            this.newtorrent.bind('piece_hashed', this.handle_piece_hashed);
            this.newtorrent_metadata_size = bencode(this.newtorrent.fake_info).length
            console.log('initialize peer connection with infohash',this.infohash);
            this.connect_timeout = setTimeout( this.on_connect_timeout, 1000 );
            this.connected = false;
            this.connecting = true;
            this.handshaking = true;

            this._remote_bitmask = null;
            this._remote_extension_handshake = null;
            this._my_extension_handshake = null;
            this._sent_extension_handshake = false;

            this._remote_choked = true;
            this._remote_interested = false;

            this._sent_bitmask = false;
            this._my_bitmask = null;

            this.handlers = {
                'UTORRENT_MSG': this.handle_extension_message,
                'PORT': this.handle_port,
                'HAVE': this.handle_have,
                'INTERESTED': this.handle_interested,
                'HAVE_ALL': this.handle_have_all,
                'BITFIELD': this.handle_bitfield,
                'REQUEST': this.handle_request
            };
            this.reconnect();
/*
            this.stream.onopen = this.onopen
            this.stream.onclose = this.onclose
            this.stream.onmessage = this.onmessage
            this.stream.onclose = this.onclose
*/
        },
        handle_piece_hashed: function(piece) {
            this.trigger('hash_progress', (piece.num / (this.newtorrent.num_pieces-1)))
        },
        send_extension_handshake: function() {
            // woo!!
            var resp = {'v': 'jstorrent 0.0.1',
                        'm': {},
                        'p': 0}; // we don't have a port to connect to :-(
            resp['metadata_size'] = this.newtorrent_metadata_size;
            resp['m']['ut_metadata'] = 2; // totally arbitrary number, but UT needs 2???
            this._my_extension_handshake = resp;
            this._my_extension_handshake_codes = reversedict(resp['m']);

            // build the payload...
            mylog(2, 'sending extension handshake with data',resp);
            var payload = bencode(resp);
            this.send_message('UTORRENT_MSG', [constants.handshake_code].concat(payload));
        },
        send_message: function(type, payload) {
            if (this._closed) {
                mylog(1,'cannot send message, connection closed',type);
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

            mylog(1, 'send message of type',type, payload?payload.length:'');
            if (type == 'UNCHOKE') {
                this._remote_choked = false;
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
            //mylog(1, 'sending message',type,utf8.parse(payload));
            var buf = packet.buffer;
            this.stream.send(buf);
        },
        serve_metadata_piece: function(metapiece, request) {
            mylog(1,'serve metadata piece');
            var tor_meta_codes = { 'request': 0,
                                   'data': 1,
                                   'reject': 2 };

            var piecedata = this.newtorrent.get_metadata_piece(metapiece, request);

            var total_size = bencode(this.newtorrent.fake_info).length
            
            var meta = { 'total_size': total_size,
                         'piece': metapiece,
                         'msg_type': tor_meta_codes.data};
            mylog(2,'responding to metadata request with meta',meta,piecedata.length);
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
        handle_extension_message: function(data) {
            var ext_msg_type = data.payload[0];
            if (ext_msg_type == constants.handshake_code) {
                var braw = new Uint8Array(data.payload.buffer.slice( data.payload.byteOffset + 1 ));
                mylog(2, 'raw extension message:', braw);
                var info = bdecode( ab2str( braw ) )
                mylog(1, 'decoded extension message stuff',info);

                this._remote_extension_handshake = info;
                this._remote_extension_handshake_codes = reversedict(info['m']);
                if (! this._sent_extension_handshake) {
                    this.send_extension_handshake();
                }
            } else if (this._my_extension_handshake_codes[ext_msg_type]) {
                var ext_msg_str = this._my_extension_handshake_codes[ext_msg_type];
                var their_ext_msg_type = this._remote_extension_handshake['m'][ext_msg_str];

                assert(their_ext_msg_type !== undefined);

                mylog(2, 'handling', ext_msg_str, 'extension message');
                if (ext_msg_str == 'ut_metadata') {
                    var str = utf8.parse(new Uint8Array(data.payload.buffer, data.payload.byteOffset+1));
                    if (str.indexOf('total_size') != -1) {
                        debugger;
                    } else {
                        var info = bdecode(str);
                        var tor_meta_type = constants.tor_meta_codes[ info['msg_type'] ];
                        if (tor_meta_type == 'request') {
                            if (this.container) {
                                // this is javascript creating the torrent from a file selection or drag n' drop.
                                var metapiece = info.piece;
                                mylog(1, 'they are asking for metadata pieces!',metapiece);
                                this.newtorrent.register_meta_piece_requested(metapiece, _.bind(this.serve_metadata_piece, this, metapiece) );
                                // figure out which pieces this corresponds to...
                                // this.bind('close', function() { this.newtorrent.register_disconnect(metapiece) } );
                            } else {
                                debugger;
                            }
                        } else {
                            debugger;
                        }
                    }
                } else {
                    mylog(1, 'unimplemented extension message', ext_msg_str);
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
            this.send_message('UNCHOKE');
        },
        handle_not_interested: function(data) {
            this._remote_interested = false;
        },
        handle_have_all: function(data) {
            mylog(1, 'handle have all');
            this._remote_bitmask = [];
            for (var i=0; i<this.newtorrent.get_num_pieces(); i++) {
                this._remote_bitmask[i] = 1;
            }
            this.trigger('handle_have');
            this.trigger('completed');
        },
        handle_have: function(data) {
            var index = jspack.Unpack('>i', data.payload);
            mylog(3, 'handle have index', index);
            this._remote_bitmask[index] = 1;
            this.trigger('handle_have', index);
            if (this.seeding()) {
                if (this.remote_complete()) {
                    this.trigger('completed');
                }
            }
        },
        seeding: function() {
            return this.bitmask_complete(this._my_bitmask);
        },
        fraction_complete: function() {
            // todo -- optimize
            var bitmask = this._remote_bitmask;
            var s = 0;
            for (var i=0; i<bitmask.length; i++) {
                if (bitmask[i] == 1) {
                    s++;
                }
            }
            return s/bitmask.length;
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
        handle_request: function(data) {
            var index = jspack.Unpack('>I', new Uint8Array(data.payload.buffer, data.payload.byteOffset + 0, 4))[0];
            var offset = jspack.Unpack('>I', new Uint8Array(data.payload.buffer, data.payload.byteOffset + 4, 4))[0];
            var size = jspack.Unpack('>I', new Uint8Array(data.payload.buffer, data.payload.byteOffset + 8, 4))[0];
            mylog(2,'handle piece request for piece',index,'offset',offset,'of size',size);

            var piece = this.newtorrent.get_piece(index);

            // read each of these file payloads and respond...
            // var request_info = {'index':index, 'offset':offset, 'size':size};
            piece.get_data(offset, size, this.on_handle_request_data);
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
            mylog(1, 'handle bitfield message');
            this._remote_bitmask = this.newtorrent.parse_bitmask(data.payload);
            mylog(1,'parsed bitmask',this._remote_bitmask);
            if (! this._sent_bitmask) {
                this.send_bitmask();
                //this.send_message('UNCHOKE');
            }
        },
        send_bitmask: function() {
            this._sent_bitmask = true;
            // payload is simply one bit for each piece
            var bitfield = [];
            var curval = null;
            var total_pieces = this.newtorrent.get_num_pieces();
            var total_chars = Math.ceil(total_pieces/8);
            for (var i=0; i<total_chars; i++) {
                curval = 0;
                for (var j=0; j<8; j++) {
                    var idx = i*8+j;
                    if (idx < total_pieces) {
                        if (this.newtorrent.has_piece(idx)) {
                            curval += Math.pow(2,7-j);
                        }
                    }
                }
                bitfield.push( curval );
            }
            this._my_bitmask = bitfield;
            this.send_message('BITFIELD', bitfield);
        },
        handle_port: function(data) {
            mylog(1, 'handle port message');
        },
        on_connect_timeout: function() {
            if (! this.connected) {
                this.stream.close();
                this.trigger('timeout');
            }
        },
        onopen: function(evt) {
            this._closed = false;
            clearTimeout( this.connect_timeout );
            // Web Socket is connected, send data using send()
            this.connected = true;
            this.connecting = false;
            mylog(1,this, "connected!");
            this.trigger('connected'); // send HAVE, unchoke
            _.delay( this.send_handshake, 100 );
        },
        send_handshake: function() {
            var handshake = create_handshake(this.infohash, my_peer_id);
            console.log('sending handshake of len',handshake.length,[handshake])
            var s = new Uint8Array(handshake);
            this.stream.send( s.buffer );

            // do this at another time?
            this.send_bitmask();
            //this.send_message('UNCHOKE');
        },
        send_keepalive: function() {
            var s = new Uint8Array(4);
            this.stream.send( s );
        },
        send: function(msg) {
            this.stream.send(msg);
        },
        handle_message: function(msg_len) {
            var msg = this.read_buffer_consume(msg_len);
            var data = parse_message(msg);
            mylog(1,'handle message',data.msgtype,data);
            //mylog(2, 'handle message', data.msgtype, data);
            var handler = this.handlers[data.msgtype];
            if (handler) {
                handler(data);
            } else {
                throw Error('unhandled message ' + data.msgtype);
            }
        },
        handle_handshake: function(handshake_len) {
            this.handshaking = false;

            var blob = this.read_buffer_consume(handshake_len);

            var data = parse_handshake(blob);
            console.log('parsed handshake',data)
        },
        read_buffer_consume: function(bytes, peek) {
            var retbuf = new Uint8Array(bytes);
            var consumed = 0;
            var i = 0;
            while (i < this.read_buffer.length) {
                var sz = Math.min( bytes - consumed, this.read_buffer[i].byteLength );
                retbuf.set( new Uint8Array(this.read_buffer[i], 0, sz), consumed );
                consumed += sz;
                if (! peek && sz < this.read_buffer[i].byteLength) {
                    debugger;
                    // tear off anything partially consumed...
                } else {
                }

                i ++;
            }

            if (! peek) {
                for (var j=0;j<i;j++){
                    this.read_buffer.shift(); // tear off everything consumed ....
                    // too aggressive!!!
                }
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
        read_buffer_peek: function(bytes) {
            // todo - fix
            // return new Uint8Array( this.read_buffer[0], bytes );
        },
        onmessage: function(evt) {
            var msg = evt.data;
            this.read_buffer.push(msg);

            var bufsz = this.read_buffer_size();


            if (this.handshaking) {
                var protocol_str_len = new Uint8Array(this.read_buffer_consume(1,true), 0, 1)[0];
                var handshake_len = 1 + protocol_str_len + 8 + 20 +20;
                if (bufsz < handshake_len) {
                    // can't handshake yet... need to read more data
                    mylog(1,'cant handshake yet',bufsz, handshake_len);
                } else {
                    this.handle_handshake(handshake_len);
                }
            } else {
                if (bufsz >= 4) {
                    // enough to read payload size
                    var msg_len = new DataView(this.read_buffer_consume(4,true)).getUint32(0); // equivalent to jspack... use that?
                    if (msg_len == 0) {
                        // keepalive message
                        this.send_keepalive()
                    }
                    //mylog(1,'onmessage, desired message len',msg_len,'cur buf',bufsz);
                    if (bufsz >= msg_len + 4) {
                        this.handle_message(msg_len + 4);
                    }
                } else {
                    mylog(1,'not large enough buffer to read message size');
                }
            }


        },
        onclose: function(evt) {
            // websocket is closed.
            this._closed = true;
            mylog(1,"Connection is closed..."); 
            //_.delay( _.bind(this.reconnect, this), 2000 );
        },
        onerror: function(evt) {
            mylog(1,'Connection error');
        }
    });



    var input = 'hello world!';
    var blocksize = 8;
    var h = naked_sha1_head();
    for (var i = 0; i < input.length; i += blocksize) {
        var len = Math.min(blocksize, input.length - i);
        var block = input.substr(i, len);
        naked_sha1(str2binb(block), len*chrsz, h);
    }
    var result = binb2hex(naked_sha1_tail(h));
    assert(result == '430ce34d020724ed75a196dfc2ad67c77772d169');

})();
