(function(){
    jstorrent.Swarm = Backbone.Collection.extend({
        model: jstorrent.Peer,
        set_torrent: function(torrent) {
            this.torrent = torrent;
        }
    });
})();
