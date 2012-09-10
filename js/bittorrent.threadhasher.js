(function() {
    jstorrent.ThreadHasher = function() {
        //this.worker = new Worker('../js/bittorrent.hasher.worker.js');
        this.workers = [];
        this.numthreads = 4;
        for (var i=0; i<this.numthreads; i++) {
            var worker = new Worker('../js/bittorrent.hasher.worker.js');
            this.workers.push( worker );
            worker.addEventListener('message', _.bind(this.onmessage,this,worker));
            worker.addEventListener('error', _.bind(this.onerror,this,worker));
        }
        this.requests = {};
        this.msgid = 0;
    }
    jstorrent.ThreadHasher.prototype = {
        get_worker: function() {
            for (var i=0; i<this.numthreads; i++) {
                if (! this.workers[i].processing) {
                    return this.workers[i];
                }
            }
            var i = Math.floor(Math.random() * this.numthreads);
            return this.workers[i];
        },
        send: function(data, callback) {
            worker = this.get_worker();
            worker.processing = true;
            this.requests[this.msgid] = callback
            data.id = this.msgid;
            worker.postMessage(data);
            this.msgid++;
        },
        onmessage: function(worker, msg) {
            worker.processing = false;
            mylog(LOGMASK.hash,'got worker message',msg);
            var callback = this.requests[msg.data.id];
            callback(msg.data);
        },
        onerror: function(worker, data) {
            mylog(LOGMASK.error,'worker error');
            debugger;
        }
    };

})();
