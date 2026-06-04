const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startStreamBtn = document.getElementById('startStreamBtn');
const stopStreamBtn = document.getElementById('stopStreamBtn');
const startRecordBtn = document.getElementById('startRecordBtn');
const stopRecordBtn = document.getElementById('stopRecordBtn');
const recordedVideo = document.getElementById('recordedVideo');
const downloadLink = document.getElementById('downloadLink');
const statusIndicator = document.getElementById('statusIndicator');

let localStream;
let mediaRecorder;
let recordedChunks = [];

// WebRTC Configuration
const config = { 'iceServers': [{ 'urls': 'stun:stun.l.google.com:19302' }] };
let peerConnection;

// Helper to update UI status
function updateStatus(text, className) {
    statusIndicator.textContent = text;
    statusIndicator.className = className;
}

// Start streaming (Get Camera & Mic)
startStreamBtn.addEventListener('click', async () => {
    try {
        // Request camera and microphone
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        
        startStreamBtn.disabled = true;
        stopStreamBtn.disabled = false;
        startRecordBtn.disabled = false;
        
        updateStatus('En Vivo', 'status-live');
        setupPeerConnection();
    } catch (error) {
        console.error('Error accessing media devices.', error);
        alert('No se pudo acceder a la cámara o micrófono.');
    }
});

// Stop streaming (Release Camera & Mic)
stopStreamBtn.addEventListener('click', () => {
    stopMediaTracks();
    
    startStreamBtn.disabled = false;
    stopStreamBtn.disabled = true;
    startRecordBtn.disabled = true;
    stopRecordBtn.disabled = true;
    
    updateStatus('Esperando', 'status-idle');
});

function stopMediaTracks() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localVideo.srcObject = null;
    }
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    // Stop recording if it's running
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    }
}

function setupPeerConnection() {
    peerConnection = new RTCPeerConnection(config);

    // Add local tracks to the connection
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    // Receive remote tracks
    peerConnection.ontrack = event => {
        remoteVideo.srcObject = event.streams[0];
    };

    console.warn("NOTA: Para conectar dos dispositivos, necesitas un servidor de señalización (WebSockets) para intercambiar ofertas SDP y candidatos ICE.");
}

// Function to find a supported MIME type for recording
function getSupportedMimeType() {
    const types = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=h264,opus',
        'video/webm',
        'video/mp4'
    ];
    for (let type of types) {
        if (MediaRecorder.isTypeSupported(type)) {
            return type;
        }
    }
    return ''; // Let the browser decide
}

// Recording Logic
startRecordBtn.addEventListener('click', () => {
    recordedChunks = [];
    const mimeType = getSupportedMimeType();
    const options = mimeType ? { mimeType } : {};

    try {
        mediaRecorder = new MediaRecorder(localStream, options);
    } catch (e) {
        console.error('MediaRecorder failed', e);
        alert('Tu navegador no soporta la grabación de video.');
        return;
    }

    mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) {
            recordedChunks.push(event.data);
        }
    };

    mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: mimeType || 'video/webm' });
        const url = URL.createObjectURL(blob);
        recordedVideo.src = url;
        downloadLink.href = url;
        downloadLink.style.display = 'inline-block';
        
        // Revoke the old URL to free memory
        if (recordedVideo.srcObject) {
            URL.revokeObjectURL(recordedVideo.srcObject);
        }
    };

    // Start recording with a timeslice of 1 second to prevent memory issues on long recordings
    mediaRecorder.start(1000);
    
    startRecordBtn.disabled = true;
    stopRecordBtn.disabled = false;
    stopStreamBtn.disabled = true; // Prevent stopping stream while recording
    
    updateStatus('Grabando', 'status-recording');
});

stopRecordBtn.addEventListener('click', () => {
    mediaRecorder.stop();
    stopRecordBtn.disabled = true;
    startRecordBtn.disabled = false;
    stopStreamBtn.disabled = false; // Re-enable stop stream
    
    updateStatus('En Vivo', 'status-live');
});
