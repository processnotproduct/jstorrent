var iframe = document.querySelectorAll('iframe')[0];

var player = new PlayerAPI({elt: iframe})

player.on('loadedmetadata', function(data) {
    iframe.setAttribute('width',data.width);
    iframe.setAttribute('height',data.height);
    console.log('player ready');
});
