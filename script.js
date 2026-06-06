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

// [FIX] La UI ahora lee el estado real de las conexiones, no depende de strings manuales
function updateUI() {
    const isStreaming = localStream && localStream.active;
    const isRecording = mediaRecorder && mediaRecorder.state === 'recording';
    const isConnected = peerConnection && (peerConnection.iceConnectionState === 'connected' || peerConnection.iceConnectionState === 'completed');

    startStreamBtn.disabled = isStreaming;
    stopStreamBtn.disabled = !isStreaming;
    startRecordBtn.disabled = !isStreaming || isRecording;
    stopRecordBtn.disabled = !isRecording;
    
    // Deshabilitar signaling si estamos grabando para evitar romper la conexión
    generateLinkBtn.disabled = !isStreaming || isRecording; 
    connectBtn.disabled = !isStreaming || isRecording;
    
    switchCameraBtn.style.display = isStreaming ? 'block' : 'none';
}

function setConnectionStatus(connected) {
    if (connected) {
        remoteStatus.textContent = "✅ CONECTADO";
        remoteStatus.classList.add('connected');
    } else {
        remoteStatus.textContent = "Desconectado";
        remoteStatus.classList.remove('connected');
    }
    updateUI();
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
        
        // [FIX] CRUCIAL: Silenciar el video local para evitar eco/feedback del micrófono
        localVideo.muted = true; 
        
        updateUI();
    } catch (error) {
        console.error('Error accessing media devices:', error);
        throw error;
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
        updateUI();

    } catch (error) {
        alert('❌ No se pudo acceder a la cámara o micrófono. Revisa los permisos o asegúrate de usar HTTPS / Localhost.');
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
                await sender.replaceTrack(newVideoTrack); // Cambio fluido sin renegociación
            } else {
                // [FIX] Si no hay sender, lo agregamos. En una app real avanzada esto requeriría 
                // crear un nuevo Offer, pero para este flujo básico es mejor reiniciar el peer
                peerConnection.addTrack(newVideoTrack, localStream);
                console.warn("Se añadió un track nuevo. Se requeriría renegociación manual si la conexión ya estaba establecida.");
            }
        }
    } catch (error) {
        alert('❌ No se pudo cambiar la cámara.');
        currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user'; 
    }
});

stopStreamBtn.addEventListener('click', () => {
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    localVideo.srcObject = null;
    
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
        
        if (state === 'connected' || state === 'completed') {
            setConnectionStatus(true);
        } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
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
            // [FIX] Si tarda mucho, resolvemos de todas formas con lo que tengamos (Trickle ICE parcial)
            console.warn("ICE gathering timeout, proceeding with partial candidates.");
            resolve(); 
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
        alert("Ya has generado un código de Oferta. Cópialo y envíalo a la otra persona.");
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
        
        // [FIX] UX: Avisar claramente qué hacer
        alert("✅ Código de Oferta generado. Cópielo y envíelo a la otra persona."); 
        
    } catch (e) {
        alert("Error al generar el código: " + e.message);
        connectionCode.value = "";
        isInitiator = false;
    } finally {
        updateUI();
    }
});

copyLinkBtn.addEventListener('click', () => {
    if (!connectionCode.value) return;
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(connectionCode.value)
            .then(() => alert("📋 Código copiado al portapapeles!"))
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
        alert("⚠️ Por favor, pega primero el código en el campo de texto.");
        return;
    }

    let signal;
    try {
        const decoded = atob(codigoIngresado);
        signal = JSON.parse(decoded);
        
        if (isInitiator && signal.type === 'offer') {
            alert("⚠️ Estás intentando usar tu propio código de Oferta. Necesitas que la OTRA persona te envíe su código de Respuesta.");
            return;
        }
        if (!isInitiator && signal.type === 'answer') {
            alert("⚠️ Estás intentando usar un código de Respuesta, pero tú no has generado una Oferta aún.");
            return;
        }
    } catch (e) {
        alert("❌ Código inválido o corrupto. Asegúrate de copiarlo completo.");
        return;
    }

    try {
        if (!peerConnection || peerConnection.connectionState === 'closed') initPeerConnection();

        generateLinkBtn.disabled = true;
        connectBtn.disabled = true;
        connectBtn.textContent = "Procesando...";

        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));

        if (signal.type === 'offer') {
            // Somos el receptor
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            await waitForIceGathering();
            
            const answerData = btoa(JSON.stringify(peerConnection.localDescription));
            connectionCode.value = answerData;
            copyLinkBtn.style.display = 'inline-block';
            
            // [FIX] UX: Aviso crucial para que no se pierda el código
            alert("🔄 ¡Respuesta generada! Tu código ha cambiado en el cuadro de texto. CóPIALO y envíalo de vuelta a la persona que te dio la Oferta.");
        } else if (signal.type === 'answer') {
            // Somos el iniciador, la conexión se establece automáticamente
            alert("✅ Código de respuesta aceptado. Conexión en curso...");
        }

    } catch (e) {
        alert("❌ Error de emparejamiento WebRTC: " + e.message);
        console.error(e);
        setConnectionStatus(false);
    } finally {
        connectBtn.textContent = "Conectar"; 
        updateUI();
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
        // [FIX] Asegurar descarga y nombre de archivo correcto
        downloadLink.download = `grabacion_${new Date().toISOString().slice(0,19)}.webm`; 
        downloadLink.style.display = 'inline-block';
        
        recordedChunks = []; 
        mediaRecorder = null; // [FIX] Limpiar referencia
        updateUI();
    };

    mediaRecorder.start(100); 
    updateUI();
});

stopRecordBtn.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        // updateUI se llamará automáticamente en el onstop
    }
});
