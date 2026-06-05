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

let localStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let peerConnection = null;
let isInitiator = false;
let currentFacingMode = 'user';

const config = { 
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ] 
};

// ==============================================
// 🎨 UI & STATE MANAGEMENT
// ==============================================

function updateMediaState() {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    const audioTrack = localStream.getAudioTracks()[0];
    
    // Aquí podrías actualizar iconos en el DOM si los tuvieras
    console.log(`Camera: ${videoTrack?.enabled ? 'On' : 'Off'} | Mic: ${audioTrack?.enabled ? 'On' : 'Off'}`);
}

function updateUI(state) {
    const isStreaming = state === 'streaming' || state === 'connected';
    const isRecording = state === 'recording';

    startStreamBtn.disabled = isStreaming;
    stopStreamBtn.disabled = !isStreaming;
    startRecordBtn.disabled = !isStreaming || isRecording;
    stopRecordBtn.disabled = !isRecording;
    generateLinkBtn.disabled = !isStreaming; 
    connectBtn.disabled = !isStreaming;
    switchCameraBtn.style.display = isStreaming ? 'block' : 'none';
}

function setConnectionStatus(connected) {
    if (connected) {
        remoteStatus.textContent = "✅ CONECTADO";
        remoteStatus.classList.add('connected');
        updateUI('connected');
    } else {
        remoteStatus.textContent = "Desconectado";
        remoteStatus.classList.remove('connected');
        if (localStream) updateUI('streaming');
    }
}

// ==============================================
// 🎥 MAIN STREAMING LOGIC
// ==============================================

async function getMediaStream(facingMode) {
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

    try {
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        localVideo.srcObject = localStream;
        updateMediaState();
    } catch (error) {
        console.error('Error accessing media devices:', error);
        throw error; // Propagate to handle in the click event
    }
}

startStreamBtn.addEventListener('click', async () => {
    try {
        await getMediaStream(currentFacingMode);
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        if (videoDevices.length > 1) {
            switchCameraBtn.style.display = 'block';
        }

        initPeerConnection(); 
        updateUI('streaming');

    } catch (error) {
        alert('❌ No se pudo acceder a la cámara o micrófono. Revisa los permisos o asegúrate de usar HTTPS.');
    }
});

switchCameraBtn.addEventListener('click', async () => {
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    
    try {
        await getMediaStream(currentFacingMode);
        
        if (peerConnection && peerConnection.connectionState !== 'closed') {
            const newVideoTrack = localStream.getVideoTracks()[0];
            const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
            
            if (sender) {
                await sender.replaceTrack(newVideoTrack); // Seamless track replacement
            } else {
                peerConnection.addTrack(newVideoTrack, localStream);
                // Note: Adding a track requires renegotiation (createOffer/setLocalDescription)
                // For simplicity, we assume sender exists. A production app would trigger renegotiation here.
            }
        }
    } catch (error) {
        alert('❌ No se pudo cambiar la cámara.');
        currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user'; 
    }
});

stopStreamBtn.addEventListener('click', () => {
    // Clean up streams
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    localVideo.srcObject = null;
    
    // Clean up remote & memory leaks
    if (remoteVideo.srcObject) {
        remoteVideo.srcObject.getTracks().forEach(t => t.stop());
        remoteVideo.srcObject = null;
    }

    destroyPeerConnection();

    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
    }

    isInitiator = false;
    connectionCode.value = "";
    copyLinkBtn.style.display = 'none';
    setConnectionStatus(false);
    updateUI('stopped');
});

// ==============================================
// 🌐 WEBRTC CONNECTION SYSTEM
// ==============================================

function destroyPeerConnection() {
    if (peerConnection) {
        peerConnection.ontrack = null;
        peerConnection.oniceconnectionstatechange = null;
        peerConnection.onicecandidate = null;
        peerConnection.close();
        peerConnection = null;
    }
}

function initPeerConnection() {
    if (peerConnection && peerConnection.connectionState !== 'closed') {
        return; 
    }
    
    destroyPeerConnection();
    peerConnection = new RTCPeerConnection(config);

    if (localStream) {
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    }

    peerConnection.ontrack = event => {
        if (event.streams && event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
            remoteVideo.play().catch(e => console.error("Error playing remote video:", e));
            setConnectionStatus(true);
        }
    };

    peerConnection.oniceconnectionstatechange = () => {
        if (!peerConnection) return;
        const state = peerConnection.iceConnectionState;
        if (state === 'disconnected' || state === 'failed' || state === 'closed') {
            setConnectionStatus(false);
        }
    };
}

function waitForIceGathering(timeout = 10000) {
    return new Promise((resolve, reject) => {
        if (!peerConnection) return reject(new Error("PeerConnection no inicializado."));
        if (peerConnection.iceGatheringState === 'complete') return resolve();

        const timer = setTimeout(() => {
            peerConnection.removeEventListener('icegatheringstatechange', checkState);
            reject(new Error("La recolección de candidatos ICE tardó demasiado."));
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
    if (!peerConnection || peerConnection.connectionState === 'closed') initPeerConnection();

    if (isInitiator && peerConnection.localDescription) {
        alert("Ya has generado un código. Cópialo y envíalo.");
        return;
    }

    try {
        generateLinkBtn.disabled = true;
        connectBtn.disabled = true;
        connectionCode.value = "Generando código, por favor espera...";
        copyLinkBtn.style.display = 'none';
        
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        isInitiator = true;
        
        await waitForIceGathering();
        
        const connectionData = btoa(JSON.stringify(peerConnection.localDescription));
        connectionCode.value = connectionData;
        copyLinkBtn.style.display = 'inline-block';
        
    } catch (e) {
        alert("Error al generar el código: " + e.message);
        connectionCode.value = "";
        isInitiator = false;
    } finally {
        if (localStream) {
            generateLinkBtn.disabled = false;
            connectBtn.disabled = false;
        }
    }
});

copyLinkBtn.addEventListener('click', () => {
    if (!connectionCode.value) return;
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(connectionCode.value)
            .then(() => alert("📋 Código copiado!"))
            .catch(() => fallbackCopy());
    } else {
        fallbackCopy();
    }
});

function fallbackCopy() {
    connectionCode.select();
    document.execCommand('copy');
    alert("📋 Código copiado!");
}

connectBtn.addEventListener('click', async () => {
    const codigoIngresado = connectionCode.value.trim();
    if (!codigoIngresado) {
        alert("⚠️ Por favor, pega primero el código.");
        return;
    }

    let signal;
    try {
        const decoded = atob(codigoIngresado);
        signal = JSON.parse(decoded);
        
        // Validación de seguridad: Evitar conectar con uno mismo
        if (isInitiator && signal.type === 'offer') {
            alert("⚠️ No puedes conectarte con tu propio código de oferta. Necesitas el código de la otra persona.");
            return;
        }
    } catch (e) {
        alert("❌ Código inválido o corrupto.");
        return;
    }

    try {
        if (!peerConnection || peerConnection.connectionState === 'closed') initPeerConnection();

        generateLinkBtn.disabled = true;
        connectBtn.disabled = true;
        connectBtn.textContent = "Conectando...";

        // Si por alguna razón recibimos una oferta siendo iniciador, reiniciamos
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
            
            alert("🔄 ¡Respuesta lista! Envía el NUEVO código de respuesta al emisor primario.");
        } else if (signal.type === 'answer') {
            // La conexión se establece automáticamente
        }

    } catch (e) {
        alert("❌ Error de emparejamiento WebRTC.");
        console.error(e);
        setConnectionStatus(false);
    } finally {
        if (localStream) {
            generateLinkBtn.disabled = false;
            connectBtn.disabled = false;
        }
        connectBtn.textContent = "Conectar"; 
    }
});

// ==============================================
// ⏺️ RECORDING LOGIC
// ==============================================
startRecordBtn.addEventListener('click', () => {
    if (!localStream) {
        alert("Primero debes activar tu cámara.");
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
        
        // Limpieza de memoria (Memory Leak Prevention)
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
        recordedChunks = []; // Limpiar buffer
    };

    mediaRecorder.start(100); 
    updateUI('recording');
});

stopRecordBtn.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        updateUI(localStream ? 'streaming' : 'stopped');
    }
});
