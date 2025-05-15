import { generateRoomId } from './public/js/room-id.js';
import { UserRepository } from './model/user-repository.js';
import { connection } from './database/connection.js';
import { v2 as cloudinary } from 'cloudinary';
import CryptoJS from 'crypto-js';

cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.API_KEY,
    api_secret: process.env.API_SECRET
});


// const upload = multer({ dest: 'uploads/' });

const onlineUsers = new Map();
const roomUsers = new Map();
const roomTeam = new Map();

// function encryptMessage(message, secret) {
//     const ciphertext = CryptoJS.AES.encrypt(message, secret).toString();
//     return ciphertext;
// }



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
            roomUsers.delete(userId);

            const rooms = io.sockets.adapter.sids.get(socket.id);
            if (rooms) {
                rooms.forEach(room => {
                    if (room !== socket.id) { // No hacer leave de la sala propia del socket
                        socket.leave(room);
                        console.log(`Usuario ${userId} abandonó la sala ${room} al desconectarse.`);
                    }
                });
            }

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
        console.log('Usuarios online:', Array.from(roomUsers.entries()));

        console.log(`Este es la cantidad de usuarios conectados al mismo chat ${roomUsers.size}`)


        await UserRepository.deleteNotification(currentUserId, 'individual');
        socket.emit('clear-notifications', contactId);
        const previusMessages = await UserRepository.getMessages(roomId);
        socket.emit('chat-started', previusMessages, roomId);
    });

    socket.on('start-chat-team', async (teamId, currentUserId) => {
        socket.join(teamId);
        socket.join(currentUserId);


        // if (!roomTeam.has(teamId)) {
        //     roomTeam.set(teamId, new Set());
        // }

        // roomTeam.get(teamId).add(currentUserId);
        // console.log('Usuarios online:', Array.from(roomTeam.entries()));


        //socket.teamData = { teamId, userId: currentUserId };
        await UserRepository.deleteNotification(teamId, 'equipo');
        socket.emit('clear-notifications', teamId);
        const previousMessages = await UserRepository.getTeamMessages(teamId);
        socket.emit('chat-started', previousMessages, teamId);
    });

    socket.on('leave-chat', (contactId, currentUserId) => {
        socket.leave(contactId);
        console.log(`Usuario ${currentUserId} ha dejado la sala del equipo ${contactId}`);
    });


    socket.on('chat message', async (msg, room, contactId) => {
        const userName = socket.handshake.auth.userName;
        const currentUser = await UserRepository.getInfo(userName);
        // const encryptionEnabled = await UserRepository.getEncryptionPreference(contactId);
        // let finalMessage
        // let isEncryptated = false;

        // if (encryptionEnabled === 1) {
        //     const secret = 'Clave_Ultra_segura';
        //     finalMessage = encryptMessage(msg, secret);
        //     isEncryptated = true;
        // }

        const saveMensaje = await UserRepository.insertMessage(currentUser[0].id_usuario, msg, room);
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



        // Siempre enviar el mensaje al emisor
        socket.emit('chat message', messageData.contenido, messageData.id_mensaje, messageData.fecha_envio, messageData.emisor);

        // Verificar si el contacto está conectado y en la misma sala
        const contactSocketId = onlineUsers.get(String(contactId));
        const contactRoomId = roomUsers.get(String(contactId));

        console.log("Info de salas:", {
            room,
            contactId,
            contactRoomId,
            contactSocketId,
            currentUser: currentUser[0].id_usuario
        });

        if (contactRoomId === room) {
            console.log(`Enviando mensaje a usuario ${contactId} en sala ${room}`);
            io.to(contactSocketId).emit('chat message', messageData.contenido, messageData.id_mensaje, messageData.fecha_envio, messageData.emisor);
        } else {
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

    socket.on('team message', async (msg, teamId) => {
        const userName = socket.handshake.auth.userName;
        const currentUser = await UserRepository.getInfo(userName);

        const saveMessage = await UserRepository.insertMessage(currentUser[0].id_usuario, msg, teamId);
        if (!saveMessage) {
            throw new Error('Error al guardar el mensaje del equipo');
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

        // ENVÍA EL MENSAJE A TODA LA SALA (teamId) en lugar de a cada socket individualmente
        io.to(teamId).emit('team message', messageData.contenido, messageData.id_mensaje, messageData.fecha_envio, messageData.emisor);

        console.log(`Mensaje enviado al equipo ${teamId}`);

        // Además, si quieres notificar a los que NO están en la sala
        const teamMembers = await UserRepository.getTeamMembers(teamId);
        for (const member of teamMembers) {
            const memberSocketId = onlineUsers.get(String(member.id_usuario));
            console.log(`Verificando notificacion para usuario ${member.id_usuario}, socket ID: ${memberSocketId}`);
            const rooms = await io.sockets.adapter.sids.get(memberSocketId);
            console.log(`Salas del usuario ${member.id_usuario}:`, rooms);
            const isInRoom = rooms && rooms.has(teamId);
            console.log(`¿Usuario ${member.id_usuario} está en la sala ${teamId}?:`, isInRoom);

            if (memberSocketId && !isInRoom) {
                try {
                    await UserRepository.setNotification(member.id_usuario, lastMessage[0].id_mensaje);
                    io.to(memberSocketId).emit('notification', teamId);
                    console.log(`Notificación enviada a usuario ${member.id_usuario} para el equipo ${teamId}`);
                } catch (error) {
                    console.error("Error al crear o enviar notificación:", error);
                }
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