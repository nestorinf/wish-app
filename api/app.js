require('dotenv').config();
const { Pool } = require('pg');
const { parse } = require('querystring');
const url = require('url');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
});

// Whitelist actualizada con MARIA
const ALLOWED_USERS = [
    "NESTOR", "KEYKA", "SILVIANA", "ROBERTO", "DANIEL",
    "OSCAR", "GREGORIO", "ESTIVALIS", "JONATHAN", "ROXY",
    "ELI", "MAYVI", "VALENTINA", "NORVIC", "HECTOR", "MARIA"
];

async function handler(req, res) {
    const pUrl = url.parse(req.url, true);

    // Endpoints API
    if (pUrl.pathname === '/api/wishes' && req.method === 'GET') {
        const result = await pool.query('SELECT * FROM wishes ORDER BY name,created_at DESC');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result.rows));
    }

    if (pUrl.pathname === '/api/add' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        await new Promise((resolve) => req.on('end', resolve));
        const { name, wish } = JSON.parse(body);
        const cleanName = name.toUpperCase().trim();
        if (ALLOWED_USERS.includes(cleanName) && wish) {
            await pool.query('INSERT INTO wishes (name, wish) VALUES ($1, $2)', [cleanName, wish.trim()]);
            return res.writeHead(200).end();
        }
        return res.writeHead(400).end();
    }

    if (pUrl.pathname === '/api/delete' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        await new Promise((resolve) => req.on('end', resolve));
        const { id } = JSON.parse(body);
        await pool.query('DELETE FROM wishes WHERE id = $1', [id]);
        return res.writeHead(200).end();
    }

    if (pUrl.pathname === '/api/musica') {
        res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
        return fs.createReadStream(path.join(process.cwd(), 'public', 'music.mp3')).pipe(res);
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <script src="https://cdn.tailwindcss.com"></script>
    <title>InterCambio 2025 🎄</title>
    <style>
        .snow-container { position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; }
        .snowflake { position: absolute; top: -10px; color: white; animation: fall linear infinite; }
        @keyframes fall { 0% { transform: translateY(0) rotate(0deg); } 100% { transform: translateY(110vh) rotate(360deg); } }
        body { background: linear-gradient(180deg, #1b342d 0%, #307b38 50%, #1b342d 100%); background-attachment: fixed; }
        .custom-scroll::-webkit-scrollbar { width: 4px; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #d42426; border-radius: 10px; }
    </style>
</head>
<body class="min-h-screen flex flex-col items-center">
    <div class="snow-container" id="snow"></div>
    <audio id="audio-player" loop><source src="/api/musica" type="audio/mpeg"></audio>
    
    <button id="music-btn" onclick="handleMusic()" class="fixed bottom-6 left-6 w-14 h-14 bg-yellow-500 rounded-full shadow-2xl z-50 flex items-center justify-center text-2xl hover:scale-110 transition-all">🎵</button>

    <div class="w-full max-w-md px-6 py-10 z-10">
        
        <div id="login-view" class="bg-white/90 backdrop-blur-lg rounded-[2.5rem] shadow-2xl border border-white/20 p-8 text-center">
            <span class="text-6xl mb-4 block">🎁</span>
            <h1 class="text-3xl font-bold text-red-600 mb-2 italic">InterCambio 2025</h1>
            <input type="text" id="userInput" placeholder="SOLO COLOCA TU NOMBRE" class="w-full p-4 mb-4 border border-gray-200 rounded-2xl text-center focus:ring-2 focus:ring-red-500 outline-none uppercase font-bold text-gray-700">
            <button onclick="login()" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-2xl shadow-lg transition-all active:scale-95 mb-6">ENTRAR 🎶</button>
            
            <div class="text-left border-t pt-4">
                <p class="text-[10px] font-bold text-gray-400 mb-3 uppercase tracking-widest">Deseos Recientes:</p>
                <div id="preview-list" class="max-h-48 overflow-y-auto custom-scroll space-y-2 pr-1"></div>
            </div>
        </div>

        <div id="app-view" class="hidden space-y-6">
            <div class="bg-white/95 backdrop-blur-md rounded-[2.5rem] p-8 shadow-xl border border-white/20 text-center relative">
                <button onclick="logout()" class="absolute top-6 left-6 text-gray-400 text-[10px] font-bold uppercase hover:text-red-500">✕ Salir</button>
                <span class="text-3xl block mb-2">🎅</span>
                <h2 id="welcome-msg" class="text-xl font-black text-green-900 mb-6 italic"></h2>
                <input type="text" id="wishInput" placeholder="¿Qué quieres pedir?" class="w-full p-4 border border-gray-100 rounded-xl bg-gray-50 outline-none focus:bg-white text-sm mb-3">
                <button onclick="addWish()" class="w-full bg-red-600 text-white font-bold py-4 rounded-xl shadow-md hover:bg-red-700 uppercase text-xs tracking-widest transition-colors">Añadir 🎁</button>
            </div>
            <div id="wishes-list" class="space-y-4"></div>
        </div>
    </div>

    <script>
        const song = document.getElementById('audio-player');
        let currentUser = new URLSearchParams(window.location.search).get('user')?.toUpperCase();
        const ALLOWED = ${JSON.stringify(ALLOWED_USERS)};
        
        // Generador de color consistente basado en el nombre
        const getColor = (name) => {
            const colors = ['#d42426', '#1b342d', '#f8b229', '#2563eb', '#9333ea', '#db2777', '#059669', '#ea580c'];
            let hash = 0;
            for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
            return colors[Math.abs(hash) % colors.length];
        };

        function login() {
            const user = document.getElementById('userInput').value.toUpperCase().trim();
            if (!ALLOWED.includes(user)) return alert("❌ Nombre no autorizado");
            currentUser = user;
            history.pushState(null, '', '/?user=' + user);
            render();
            if (localStorage.getItem('playMusic') !== 'true') {
                song.play();
                localStorage.setItem('playMusic', 'true');
                document.getElementById('music-btn').innerText = '⏸';
            }
        }

        function logout() { localStorage.setItem('playMusic', 'false'); window.location.href = '/'; }

        async function addWish() {
            const val = document.getElementById('wishInput').value.trim();
            if (!val) return;
            await fetch('/api/add', { method: 'POST', body: JSON.stringify({ name: currentUser, wish: val }) });
            document.getElementById('wishInput').value = '';
            loadWishes();
        }

        async function deleteWish(id) {
            if (confirm('¿Borrar deseo?')) {
                await fetch('/api/delete', { method: 'POST', body: JSON.stringify({ id }) });
                loadWishes();
            }
        }

        async function loadWishes() {
            const res = await fetch('/api/wishes');
            const data = await res.json();
            
            // Preview en Login
            const preview = document.getElementById('preview-list');
            if (preview) {
                preview.innerHTML = data.slice(0, 10).map(i => \`
                    <div class="flex items-center gap-2 bg-gray-50/50 p-2 rounded-lg border border-gray-100">
                        <span class="text-[10px] font-bold px-2 py-0.5 rounded text-white" style="background:\${getColor(i.name)}">\${i.name}</span>
                        <span class="text-[10px] text-gray-500 truncate">\${i.wish || i.text}</span>
                    </div>
                \`).join('') || '<p class="text-center text-[10px] text-gray-400 italic">No hay deseos aún</p>';
            }

            // Lista en App
            const container = document.getElementById('wishes-list');
            if (container) {
                const grouped = data.reduce((acc, i) => { (acc[i.name] = acc[i.name] || []).push(i); return acc; }, {});
                container.innerHTML = Object.entries(grouped).map(([name, items]) => \`
                    <div class="bg-white/90 p-5 rounded-3xl shadow-lg" style="border-left: 8px solid \${getColor(name)}">
                        <b class="text-[10px] font-black uppercase tracking-widest block mb-3" style="color:\${getColor(name)}">👤 \${name}</b>
                        <div class="space-y-2">
                            \${items.map(i => \`
                                <div class="flex justify-between items-center bg-white border border-gray-50 p-3 rounded-xl text-xs shadow-sm">
                                    <span class="text-gray-700 font-medium">\${i.text || i.wish}</span>
                                    \${name === currentUser ? \`<button onclick="deleteWish(\${i.id})" class="text-red-300 hover:text-red-500 ml-2">✕</button>\` : ''}
                                </div>
                            \`).join('')}
                        </div>
                    </div>
                \`).join('');
            }
        }

        function render() {
            if (currentUser && ALLOWED.includes(currentUser)) {
                document.getElementById('login-view').classList.add('hidden');
                document.getElementById('app-view').classList.remove('hidden');
                document.getElementById('welcome-msg').innerText = 'HOLA, ' + currentUser;
            }
            loadWishes();
        }

        function handleMusic() {
            if (song.paused) { song.play(); document.getElementById('music-btn').innerText = '⏸'; localStorage.setItem('playMusic', 'true'); }
            else { song.pause(); document.getElementById('music-btn').innerText = '🎵'; localStorage.setItem('playMusic', 'false'); }
        }

        window.onload = () => {
            render();
            if (localStorage.getItem('playMusic') === 'true') {
                song.play().then(() => document.getElementById('music-btn').innerText = '⏸').catch(() => {});
            }
            // Nieve
            const snow = document.getElementById('snow');
            for (let i = 0; i < 30; i++) {
                const s = document.createElement('div');
                s.className = 'snowflake'; s.innerHTML = '❄';
                s.style.left = Math.random() * 100 + 'vw';
                s.style.animationDuration = (Math.random() * 4 + 6) + 's';
                snow.appendChild(s);
            }
        };
    </script>
</body>
</html>
    `);
}

if (require.main === module) { require('http').createServer(handler).listen(3000); }
module.exports = handler;