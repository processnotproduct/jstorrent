if (false && window.indexedDB) {
    jstorrent.storage = {
        id: "jstorrent",
        description: "The database for client sessions",
        version: 1,
        versions: {"1":{
            migrate: function(trans, callback) {
                var db = trans.db;
                var store = db.createObjectStore("torrent", {keyPath: 'infohash'});
                store.createIndex('hashIndex','infohash', { unique:true});
                var store = db.createObjectStore("client"); 
                var store = db.createObjectStore("setting"); 
                if (callback) { callback() };
            }
        }
                  }
    };

    jstorrent.Database = Backbone.Model.extend({
        initialize: function(opts) {
            this.schema = opts.schema;
            this.indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.msIndexedDB;
            this.IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction; // No prefix in moz
            this.IDBKeyRange = window.IDBKeyRange || window.webkitIDBKeyRange ; // No prefix in moz
            this.IDBCursor = window.IDBCursor || window.webkitIDBCursor ||  window.mozIDBCursor ||  window.msIDBCursor ;
            this.db = null;

            _.bindAll(this, 
                      'onsuccess',
                      'onerror',
                      'onupgradeneeded'
                     );
        },
        open_new: function() {
            var dbreq = this.indexedDB.deleteDatabase(this.schema.id);
            dbreq.onabort = function(evt){debugger;}
            dbreq.onopen = function(evt){debugger;}
            dbreq.onerror = function(evt){debugger;}
            dbreq.onsuccess = _.bind(function(evt){
                this.open();
            },this);
            dbreq.onblocked = function(evt){debugger;}
            dbreq.onupgradeneeded = function(evt){debugger;}
        },
        open: function() {
            var dbreq = this.indexedDB.open(this.schema.id,this.schema.version); //schema version need to be an unsigned long
            dbreq.onabort = function(evt){debugger;}
            dbreq.onopen = function(evt){debugger;}
            dbreq.onerror = this.onerror;
            dbreq.onsuccess = this.onsuccess
            dbreq.onblocked = function(evt){debugger;}
            dbreq.onupgradeneeded = this.onupgradeneeded;
        },
        onupgradeneeded: function(evt) {
            var steps = [];
            for (var ver=evt.oldVersion; ver<=evt.newVersion; ver++) {
                if (this.schema.versions[ver]) {

                    steps.push( { fn: this.schema.versions[ver].migrate,
                                  arguments: [evt.target.transaction],
                                  callbacks: [1]
                                }
                              );
                }
            }

            var multi = new Multi( steps );
            multi.sequential( function(results) {
                console.log('database upgrade steps complete',results);
            });
            

        },
        onerror: function(evt) {

            console.error('error opening db:',[evt.target.webkitErrorMessage]);
            var result = confirm('Unrecoverable error opening the database. Clear it?')
            if (result) {
                this.open_new();
            }
            // clear out the database?
        },
        onsuccess: function(evt) {
            this.db = evt.target.result;
            this.db.transactions = 0;
            this.db.transactions_complete = 0;
            console.log('db open',this.db);
            this.trigger('ready');
        },
        clean: function(storename, check, cb) {
            console.warn("CLEAN",storename)
            var thiz = this;
            var todelete = [];
            var trans = jstorrent.database.db.transaction([storename],'readonly');
            this.db.transactions++;
            trans.oncomplete = _.bind(function(evt) {
                this.db.transactions_complete++;
                console.log('cursor trans complete');
            },this)
            var store = trans.objectStore(storename);
            var req;
            var cursor;
            var coll;
            cursor = store.openCursor();
            cursor.onsuccess = function(evt) {
                if (evt.target.result) {
                    var key = evt.target.result.primaryKey
                    if (check(key)) {
                        todelete.push(key);
                    }
                    var val = evt.target.result.value;
                    evt.target.result.continue();
                } else {
                    thiz.doclean(storename, todelete);
                }

            }
            cursor.onerror = function(evt) {
                console.log('cursor error',evt.target.webkitErrorMessage);
                debugger;
            }
        },
        doclean: function(storename, todelete) {
            console.log('cleaning',todelete.length);
            var thiz = this;
            var trans = jstorrent.database.db.transaction([storename],'readwrite');
            this.db.transactions++;
            trans.oncomplete = _.bind(function(evt) {
                this.db.transactions_complete++;
                console.log('cursor trans complete');
            },this)
            var store = trans.objectStore(storename);
            var req;

            var next = function() {
                if (todelete.length > 0) {
                    var key = todelete.pop()
                    req = store.delete( key )
                    req.onsuccess = function(evt) {
                        next();
                    }
                    req.onerror = function(evt) {
                        console.log('delete error',evt.target.webkitErrorMessage);
                        debugger;
                    }
                } else {

                }
            }
            next();
        }
    });

    jstorrent.database = new jstorrent.Database({schema:jstorrent.storage});

    Backbone.sync = function(method, model, opts) {
        console.log('call bb sync',method,model,opts);

        if (method == 'read') {
            var db = jstorrent.database.db;
            var trans = db.transaction([model.storeName],'readonly');
            db.transactions++;
            trans.oncomplete = _.bind(function(evt) {
                db.transactions_complete++;
                console.log('cursor trans complete',evt);
            },this)
            trans.onabort = function(evt) {
                console.log('cursor trans abort',evt);
            }
            trans.onerror = function(evt) {
                console.log('cursor trans error',evt);
            }
            var store = trans.objectStore(model.storeName);
            var req;
            var cursor;
            var coll;
            var arr = [];

            if (model instanceof jstorrent.Collection) {
                console.log('read collection');
                coll = model;
                cursor = store.openCursor();

                cursor.onsuccess = function(evt) {
                    if (evt.target.result) {
                        var cursor = evt.target.result;
                        console.log('add',cursor.value);
                        //coll.add( val );
                        arr.push(cursor.value);
                        cursor.continue();
                    } else {
                        console.log('cursor done');
                        //debugger;
                        //_.defer( function() { opts.success(arr); } )
                        opts.success(arr);
                    }
                }
                cursor.onerror = function(evt) {
                    console.log('cursor error',[evt.target.webkitErrorMessage]);
                    debugger;
                    //opts.error(arr);
                    opts.success(arr);

                }

            } else {
                return opts.success({});
                if (store.keyPath) {
                    debugger;
                }
                console.log('read id', model.get('id'));
                var req = store.get( model.get('id') );
                req.onsuccess = function(evt) {
                    console.log('got result',evt.target.result);
                    opts.success(evt.target.result);
                }
                req.onerror = function(evt) {
                    debugger;
                }
            }
            
        } else if (method == 'update' || method == 'create') {
            var trans = jstorrent.database.db.transaction([model.storeName],'readwrite');
            jstorrent.database.db.transactions++;
            trans.oncomplete = _.bind(function(evt) {
                jstorrent.database.db.transactions_complete++;
                console.log(method,'trans complete');
            },this)
            var store = trans.objectStore(model.storeName);
            var req;
            var cursor;
            var coll;

            if (store.keyPath) {

                if (method == 'update') {
                    console.log('store keypath', method, model.storeName, store.keyPath );
                    req = store.put( model.toJSON() );
                } else if (method == 'create') {
                    console.log('store keypath', method, model.storeName, store.keyPath );
                    req = store.add( model.toJSON() );
                } else {
                    debugger;
                }

            } else {

                if (method == 'update') {
                    console.log('store', method, model.storeName, model.id)
                    req = store.put( model.toJSON(), model.id );
                } else if (method == 'create') {
                    console.log('store', method, model.storeName, model.newid)
                    req = store.add( model.toJSON(), model.newid );
                } else {
                    debugger;
                }
            }

            req.onsuccess = function(evt) {
                if (method == 'create') {
                    if (store.keyPath) {
                        model.id = model.get(store.keyPath);
                    } else {
                        model.id = model.newid;
                    }
                    opts.success();
                } else {
                    opts.success();
                }
            }
            req.onerror = function(evt) {
                debugger;
            }
        } else if (method == 'delete') {
            var trans = jstorrent.database.db.transaction([model.storeName],'readwrite');
            jstorrent.database.db.transactions++;
            trans.oncomplete = _.bind(function(evt) {
                jstorrent.database.db.transactions_complete++;
                console.log(method,'trans complete');
            },this)
            var store = trans.objectStore(model.storeName);
            var req;
            if (store.keyPath) {
                req = store.delete( model.get(store.keyPath) );
            } else {
                req = store.delete( model.id );
            }
            req.onsuccess = function(evt) {
                debugger;
                opts.success();
            }
            req.onerror = function(evt) {
                debugger;
            }

        } else {
            debugger;
        }
    }
} else {


    window.asyncLocalStorage = {
        getItem: function(k, callback) {
            //console.log('getitem',k);
            if (config.packaged_app) {
                chrome.storage.local.get(k, function(res) {
                    callback(res[k]);
                });
            } else {
                callback( localStorage.getItem(k) );
            }
        },
        setItem: function(k, v, callback) {
            //console.log('setitem',k,v);
            if (config.packaged_app) {
                var obj = {};
                obj[k] = v;
                chrome.storage.local.set(obj,callback);
            } else {
                callback( localStorage.setItem(k, v) );
            }
        },
        removeItem: function(k, callback) {
            //console.log('removeitem',k);
            if (config.packaged_app) {
                chrome.storage.local.remove(k, callback);
            } else {
                callback( localStorage.removeItem(k) );
            }
        }
    }

    /*

      the indexeddb database backend is too buggy to work
      reliably. perhaps in the future it will behave better. This is a
      localStorage backed database.

     */

    jstorrent.Database = Backbone.Model.extend({
        initialize: function(opts) {
        },
        open: function() {
            this.trigger('ready');
        }
    });

    jstorrent.database = new jstorrent.Database();

    Backbone.sync = function(method, model, opts) {
        //mylog(1,'call sync',model.storeName,method,model,opts);

        if (model instanceof jstorrent.Collection) {

            if (method == 'read') {
                asyncLocalStorage.getItem( model.storeName, function(items) {
                    if (items) {
                        items = JSON.parse( items );
                        // for each, read

                        var fns = [];
                        for (var i=0; i<items.length; i++) {
                            var h = items[i];
                            fns.push( { fn: asyncLocalStorage.getItem, arguments: [model.storeName + '-' + h], callbacks: [1] } );
                        }

                        new Multi(fns).sequential( function(respitemsraw) {
                            var respitems = [];
                            for (var i=0; i<respitemsraw.called.length; i++) {
                                var s = respitemsraw.called[i].data[0];

                                if (s !== null && typeof s == "string") {
                                    respitems.push( JSON.parse(s) );
                                } else {
                                    debugger;
                                }
                            }
                            opts.success( respitems );

                        });

                    } else {
                        items = [];
                        opts.success( items );
                    }
                });
            } else {
                debugger;
            }
            
        } else {
            assert(model.get('id') !== undefined || model.newid || model.id);
            //var key = model.storeName + '-' + (model.get('id') || model.newid || model.id);
            var key = model.get_storage_key();
            assert(! key.match('undefined'));
            assert( key.toLowerCase() == key );
            
            if (method == 'read') {
                asyncLocalStorage.getItem( key, function(item) {
                    if (item) {
                        var parsed = JSON.parse( item );
                        opts.success( parsed );
                    } else {
                        opts.success( item );
                    }
                } );
            } else if (method == 'create') {
                assert(! key.match('undefined'));
                if (model instanceof jstorrent.TorrentFile) {
                    debugger;
                }
                asyncLocalStorage.setItem( key, JSON.stringify(model.toJSON()), function(){} );
                model.id = model.newid;
                model.collection._byId[ model.id ] = model; // W T F, when is this supposed to happen...

                // update collection (only for torrents...)
                if (model instanceof jstorrent.Torrent) {
                    var torrents = _.map( model.collection.models, function(m) { return m.id } );
                    asyncLocalStorage.setItem( model.collection.storeName, JSON.stringify( torrents ), function(){} );
                }

                opts.success();
            } else if (method == 'update') {
                var val = JSON.stringify(model.toJSON());
                assert(val);
                assert(! key.match('undefined'));
                asyncLocalStorage.setItem( key, val, function(){} );
                opts.success();
            } else if (method == 'delete') {
                asyncLocalStorage.removeItem( key, function(){} );
                if (! model.collection) {
                    debugger; // why no collection??
                } else {
                    if (model instanceof jstorrent.Torrent) {
                        var torrents = _.map(_.reject( model.collection.models, function(m) { return m.id == model.id } ), function(m) { return m.id } );
                        asyncLocalStorage.setItem( model.collection.storeName, JSON.stringify( torrents ), function(){} );
                        model.collection.remove( model );
                    }
                }
                opts.success();
            } else {
                debugger;
            }
        }

    }
}


var JSTorrentClientViewSettings = Backbone.Model.extend({
    //localStorage: new Store('JSTorrentClientViewSettings'),
    database: jstorrent.storage,
    storeName: 'setting',
    initialize: function() {
    },
    get_storage_key: function() {
        return this.get('id');
    },
    
});
