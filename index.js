const { parse } = require('querystring');
const url = require('url');
const fs = require('fs');
const path = require('path');

// NOTA: En Vercel, el sistema de archivos es de solo lectura en producción.
// Los deseos se mantendrán mientras la función esté caliente, pero para 
// persistencia real necesitarías una base de datos (como Vercel KV o MongoDB).
let memoryWishes = [];

module.exports = (req, res) => {
    const pUrl = url.parse(req.url, true);

    // Ruta para la música local
    if (pUrl.pathname === '/api/musica') {
        const musicPath = path.join(process.cwd(), 'public', 'music.mp3');
        if (fs.existsSync(musicPath)) {
            const stat = fs.statSync(musicPath);
            res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': stat.size });
            return fs.createReadStream(musicPath).pipe(res);
        }
        return res.status(404).end();
    }

    if (req.method === 'POST' && pUrl.pathname === '/api/add') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            const { name, wish } = parse(body);
            if (name && wish) {
                memoryWishes.push({ name: name.trim(), wish: wish.trim() });
            }
            res.writeHead(302, { 'Location': '/?user=' + encodeURIComponent(name) });
            res.end();
        });
        return;
    }

    // Renderizado del HTML
    const groupedWishes = memoryWishes.reduce((acc, item) => {
        if (!acc[item.name]) acc[item.name] = [];
        acc[item.name].push(item.wish);
        return acc;
    }, {});

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(renderHTML(groupedWishes, pUrl.query.user));
};

function renderHTML(groupedWishes, currentUser) {
    return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>NaviWish 🎄</title>
        <style>
            body {
                font-family: -apple-system, system-ui, sans-serif;
                background: linear-gradient(189deg, #307b38, #409f6f, #1b342d);
                background-attachment: fixed; margin: 0; display: flex; justify-content: center; min-height: 100vh; overflow-x: hidden;
            }
            .app-container { width: 100%; max-width: 480px; padding: 20px; z-index: 10; position: relative; }
            .glass-card {
                background: rgba(255, 255, 255, 0.92); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
                border-radius: 30px; box-shadow: 0 15px 35px rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.4);
                margin-bottom: 25px; overflow: hidden;
            }
            .candy-strip { height: 10px; background: repeating-linear-gradient(45deg, #d42426, #d42426 15px, #fff 15px, #fff 30px); }
            .padding { padding: 30px 20px; text-align: center; }
            input { width: 100%; padding: 18px; margin-bottom: 12px; border: 1px solid #ddd; border-radius: 18px; font-size: 16px; }
            button { width: 100%; padding: 18px; border: none; border-radius: 18px; background: #d42426; color: white; font-weight: bold; cursor: pointer; box-shadow: 0 4px 0 #8b181a; }
            .wish-item { background: rgba(255, 255, 255, 0.92); border-radius: 20px; padding: 18px; margin-bottom: 15px; border-left: 10px solid #f8b229; text-align: left; }
            #music-toggle { position: fixed; bottom: 20px; left: 20px; width: 60px; height: 60px; background: #f8b229; border: none; border-radius: 50%; font-size: 1.5rem; z-index: 100; cursor: pointer; }
        </style>
    </head>
    <body>
        <audio id="audio-player" loop><source src="/api/musica" type="audio/mpeg"></audio>
        <button id="music-toggle" onclick="handleMusic()">🎵</button>
        <div class="app-container">
            <div class="glass-card">
                <div class="candy-strip"></div>
                <div class="padding">
                    <h1>NaviWish 🎄</h1>
                    <form method="POST" action="/api/add">
                        <input type="text" name="name" placeholder="Nombre" value="${currentUser || ''}" required>
                        <input type="text" name="wish" placeholder="Deseo" required>
                        <button type="submit">Enviar 🎁</button>
                    </form>
                </div>
            </div>
            ${Object.entries(groupedWishes).map(([name, items]) => `
                <div class="wish-item">
                    <b>👤 ${name}</b>
                    <ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>
                </div>
            `).join('')}
        </div>
        <script>
            const song = document.getElementById('audio-player');
            function handleMusic() {
                if (song.paused) { song.play(); document.getElementById('music-toggle').innerHTML = '⏸'; }
                else { song.pause(); document.getElementById('music-toggle').innerHTML = '🎵'; }
            }
        </script>
    </body>
    </html>`;
}