(function(){
    jstorrent.TCPSocketServer = Backbone.Model.extend({
        initialize: function() {
            this.sockno = null;
            this.callbacks = {};
            this.interfaces = null;
            this.remote_port = null;
            this.listen_results = {};
            this.try_port = 14097;
            _.bindAll(this,'establish','oncreate','check_listen','onlist','all_listening');
        },
        establish: function() {
            // binds listening socket
            chrome.socket.getNetworkList( this.onlist );
        },
        onlist: function(list) {
            this.interfaces = list;
            console.log('got network list',list);
            chrome.socket.create('tcp', null, this.oncreate);
        },
        oncreate: function(info) {
            this.sockno = info.socketId;
            chrome.socket.listen(this.sockno, this.interfaces[1].address, this.try_port, 64, this.all_listening)
/*
            for (var i=0; i<this.interfaces.length; i++) {
                chrome.socket.listen(this.sockno, this.interfaces[i].address, 14099, 64, _.bind(this.check_listen, this, i))
            }
*/
        },
        check_listen: function(i, result) {
            this.listen_results[i] = result;
            console.log('listen result',result);
            this.set('remote_port', this.try_port);

            if (_.keys(this.listen_results).length == this.interfaces.length) {
                this.all_listening();
            }
        },
        all_listening: function() {
            this.set('remote_port', this.try_port);
            console.log('all listening!')
            this.trigger('established');
        },
        current: function() {
            return this;
        },
    });
})();
