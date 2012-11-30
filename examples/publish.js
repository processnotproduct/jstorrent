(function() {
    window.jspublish = {};


    jspublish.Post = Backbone.Model.extend({
        initialize: function() {
            
        }
    });
    jspublish.Posts = Backbone.Collection.extend({
        initialize: function() {
        },
        model: jspublish.Post
    });

    jspublish.PostView = Backbone.View.extend({
        initialize: function() {
            this.$el.html( $('#js-PostView').html() );
            console.log('init with attrs',JSON.stringify(this.model.attributes));
            this.render();
        },
        render: function() {
            this.$('.js-name').text( this.model.get('name') );
            this.$('.js-magnet').text( this.model.get('hash') );
            this.$('.js-created').text( this.model.get('created') );
            this.$('.js-user').text( this.model.get('user') );
        },
    });
    jspublish.PostsView = Backbone.View.extend({
        initialize: function() {
            this.$el.html( $('#js-PostsView').html() );
            _.bindAll(this, 'on_add');

            this.model.on('add', this.on_add);
        },
        on_add: function(model, collection) {
            var view = new jspublish.PostView( { model: model } );
            view.$el.data( { view: view } );
            this.$('.js-posts-container').append( view.el );
        }

    });


    function PublishAPI() {
        this.url = 'http://192.168.56.1:8040';
    }
    PublishAPI.prototype = {
        publish: function(data) {
            var xhr = new XMLHttpRequest()
            xhr.open("POST", this.url + '/publish?user=kyle2', true)
            xhr.onload = _.bind(this.onsuccess, this);
            xhr.onerror = _.bind(this.onerror, this);
            //xhr.timeout = 1000;
            //xhr.on_timeout = ajax_opts.ontimeout;
            //setTimeout( _.bind(this.check_timeout,this,xhr), 4000 );
            xhr.setRequestHeader('Content-Type', 'application/json')
            var data = JSON.stringify(data)
            xhr.send(data);
        },
        onsuccess: function(data) {
            console.log(data.target.response);
        },
        onerror: function() {
            debugger;
        }
    }

    function ViewAPI() {
        this.url = 'http://192.168.56.1:8040';
    }
    ViewAPI.prototype = {
        view: function() {
            var xhr = new XMLHttpRequest()
            xhr.open("GET", this.url + '/view/posts?user=kyle2', true)
            xhr.onload = _.bind(this.onsuccess, this);
            xhr.onerror = _.bind(this.onerror, this);
            //xhr.overrideMimeType("application/json");  
            //xhr.timeout = 1000;
            //xhr.on_timeout = ajax_opts.ontimeout;
            //setTimeout( _.bind(this.check_timeout,this,xhr), 4000 );
            //xhr.setRequestHeader('Content-Type', 'application/json')
            //var data = JSON.stringify(data)
            xhr.send();
        },
        onsuccess: function(p) {
            var data = JSON.parse(p.target.response)
            for (var i=0; i<data.items.length; i++) {
                var post = new jspublish.Post( data.items[i] );
                posts.add( post );
            }

        },
        onerror: function() {
            debugger;
        }
        
    }


    function JSPublishWidget(opts) {
        this.opts = opts
        this.elid = this.opts.elid;
        this.el = $('#' + this.opts.elid);
        var iframe = document.createElement('iframe')
        iframe.src = 'publish_window.html';
        iframe.setAttribute('width',200);
        iframe.setAttribute('height',200);
        iframe.setAttribute('style','border: 1px solid red');
        this.el[0].appendChild( iframe );
        this.iframe = iframe;

        window.addEventListener('message', _.bind(function(msg) {
            this.handle_message(msg);
            //debugger;
        },this));
    }
    
    JSPublishWidget.prototype = {
        handle_message: function(msg) {
            if (msg.data.event == 'drop') {
                this.send_message({command:'create', id: msg.data.id});
            } else if (msg.data.event == 'hashed') {
                //btapp.attributes.torrent
                var url = 'magnet:?xt=urn:btih:' + msg.data.hash
                var def = btapp.attributes.add.torrent( url );
                publishapi.publish( { date: new Date().getTime(),
                                      channel: 'public',
                                      hash: msg.data.hash } );
                def.then( _.bind(function() {
                    // this.send_message({command:'connect', host: '127.0.0.1', port: btapp.bind_port});
                    debugger;
                    this.send_message({command:'connect', host: '192.168.56.1', port: btapp.bind_port});
                },this));

            } else {
                debugger;
            }
        },
        send_message: function(msg) {
            this.iframe.contentWindow.postMessage(msg,'*');
        }
    }

    window.JSPublishWidget = JSPublishWidget;

    $(document).ready( function() {
        window.widget = new JSPublishWidget( {elid:'jspublish'} )

        window.publishapi = new PublishAPI();
/*
        publishapi.publish( { date: new Date().getTime(),
                              channel: 'public',
                              hash: 'foobar' } );
*/

        var viewapi = new ViewAPI();

        viewapi.view()

        window.posts = new jspublish.Posts();
        window.postsview = new jspublish.PostsView( { el: $('#js-PostsCollection'), model: window.posts } )

        if (window.Btapp) {
            window.btapp = new Btapp();
            btapp.connect();
            btapp.live('settings bind_port', function(port) {
                btapp.bind_port = port;
                console.log('btapp on port',port);
            });
        }



    })

})();
