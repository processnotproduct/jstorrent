importScripts('deps/jspack.js');
importScripts('bittorrent.quicktime.js');
importScripts('deps/underscore.js');
/*
function bind(func) {
    return Function.prototype.bind.apply(func, Array.prototype.slice.call(arguments, 1))
}
*/
function assert(v) {
    if (!v) { 
        debugger; 
    }
}

function ParserWorker() {
    self.addEventListener('message', _.bind(this.onmessage,this))
}
ParserWorker.prototype = {
    onmessage: function(e) {
        var data = e.data
        var msgid = data.id;
        var file_path = data.file_path;
        var file_ranges = data.file_ranges;
        var file_size = data.file_size;
        var storage_area = data.storage_area;

        if (self.webkitRequestFileSystemSync) {
//            try {
                var fs = self.webkitRequestFileSystemSync( (storage_area == 'temporary')?self.TEMPORARY:self.PERSISTENT, 1 );
                var entry = fs.root.getFile(file_path, {create:false});
/*            } catch(exc) {
                self.postMessage({result:{error:'unable to get entry',code:exc.code}, id:msgid})
                return;
            }
  */          
            var result = {};


            var parts = file_path.split('.');
            if (parts.length > 0 && parts[parts.length-1].toLowerCase() == 'mp4') {

                var reader = new FileReaderSync;
                var file = entry.file();

                var sparse_data = [];
                for (var i=0; i<file_ranges.length; i++) {
                    var a = file_ranges[i][0];
                    var b = file_ranges[i][1];
                    sparse_data.push( [a, new Uint8Array(reader.readAsArrayBuffer( file.slice( a,b )))] );
                }
                var stream = new SparseBytestream(sparse_data, 0, file_size);
                var mp4reader = new MP4Reader(stream);
                var parsedata = {};
                mp4reader.readBoxes(stream, parsedata);
                result.file = parsedata;

                if (mp4reader.error) {
                    result.error = mp4reader.error
                    self.postMessage({result:result, id:msgid});
                }
            } else {
                result.error = 'unable to parse this type';
            }



            self.postMessage({result:result, id:msgid});
        } else {
            self.postMessage({result:{error:'unable to open filesystem'}, id:msgid});
        }

    }
};


var pw = new ParserWorker
/*
self.onerror = function(a,b,c) {
    debugger;
}
*/
