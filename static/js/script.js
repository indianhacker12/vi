const socket = io.connect();
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const muteBtn = document.getElementById('muteBtn');
const videoBtn = document.getElementById('videoBtn');
const endBtn = document.getElementById('endBtn');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const messagesContainer = document.getElementById('messages');

// Get room info from the window object
const roomId = window.ROOM_INFO.roomId;
const partnerId = window.ROOM_INFO.partnerId;

// WebRTC variables
let localStream;
let peerConnection;
let isAudioMuted = false;
let isVideoHidden = false;

// Configuration for STUN/TURN servers
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
    ]
};

// Join the room
socket.emit('join-room', { room: roomId });

// Setup chat functionality
if (sendBtn && messageInput) {
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
}

function sendMessage() {
    if (!messageInput.value.trim()) return;
    
    const message = messageInput.value;
    displayMessage(message, 'sent');
    
    // Send the message to the other user
    socket.emit('chat-message', {
        room: roomId,
        message: message
    });
    
    messageInput.value = '';
}

function displayMessage(message, type) {
    const messageEl = document.createElement('div');
    messageEl.classList.add('message', type);
    messageEl.textContent = message;
    messagesContainer.appendChild(messageEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Listen for chat messages from the other user
socket.on('chat-message', (data) => {
    displayMessage(data.message, 'received');
});

// Handle user joining
socket.on('user-joined', (data) => {
    console.log(data.message);
    startCall();
});

// Handle user leaving
socket.on('user-left', (data) => {
    console.log(data.message);
    displayMessage('The other person has left the chat.', 'received');
    
    // Clear the remote video
    if (remoteVideo.srcObject) {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
    }
});

// Get user media
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then((stream) => {
        localStream = stream;
        localVideo.srcObject = stream;
    })
    .catch((error) => {
        console.error('Error accessing media devices:', error);
        alert('Unable to access camera or microphone. Please check your permissions.');
    });

// WebRTC signaling
socket.on('offer', async (data) => {
    if (!peerConnection) createPeerConnection();
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', { room: roomId, answer: peerConnection.localDescription });
});

socket.on('answer', async (data) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
});

socket.on('ice-candidate', (data) => {
    if (data.candidate) {
        peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
});

// Create peer connection
function createPeerConnection() {
    peerConnection = new RTCPeerConnection(configuration);

    // Add local tracks
    localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream);
    });

    // Handle remote stream
    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', { room: roomId, candidate: event.candidate });
        }
    };
    
    // Connection state change
    peerConnection.onconnectionstatechange = (event) => {
        if (peerConnection.connectionState === 'connected') {
            console.log('Peers connected!');
        }
    };
}

// Start call
function startCall() {
    if (!peerConnection) createPeerConnection();
    peerConnection.createOffer()
        .then((offer) => peerConnection.setLocalDescription(offer))
        .then(() => {
            socket.emit('offer', { room: roomId, offer: peerConnection.localDescription });
        })
        .catch(error => {
            console.error('Error creating offer:', error);
        });
}

// Add event listeners for control buttons
if (muteBtn) {
    muteBtn.addEventListener('click', toggleAudio);
}

if (videoBtn) {
    videoBtn.addEventListener('click', toggleVideo);
}

if (endBtn) {
    endBtn.addEventListener('click', endCall);
}

// Toggle audio mute
function toggleAudio() {
    if (localStream) {
        const audioTracks = localStream.getAudioTracks();
        if (audioTracks.length === 0) return;
        
        const enabled = !isAudioMuted;
        audioTracks[0].enabled = enabled;
        isAudioMuted = !enabled;
        
        muteBtn.textContent = isAudioMuted ? 'Unmute' : 'Mute';
    }
}

// Toggle video visibility
function toggleVideo() {
    if (localStream) {
        const videoTracks = localStream.getVideoTracks();
        if (videoTracks.length === 0) return;
        
        const enabled = !isVideoHidden;
        videoTracks[0].enabled = enabled;
        isVideoHidden = !enabled;
        
        videoBtn.textContent = isVideoHidden ? 'Show Video' : 'Hide Video';
    }
}

// End the call and go back to home
function endCall() {
    // Stop all streams
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    
    // Close peer connection
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    // Leave the room
    socket.emit('leave-room', { room: roomId });
    
    // Redirect to home
    window.location.href = "/";
}
