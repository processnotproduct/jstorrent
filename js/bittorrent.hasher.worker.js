importScripts('deps/digest.js');

self.addEventListener('message', function(e) {
    var data = e.data
    var msgid = data.id;

    try {
        var hasher = new Digest.SHA1();
        for (var i=0; i<data.chunks.length; i++) {
            hasher.update( data.chunks[i] );
        }
        var hash = hasher.finalize();
    } catch(e) {
        self.postMessage({id:msgid, error:e});
        return;
    }

    self.postMessage({id:msgid, hash:hash});
}, false);
