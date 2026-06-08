const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { execFile } = require('child_process');

// Configuración de Rutas de Ejecutables (Autónomo)
const SERVER_DIR = __dirname;
const FFMPEG_PATH = process.env.FFMPEG_PATH || path.join(SERVER_DIR, 'ffmpeg.exe');
const YTDLP_PATH = process.env.YTDLP_PATH || path.join(SERVER_DIR, 'yt-dlp.exe');
const hasFfmpeg = fs.existsSync(FFMPEG_PATH);
const hasYtDlp = fs.existsSync(YTDLP_PATH);

// Verificar existencia de herramientas
if (!fs.existsSync(FFMPEG_PATH)) {
    console.warn('ADVERTENCIA: No se encuentra ffmpeg en la ruta configurada.');
}
if (!fs.existsSync(YTDLP_PATH)) {
    console.warn('ADVERTENCIA: No se encuentra yt-dlp en la ruta configurada.');
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// Directorio temporal
const TEMP_DIR = path.join(SERVER_DIR, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR);
}

// --- FUNCIONES AUXILIARES PARA YT-DLP ---

function runYtDlp(args) {
    return new Promise((resolve, reject) => {
        // Ejecutamos yt-dlp con las rutas correctas
        execFile(YTDLP_PATH, args, { windowsHide: true }, (error, stdout, stderr) => {
            if (error) {
                // Si hay error, mostramos el stderr para depurar
                console.error('yt-dlp stderr:', stderr);
                reject(error);
            } else {
                resolve(stdout);
            }
        });
    });
}

// --- ENDPOINTS ---

// 1. Analizar URL
app.post('/api/analyze', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL requerida' });
    if (!hasYtDlp) return res.status(503).json({ error: 'yt-dlp no esta disponible en este entorno.' });

    try {
        // Obtenemos información en formato JSON
        // NOTA: Se eliminó --no-call-home porque está obsoleto
        const args = [
            url,
            '--dump-single-json',
            '--no-warnings',
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        ];

        const output = await runYtDlp(args);
        const videoInfo = JSON.parse(output);

        const response = {
            title: videoInfo.title || 'Video sin título',
            thumbnail: videoInfo.thumbnail || 'https://placehold.co/600x400?text=No+Image',
            duration: formatDuration(videoInfo.duration),
            quality: 'HD (Best Available)',
            size: 'Variable', 
            platform: detectPlatform(url),
            downloadUrl: url
        };

        res.json(response);

    } catch (error) {
        console.error('Error analizando:', error.message);
        res.status(500).json({ error: 'No se pudo analizar. Es posible que TikTok haya bloqueado la solicitud o necesites actualizar yt-dlp.exe' });
    }
});

// 2. Descargar y Procesar
app.post('/api/download', async (req, res) => {
    const { url, removeMetadata } = req.body;
    if (!hasYtDlp) return res.status(503).json({ error: 'yt-dlp no esta disponible en este entorno.' });
    if (removeMetadata && !hasFfmpeg) return res.status(503).json({ error: 'ffmpeg no esta disponible en este entorno.' });
    const fileId = uuidv4();
    
    const tempFilePath = path.join(TEMP_DIR, `${fileId}.mp4`);
    const finalFilePath = path.join(TEMP_DIR, `${fileId}_final.mp4`);

    try {
        // Paso 1: Descargar video usando yt-dlp
        const downloadArgs = [
            url,
            '-o', tempFilePath,
            '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            '--merge-output-format', 'mp4',
            '--no-warnings'
        ];

        await runYtDlp(downloadArgs);

        if (!fs.existsSync(tempFilePath)) {
            throw new Error('La descarga falló o el archivo no se creó.');
        }

        // Paso 2: Procesar (Eliminar metadatos si se solicitó)
        if (removeMetadata) {
            await stripMetadataWithFFmpeg(tempFilePath, finalFilePath);
            sendFile(res, finalFilePath, `video_clean_${fileId}.mp4`);
            setTimeout(() => cleanupFiles([tempFilePath, finalFilePath]), 60000);
        } else {
            sendFile(res, tempFilePath, `video_original_${fileId}.mp4`);
            setTimeout(() => cleanupFiles([tempFilePath]), 60000);
        }

    } catch (error) {
        console.error('Error en descarga/proceso:', error);
        cleanupFiles([tempFilePath, finalFilePath]);
        res.status(500).json({ error: 'Error procesando el video. Intenta de nuevo.' });
    }
});

// --- FUNCIONES DE PROCESAMIENTO ---

function stripMetadataWithFFmpeg(input, output) {
    return new Promise((resolve, reject) => {
        const ffmpeg = require('fluent-ffmpeg');
        ffmpeg.setFfmpegPath(FFMPEG_PATH);

        ffmpeg(input)
            .outputOptions([
                '-map_metadata', '-1', 
                '-c:v', 'copy',        
                '-c:a', 'copy'         
            ])
            .on('end', () => resolve())
            .on('error', (err) => reject(err))
            .save(output);
    });
}

function sendFile(res, filePath, fileName) {
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'video/mp4');
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
}

function cleanupFiles(files) {
    files.forEach(file => {
        if (fs.existsSync(file)) fs.unlinkSync(file);
    });
}

function detectPlatform(url) {
    if (url.includes('tiktok')) return 'TikTok';
    if (url.includes('instagram')) return 'Instagram';
    if (url.includes('twitter') || url.includes('x.com')) return 'X (Twitter)';
    return 'Desconocida';
}

function formatDuration(seconds) {
    if (!seconds) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

if (require.main === module) {
app.listen(PORT, () => {
    console.log(`Servidor Autónomo corriendo en http://localhost:${PORT}`);
    console.log(`Usando FFmpeg en: ${FFMPEG_PATH}`);
    console.log(`Usando yt-dlp en: ${YTDLP_PATH}`);
});
}

module.exports = app;
