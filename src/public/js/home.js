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

function updateNotificationBadge(userId, status) {
    // Buscar todos los elementos con la clase badge que correspondan al usuario
    const badges = document.querySelectorAll(`.badge[data-id="${userId}"]`);
    
    badges.forEach(badge => {
        if (status) {
            badge.style.background = 'green';
            badge.style.display = 'inline-block';
        } else {
            badge.style.background = 'white';
            badge.style.display = 'none';
        }
    });
    
    // Si no existen badges para este usuario, podríamos crear uno en algún lugar visible
    // como el nav-bar o junto al nombre del usuario en la lista de amigos
    if (badges.length === 0 && status) {
        const friendItem = document.querySelector(`li[data-id="${userId}"]`);
        if (friendItem) {
            const notificationDot = document.createElement('span');
            notificationDot.className = 'badge rounded-pill bg-success ms-2';
            notificationDot.dataset.id = userId;
            notificationDot.innerHTML = '●';
            friendItem.appendChild(notificationDot);
        }
    }
}

initializeSocket();