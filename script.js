// Add new DOM element references
const createOfferBtn = document.getElementById('createOfferBtn');
const localDescription = document.getElementById('localDescription');
const copyLocalBtn = document.getElementById('copyLocalBtn');
const remoteDescription = document.getElementById('remoteDescription');
const acceptOfferBtn = document.getElementById('acceptOfferBtn');
const iceCandidateInput = document.getElementById('iceCandidateInput');
const addIceBtn = document.getElementById('addIceBtn');

// Modify the existing setupPeerConnection function
function setupPeerConnection() {
    peerConnection = new RTCPeerConnection(config);

    // Add local tracks to the connection
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    // Receive remote tracks
    peerConnection.ontrack = event => {
        remoteVideo.srcObject = event.streams[0];
    };

    // Handle ICE candidates generated locally
    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            // In a real app, you would send this to the remote peer via a signaling server.
            // Here, we append it to the local description for manual copying.
            localDescription.value = JSON.stringify(peerConnection.localDescription);
        }
    };
}

// Create Offer (The initiator / Emisor)
createOfferBtn.addEventListener('click', async () => {
    setupPeerConnection();
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    localDescription.value = JSON.stringify(offer);
});

// Accept Offer (The receiver / Receptor) and create Answer
acceptOfferBtn.addEventListener('click', async () => {
    if (!peerConnection) setupPeerConnection(); // Ensure connection exists for receiver
    
    const remoteDesc = JSON.parse(remoteDescription.value);
    await peerConnection.setRemoteDescription(remoteDesc);

    // If the pasted description is an offer, create an answer
    if (remoteDesc.type === 'offer') {
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        localDescription.value = JSON.stringify(answer);
    }
});

// Add remote ICE candidates manually
addIceBtn.addEventListener('click', async () => {
    if (!peerConnection) return;
    try {
        const candidate = JSON.parse(iceCandidateInput.value);
        await peerConnection.addIceCandidate(candidate);
        iceCandidateInput.value = ''; // Clear input after success
    } catch (e) {
        console.error('Error adding ICE candidate', e);
    }
});

// Copy local description to clipboard
copyLocalBtn.addEventListener('click', () => {
    localDescription.select();
    document.execCommand('copy');
    alert('Link local copiado. Envíalo al otro móvil.');
});
