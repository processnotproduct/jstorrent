var main_window = null;

(function() {

    chrome.app.runtime.onLaunched.addListener(function() {
        main_window = chrome.app.window.create('examples/grid.html',
                                               { defaultWidth: 1000,
                                                 id:'jstorrent',
                                                 minHeight: 690,
                                                 defaultHeight: 690 }
                                              );
    });

    chrome.runtime.onSuspend.addListener(function() { 
        // Do some simple clean-up tasks.
        console.log('suspend');
        
    });


}).call(this);
