var CLIENT_ID = '432934632994.apps.googleusercontent.com';
var SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
//    'https://www.googleapis.com/auth/userinfo.email',
//    'https://www.googleapis.com/auth/userinfo.profile',
    // Add other scopes needed by your application.
];

/**
 * Called when the client library is loaded.
 */
function handleClientLoad() {
    gapi.client.setApiKey('AIzaSyBrXfDSEzTxpwaEfqPg1qCPAOT_fzHRVz4');
    gapi.auth.init( function() {
        console.log('attempt auth?');
        gapi.auth.authorize(
            {'client_id': CLIENT_ID, 'scope': SCOPES.join(' '), immediate:true},
            function(result) {
                console.log('goog auth result',result);
                var expires_in = result.expires_in;
                // store expires_in, so we know to re-request in a little bit!

                if (result) { window.GAUTH = result;
                              authed();
                              //document.getElementById('auth').style.display = 'none'
                            }
            }
        );

        console.log('goog iframe setup');
    });

}

/**
 * Check if the current user has authorized the application.
 */
function checkAuth() {
debugger;
}


function retrieveAllFiles(callback) {
    var retrievePageOfFiles = function(request, result) {
        request.execute(function(resp) {
            if (resp.items) {
                result = result.concat(resp.items);
            }
            var nextPageToken = resp.nextPageToken;
            if (nextPageToken) {

                request = gapi.client.drive.files.list({
                    'pageToken': nextPageToken
                });
                retrievePageOfFiles(request, result);
            } else {

                callback(result);
            }
        });
    }
    var initialRequest = gapi.client.drive.files.list();
    retrievePageOfFiles(initialRequest, []);
}

function ResumableUpload() {
    this.url = "https://www.googleapis.com/upload/drive/v2/files?uploadType=resumable"
    this.xhr = null;
    this.loc = null;
    this.ul_offset = 0;
    this.ul_chunk_sz = 666;

    /*
      Chunk size restriction: There are some chunk size restrictions based on the size of the file you are uploading. Files larger than 256 KB (256 x 1024 bytes) must have chunk sizes that are multiples of 256 KB.  For files smaller than 256 KB, there are no restrictions. In either case, the final chunk has no limitations; you can simply transfer the remaining bytes. If you use chunking, it is important to keep the chunk size as large as possible to keep the upload efficient.
    */

    this.ul_size = this.ul_chunk_sz * 5;
    this.ul_responses = [];
}
ResumableUpload.prototype = {
    start: function() {
        // GAPI does not yet support CORS for upload :-(
        var blob = new Uint8Array([0,3,4])
        if (false) {
            this.xhr = new XMLHttpRequest;
            this.xhr.open('POST', this.url, true);

            this.xhr.setRequestHeader('Authorization', gapi.auth.getToken().access_token);
            this.xhr.send(blob);
            this.xhr.onreadystatechange = _.bind(this.onreadystatechange,this);
            this.xhr.upload.onprogress = _.bind(this.onprogress,this)
        }

        var req = gapi.client.request({
            'path': '/upload/drive/v2/files',
            'method': 'POST',
            'params': {'uploadType': 'resumable'},
/*
            'headers': {
                'Content-Type': 'multipart/mixed; boundary="' + boundary + '"'
            },
*/
            'body': blob});
        req.execute( _.bind(this.oncreated, this, req) );
    },
    oncreated: function(req,a,b) {
        if (typeof b == 'string') {
            var data = JSON.parse(b)
            var loc = data.gapiRequest.data.headers.location;
            this.loc = loc.slice(loc.indexOf('/upload'), loc.length);
            this.upload_next();
        } else {
            debugger;
        }
    },
    upload_next: function() {
        var arr = [];
        for (var i=0; i<this.ul_chunk_sz;i++) {
            arr.push( Math.floor( Math.random() * 10 ) )
        }
        var blob = new Uint8Array(arr);

        var req = gapi.client.request({
            'path': this.loc,
            'method': 'PUT',
//            'params': {'uploadType': 'resumable'},
            'headers': {'Content-Range': 'bytes ' + this.ul_offset + '-' + (this.ul_offset + this.ul_chunk_sz-1) + '/' + this.ul_size,
                        'Content-Length': this.ul_chunk_sz
                       },
            'body': blob});
        this.ul_offset += this.ul_chunk_sz;
        req.execute( _.bind(this.uploaded_chunk, this, req) );
    },
    uploaded_chunk: function(req,a,b) {
        console.log('uploaded chunk!',req,a,b);
        this.ul_responses.push( [req,a,b] )
        if (this.ul_offset >= this.ul_size-1) {
            console.log('done!')
        } else {
            this.upload_next();
        }
    },
    onreadystatechange: function(evt) {
        debugger;
    },
    onprogress: function(e) {
        if (e.lengthComputable) {
            var pct = (e.loaded / e.total) * 100;
            console.log('pct upload',pct);
        }
    }
}


function authed() {
    gapi.client.load('drive', 'v2', function() {
        console.log('drive api loaded');
        retrieveAllFiles( function(result) {
            console.log('got files',result);
            //window.ul = new ResumableUpload
            //ul.start();
        })
    });

}

/**
 * Called when authorization server replies.
 *
 * @param {Object} authResult Authorization result.
 */
function handleAuthResult(authResult) {
    if (authResult) {
        debugger;
        // Access token has been successfully retrieved, requests can be sent to the API
    } else {
        console.log('no auth!');
        debugger;
        // No access token could be retrieved, force the authorization flow.
    }
}


function afterauth(result) {
    if (result) {
        debugger;
    } else {
        debugger;
    }
}

function setup_drive_action() {
    document.getElementById('setup-storage').addEventListener('click',function(evt) {
        if (window.GAUTH) {

            
        } else {
            // immediate false means iframe can pop up
            gapi.auth.authorize(
                {'client_id': CLIENT_ID, 'scope': SCOPES.join(' '), immediate:false},
                afterauth);

        }
        
    });
    console.log('click evt setup');
}

//document.addEventListener('DOMContentLoaded', function() {
//});
