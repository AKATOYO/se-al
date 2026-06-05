const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const remoteStatus = document.getElementById('remoteStatus');
const startStreamBtn = document.getElementById('startStreamBtn');
const stopStreamBtn = document.getElementById('stopStreamBtn');
const startRecordBtn = document.getElementById('startRecordBtn');
const stopRecordBtn = document.getElementById('stopRecordBtn');
const recordedVideo = document.getElementById('recordedVideo');
const downloadLink = document.getElementById('downloadLink');
const switchCameraBtn = document.getElementById('switchCameraBtn');

const generateLinkBtn = document.getElementById('generateLinkBtn');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const connectionCode = document.getElementById('connectionCode');
const connectBtn = document.getElementById('connectBtn');

let localStream;
let mediaRecorder;
let recordedChunks = [];
let peerConnection;
let isInitiator = false;
let currentFacingMode = 'user'; // 'user' for front, 'environment' for back

const config = { 
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ] 
};

// ==============================================
// MAIN STREAMING LOGIC
// ==============================================

async function getMediaStream(facingMode) {
    // Stop existing tracks to free up the camera hardware
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }

    const constraints = {
        video: { 
            width: { ideal: 1280 }, 
            height: { ideal: 720 },
            facingMode: facingMode 
        }, 
        audio: { echoCancellation: true, noiseSuppression: true } 
    };

    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    localVideo.srcObject = localStream;
    // Removed redundant localVideo.play(). The video element handles playback via srcObject natively.
}

startStreamBtn.addEventListener('click', async () => {
    try {
        await getMediaStream(currentFacingMode);
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        if (videoDevices.length > 1) {
            switchCameraBtn.style.display = 'block';
        }

        startStreamBtn.disabled = true;
        stopStreamBtn.disabled = false;
        startRecordBtn.disabled = false;
        generateLinkBtn.disabled = false; 
        connectBtn.disabled = false;

        // Initialize connection and add current stream tracks
        initPeerConnection(); 

    } catch (error) {
        console.error('Error:', error);
        alert('❌ Could not access camera or microphone. Check permissions or ensure you are using HTTPS.');
    }
});

switchCameraBtn.addEventListener('click', async () => {
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    
    try {
        await getMediaStream(currentFacingMode);
        
        // FIX: Safely replace track on existing peer connection
        if (peerConnection && peerConnection.connectionState !== 'closed') {
            const videoTrack = localStream.getVideoTracks()[0];
            const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender && videoTrack) {
                await sender.replaceTrack(videoTrack);
            } else {
                // If sender doesn't exist (rare edge case), we might need to re-add
                peerConnection.addTrack(videoTrack, localStream);
            }
        }
    } catch (error) {
        alert('❌ Could not switch camera.');
        // Revert facing mode if switch failed
        currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user'; 
    }
});

stopStreamBtn.addEventListener('click', () => {
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;

    // FIX: Properly destroy PeerConnection
    destroyPeerConnection();

    if (mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.stop();

    isInitiator = false;
    connectionCode.value = "";
    copyLinkBtn.style.display = 'none';
    switchCameraBtn.style.display = 'none';
    remoteStatus.textContent = "Disconnected";
    remoteStatus.classList.remove('connected');

    startStreamBtn.disabled = false;
    stopStreamBtn.disabled = true;
    startRecordBtn.disabled = true;
    stopRecordBtn.disabled = true;
    generateLinkBtn.disabled = true;
    connectBtn.disabled = true;
});

// ==============================================
// 🔹 REMOTE CONNECTION SYSTEM
// ==============================================

// FIX: Separated destruction logic to ensure peerConnection is always set to null
function destroyPeerConnection() {
    if (peerConnection) {
        peerConnection.ontrack = null;
        peerConnection.oniceconnectionstatechange = null;
        peerConnection.onicecandidate = null;
        peerConnection.close();
        peerConnection = null; // Crucial: allow re-initialization
    }
}

function initPeerConnection() {
    // FIX: Only close if it exists and is closed, otherwise reuse or reset safely
    if (peerConnection && peerConnection.connectionState !== 'closed') {
        return; 
    }
    
    destroyPeerConnection(); // Ensure clean state
    peerConnection = new RTCPeerConnection(config);

    if (localStream) {
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    }

    peerConnection.ontrack = event => {
        if (event.streams && event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
            remoteVideo.play().catch(e => console.error("Error playing remote video:", e));
            remoteStatus.textContent = "✅ CONNECTED";
            remoteStatus.classList.add('connected');
        }
    };

    peerConnection.oniceconnectionstatechange = () => {
        if (!peerConnection) return;
        if (peerConnection.iceConnectionState === 'disconnected' || peerConnection.iceConnectionState === 'failed') {
            remoteVideo.srcObject = null;
            remoteStatus.textContent = "Disconnected";
            remoteStatus.classList.remove('connected');
        }
    };
}

function waitForIceGathering(timeout = 10000) {
    return new Promise((resolve, reject) => {
        if (!peerConnection) return reject(new Error("PeerConnection not initialized."));
        if (peerConnection.iceGatheringState === 'complete') {
            resolve();
            return;
        }

        let timer = setTimeout(() => {
            peerConnection.removeEventListener('icegatheringstatechange', checkState);
            reject(new Error("ICE gathering timed out."));
        }, timeout);

        const checkState = () => {
            if (peerConnection && peerConnection.iceGatheringState === 'complete') {
                clearTimeout(timer);
                peerConnection.removeEventListener('icegatheringstatechange', checkState);
                resolve();
            }
        };
        peerConnection.addEventListener('icegatheringstatechange', checkState);
    });
}

generateLinkBtn.addEventListener('click', async () => {
    initPeerConnection();

    if (isInitiator && peerConnection.localDescription) {
        alert("You have already generated a code. Copy it and send it.");
        return;
    }

    try {
        generateLinkBtn.disabled = true;
        connectBtn.disabled = true;
        connectionCode.value = "Generating code, please wait...";
        copyLinkBtn.style.display = 'none';
        
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        isInitiator = true;
        
        await waitForIceGathering();
        
        const connectionData = btoa(JSON.stringify(peerConnection.localDescription));
        connectionCode.value = connectionData;
        copyLinkBtn.style.display = 'inline-block';
        
    } catch (e) {
        alert("Error generating code: " + e.message);
        connectionCode.value = "";
        isInitiator = false;
    } finally {
        generateLinkBtn.disabled = false;
        connectBtn.disabled = false;
    }
});

copyLinkBtn.addEventListener('click', () => {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(connectionCode.value)
            .then(() => alert("📋 Code copied!"))
            .catch(() => fallbackCopy());
    } else {
        fallbackCopy();
    }
});

function fallbackCopy() {
    connectionCode.select();
    connectionCode.setSelectionRange(0, 99999); 
    document.execCommand('copy');
    alert("📋 Code copied!");
}

// FIX: Removed the focus clear logic. It's annoying if a user clicks the textarea to paste.
// Instead, we handle clearing when the connect button is explicitly clicked.

connectBtn.addEventListener('click', async () => {
    let codigoIngresado = connectionCode.value.trim();
    if (!codigoIngresado) {
        alert("⚠️ Please paste the code first.");
        return;
    }

    try {
        const decoded = atob(codigoIngresado);
        const signal = JSON.parse(decoded);

        initPeerConnection();

        generateLinkBtn.disabled = true;
        connectBtn.disabled = true;
        const originalText = connectBtn.textContent;
        connectBtn.textContent = "Connecting...";

        // If I am the initiator and I receive an external offer, reset logic
        if (isInitiator && signal.type === 'offer') {
            destroyPeerConnection();
            initPeerConnection();
            isInitiator = false;
        }

        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));

        if (signal.type === 'offer') {
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            await waitForIceGathering();
            
            const answerData = btoa(JSON.stringify(peerConnection.localDescription));
            connectionCode.value = answerData;
            copyLinkBtn.style.display = 'inline-block';
            
            alert("🔄 Answer ready! Send the NEW answer code to the primary sender.");
        } else if (signal.type === 'answer') {
            alert("✅ Processing Answer. Connection in progress...");
        }

    } catch (e) {
        alert("❌ Invalid code or pairing error.");
        console.error(e);
    } finally {
        generateLinkBtn.disabled = false;
        connectBtn.disabled = false;
        connectBtn.textContent = "Connect"; 
    }
});

// ==============================================
// RECORDING LOGIC
// ==============================================
startRecordBtn.addEventListener('click', () => {
    if (!localStream) {
        alert("You must activate your camera first.");
        return;
    }
    recordedChunks = [];
    let options;

    const tipos = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    for (let t of tipos) {
        if (MediaRecorder.isTypeSupported(t)) {
            options = { mimeType: t };
            break;
        }
    }

    try {
        mediaRecorder = options ? new MediaRecorder(localStream, options) : new MediaRecorder(localStream);
    } catch (e) {
        mediaRecorder = new MediaRecorder(localStream);
    }

    mediaRecorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) {
            recordedChunks.push(e.data);
        }
    };

    mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        
        // FIX: Revoke previous object URLs to prevent memory leaks
        if (recordedVideo.src && recordedVideo.src.startsWith('blob:')) {
            URL.revokeObjectURL(recordedVideo.src);
        }
        if (downloadLink.href && downloadLink.href.startsWith('blob:')) {
            URL.revokeObjectURL(downloadLink.href);
        }
        
        const url = URL.createObjectURL(blob);
        recordedVideo.src = url;
        recordedVideo.play().catch(e => console.error(e));
        downloadLink.href = url;
        downloadLink.style.display = 'inline-block';
    };

    mediaRecorder.start(100); 
    startRecordBtn.disabled = true;
    stopRecordBtn.disabled = false;
});

stopRecordBtn.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        startRecordBtn.disabled = false;
        stopRecordBtn.disabled = true;
    }
});
