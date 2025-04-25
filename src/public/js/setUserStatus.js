export function setUserStatus(userId, online) {
    const buttons = document.querySelectorAll('.friends');
    buttons.forEach((button) => {
        if (button.dataset.id == userId) {
            button.style.border = online ? '2px solid green' : 'none';
        }
    });
}
