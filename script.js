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
let currentFacingMode = 'user'; // 'user' para frontal, 'environment' para trasera

const config = { 
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ] 
};

// ==============================================
// LÓGICA PRINCIPAL DE TRANSMISIÓN
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

    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    localVideo.srcObject = localStream;
    
    try {
        await localVideo.play();
    } catch (e) {
        console.error("Error al reproducir video local:", e);
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

        startStreamBtn.disabled = true;
        stopStreamBtn.disabled = false;
        startRecordBtn.disabled = false;
        generateLinkBtn.disabled = false; 
        connectBtn.disabled = false;

        // Inicializamos la conexión y le cargamos el stream actual inmediatamente
        initPeerConnection(); 

    } catch (error) {
        console.error('Error:', error);
        alert('❌ No se pudo acceder a la cámara o micrófono. Revisa los permisos o asegúrate de usar HTTPS.');
    }
});

switchCameraBtn.addEventListener('click', async () => {
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    
    try {
        await getMediaStream(currentFacingMode);
        
        if (peerConnection) {
            const videoTrack = localStream.getVideoTracks()[0];
            const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) {
                sender.replaceTrack(videoTrack);
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
    remoteVideo.srcObject = null;

    if (peerConnection) {
        peerConnection.ontrack = null;
        peerConnection.oniceconnectionstatechange = null;
        peerConnection.onicecandidate = null;
        peerConnection.close();
    }

    if (mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.stop();

    peerConnection = null;
    isInitiator = false;
    connectionCode.value = "";
    copyLinkBtn.style.display = 'none';
    switchCameraBtn.style.display = 'none';
    remoteStatus.textContent = "Desconectado";
    remoteStatus.classList.remove('connected');

    startStreamBtn.disabled = false;
    stopStreamBtn.disabled = true;
    startRecordBtn.disabled = true;
    stopRecordBtn.disabled = true;
    generateLinkBtn.disabled = true;
    connectBtn.disabled = true;
});

// ==============================================
// 🔹 SISTEMA DE CONEXIÓN REMOTA
// ==============================================

function initPeerConnection() {
    // Si ya existe una conexión activa con tracks, evitamos destruirla innecesariamente
    if (peerConnection) return;
    
    peerConnection = new RTCPeerConnection(config);

    if (localStream) {
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    }

    peerConnection.ontrack = event => {
        if (event.streams && event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
            remoteVideo.play().catch(e => console.error("Error al reproducir video remoto:", e));
            remoteStatus.textContent = "✅ CONECTADO";
            remoteStatus.classList.add('connected');
        }
    };

    peerConnection.oniceconnectionstatechange = () => {
        if (peerConnection.iceConnectionState === 'disconnected' || peerConnection.iceConnectionState === 'failed') {
            remoteVideo.srcObject = null;
            remoteStatus.textContent = "Desconectado";
            remoteStatus.classList.remove('connected');
        }
    };
}

function waitForIceGathering(timeout = 10000) {
    return new Promise((resolve, reject) => {
        if (!peerConnection) return reject(new Error("PeerConnection no inicializado."));
        if (peerConnection.iceGatheringState === 'complete') {
            resolve();
            return;
        }

        let timer = setTimeout(() => {
            peerConnection.removeEventListener('icegatheringstatechange', checkState);
            reject(new Error("La recolección de candidatos ICE tardó demasiado."));
        }, timeout);

        const checkState = () => {
            if (peerConnection.iceGatheringState === 'complete') {
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
        generateLinkBtn.disabled = false;
        connectBtn.disabled = false;
    }
});

copyLinkBtn.addEventListener('click', () => {
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
    connectionCode.setSelectionRange(0, 99999); 
    document.execCommand('copy');
    alert("📋 Código copiado!");
}

connectionCode.addEventListener('focus', () => {
    if (copyLinkBtn.style.display === 'inline-block') {
        connectionCode.value = "";
        copyLinkBtn.style.display = 'none';
    }
});

connectBtn.addEventListener('click', async () => {
    const codigoIngresado = connectionCode.value.trim();
    if (!codigoIngresado) {
        alert("⚠️ Por favor, pega primero el código.");
        return;
    }

    try {
        const decoded = atob(codigoIngresado);
        const signal = JSON.parse(decoded);

        initPeerConnection();

        generateLinkBtn.disabled = true;
        connectBtn.disabled = true;
        const originalText = connectBtn.textContent;
        connectBtn.textContent = "Conectando...";

        // Si soy el iniciador y me pasan una oferta externa, reinicio la lógica
        if (isInitiator && signal.type === 'offer') {
            if (peerConnection) peerConnection.close();
            peerConnection = null;
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
            alert("✅ Procesando Respuesta. Conexión en curso...");
        }

    } catch (e) {
        alert("❌ Código inválido o error de emparejamiento.");
        console.error(e);
    } finally {
        generateLinkBtn.disabled = false;
        connectBtn.disabled = false;
        connectBtn.textContent = "Conectar"; 
    }
});

// ==============================================
// LÓGICA DE GRABACIÓN
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
        
        if (downloadLink.href.startsWith('blob:')) {
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
