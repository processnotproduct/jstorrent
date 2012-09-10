(function(){
    jstorrent.Swarm = Backbone.Collection.extend({
        initialize: function(opts) {
            this.torrent = opts.torrent;
        },
        model: jstorrent.Peer
    });
})();
