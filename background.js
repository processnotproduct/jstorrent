console.log('jstorrent background init');
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

                                 console.log('putting our ab into content window')

                                 if (window._please_add_this_torrent) {

                                     main_window.contentWindow._please_load_this_as_a_torrent = window._please_add_this_torrent;
                                 }

                                 //main_window.contentWindow.jsclient.add_torrent( { metadata: window._please_add_this_torrent } );

                                 window._please_add_this_torrent = undefined
                                 main_window.onClosed.addListener( function() {
                                     console.log('main window closed')
                                     main_window_launching = false
                                     main_window = null
                                 })
                                 if (cb){cb(w)}
                             });

}

(function() {

//  window.open("http://localhost/myUrl", "bg", "background"); 
//return;


    chrome.app.runtime.onLaunched.addListener(function(launchData) {
        // confusing! the main_window can still exist as a reference even though we closed it...

        console.log('launched with data',launchData)

        //var page = 'examples/blank.html'
        //var page = 'http://127.0.0.1:4224';


        if (launchData && launchData.items) {
            console.log('data items')

            var entry = launchData.items[0].entry;
            if (entry.isFile) {
                console.log('data item entry file')
                entry.file( function(file) {
                    var fr = new FileReader
                    fr.onload = function(evt) {
                        var ab = evt.target.result;
                        console.log('file read...')
                        // now send this ab to somewheres...
                        if (main_window && main_window.contentWindow) {
                            console.log('main window has content window, putting it there...', ab)
                            main_window.contentWindow._please_load_this_as_a_torrent = ab;
                            //main_window.contentWindow.jsclient.add_torrent( { metadata: ab } );

                        } else {
                            window._please_add_this_torrent = ab
                            console.log('no main window to send the loaded torrent arraybuffer... storing for now...')
                        }
                    }
                    fr.onerror = function(e){console.log('intent file read error')}
                    fr.readAsArrayBuffer(file)
                })
            }
        }


        if (main_window_launching) {
            
            console.log('main window lauching..., wait for it...')
            // window already launching...
        } else {
            main_window_launching = true
            load_main_window()
        }
    });

    chrome.runtime.onSuspend.addListener(function() { 
        // Do some simple clean-up tasks.
        // console.log('suspend');
        
    });


    chrome.runtime.onMessageExternal.addListener( function(request, sender, sendResponse) {
        console.log('onconnectexternal message', request, sender)
        if (sender.id == jstorrent_extension_id) {
            if (main_window) {
                main_window.focus()
                // could be race condition, is it ready?
                main_window.contentWindow.jsclient.add_unknown(request.url)
            } else {
                // console.assert(! main_window_launching)
                load_main_window(function() {
                    // main window loaded, but no scripts run yet?
                    main_window_launching = false
                    main_window.focus()
                    main_window.contentWindow.packaged_app_launch_url = request.url;
                })
            }
        } else {
            sendResponse("fuck off")
        }

    })

    chrome.runtime.onConnectExternal.addListener( function(port) {
        console.log('onconnectexternal port',port)
        port.onMessage.addListener( function(msg) {
            console.log('got msg',msg)
            port.postMessage("byebye")
        });
    });


}).call(this);
