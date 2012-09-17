(function(){
    jstorrent.Swarm = jstorrent.Collection.extend({
        model: jstorrent.Peer,
        set_torrent: function(torrent) {
            this.torrent = torrent;
        },
        healthy: function() {
            return this.models.length > this.torrent.get('maxconns');
        }
    });
})();
