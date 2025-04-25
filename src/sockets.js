import { generateRoomId } from './public/js/room-id.js';
import { UserRepository } from './model/user-repository.js';
import { connection } from './database/connection.js';


const onlineUsers = new Map();
let roomUsers = new Map();


export async function socketHandlers(io, socket) {
    const userId = socket.handshake.auth.userId; //Id del cliente conectado

    if (userId) {
        onlineUsers.set(userId, socket.id);
        socket.broadcast.emit('online', userId);
        console.log('currentUserId ' + userId);
        for (const [onlineUserId, _] of onlineUsers) {
            if (onlineUserId !== userId) {
                console.log('onlineUserId ' + onlineUserId);
                socket.emit('online', onlineUserId);
            }
        }

    }

    socket.on('disconnect', () => {
        if (userId) {
            onlineUsers.delete(userId);
            socket.broadcast.emit('offline', userId);
            console.log(`Usuario ${userId} desconectado`);
        }
    });





    socket.on('start-chat', async (contactId, currentUserId) => {
        console.log(`Estas en el chat de ${contactId} y ${currentUserId}. Tu eres ${currentUserId}`);
        const roomId = generateRoomId(contactId, currentUserId);
        socket.join(roomId);
        socket.join(currentUserId);

        if (roomUsers.has(currentUserId))
            roomUsers.delete(currentUserId);


        roomUsers.set(currentUserId, roomId);

        console.log(`Este es la cantidad de usuarios conectados al mismo chat ${roomUsers.size}`)

        socket.emit('clear-notifications', contactId);
        const previusMessages = await UserRepository.getMessages(roomId);
        socket.emit('chat-started', previusMessages, roomId);
    });



    socket.on('chat message', async (msg, room, contactId) => {
        const userName = socket.handshake.auth.userName;
        const currentUser = await UserRepository.getInfo(userName);
        const saveMensaje = await UserRepository.insertMessage(currentUser[0].id_usuario, msg, room);

        const roomId = generateRoomId(contactId, currentUser[0].id_usuario);

        if (!saveMensaje) {
            throw new Error('Error al guardar el mensaje');
        }


        const lastMessage = await UserRepository.getLastMessage();
        const messageData = {
            contenido: msg,
            id_mensaje: lastMessage[0].id_mensaje,
            fecha_envio: lastMessage[0].fecha_envio.toLocaleString('es-ES', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric'
            }),
            emisor: userName
        };

        const contactRoomId = roomUsers.get(contactId);

        if (contactRoomId === room) {
            io.to(room).emit('chat message', messageData.contenido, messageData.id_mensaje, messageData.fecha_envio, messageData.emisor);
        } else {
            io.to(roomId).emit('chat message', messageData.contenido, messageData.id_mensaje, messageData.fecha_envio, messageData.emisor);
            io.to(contactId).emit('notification', currentUser[0].id_usuario);
        }
    });

    if (!socket.recovered) {
        try {
            const [results] = await connection.query(`
                    SELECT m.id_mensaje, m.contenido, m.multimedia, m.fecha_envio, m.room_id, u.nombre AS emisor
                    FROM mensajes m
                    JOIN usuario u ON m.id_emisor = u.id_usuario
                    WHERE m.id_mensaje > ? AND m.room_id = ?`,
                [socket.handshake.auth.serverOffset ?? 0, socket.handshake.auth.roomId ?? 0]

            );

            results.forEach(row => {
                const messageData = {
                    contenido: row.contenido,
                    id_mensaje: row.id_mensaje,
                    fecha_envio: row.fecha_envio.toLocaleString('es-ES', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: 'numeric'
                    }),
                    emisor: row.emisor
                }
                if (!row.multimedia) {
                    socket.to(row.room_id).emit('chat message', messageData.contenido, messageData.id_mensaje, messageData.fecha_envio, messageData.emisor);
                }
            });



        } catch (error) {
            console.error('Error al recuperar mensajes:', error);
        }
    }

}