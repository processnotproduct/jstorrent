function File(torrent, num) {
    this.torrent = torrent;
    this.num = num;
    this.size = this.get_size();
    this.start_byte = this.torrent._file_byte_accum[this.num];
    this.end_byte = this.start_byte + this.size - 1;
    this._data = null;
    this._reading = false;
    this.info = this.get_info();
    this._cache = {};

    this._read_queue = [];
    this._processing_read_queue = false;

    this.read_callback = null;
}

File.prototype = {
    get_data_from_piece: function(piecenum) {
        // returns the file data that intersects a specific piece
    },
    get_data: function(callback, byte_range) {
        // check if it's in the cache...
        this._read_queue.push({'callback':callback,'byte_range':byte_range});
        this.process_read_data_queue();
    },
    process_read_data_queue: function() {
        if (this._processing_read_queue) {
            return;
        } else {
            if (this._read_queue.length > 0) {
                this._processing_read_queue = true;
                var item = this._read_queue.shift();
                var dndfile = this.torrent.get_by_path(this.info.path);
                assert(dndfile);
                var filereader = new FileReader(); // todo - re-use and seek!
                filereader.onload = _.bind(this.got_queue_data, this, item);
                var byte_range = item.byte_range;
                var offset = byte_range[0] - this.start_byte;
                var bytesRemaining = byte_range[1] - byte_range[0];
                assert(bytesRemaining > 0);
                var blob = dndfile.file.slice(offset, offset + bytesRemaining);
                //item.slice = [offset, bytesRemaining];
                //mylog(1,'reading blob',offset,bytesRemaining);
                filereader.readAsArrayBuffer(blob);
            }
        }
    },
    got_queue_data: function(item, evt) {
        this._processing_read_queue = false;
        var binary = evt.target.result;
        assert(binary.byteLength == (item.byte_range[1] - item.byte_range[0]));
        var callback = item.callback;
        callback(binary);
        this.process_read_data_queue();
    },
/*
    read_data_old: function(callback, byte_range) {
        // enqueue if already reading...
        assert(!this._reading);
        this._reading = true;
        this.dndfile = this.torrent.get_by_path(this.info.path);
        this.filereader = new FileReader();
        this.read_callback = callback;
        this.filereader.onload = _.bind(this.got_data, this, byte_range);
        // start reading
        //this.hasher = new Digest.SHA1();
        this._data = [];
        this.readBufferSize = Math.pow(2,14);

        if (byte_range) {
            //mylog(1, 'read data w byte range',byte_range);
            this.read_byte_range = byte_range
            // relative to torrent bytes
            this.offset = byte_range[0] - this.start_byte;
            this.bytesRemaining = byte_range[1] - byte_range[0];
        } else {
            this.offset = 0; // need to go to a piece offset !!!! tricky....
            this.bytesRemaining = this.size;
        }
        this.read_some();
    },
*/
    read_some: function() {
        if (this.read_byte_range) {
            var readmax = Math.min(this.read_byte_range[1], this.offset + this.readBufferSize);
        } else {
            var readmax = this.offset + this.readBufferSize; // bother explicitly limiting to file boundary?
        }
        var blob = this.dndfile.file.slice(this.offset,readmax);
        this.filereader.readAsArrayBuffer(blob);
    },
    got_data: function(range, evt) {
        var binary = evt.target.result;
        if (binary.byteLength == 0) {
            assert(false, 'should not have tried to read, bytesRemaining computation bad');
            this.got_all_data();
        } else {
            this.bytesRemaining -= binary.byteLength;
            //this.hasher.update(binary);
            this._data.push(binary);
            this._cache[JSON.stringify(range)] = binary;
            //mylog(1,'read some more data',this.get_name(),binary.byteLength);
            this.offset += this.readBufferSize;
            if (this.bytesRemaining > 0) {
                this.read_some();
            } else {
                this.got_all_data();
            }
        }
    },
    got_all_data: function() {
        this._reading = false;
        var callback = this.read_callback;
        this.read_callback = null;
        callback(this);
    },
    get_name: function() {
        return this.info.path[this.info.path.length-1];
    },
    get_size: function() {
        return this.torrent.fake_info['files'][this.num]['length'];
    },
    get_info: function() {
        return this.torrent.fake_info.files[this.num];
    },
};
