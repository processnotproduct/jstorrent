(function() {
    jstorrent.UDPProxy = Backbone.Model.extend({
        initialize: function(opts) {
            _.bindAll(this, 
                      'onopen', 
                      'onclose', 
                      'onmessage', 
                      'onerror', 
                      'on_connect_timeout');
            this.client = opts && opts.client;
            this.strurl = 'ws://' + config.udp_proxy + '/wsudpproxy';
            this.set('state','connecting');
            this.stream = new WebSocket(this.strurl);
            this.stream.binaryType = "arraybuffer";
            this.stream.onerror = this.onerror;
            this.stream.onopen = this.onopen;
            this.stream.onclose = this.onclose;
            this.stream.onmessage = this.onmessage;
            this.connect_timeout = setTimeout( this.on_connect_timeout, 2000 );
            this._read_callbacks = {} // per-torrent, per-address read callbacks
            this._send_queue = [];

            this._await_req_ctr = 0;
            this._await_reqs = {};

        },
        send: function(msg) {
            var payload = { method: 'send', args: [msg] };
            var encoded = new Uint8Array(bencode(payload)).buffer;
            this.do_send(encoded);
        },
        sendto: function(msg, addr) {
            //var deferred = new Deferred;
            var payload = { method: 'sendto', args: [msg, addr] };
            var encoded = new Uint8Array(bencode(payload)).buffer;
            this.do_send(encoded);
            //await this.stream.recvfrom(addr)
        },
        socksendrecv: function(socknum, msg, res) {
            // send payload to socknum
            var deferred = new jQuery.Deferred;
            var payload = { sock: socknum, method: 'send', args: [msg] };
            var encoded = new Uint8Array(bencode(payload)).buffer;
            this.do_send(encoded);

            var payload = { id: this._await_req_ctr, sock: socknum, method: 'recv', args: [] };
            var encoded = new Uint8Array(bencode(payload)).buffer;
            this.do_send(encoded);

            this._await_reqs[this._await_req_ctr] = { deferred: deferred, res: res };
            this._await_req_ctr++;
            return deferred;
        },
        newsock_connect: function(addr, res) {
            var deferred = new jQuery.Deferred();
            var payload = { id: this._await_req_ctr, method: 'newsock', args: [addr] };
            var encoded = new Uint8Array(bencode(payload)).buffer;
            this.do_send(encoded);
            this._await_reqs[this._await_req_ctr] = { deferred: deferred, res: res };
            this._await_req_ctr++;
            return deferred;
        },
        recvfrom: function(addr) {
            var payload = { method: 'recvfrom', args: [addr] };
            var encoded = new Uint8Array(bencode(payload)).buffer;
            this.do_send(encoded);
        },
        sock_close: function(socknum) {
            var payload = { method: 'sock_close', args: [socknum] };
            var encoded = new Uint8Array(bencode(payload)).buffer;
            this.do_send(encoded);
        },
        do_send: function(payload) {
            if (this.get('state') != 'connected') {
                this._send_queue.push(payload);
                mylog(LOGMASK.error,'udp cannot send, not connected');
                return;
            }
            //mylog(LOGMASK.udp,'sending payload to websocket',payload);
            this.stream.send(payload)
        },
        recv: function(sock) {
            //var deferred = new Deferred;
        },
        repr: function() {
            return "<UDPProxy>";
        },
        onopen: function(evt) {
            this.set('state','connected');
            if (this.connect_timeout) clearTimeout(this.connect_timeout);
            mylog(LOGMASK.udp,this.repr(),'udp proxy available');
            while (this._send_queue.length > 0) {
                var payload = this._send_queue.shift();
                this.do_send(payload);
            }
        },
        onclose: function(evt) {
            if (this.connect_timeout) clearTimeout(this.connect_timeout);
            mylog(LOGMASK.udp,this.repr(),'udp proxy closed');
        },
        onmessage: function(evt) {
            // received message, trigger deferreds if they are available
            var message = bdecode(arr2str(new Uint8Array(evt.data)));
            mylog(LOGMASK.udp,'got udpsock msg',evt, message);
            if (message.id !== undefined) {
                var data = this._await_reqs[message.id];
                //mylog(LOGMASK.udp,'found await req', data)
                data.res['message'] = message
                //assert (data.deferred.listeners_.length > 0)
                data.deferred.resolve(true);
                delete this._await_reqs[message.id];
            }
        },
        onerror: function(evt) {
            if (this.connect_timeout) clearTimeout(this.connect_timeout);
            mylog(LOGMASK.udp,this.repr(),'udp proxy error');
        },
        on_connect_timeout: function() {
            delete this.connect_timeout;
            this.close('timeout');
        },
        close: function(reason) {
            mylog(LOGMASK.udp,this.repr(),'udp proxy close, reason:',reason);
            this.stream.close();
        }
    });
})();
