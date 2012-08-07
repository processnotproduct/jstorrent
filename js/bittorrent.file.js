function File(torrent, num) {
    this.torrent = torrent;
    this.num = num;
    this.size = this.get_size();
    this.start_byte = this.torrent._file_byte_accum[this.num];
    this.end_byte = this.start_byte + this.size - 1;
    this._data = null;
    this._reading = false;
    this.info = this.get_info();
    this.read_callback = null;
}

File.prototype = {
    get_data_from_piece: function(piecenum) {
        // returns the file data that intersects a specific piece
    },
    get_data: function(callback, byte_range) {
        assert(!this._reading);
        this._reading = true;
        this.dndfile = this.torrent.entry.get_by_path(this.info.path);
        this.filereader = new FileReader();
        this.read_callback = callback;
        this.filereader.onload = _.bind(this.got_data, this);
        // start reading
        this.hasher = new Digest.SHA1();
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
    read_some: function() {
        if (this.read_byte_range) {
            var readmax = Math.min(this.read_byte_range[1], this.offset + this.readBufferSize);
        } else {
            var readmax = this.offset + this.readBufferSize; // bother explicitly limiting to file boundary?
        }
        var blob = this.dndfile.file.slice(this.offset,readmax);
        this.filereader.readAsArrayBuffer(blob);
    },
    got_data: function(evt) {
        var binary = evt.target.result;
        if (binary.byteLength == 0) {
            assert(false, 'should not have tried to read, bytesRemaining computation bad');
            this.got_all_data();
        } else {
            this.bytesRemaining -= binary.byteLength;
            this.hasher.update(binary);
            this._data.push(binary);
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
