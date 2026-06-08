const fs = require('fs');
const https = require('https');
const path = require('path');

if (process.platform !== 'linux') {
  process.exit(0);
}

const outputDir = path.join(__dirname, '..', 'api', 'bin');
const outputPath = path.join(outputDir, 'yt-dlp_linux');
const ffmpegOutputPath = path.join(outputDir, 'ffmpeg');

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'video-downloader-build', ...headers } }, response => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          resolve(get(response.headers.location, headers));
          return;
        }

        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Request failed with status ${response.statusCode}: ${url}`));
          return;
        }

        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', reject);
  });
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });

  const releases = JSON.parse(
    await get('https://api.github.com/repos/yt-dlp/yt-dlp/releases?per_page=1')
  );
  const asset = releases[0].assets.find(({ name }) => name === 'yt-dlp_linux');

  if (!asset) {
    throw new Error('No se encontro el binario yt-dlp_linux en el release mas reciente.');
  }

  const binary = await get(asset.browser_download_url);
  fs.writeFileSync(outputPath, binary, { mode: 0o755 });
  fs.chmodSync(outputPath, 0o755);

  const ffmpegPath = require('ffmpeg-static');
  if (ffmpegPath && fs.existsSync(ffmpegPath)) {
    fs.copyFileSync(ffmpegPath, ffmpegOutputPath);
    fs.chmodSync(ffmpegOutputPath, 0o755);
  }

  console.log(`Installed yt-dlp Linux binary at ${outputPath}`);
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
