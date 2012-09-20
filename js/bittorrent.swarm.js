(function(){
    jstorrent.Swarm = jstorrent.Collection.extend({
        model: jstorrent.Peer,
        set_torrent: function(torrent) {
            this.torrent = torrent;
        },
        healthy: function() {
            var num_unresponsive = 0;
            for (var i=0; i<this.models.length; i++) {
                if (this.models[i].get('unresponsive')) {
                    num_unresponsive++;
                }
            }
            return (this.models.length-num_unresponsive) > this.torrent.get('maxconns');
        }
    });
})();
