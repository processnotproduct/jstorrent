var main_window = null;
var main_window_launching = false;
var jstorrent_extension_id = "bnceafpojmnimbnhamaeedgomdcgnbjk";

function load_main_window(cb) {

    if (navigator.appVersion.match("Chrome/23") || navigator.appVersion.match("Chrome/22")) {
        var page = 'examples/message.html' ; // message that their version is too old
    } else {
        var page = 'examples/grid.html'
    }

    chrome.app.window.create(page,
                             { defaultWidth: 1000,
                               id:'jstorrent',
                               minHeight: 700,
                               defaultHeight: 700  },
                             function(w) {
                                 main_window_launching = false
                                 main_window = w
                                 if (cb){cb(w)}
                             });

}

(function() {

//  window.open("http://localhost/myUrl", "bg", "background"); 
//return;


    chrome.app.runtime.onLaunched.addListener(function(launchData) {
        // console.log('launched with data',launchData)

        //var page = 'examples/blank.html'
        //var page = 'http://127.0.0.1:4224';
        main_window_launching = true
        load_main_window()
    });

    chrome.runtime.onSuspend.addListener(function() { 
        // Do some simple clean-up tasks.
        // console.log('suspend');
        
    });


    chrome.runtime.onMessageExternal.addListener( function(request, sender, sendResponse) {
        if (sender.id == jstorrent_extension_id) {
            if (main_window) {
                main_window.focus()
                // could be race condition, is it ready?
                main_window.contentWindow.jsclient.add_unknown(request.url)
            } else {
                // console.assert(! main_window_launching)
                load_main_window(function() {
                    // main window loaded, but no scripts run yet?
                    main_window.focus()
                    main_window.contentWindow.packaged_app_launch_url = request.url;
                })
            }
        } else {
            sendResponse("fuck off")
        }

    })
/*
    chrome.runtime.onConnectExternal.addListener( function(port) {

        port.onMessage.addListener( function(msg) {
            console.log('got msg',msg)
            port.postMessage("byebye")
        });
    });
*/

}).call(this);
