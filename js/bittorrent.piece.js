function Piece(torrent, num) {
    assert(typeof num == 'number');
    this.torrent = torrent;
    this.num = num;
    this.sz = this.torrent.get_piece_len(this.num)
    this.start_byte = this.torrent.get_piece_len() * this.num
    this.end_byte = this.start_byte + this.sz - 1
    assert(this.start_byte >= 0)
    assert(this.end_byte >= 0)
}

Piece.prototype = {
    get_data: function(callback) {
        debugger;
    },
    get_data_from_file: function(fileno) {
        // returns the data in this piece that intersects a specific file
    },
    get_data: function() {
        // reads through all the files in this piece and hashes it

        // can get data from FileReader is faster than we can hash it...

        // request large blocks from FileReader, (prepare up to say 8 pieces at once)
        // hash them independently inside webworker threads.
    },
};
