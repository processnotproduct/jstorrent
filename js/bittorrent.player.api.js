(function(){
    window.PlayerAPI = function(opts) {
        this.elt = opts.elt;
        this.id = Math.floor(Math.random() * Math.pow(2,16));
        this.events = {};

        var _this = this;

        this.onmessage = function(evt) {
            if (evt.data.state && _this.events[evt.data.state]) {
                _this.events[evt.data.state](evt.data);
            }
            console.log('GOT MSG',JSON.stringify(evt.data));
        };                
        this.send = function(msg) {
            _this.elt.contentWindow.postMessage(msg, "*");
        };
        this.send_init = function() {
            _this.send({newplayer: _this.id});
        };
        this.on = function(k,fn) {
            _this.events[k] = fn;
        }


        window.addEventListener('message', this.onmessage);
        this.send_init();
    }
})();
