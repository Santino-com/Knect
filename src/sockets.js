import { generateRoomId } from './public/js/room-id.js';
import { UserRepository } from './model/user-repository.js';
import { connection } from './database/connection.js';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';



cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.API_KEY,
    api_secret: process.env.API_SECRET
});

const upload = multer({ dest: 'uploads/' });

const onlineUsers = new Map();
let roomUsers = new Map();


export async function socketHandlers(io, socket) {
    const userId = socket.handshake.auth.userId;
    const page = socket.handshake.auth.page || 'unknown';

    console.log(`Nuevo socket conectado. userId: ${userId}, página: ${page}`);

    if (userId) {
        onlineUsers.set(userId, socket.id);
        //console.log(onlineUsers)
        socket.broadcast.emit('online', userId);

        for (const [onlineUserId, _] of onlineUsers) {
            if (onlineUserId !== userId) {
                socket.emit('online', onlineUserId);
            }
        }
    }

    socket.on('disconnect', () => {
        if (userId) {
            onlineUsers.delete(userId);
            roomUsers.delete(userId)
            socket.broadcast.emit('offline', userId);
            console.log(`Usuario ${userId} desconectado`);
        }
    });





    socket.on('start-chat', async (contactId, currentUserId) => {

        const roomId = generateRoomId(contactId, currentUserId);
        socket.join(roomId);
        socket.join(currentUserId);

        if (roomUsers.has(currentUserId))
            roomUsers.delete(currentUserId);


        roomUsers.set(currentUserId, roomId);

        console.log(`Este es la cantidad de usuarios conectados al mismo chat ${roomUsers.size}`)


        await UserRepository.deleteNotification(currentUserId);
        socket.emit('clear-notifications', contactId);
        const previusMessages = await UserRepository.getMessages(roomId);
        socket.emit('chat-started', previusMessages, roomId);
    });



    socket.on('chat message', async (msg, room, contactId) => {
        const userName = socket.handshake.auth.userName;
        const currentUser = await UserRepository.getInfo(userName);
        const saveMensaje = await UserRepository.insertMessage(currentUser[0].id_usuario, msg, room);
        if (!saveMensaje) {
            throw new Error('Error al guardar el mensaje');
        }

        //const roomId = generateRoomId(contactId, currentUser[0].id_usuario);


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

        // Siempre enviar el mensaje al emisor
        socket.emit('chat message', messageData.contenido, messageData.id_mensaje, messageData.fecha_envio, messageData.emisor);

        // Verificar si el contacto está conectado y en la misma sala
        const contactSocketId = onlineUsers.get(contactId);
        const contactRoomId = roomUsers.get(contactId);

        console.log("Info de salas:", {
            room,
            contactId,
            contactRoomId,
            contactSocketId,
            currentUser: currentUser[0].id_usuario
        });

        // Si el contacto está en la misma sala, enviar mensaje
        if (contactRoomId === room) {
            console.log(`Enviando mensaje a usuario ${contactId} en sala ${room}`);
            io.to(contactSocketId).emit('chat message', messageData.contenido, messageData.id_mensaje, messageData.fecha_envio, messageData.emisor);
        } else {
            // Si no está en la misma sala 
            console.log(`Creando notificación para usuario ${contactId}`);

            try {
                await UserRepository.setNotification(contactId, lastMessage[0].id_mensaje);

                // Si el usuario está conectado en otra página, enviar notificación
                if (contactSocketId) {
                    io.to(contactSocketId).emit('notification', currentUser[0].id_usuario);
                }
            } catch (error) {
                console.error("Error al crear o enviar notificación:", error);
            }
        }
    });


    socket.on('file message', async (data) => {
        const { file, currentRoomId, contactId, fileName, fileType } = data;
        const userName = socket.handshake.auth.userName;
        const currentUser = await UserRepository.getInfo(userName);

        try {
           
            const result = await cloudinary.uploader.upload(file, {
                resource_type: 'auto',
                public_id: `chat/${fileName}-${Date.now()}` // nombre personalizado opcional
            });

            await UserRepository.insertMultimedia(currentUser[0].id_usuario, result.secure_url, currentRoomId);


            const lastMessage = await UserRepository.getLastMessage();

            const messageData = {
                url: result.secure_url,
                type: result.resource_type,
                id_mensaje: lastMessage[0].id_mensaje,
                fecha: lastMessage[0].fecha_envio.toLocaleString('es-ES', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: 'numeric'
                }),
                nombre: userName
            };

            socket.emit('file-message', messageData);

            // Verificar si el contacto está en la misma sala
            const contactSocketId = onlineUsers.get(contactId);
            const contactRoomId = roomUsers.get(contactId);

            if (contactRoomId === currentRoomId) {
                io.to(contactSocketId).emit('file-message', messageData);
            } else {
                await UserRepository.setNotification(contactId, lastMessage[0].id_mensaje);

                if (contactSocketId) {
                    io.to(contactSocketId).emit('notification', currentUser[0].id_usuario);
                }
            }

        } catch (error) {
            console.error("Error al procesar mensaje multimedia:", error);
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