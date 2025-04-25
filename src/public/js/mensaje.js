import { renderTextMessage, renderFileMessage } from "./render-mensaje.js";
import { setUserStatus } from './setUserStatus.js';
import { handleChatStarted } from "./handleChatStarted.js";
import { handleFileMessage } from "./handleFileMessage.js";

const body = document.querySelector('body');
const userId = body.dataset.userId;
const userName = body.dataset.userName;

let currentRoomId = 0;
let contactId = 0;
let socket;
export {socket};


function startChat(contactId) {
    const currentUserId = userId;
    socket.emit('start-chat', contactId, currentUserId);
}


const friendItems = document.querySelectorAll(".sendBtn"); //Agregar a cada amigo el eventListener para iniciar un chat a la hora de dar click
friendItems.forEach(item => {
    item.addEventListener('click', () => {
        contactId = item.dataset.id;
        //updateNotificationBadge(contactId, true);
        startChat(contactId);

    });
});


const mensajeInput = document.getElementById('mensajeInput');
const mensajeForm = document.getElementById('formMensaje');

mensajeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = mensajeInput.value.trim();

    if (msg) {
        socket.emit('chat message', msg, currentRoomId, contactId);
        mensajeInput.value = '';
        mensajeInput.focus();
    }

});




async function initializeSocket() {
    socket = io({
        auth: {
            serverOffset: 0,
            userName: userName,
            userId: userId,
            roomId: currentRoomId
        }
    });

    socket.on('connect', () => {
        handleConnect();
    });

    socket.on('disconnect', () => {
        handleDisconnect();
    });

    socket.on('online', (onlineUserId) => {
        setUserStatus(onlineUserId, true);
    });

    socket.on('offline', (offlineUserId) => {
        setUserStatus(offlineUserId, false);
    });

    socket.on('chat-started', (previusMessages, roomId) => {
        currentRoomId = handleChatStarted(previusMessages, roomId);
    });

    socket.on('chat message', (msg, serverOffset, fecha, username) => {
        handleChatMessage(msg, serverOffset, fecha, username);
    });

    socket.on('notification', (userId) => {
        updateNotificationBadge(userId, true);
    });

    socket.on('clear-notifications', (userId) => {
        console.log(`Intento de borrar notifiaciones de ${userId}`)
        updateNotificationBadge(userId, false);
    });

    socket.on('fileMessage', (data) => {
        handleFileMessage(data);
    });

    socket.on('connect_error', (error) => {
        console.error("Error de conexión:", error);
    });

}
initializeSocket()

function handleConnect() {
    if (userId) {
        console.log(`Usuario ${userId} conectado`);
        //Inicializamos el conteo de notificaciones del usuario
        //notificationCount.set(userId, {});
    }
}

function handleDisconnect() {
    if (userId) {
        console.log(`Usuario ${userId} desconectado`);
    }
}

function handleChatMessage(msg, serverOffset, fecha, username) {
    renderTextMessage(username, msg, fecha);
    socket.auth.serverOffset = serverOffset;
}

function updateNotificationBadge(userId, status) { // <-- Recibir roomId
    const notis = document.querySelectorAll('.badge');
    notis.forEach((noti) => {
        if (noti.dataset.id == userId) {
            noti.style.background = status ? 'green' : 'white';
        }
    });
}







