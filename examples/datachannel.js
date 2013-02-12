window.PeerConnection = window.webkitRTCPeerConnection || window.mozRTCPeerConnection;


function Conn() {
    _.bindAll( this, 'onSessionDescription','onAnswer','onopen','onmedia','onnegotiationneeded','onaddstream','onicecandidate' );
    //https://code.google.com/p/natvpn/source/browse/trunk/stun_server_list
    //var pc_config = {"iceServers": [{"url": "stun:stun.l.google.com:19302"}]};
    var pc_config = {"iceServers":[]};
    this.pc = new PeerConnection(pc_config);
    console.log("Created webkitRTCPeerConnnection with config \"" + JSON.stringify(pc_config) + "\".");
    this.pc.onaddstream = _.bind(this.onaddstream,this);
    this.pc.ondatachannel = _.bind(this.ondatachannel,this)
    this.pc.onicecandidate = _.bind(this.onicecandidate,this);
    this.pc.onicechange = _.bind(this.onicechange,this);
    this.pc.onnegotiationneeded = _.bind(this.onnegotiationneeded,this);
    this.pc.onopen = _.bind(this.onopen,this);
    this.pc.onremovestream = _.bind(this.onremovestream,this);
    this.pc.onstatechange = _.bind(this.onstatechange, this);
    this.initiating = false;
    this.candidates = [];
    this.offers = [];
    this.answers = [];
    this.peer = null;
    this.name = null;
    //this.pc.createDataChannel("test",{reliable:false});
}
Conn.prototype = {
    call_peer: function(peer) {
        console.log(this.name,'callpeer',peer.name);
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
        console.log(this.name, 'onsessiondesc');
        this.offers.push(evt);
        this.pc.setLocalDescription(evt);
        this.peer.pc.setRemoteDescription(evt);

        this.peer.pc.createAnswer( this.onAnswer );

        this.pc.createDataChannel("test",{reliable:false});
        this.peer.pc.createAnswer();

    },
    onAnswer: function(evt) {
        console.log(this.name,'onansw');
        this.peer.pc.setLocalDescription(evt);
        this.peer.answers.push(evt);
        this.pc.setRemoteDescription(evt);
    },
    onaddstream: function(evt) {
        console.log(this.name, 'onnaddstream',evt);

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
        console.log(this.name,'ondatachannel');
        debugger;
    },
    onicecandidate: function(evt) {
        console.log(this.name,'onicecand');
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
        console.log(this.name,'onicechange');
        debugger;
    },
    onnegotiationneeded: function(evt) {
        console.log(this.name, 'onnegotiationneeded');

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
        console.log(this.name,'onopen!');

        if (this.initiating && this.pc.localStreams.length == 0) {
            //window.dc = this.pc.createDataChannel("test",{reliable:false});
            window.dc = this.pc.createDataChannel("test",{});
            debugger;
            //navigator.webkitGetUserMedia( { video: true, audio: true }, this.onmedia, this.onmedia );
        }
    },
    onremovestream: function(evt) {
        console.log(this.name, 'onremovestream');
        debugger;
    },
    onstatechange: function(evt) {
        console.log(this.name,'onstatechange',evt);

    }
}

var conn = new Conn();
conn.name = 'conn1'
var conn2 = new Conn();
conn2.name = 'conn2';

conn.call_peer(conn2);

