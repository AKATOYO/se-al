const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const remoteStatus = document.getElementById('remoteStatus');
const startStreamBtn = document.getElementById('startStreamBtn');
const stopStreamBtn = document.getElementById('stopStreamBtn');
const startRecordBtn = document.getElementById('startRecordBtn');
const stopRecordBtn = document.getElementById('stopRecordBtn');
const recordedVideo = document.getElementById('recordedVideo');
const downloadLink = document.getElementById('downloadLink');

// Elementos NUEVOS para conexión remota
const generateLinkBtn = document.getElementById('generateLinkBtn');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const connectionCode = document.getElementById('connectionCode');
const connectBtn = document.getElementById('connectBtn');

let localStream;
let mediaRecorder;
let recordedChunks = [];
let peerConnection;
let isInitiator = false; 

// Servidores para conectar desde cualquier red
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
startStreamBtn.addEventListener('click', async () => {
    try {
        // MEJORA: En móviles, se debe especificar facingMode para elegir la cámara trasera o frontal
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 1280 }, 
                height: { ideal: 720 },
                facingMode: 'user' // Usa 'environment' para cámara trasera
            }, 
            audio: { echoCancellation: true, noiseSuppression: true } 
        });
        
        localVideo.srcObject = localStream;
        // MEJORA: Requerido para reproducción en navegadores móviles iOS/Safari
        localVideo.play().catch(e => console.error("Error playing local video:", e));
        
        startStreamBtn.disabled = true;
        stopStreamBtn.disabled = false;
        startRecordBtn.disabled = false;
        generateLinkBtn.disabled = false; 
        connectBtn.disabled = false;

        initPeerConnection(); 

    } catch (error) {
        console.error('Error:', error);
        alert('❌ No se pudo acceder a la cámara o micrófono. Revisa los permisos.');
    }
});

stopStreamBtn.addEventListener('click', () => {
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;

    // MEJORA: Cerrar y limpiar la conexión peer correctamente para evitar fugas de memoria
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
// 🔹 SISTEMA DE CONEXIÓN REMOTA (GENERAR LINK/CODIGO)
// ==============================================

function initPeerConnection() {
    if (peerConnection) {
        peerConnection.ontrack = null;
        peerConnection.oniceconnectionstatechange = null;
        peerConnection.onicecandidate = null;
        peerConnection.close();
    }
    
    peerConnection = new RTCPeerConnection(config);

    if (localStream) {
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    }

    peerConnection.ontrack = event => {
        if (event.streams && event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
            // MEJORA: Los navegadores móviles requieren play() explícito debido a las políticas de autoplay
            remoteVideo.play().catch(e => console.error("Error playing remote video:", e));
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

    // MEJORA: Manejar candidatos ICE explícitamente para mayor estabilidad
    peerConnection.onicecandidate = event => {
        if (!event.candidate) {
            // La recolección de ICE ha terminado
        }
    };
}

// Helper function to wait for ICE candidates with a timeout
function waitForIceGathering(timeout = 10000) {
    return new Promise((resolve, reject) => {
        if (peerConnection.iceGatheringState === 'complete') {
            resolve();
            return;
        }

        let timer = setTimeout(() => {
            peerConnection.removeEventListener('icegatheringstatechange', checkState);
            reject(new Error("La recolección de candidatos ICE tardó demasiado. Verifica tu conexión a internet."));
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

// Generar el código de conexión
generateLinkBtn.addEventListener('click', async () => {
    if (!peerConnection) initPeerConnection();

    if (isInitiator && peerConnection.localDescription) {
        alert("Ya has generado un código. Copialo y envíalo, o espera la respuesta.");
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

// Copiar código al portapapeles
copyLinkBtn.addEventListener('click', () => {
    // MEJORA: Fallback para navegadores móviles que no soportan clipboard API de forma segura
    if (navigator.clipboard && navigator.clipboard.writeText) {
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
    alert("📋 Código copiado al portapapeles!");
}

// Conectar usando un código recibido
connectBtn.addEventListener('click', async () => {
    const codigoIngresado = connectionCode.value.trim();
    if (!codigoIngresado) {
        alert("⚠️ Por favor, pega primero el código que te enviaron en el cuadro de texto y luego presiona este botón.");
        return;
    }

    try {
        const decoded = atob(codigoIngresado);
        const signal = JSON.parse(decoded);

        if (!peerConnection) initPeerConnection();

        generateLinkBtn.disabled = true;
        connectBtn.disabled = true;
        connectBtn.textContent = "Conectando...";

        // MEJORA: Evitar conflicto de estados. Si ya somos el iniciador y recibimos otra oferta, reiniciamos la conexión.
        if (isInitiator && signal.type === 'offer') {
            peerConnection.close();
            initPeerConnection();
            isInitiator = false;
        }

        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));

        if (signal.type === 'offer') {
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            await waitForIceGathering();
            
            const answerData = btoa(JSON.stringify(peerConnection.localDescription));
            // MEJORA: Se usa un alert para indicar que el código cambió, evitando que el usuario copie el código viejo por error
            connectionCode.value = answerData;
            copyLinkBtn.style.display = 'inline-block';
            
            alert("🔄 Respuesta lista! Ahora copia el código NUEVO que aparece en el cuadro de texto y envíaselo de vuelta. NO uses el código anterior.");
        } else if (signal.type === 'answer') {
            alert("✅ Conexión establecida exitosamente.");
        }

    } catch (e) {
        alert("❌ Código inválido o error al conectar. Verifica que sea el texto correcto y que no tenga espacios extra.");
        console.error(e);
    } finally {
        generateLinkBtn.disabled = false;
        connectBtn.disabled = false;
        connectBtn.textContent = "Conectar con este Código";
    }
});

// ==============================================
// LÓGICA DE GRABACIÓN (COMPLETADA Y CORREGIDA)
// ==============================================
startRecordBtn.addEventListener('click', () => {
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
        // MEJORA: Asegurar reproducción en móvil
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
