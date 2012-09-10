(function() {

    jstorrent.ThreadHasher = function() {
        this.worker = new Worker('../js/bittorrent.hasher.worker.js');
        this.requests = {};
        this.msgid = 0;
        this.worker.addEventListener('message', _.bind(this.onmessage,this));
        this.worker.addEventListener('error', _.bind(this.onerror,this));
    }

    jstorrent.ThreadHasher.prototype = {
        send: function(data, callback) {
            this.requests[this.msgid] = callback
            data.id = this.msgid;
            this.worker.postMessage(data);
            this.msgid++;
        },
        onmessage: function(msg) {
            mylog(LOGMASK.hash,'got worker message',msg);
            var callback = this.requests[msg.data.id];
            callback(msg.data);
        },
        onerror: function(data) {
            mylog(LOGMASK.error,'worker error');
            debugger;
        }
    };

})();
