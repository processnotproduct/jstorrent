var main_window = null;

(function() {

    chrome.app.runtime.onLaunched.addListener(function() {
        main_window = chrome.app.window.create('examples/grid.html');
    });


    chrome.runtime.onSuspend.addListener(function() { 
        // Do some simple clean-up tasks.
        console.log('suspend');
        
    });


}).call(this);
