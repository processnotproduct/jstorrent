window.PeerConnection = window.webkitRTCPeerConnection || window.mozRTCPeerConnection;


function Conn() {
    _.bindAll( this, 'onSessionDescription','onAnswer','onopen','onmedia','onnegotiationneeded','onaddstream','onicecandidate' );
    //https://code.google.com/p/natvpn/source/browse/trunk/stun_server_list
    //var pc_config = {"iceServers": [{"url": "stun:stun.l.google.com:19302"}]};
    var pc_config = {"iceServers":[]};
    this.pc = new PeerConnection(pc_config);
    console.log("Created webkitRTCPeerConnnection with config \"" + JSON.stringify(pc_config) + "\".");
    this.pc.onaddstream = this.onaddstream
    this.pc.ondatachannel = this.ondatachannel
    this.pc.onicecandidate = this.onicecandidate;
    this.pc.onicechange = this.onicechange;
    this.pc.onnegotiationneeded = this.onnegotiationneeded;
    this.pc.onopen = this.onopen;
    this.pc.onremovestream = this.onremovestream;
    this.pc.onstatechange = this.onstatechange;
    this.initiating = false;
    this.candidates = [];
    this.offers = [];
    this.answers = [];
    this.peer = null;
    //this.pc.createDataChannel("test",{reliable:false});
}
Conn.prototype = {
    call_peer: function(peer) {
        console.log('callpeer');
        this.initiating = true;
        this.peer = peer;
        this.pc.createOffer( this.onSessionDescription, this.onerr );
        //this.pc.updateIce();
    },
    onerr: function(evt) {
        console.log('onerr');
        debugger;
    },
    onSessionDescription: function(evt) {
        console.log('onseccdesc');
        this.offers.push(evt);
        this.pc.setLocalDescription(evt);
        this.peer.pc.setRemoteDescription(evt);

        this.peer.pc.createAnswer( this.onAnswer );

        //this.pc.createDataChannel("test",{reliable:false});
        //this.peer.pc.createAnswer();

    },
    onAnswer: function(evt) {
        console.log('onansw');
        this.peer.pc.setLocalDescription(evt);
        this.peer.answers.push(evt);
        this.pc.setRemoteDescription(evt);
    },
    onaddstream: function(evt) {
        console.log('onnadstream',evt);

        if (! this.initiator) {
            //var audio = evt.stream.audioTracks[0];
            var url = webkitURL.createObjectURL(evt.stream)
            var vid = document.createElement('video');
            vid.controls = true;
            vid.autoplay = true;
            vid.src = url;
            document.getElementById('content').appendChild(vid);
        }

    },
    ondatachannel: function(evt) {
        console.log('ondatachannel');
        debugger;
    },
    onicecandidate: function(evt) {
        console.log('onicecand');
        this.candidates.push(evt.candidate);

        if (this.initiating) {
            if (evt.candidate) {
                console.log('onicecandidate',evt.candidate);
                if (this.peer.candidates.length == 0) {
                    //this.peer.candidates = 1;
                    this.peer.pc.addIceCandidate(evt.candidate);
                }
            }
        } else {
            console.log('peer ice candidate',evt.candidate);
            if (conn.candidates.length == 0) {
                //conn.candidates = 1;
                conn.pc.addIceCandidate(evt.candidate);
            }
        }

    },
    onicechange: function(evt) {
        console.log('onicechange');
        debugger;
    },
    onnegotiationneeded: function(evt) {
        console.log('onnegotiationneeded');
        this.pc.createOffer( _.bind(function(desc) {
            this.offers.push(desc);
            this.pc.setLocalDescription(desc);
            this.peer.pc.setRemoteDescription(desc);
            this.peer.pc.createAnswer( _.bind(function(desc2) {
                this.peer.answers.push(desc2);
                this.peer.pc.setLocalDescription(desc2);
                this.pc.setRemoteDescription(desc2);

            }, this) );
        },this) );
    },
    onmedia: function(evt) {
        console.log('onmedia');
        var url = webkitURL.createObjectURL(evt)
        var vid = document.createElement('video');
        vid.controls = true;
        vid.autoplay = true;
        vid.mute = true;
        vid.src = url;
        document.getElementById('content').appendChild(vid);

        
        if (this.initiating) {
            this.pc.addStream( evt );
        } else {
            debugger;
        }
    },
    onopen: function(evt) {
        console.log('onopen!');

        if (this.initiating && this.pc.localStreams.length == 0) {
            window.dc = this.pc.createDataChannel("test",{reliable:false});
            debugger;
            //navigator.webkitGetUserMedia( { video: true, audio: true }, this.onmedia, this.onmedia );
        }
    },
    onremovestream: function(evt) {
        console.log('onremovestream');
        debugger;
    },
    onstatechange: function(evt) {
        console.log('onstatechange',evt);

    }
}

var conn = new Conn();
var conn2 = new Conn();

conn.call_peer(conn2);

