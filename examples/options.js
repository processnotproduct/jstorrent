document.addEventListener("DOMContentLoaded", function() { 
    console.log('options page loaded')
    main();


})


function update_quotas() {

    var temp = navigator.webkitTemporaryStorage
    var pers = navigator.webkitPersistentStorage
    temp.queryUsageAndQuota( function(tused, tavail) {
        pers.queryUsageAndQuota( function(pused, pavail) {
            var quotas = {'persistent': {used:pused, capacity:pavail},
                          'temporary': {used:tused, capacity:tavail}};
            document.getElementById('temporary-used').innerText = to_file_size(tused);
            document.getElementById('temporary-avail').innerText = to_file_size(tavail);
            //document.getElementById('persistent-used').innerText = to_file_size(pused);
            //document.getElementById('persistent-avail').innerText = to_file_size(pavail);
        })
    })
}

function bind_gdrive_authorize() {
    var infospan = document.getElementById('gdrive-authorize-info');
    var btn = document.getElementById('gdrive-authorize');
    btn.addEventListener('click', function(evt) {

        btn.disabled=true
        cloudstorage.get_new_token( {immediate:false}, function(r) {
            btn.disabled= false
            console.log('token result',r)
            infospan.innerText = JSON.stringify(r)
        })
    })
}

function bind_get_persistent_storage() {
    // does not work :-(
    document.getElementById('persistent-store').addEventListener('click', function(evt) {

        navigator.webkitPersistentStorage.requestQuota( 
            //        navigator.webkitTemporaryStorage.requestQuota( 
            1024 * 1024 * 1024 * 100,
            function(res,a,b) {
                console.log('success',res,a,b)
            },
            function(res) {
                console.log('fail',res)
            })
    })
}



function main() {
    window.cloudstorage = new jstorrent.CloudDrive;

    // ask parent frame what the current storage location is...

    chrome.runtime.sendMessage({event:'query_setting',
                                source: 'options',
                                setting: 'default_storage_location'}, function(resp) {
                                    console.log('query setting response!',resp)

                                    if (resp.value == 'gdrive') {
                                        $("#radio-gdrive")[0].checked = true
                                    } else if (resp.value == 'sandbox') {
                                        $("#radio-sandbox")[0].checked = true
                                    }

                                })



    //window.settings = new JSTorrentClientViewSettings(); // dont need this.
    //settings.set('id','client')

    cloudstorage.on('authorized', function(evt) {
        console.log('gdrive is authorized')
        $('#radio-gdrive')[0].disabled = false
    })

    $('input:radio').change( function(evt) {
        console.log('click radio',evt.target)
        if (evt.target.name == 'save_location') {

            chrome.runtime.sendMessage({event:'set_setting',
                                        source: 'options',
                                        name: 'default_storage_area',
                                        value: evt.target.value})
            // send a message to the main window, if it's alive

            if (evt.target.value == 'sandbox') {
                
            } else if (evt.target.value == 'gdrive') {

            }
        }
    })

    bind_gdrive_authorize()
    update_quotas()

}