let localStream;
let peerConnection;
let remoteUserId;
const videoCallModal = document.getElementById('videoCallModal');
const hangUpBtn = document.getElementById('hangUpBtn');
const closeVideoCallModalBtn = document.getElementById('closeVideoCallModal');
import { socket } from './mensaje.js';
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

async function getLocalStream() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.srcObject = stream;
        }
        localStream = stream;
        return stream;
    } catch (error) {
        console.error('Error al obtener la transmisión de medios:', error);
        // Podrías mostrar un mensaje al usuario indicando que no se pudo acceder a la cámara/micrófono
        return null;
    }
}

function createPeerConnection() {
    peerConnection = new RTCPeerConnection(configuration);

    peerConnection.ontrack = (event) => {
        const remoteVideo = document.getElementById('remoteVideo');
        if (remoteVideo && event.streams && event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
        }
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate && remoteUserId) {
            socket.emit('ice-candidate', event.candidate, remoteUserId);
        }
    };

    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }
}

async function callUser(calleeId) {
    remoteUserId = calleeId;
    createPeerConnection();
    console.log(`${remoteUserId} Esta llamando crack`)

    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('offer', offer, calleeId);
    } catch (error) {
        console.error('Error al crear y enviar la oferta:', error);
        // Manejar el error, por ejemplo, mostrar un mensaje al usuario
        closeVideoCall(); // Cerrar el modal si falla la llamada
    }
}

function handleIncomingCall(callerId) {
    // Aquí podrías mostrar una notificación visual más atractiva
    const shouldAccept = confirm(`¿Quieres aceptar la videollamada de ${callerId}?`);
    if (shouldAccept) {
        remoteUserId = callerId;
        createPeerConnection();
        answerCall();
        if (videoCallModal) videoCallModal.style.display = 'flex'; // Asegurarse de que el modal esté visible
    } else {
        socket.emit('call-rejected', { reason: 'El usuario rechazó la llamada', calleeId: callerId });
    }
}

async function answerCall() {
    try {
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', answer, remoteUserId);
    } catch (error) {
        console.error('Error al crear y enviar la respuesta:', error);
        closeVideoCall();
    }
}

socket.on('incoming-call', (callerId) => {
    handleIncomingCall(callerId);
});

socket.on('offer', async (offer, callerId) => {
    remoteUserId = callerId;
    createPeerConnection();
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        await answerCall();
        if (videoCallModal) videoCallModal.style.display = 'flex';
    } catch (error) {
        console.error('Error al procesar la oferta:', error);
        closeVideoCall();
    }
});

socket.on('answer', async (answer) => {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
        console.error('Error al procesar la respuesta:', error);
        closeVideoCall();
    }
});

socket.on('ice-candidate', async (candidate) => {
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
        console.error('Error al añadir el candidato ICE:', error);
    }
});

function closeVideoCall() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    if (videoCallModal) videoCallModal.style.display = 'none';
    remoteUserId = null;
    // Podrías también limpiar las fuentes de video en el HTML
    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    if (localVideo) localVideo.srcObject = null;
    if (remoteVideo) remoteVideo.srcObject = null;
}

if (hangUpBtn) {
    hangUpBtn.addEventListener('click', () => {
        if (remoteUserId) {
            socket.emit('hang-up', remoteUserId);
        }
        closeVideoCall();
    });
}

socket.on('hang-up', () => {
    closeVideoCall();
});

if (closeVideoCallModalBtn) {
    closeVideoCallModalBtn.addEventListener('click', closeVideoCall);
}

// Event listener para el botón de videollamada en la lista de contactos
document.querySelectorAll('.videoCallBtn').forEach(button => {
    button.addEventListener('click', async () => {
        const recipientId = button.dataset.id;
        remoteUserId = recipientId;
        videoCallModal.style.display = 'flex';
        if (!localStream) {
            await getLocalStream(); // Obtener la transmisión local solo al abrir el modal
            if (localStream) {
                callUser(recipientId); // Iniciar la llamada solo si se obtuvo la transmisión
            } else {
                // Si no se pudo obtener la transmisión, cerrar el modal o mostrar un error
                videoCallModal.style.display = 'none';
                alert('No se pudo acceder a la cámara y/o micrófono.');
            }
        } else {
            callUser(recipientId); // Si ya tenemos la transmisión, iniciar la llamada directamente
        }
    });
});
