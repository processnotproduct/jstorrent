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
        initialize: function(host, port, infohash, entry) {
            _.bindAll(this, 'onopen', 'onclose', 'onmessage', 'onerror', 'on_connect_timeout',
                      'handle_extension_message',
                      'send_extension_handshake',
                      'handle_bitfield',
                      'send_bitmask',
                      'handle_request',
                      'on_handle_request_data'
                     );

            this.stream = new WebSocket('ws://'+host+':'+port+'/api/upload/ws');
            this.stream.binaryType = "arraybuffer"; // blobs dont have a synchronous API?
            this.infohash = infohash;
            assert(this.infohash.length == 20, 'input infohash as array of bytes');
            this.entry = entry; // upload.btapp.js gives us this...
            this.newtorrent = new NewTorrent({entry:entry, althash:infohash});
            this.newtorrent_metadata_size = bencode(this.newtorrent.fake_info).length
            console.log('initialize peer connection with infohash',this.infohash);
            this.connect_timeout = setTimeout( this.on_connect_timeout, 1000 );
            this.connected = false;
            this.connecting = true;
            this.handshaking = true;

            this._remote_extension_handshake = null;
            this._my_extension_handshake = null;
            this._sent_extension_handshake = false;

            this._remote_choked = true;
            this._remote_interested = false;

            this._sent_bitmask = false;

            this.handlers = {
                'UTORRENT_MSG': this.handle_extension_message,
                'PORT': this.handle_port,
                'HAVE': this.handle_have,
                'BITFIELD': this.handle_bitfield,
                'REQUEST': this.handle_request
            };
            this.stream.onopen = this.onopen
            this.stream.onclose = this.onclose
            this.stream.onmessage = this.onmessage
            this.stream.onclose = this.onclose
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
            var tor_meta_codes = { 'request': 0,
                                   'data': 1,
                                   'reject': 2 };

            var piecedata = this.newtorrent.get_metadata_piece(metapiece, request);

            var total_size = bencode(this.newtorrent.fake_info).length
            
            var meta = { 'total_size': total_size,
                         'piece': metapiece,
                         'msg_type': tor_meta_codes.data};
            mylog(1,'responding to metadata request with meta',meta,piecedata.length);
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
            mylog(1, 'ext msg type', ext_msg_type );
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
                    mylog(1, 'they are asking for metadata pieces!')
                    var str = utf8.parse(new Uint8Array(data.payload.buffer, data.payload.byteOffset+1));
                    if (str.indexOf('total_size') != -1) {
                        debugger;
                    } else {
                        var info = bdecode(str);
                        var tor_meta_type = constants.tor_meta_codes[ info['msg_type'] ];
                        if (tor_meta_type == 'request') {
                            if (this.entry) {
                                // this is javascript creating the torrent from a file selection or drag n' drop.
                                var metapiece = info.piece;
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
        handle_have: function(data) {
            var index = jspack.Unpack('>i', data.payload);
            mylog(1, 'handle have index', index);
        },
        handle_request: function(data) {
            var index = jspack.Unpack('>I', new Uint8Array(data.payload.buffer, data.payload.byteOffset + 0, 4))[0];
            var offset = jspack.Unpack('>I', new Uint8Array(data.payload.buffer, data.payload.byteOffset + 4, 4))[0];
            var size = jspack.Unpack('>I', new Uint8Array(data.payload.buffer, data.payload.byteOffset + 8, 4))[0];
            mylog(1,'handle piece request for piece',index,'offset',offset,'of size',size);

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
            this._remote_bitmask = data.payload;
            if (! this._sent_bitmask) {
                this.send_bitmask();
                this.send_message('UNCHOKE');
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
            clearTimeout( this.connect_timeout );
            // Web Socket is connected, send data using send()
            this.connected = true;
            this.connecting = false;
            console.log(this, "connected!");
            this.trigger('connected'); // send HAVE, unchoke
            this.send_handshake();
        },
        send_handshake: function() {
            var handshake = create_handshake(this.infohash, my_peer_id);
            console.log('sending handshake of len',handshake.length,[handshake])
            var s = new Uint8Array(handshake);
            this.stream.send( s.buffer );
        },
        send: function(msg) {
            this.stream.send(msg);
        },
        handle_message: function(msg) {
            var data = parse_message(msg);
            mylog(2, 'handle message', data.msgtype, data);
            var handler = this.handlers[data.msgtype];
            if (handler) {
                handler(data);
            } else {
                throw Error('unhandled message ' + data.msgtype);
            }
        },
        handle_handshake: function(msg) {
            this.handshaking = false;
            var blob = msg;
            var data = parse_handshake(msg);
            console.log('parsed handshake',data)
        },
        onmessage: function(evt) {
            var msg = evt.data;            

            if (this.handshaking) {
                this.handle_handshake(msg);
            } else {
                this.handle_message(msg);
            }

        },
        onclose: function(evt) {
            // websocket is closed.
            console.log("Connection is closed..."); 
        },
        onerror: function(evt) {
            console.error('Connection error');
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
