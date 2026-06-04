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
        // Obtener cámara y micrófono con buena calidad
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: { ideal: 1280 }, height: { ideal: 720 } }, 
            audio: { echoCancellation: true, noiseSuppression: true } 
        });
        
        localVideo.srcObject = localStream;
        
        // Habilitar botones
        startStreamBtn.disabled = true;
        stopStreamBtn.disabled = false;
        startRecordBtn.disabled = false;
        generateLinkBtn.disabled = false; // Ya se puede generar código
        connectBtn.disabled = false;

        initPeerConnection(); // Preparar conexión

    } catch (error) {
        console.error('Error:', error);
        alert('❌ No se pudo acceder a la cámara o micrófono. Revisa los permisos.');
    }
});

stopStreamBtn.addEventListener('click', () => {
    // Detener video y audio
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;

    // Cerrar conexión remota
    if (peerConnection) peerConnection.close();

    // Detener grabación si está activa
    if (mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.stop();

    // Reiniciar todo
    peerConnection = null;
    connectionCode.value = "";
    copyLinkBtn.style.display = 'none';
    remoteStatus.textContent = "Desconectado";
    remoteStatus.classList.remove('connected');

    // Deshabilitar botones
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

// Inicializar la conexión WebRTC
function initPeerConnection() {
    peerConnection = new RTCPeerConnection(config);

    // Enviar mi video/audio al otro dispositivo
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    // Recibir el video/audio del otro dispositivo
    peerConnection.ontrack = event => {
        if (event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
            remoteStatus.textContent = "✅ CONECTADO";
            remoteStatus.classList.add('connected');
        }
    };

    // Manejo de desconexión
    peerConnection.oniceconnectionstatechange = () => {
        if (peerConnection.iceConnectionState === 'disconnected' || peerConnection.iceConnectionState === 'failed') {
            remoteVideo.srcObject = null;
            remoteStatus.textContent = "Desconectado";
            remoteStatus.classList.remove('connected');
        }
    };

    // Cuando se generan los datos para conectar
    peerConnection.onicecandidate = event => {
        // Cuando ya tenemos todos los datos necesarios
        if (!event.candidate) {
            // Convertimos los datos a texto codificado para que sea fácil de copiar/pegar
            const connectionData = btoa(JSON.stringify(peerConnection.localDescription));
            connectionCode.value = connectionData;
            copyLinkBtn.style.display = 'inline-block'; // Mostrar botón de copiar
        }
    };
}

// Generar el código de conexión
generateLinkBtn.addEventListener('click', async () => {
    if (!peerConnection) initPeerConnection();

    try {
        // Creamos la oferta para conectarse
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        alert("🔑 Código generado! Copialo y envíalo a quien quieras que te vea.");
    } catch (e) {
        alert("Error al generar el código: " + e.message);
    }
});

// Copiar código al portapapeles
copyLinkBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(connectionCode.value)
        .then(() => alert("📋 Código copiado al portapapeles!"))
        .catch(() => alert("No se pudo copiar, selecciónalo manualmente."));
});

// Conectar usando un código recibido
connectBtn.addEventListener('click', async () => {
    // Clear textarea and prompt user to paste
    connectionCode.value = '';
    connectionCode.focus();
    alert("⚠️ Pega el código que te enviaron en el cuadro de texto y presiona Aceptar.");
    
    const codigoIngresado = connectionCode.value.trim();
    if (!codigoIngresado) {
        alert("No se ingresó ningún código.");
        return;
    }

    try {
        // Decodificamos el texto
        const signal = JSON.parse(atob(codigoIngresado));

        if (!peerConnection) initPeerConnection();

        // Enviamos nuestros datos al otro dispositivo
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));

        // Si lo que recibimos es una petición, generamos nuestra respuesta automáticamente
        if (signal.type === 'offer') {
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            alert("🔄 Respuesta lista! Ahora copia el código nuevo que aparezca y envíaselo de vuelta.");
        } else if (signal.type === 'answer') {
            alert("✅ Conexión establecida exitosamente.");
        }

    } catch (e) {
        alert("❌ Código inválido o error al conectar. Verifica que sea el texto correcto.");
        console.error(e);
    }
});

// ==============================================
// LÓGICA DE GRABACIÓN (COMPLETADA Y CORREGIDA)
// ==============================================
startRecordBtn.addEventListener('click', () => {
    recordedChunks = [];
    let options;

    // Buscar códec compatible
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

    // Fixed variable from 'event' to 'e'
    mediaRecorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) {
            recordedChunks.push(e.data);
        }
    };

    mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        recordedVideo.src = url;
        downloadLink.href = url;
        downloadLink.style.display = 'inline-block';
    };

    mediaRecorder.start(100); // Collect data every 100ms
    startRecordBtn.disabled = true;
    stopRecordBtn.disabled = false;
});

// Added missing stop record button logic
stopRecordBtn.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        startRecordBtn.disabled = false;
        stopRecordBtn.disabled = true;
    }
});
