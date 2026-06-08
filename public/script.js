document.addEventListener('DOMContentLoaded', () => {
    const analyzeBtn = document.getElementById('analyzeBtn');
    const videoUrlInput = document.getElementById('videoUrl');
    const loadingSection = document.getElementById('loadingSection');
    const previewSection = document.getElementById('previewSection');
    const downloadBtn = document.getElementById('downloadBtn');
    const modal = document.getElementById('metadataModal');
    const closeModal = document.getElementById('closeModal');
    const btnCleanDownload = document.getElementById('btnCleanDownload');
    const btnOriginalDownload = document.getElementById('btnOriginalDownload');
    const toast = document.getElementById('toast');

    let currentVideoData = null;

    // Analizar Video
    analyzeBtn.addEventListener('click', async () => {
        const url = videoUrlInput.value.trim();
        if (!url) return showToast('Por favor ingresa una URL', 'error');

        setLoading(true);
        previewSection.classList.add('hidden');

        try {
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });

            if (!response.ok) throw new Error('Error al analizar');

            currentVideoData = await response.json();
            updatePreview(currentVideoData);
            setLoading(false);
            previewSection.classList.remove('hidden');
        } catch (error) {
            setLoading(false);
            showToast('No se pudo analizar el video', 'error');
        }
    });

    // Mostrar Modal
    downloadBtn.addEventListener('click', () => {
        modal.classList.remove('hidden');
    });

    // Cerrar Modal
    closeModal.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    // Descargar con Limpieza
    btnCleanDownload.addEventListener('click', () => {
        handleDownload(true);
    });

    // Descargar Original
    btnOriginalDownload.addEventListener('click', () => {
        handleDownload(false);
    });

    async function handleDownload(removeMetadata) {
        modal.classList.add('hidden');
        showToast('Iniciando descarga...', 'info');
        
        try {
            const response = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    url: currentVideoData.downloadUrl, 
                    removeMetadata 
                })
            });

            if (!response.ok) throw new Error('Error en descarga');

            // Crear blob y descargar
            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = removeMetadata ? 'video_clean.mp4' : 'video_original.mp4';
            document.body.appendChild(a);
            a.click();
            a.remove();
            
            showToast('Descarga completada', 'success');
        } catch (error) {
            showToast('Error al descargar el archivo', 'error');
        }
    }

    function updatePreview(data) {
        document.getElementById('thumbnail').src = data.thumbnail;
        document.getElementById('videoTitle').textContent = data.title;
        document.getElementById('platformTag').textContent = data.platform;
        document.getElementById('duration').textContent = data.duration;
        document.getElementById('quality').textContent = data.quality;
        document.getElementById('size').textContent = data.size;
    }

    function setLoading(isLoading) {
        if (isLoading) {
            loadingSection.classList.remove('hidden');
            analyzeBtn.disabled = true;
        } else {
            loadingSection.classList.add('hidden');
            analyzeBtn.disabled = false;
        }
    }

    function showToast(message, type = 'success') {
        const toastEl = document.getElementById('toast');
        const msgEl = document.getElementById('toastMessage');
        msgEl.textContent = message;
        
        if (type === 'error') {
            toastEl.style.background = '#ef4444';
        } else {
            toastEl.style.background = '#10b981';
        }

        toastEl.classList.remove('hidden');
        setTimeout(() => toastEl.classList.add('hidden'), 3000);
    }
});