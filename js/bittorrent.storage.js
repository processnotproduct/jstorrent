jstorrent.storage = {
    id: "jstorrent",
    description: "The database for client sessions",
    migrations : [
        {
            version: "0.1",
            migrate: function(trans, next) {
                var db = trans.db;
                var store = db.createObjectStore("torrent"); // Adds a store, we will use "movies" as the storeName in our Movie model and Collections
                store.createIndex('hashIndex','infohash', { unique:true});
                var store = db.createObjectStore("client"); 
                var store = db.createObjectStore("setting"); 

                next();
            }
        }, 

        {
            version: "1.1",
            migrate: function(trans, next) {
                var db = trans.db;
                /*
                  var store = versionRequest.transaction.objectStore("torrents")

                  store.createIndex("titleIndex", "title", { unique: true});  // Adds an index on the movies titles
                  store.createIndex("formatIndex", "format", { unique: false}); // Adds an index on the movies formats
                  store.createIndex("genreIndex", "genre", {x unique: false}); // Adds an index on the movies genres
                */
                next();
            }
        }
    ]
}

