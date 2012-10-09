(function() {
    jstorrent.StreamParser = function() {
    }
    jstorrent.StreamParser.prototype = {
        init: function() {
            this.worker = new Worker('../js/bittorrent.parser.worker.js');
            this.worker.addEventListener('message', _.bind(this.onmessage,this));
            this.worker.addEventListener('error', _.bind(this.onerror,this));
            this.msgid = 0;
            this.callbacks = {};
        },
        parse: function(file, storage_area, file_path, file_ranges, callback) {
            if (! this.worker) {
                this.init();
            }
            var msgid = this.msgid;
            var msg = { command: 'parse',
                        id: msgid,
                        storage_area: storage_area,
                        file_ranges: file_ranges,
                        file_size: file.get_size(),
                        file_path: file_path }
            this.worker.postMessage(msg);
            this.callbacks[this.msgid] = callback;
            this.msgid++;
        },
        onmessage: function(msg) {
            var data = msg.data;
            mylog(LOGMASK.ui,'stream parser got back msg',data);
            assert(data.id !== undefined);
            if (this.callbacks[data.id]) {
                var callback = this.callbacks[data.id]
                delete this.callbacks[data.id];
                callback(data.result);
            }
        },
        onerror: function(msg) {
            mylog(LOGMASK.error,'worker error', msg);
        }
    };
})();
