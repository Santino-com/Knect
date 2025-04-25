import { renderTextMessage, renderFileMessage } from "./render-mensaje.js";


export function handleChatStarted(previusMessages, roomId) {
    let currentRoomId = roomId;
    console.log('Chat iniciado en la sala:', currentRoomId);

    const mensajesDiv = document.getElementById('mensajes');
    mensajesDiv.innerHTML = ''; // Limpiar mensajes anteriores


    previusMessages.forEach(msg => {
        if (!msg.multimedia) {
            renderTextMessage(msg.nombre, msg.contenido, msg.fecha_envio);
        } else {
            renderFileMessage(msg.nombre, msg.fecha_envio, msg.multimedia);
        }
    });

    return currentRoomId
}