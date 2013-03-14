var main_window = null;

(function() {

//  window.open("http://localhost/myUrl", "bg", "background"); 
//return;

    if (navigator.appVersion.match("Chrome/23") || navigator.appVersion.match("Chrome/22")) {
        var page = 'examples/message.html' ; // message that their version is too old
    } else {
        var page = 'examples/grid.html'
    }

    chrome.app.runtime.onLaunched.addListener(function(intent) {

        if (intent) { console.log('launched with intent',intent) }

        //var page = 'examples/blank.html'
        //var page = 'http://127.0.0.1:4224';
        main_window = chrome.app.window.create(page,
                                               { defaultWidth: 1000,
                                                 id:'jstorrent',
                                                 minHeight: 700,
                                                 defaultHeight: 700 }
                                              );
    });

    chrome.runtime.onSuspend.addListener(function() { 
        // Do some simple clean-up tasks.
        console.log('suspend');
        
    });


}).call(this);
