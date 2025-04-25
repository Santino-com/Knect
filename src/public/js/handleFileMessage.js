export function handleFileMessage(data) {
    const mensajesDiv = document.getElementById('mensajes');
    const div = document.createElement('div');
    div.classList.add('mb-3');

    if (data.type === 'image') {
        div.innerHTML = `<div class="card shadow-sm border-0">
                            <div class="card-body p-3">
                                <div class="d-flex flex-column">
                                    <div class="d-flex align-items-center mb-2">
                                        <strong class="me-auto">${data.nombre}</strong>
                                        <small class="text-muted">${data.fecha}</small>
                                    </div>
                                    <div class="message-content">
                                        <img src="${data.url}" class="img-fluid rounded mb-2" style="max-width: 300px;" alt="Sent image">
                                    </div>
                                </div>
                            </div>
                        </div>`;

    } else if (data.format === 'pdf') {
        div.innerHTML = `<iframe src="${data.url}" width="300" height="400" style="border:none;"></iframe>`;
    } else {
        div.innerHTML = `<a href="${data.url}" target="_blank" class="file-link">📄 Ver archivo</a>`;
    }
    mensajesDiv.appendChild(div);
}