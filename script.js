const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startStreamBtn = document.getElementById('startStreamBtn');
const startRecordBtn = document.getElementById('startRecordBtn');
const stopRecordBtn = document.getElementById('stopRecordBtn');
const recordedVideo = document.getElementById('recordedVideo');
const downloadLink = document.getElementById('downloadLink');

let localStream;
let mediaRecorder;
let recordedChunks = [];

// WebRTC Configuration
const config = { 'iceServers': [{ 'urls': 'stun:stun.l.google.com:19302' }] };
let peerConnection;

// Start streaming (Get Camera & Mic)
startStreamBtn.addEventListener('click', async () => {
    try {
        // Request camera and microphone
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        
        startRecordBtn.disabled = false;
        startStreamBtn.disabled = true;
        
        setupPeerConnection();
    } catch (error) {
        console.error('Error accessing media devices.', error);
        alert('No se pudo acceder a la cámara o micrófono.');
    }
});

function setupPeerConnection() {
    peerConnection = new RTCPeerConnection(config);

    // Add local tracks to the connection
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    // Receive remote tracks
    peerConnection.ontrack = event => {
        remoteVideo.srcObject = event.streams[0];
    };

    // NOTE: To connect two different cellphones, you need a signaling server 
    // (e.g., WebSockets) to exchange the SDP offer and answer, and ICE candidates.
    // This example sets up the local infrastructure.
}

// Recording Logic
startRecordBtn.addEventListener('click', () => {
    recordedChunks = [];
    const options = { mimeType: 'video/webm;codecs=vp9' };

    try {
        mediaRecorder = new MediaRecorder(localStream, options);
    } catch (e) {
        console.error('MediaRecorder failed', e);
        // Fallback
        mediaRecorder = new MediaRecorder(localStream);
    }

    mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) {
            recordedChunks.push(event.data);
        }
    };

    mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        recordedVideo.src = url;
        downloadLink.href = url;
        downloadLink.style.display = 'inline-block';
    };

    mediaRecorder.start();
    startRecordBtn.disabled = true;
    stopRecordBtn.disabled = false;
});

stopRecordBtn.addEventListener('click', () => {
    mediaRecorder.stop();
    stopRecordBtn.disabled = true;
    startRecordBtn.disabled = false;
});
