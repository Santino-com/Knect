import { setUserStatus } from './setUserStatus.js';

const body = document.querySelector('body');
const userId = body.dataset.userId;
const userName = body.dataset.userName;

let socket;

function initializeSocket() {
    socket = io({
        auth: {
            serverOffset: 0,
            userName: userName,
            userId: userId,
            page: 'home'
        }
    });

    socket.on('connect', () => {
        console.log(`Usuario ${userId} conectado desde home`);
    });

    socket.on('notification', async (senderUserId) => {

        console.log("Recibida notificación de:", senderUserId);

        let senderName = "Usuario";


        const notificationContainer= document.getElementById('notifications-container');


        if (notificationContainer) {
            const newNotification = document.createElement('div');
            newNotification.className = 'card-body';

            const now = new Date();
            const formattedDate = now.toLocaleString('es-ES', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric'
            });

            newNotification.innerHTML = `
                <p>${senderName}</p>
                <p>Te ha enviado un nuevo mensaje</p>
                <small class="text-muted">${formattedDate}</small>
            `;

            notificationContainer.appendChild(newNotification);  
        }
    });


    socket.on('clear-notifications', (userId) => {
        //updateNotificationBadge(userId, false);
    });

    socket.on('online', (onlineUserId) => {
        setUserStatus(onlineUserId, true);
    });

    socket.on('offline', (offlineUserId) => {
        setUserStatus(offlineUserId, false);
    });
}


initializeSocket();