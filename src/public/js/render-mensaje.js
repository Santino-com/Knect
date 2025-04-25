export function renderTextMessage(nombre, contenido, fecha) {
    const div = document.createElement('div');
    div.innerHTML = `
            <div class="message-container d-flex mb-3">
                <div style="max-width: 80%;">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <strong>${nombre}</strong>
                    </div>
                    <p class="mb-1">${contenido}</p>
                    <small class="text-muted">${fecha}</small>
                </div>
            </div>`;
    mensajes.appendChild(div);
    mensajes.scrollTop = mensajes.scrollHeight;
}

export function renderFileMessage(nombre, fecha_envio, multimedia) {
    const div = document.createElement('div');
    div.innerHTML = `
                <div class="card shadow-sm mb-3 border-0">
                    <div class="card-body p-3">
                        <div class="d-flex flex-column">
                        <div class="d-flex align-items-center mb-2">
                            <strong class="me-auto">${nombre}</strong>
                            <small class="text-muted">${fecha_envio}</small>
                        </div>
                        <div class="message-content">
                            <img src="${multimedia}" class="img-fluid rounded mb-2" style="max-width: 300px;" alt="Sent image">
                        </div>
                        </div>
                    </div>
                </div>
            `;
    mensajes.appendChild(div);
    mensajes.scrollTop = mensajes.scrollHeight;

}

