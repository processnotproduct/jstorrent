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
    get_data: function(piecerange, callback) {
        this._reading = true;
        this.dndfile = this.torrent.entry.get_by_path(this.info.path);
        this.filereader = new FileReader();
        this.read_callback = callback;
        this.filereader.onload = _.bind(this.got_data, this);
        // start reading
        this.hasher = new Digest.SHA1();
        this._data = [];
        this.offset = 0; // need to go to a piece offset !!!! tricky....
        this.readSize = 1024 * 16; // 16 kb chunks
        var blob = this.dndfile.file.slice(this.offset,this.offset + this.readSize);
        this.filereader.readAsArrayBuffer(blob);
    },
    got_data: function(evt) {
        var binary = evt.target.result;
        if (binary.byteLength == 0) {
            this.read_callback(this);
            this._reading = false;
            this.read_callback = null;
        } else {
            this.hasher.update(binary);
            this._data.push(binary);
            mylog(1,'read some more data',this.get_name(),binary.byteLength);
            this.offset += this.readSize;
            var blob = this.dndfile.file.slice(this.offset,this.offset + this.readSize);
            this.filereader.readAsArrayBuffer(blob);
        }
        //var new Uint8Array(binary);
        // read some more...

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
