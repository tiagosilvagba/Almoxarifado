export function setProgress(percent, msg, type='info') {
    window.loaderProgress = percent;
    const bar = document.getElementById('loader-bar');
    const text = document.getElementById('loader-percent');
    if(bar) bar.style.width = `${percent}%`;
    if(text) text.innerText = `${Math.round(percent)}%`;
    if(msg) addLog(msg, type);
}

export function addLog(msg, type='info') {
    const logs = document.getElementById('loader-logs');
    if(logs) {
        let classe = type === 'error' ? 'class="error"' : type === 'success' ? 'class="success"' : type === 'warning' ? 'class="warning"' : '';
        logs.innerHTML += `<div ${classe}>> ${msg}</div>`;
        logs.scrollTop = logs.scrollHeight;
    }
}

export function mostrarErroLoaderFatal() {
    const ring = document.getElementById('loader-ring');
    const btn = document.getElementById('btn-fallback');
    if(ring) ring.classList.add('error');
    if(btn) btn.style.display = 'block';
}

export function fecharLoader() {
    const loader = document.getElementById('tech-loader');
    const app = document.getElementById('app-layout');
    if(loader && app) {
        loader.style.opacity = '0';
        app.style.opacity = '1';
        setTimeout(() => loader.style.display = 'none', 600);
    }
}

export function mostrarToast(mensagem, tipo = 'info') {
    const container = document.getElementById('toast-container');
    if(!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.innerText = mensagem;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 5000);
}