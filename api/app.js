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

const ALLOWED_USERS = ["NESTOR", "KEYKA", "MARIA", "SILVIANA", "ROBERTO", "DANIEL", "OSCAR", "GREGORIO", "ESTIVALIS", "JONATHAN", "ROXY", "ELI", "MAYVI", "VALENTINA", "NORVIC", "HECTOR"];

async function handler(req, res) {
    const pUrl = url.parse(req.url, true);

    // Endpoints API
    if (pUrl.pathname === '/api/wishes' && req.method === 'GET') {
        const result = await pool.query('SELECT * FROM wishes ORDER BY created_at DESC');
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

    // Archivos Estáticos
    if (pUrl.pathname === '/manifest.json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(fs.readFileSync(path.join(process.cwd(), 'public', 'manifest.json')));
    }
    if (pUrl.pathname === '/sw.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        return res.end(fs.readFileSync(path.join(process.cwd(), 'public', 'sw.js')));
    }
    if (pUrl.pathname === '/api/musica') {
        res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
        return fs.createReadStream(path.join(process.cwd(), 'public', 'music.mp3')).pipe(res);
    }

    // Renderizado con Tailwind
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <link rel="manifest" href="/manifest.json">
    <script src="https://cdn.tailwindcss.com"></script>
    <title>NaviWish 2025 🎄</title>
    <style>
        .snow-container { position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; }
        .snowflake { position: absolute; top: -10px; color: white; animation: fall linear infinite; }
        @keyframes fall { 0% { transform: translateY(0) rotate(0deg); } 100% { transform: translateY(110vh) rotate(360deg); } }
        body { background: linear-gradient(180deg, #1b342d 0%, #307b38 50%, #1b342d 100%); background-attachment: fixed; }
    </style>
</head>
<body class="min-h-screen flex flex-col items-center">
    <div class="snow-container" id="snow"></div>
    <audio id="audio-player" loop><source src="/api/musica" type="audio/mpeg"></audio>
    
    <button id="music-btn" onclick="handleMusic()" class="fixed bottom-6 left-6 w-14 h-14 bg-yellow-500 rounded-full shadow-2xl z-50 flex items-center justify-center text-2xl hover:scale-110 transition-transform">
        🎵
    </button>

    <div class="w-full max-w-md px-6 py-10 z-10">
        
        <div id="login-view" class="bg-white/90 backdrop-blur-lg rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/20">
            <div class="h-2 bg-gradient-to-r from-red-600 via-white to-red-600 bg-[length:30px_100%]"></div>
            <div class="p-10 text-center">
                <span class="text-6xl mb-4 block">🎁</span>
                <h1 class="text-3xl font-bold text-red-600 mb-2">Intercambio 2025</h1>
                <p class="text-gray-600 mb-8">Ingresa tu nombre para comenzar</p>
                <input type="text" id="userInput" placeholder="Tu nombre es" class="w-full p-4 mb-4 border border-gray-200 rounded-2xl text-center text-lg focus:ring-2 focus:ring-red-500 outline-none uppercase font-semibold">
                <button onclick="login()" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-red-900/20 transition-all active:scale-95">
                    ENTRAR 🎶
                </button>
            </div>
        </div>

        <div id="app-view" class="hidden space-y-6">
            <div class="bg-white/95 backdrop-blur-md rounded-[2.5rem] p-8 shadow-xl border border-white/20 text-center">
                <h2 id="welcome-msg" class="text-2xl font-bold text-green-900 mb-6"></h2>
                <div class="space-y-3">
                    <input type="text" id="wishInput" placeholder="¿Qué quieres para Navidad?" class="w-full p-4 border border-gray-100 rounded-xl bg-gray-50 outline-none focus:bg-white transition-all">
                    <button onclick="addWish()" class="w-full bg-red-600 text-white font-bold py-4 rounded-xl shadow-md hover:bg-red-700 transition-colors uppercase text-sm tracking-widest">
                        Añadir a la lista 🎁
                    </button>
                </div>
                <button onclick="logout()" class="mt-6 text-gray-400 text-xs hover:text-red-500 transition-colors uppercase tracking-tighter underline">Cerrar Sesión</button>
            </div>

            <h3 class="text-white text-center font-bold text-lg drop-shadow-md">Deseos</h3>
            <div id="wishes-list" class="space-y-4"></div>
        </div>

    </div>

    <script>
        const song = document.getElementById('audio-player');
        let currentUser = new URLSearchParams(window.location.search).get('user')?.toUpperCase();
        const ALLOWED = ${JSON.stringify(ALLOWED_USERS)};

        function login() {
            const input = document.getElementById('userInput');
            const user = input.value.toUpperCase().trim();
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

        function logout() {
            localStorage.setItem('playMusic', 'false');
            window.location.href = '/';
        }

        async function addWish() {
            const input = document.getElementById('wishInput');
            const wish = input.value.trim();
            if (!wish) return;
            await fetch('/api/add', {
                method: 'POST',
                body: JSON.stringify({ name: currentUser, wish })
            });
            input.value = '';
            loadWishes();
        }

        async function deleteWish(id) {
            if (!confirm('¿Seguro que quieres borrar este deseo?')) return;
            await fetch('/api/delete', { method: 'POST', body: JSON.stringify({ id }) });
            loadWishes();
        }

        async function loadWishes() {
            const res = await fetch('/api/wishes');
            const data = await res.json();
            const container = document.getElementById('wishes-list');
            
            const grouped = data.reduce((acc, i) => {
                if (!acc[i.name]) acc[i.name] = [];
                acc[i.name].push(i);
                return acc;
            }, {});

            container.innerHTML = Object.entries(grouped).map(([name, items]) => \`
                <div class="bg-white/90 p-5 rounded-3xl border-l-8 border-yellow-500 shadow-sm transition-all">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="text-sm">👤</span>
                        <b class="text-green-900 font-bold uppercase text-sm">\${name}</b>
                    </div>
                    <ul class="space-y-2">
                        \${items.map(i => \`
                            <li class="text-gray-700 flex justify-between items-center bg-white/50 p-2 px-3 rounded-lg text-sm border border-gray-100">
                                <span>\${i.text || i.wish}</span>
                                \${name === currentUser ? \`<button onclick="deleteWish(\${i.id})" class="text-red-400 hover:text-red-600 px-2 font-bold">✕</button>\` : ''}
                            </li>
                        \`).join('')}
                    </ul>
                </div>
            \`).join('');
        }

        function render() {
            if (currentUser && ALLOWED.includes(currentUser)) {
                document.getElementById('login-view').classList.add('hidden');
                document.getElementById('app-view').classList.remove('hidden');
                document.getElementById('welcome-msg').innerText = '¡Hola, ' + currentUser + '! 👋';
                loadWishes();
            }
        }

        function handleMusic() {
            if (song.paused) { 
                song.play(); 
                document.getElementById('music-btn').innerText = '⏸';
                localStorage.setItem('playMusic', 'true'); 
            } else { 
                song.pause(); 
                document.getElementById('music-btn').innerText = '🎵';
                localStorage.setItem('playMusic', 'false'); 
            }
        }

        window.onload = () => {
            render();
            if (localStorage.getItem('playMusic') === 'true') {
                song.play().then(() => document.getElementById('music-btn').innerText = '⏸').catch(() => {});
            }
            // Generar Nieve
            const snow = document.getElementById('snow');
            for (let i = 0; i < 35; i++) {
                const s = document.createElement('div');
                s.className = 'snowflake'; s.innerHTML = '❄';
                s.style.left = Math.random() * 100 + 'vw';
                s.style.animationDuration = (Math.random() * 4 + 6) + 's';
                s.style.fontSize = (Math.random() * 10 + 10) + 'px';
                s.style.opacity = Math.random();
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