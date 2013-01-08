var main_window = null;

(function() {

  window.open("http://localhost/myUrl", "bg", "background"); 
return;
    chrome.app.runtime.onLaunched.addListener(function() {
        //var page = 'examples/grid.html'
        //var page = 'examples/blank.html'
        var page = 'http://127.0.0.1:4224';
        main_window = chrome.app.window.create(page,
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
