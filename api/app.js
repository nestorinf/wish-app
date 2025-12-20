require('dotenv').config();
const { Pool } = require('pg');
const url = require('url');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
});

const JWT_SECRET = process.env.JWT_SECRET || 'navidad_segura_2025';

const ALLOWED_USERS = [
    "NESTOR", "KEYKA", "SILVIANA", "ROBERTO", "DANIEL",
    "OSCAR", "GREGORIO", "ESTIVALIS", "JONATHAN", "ROXY",
    "ELI", "MAYVI", "VALENTINA", "NORVIC", "HECTOR", "MARIA"
];

function cleanInput(str, maxLength = 255) {
    if (typeof str !== 'string') return '';
    return str.trim().replace(/<[^>]*>?/gm, '').substring(0, maxLength);
}

function verifyToken(req) {
    try {
        const authHeader = req.headers['authorization'];
        if (!authHeader) return null;
        const token = authHeader.split(' ')[1];
        return jwt.verify(token, JWT_SECRET);
    } catch (err) { return null; }
}

async function handler(req, res) {
    const pUrl = url.parse(req.url, true);

    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS users (name TEXT PRIMARY KEY, code TEXT, attempts INTEGER DEFAULT 0, block_until TIMESTAMP);`);
        await pool.query(`CREATE TABLE IF NOT EXISTS wishes (id SERIAL PRIMARY KEY, name TEXT, wish TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
    } catch (e) { console.error("Error DB Init:", e); }

    // --- API: LOGIN ---
    if (pUrl.pathname === '/api/login' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        await new Promise((resolve) => req.on('end', resolve));
        try {
            const data = JSON.parse(body);
            const cleanName = cleanInput(data.name).toUpperCase();
            const cleanCode = cleanInput(data.code).toUpperCase(); // Forzar a mayúsculas

            if (!cleanName || !cleanCode) {
                res.writeHead(400); return res.end(JSON.stringify({ error: 'Faltan datos.' }));
            }
            if (!ALLOWED_USERS.includes(cleanName)) {
                res.writeHead(401); return res.end(JSON.stringify({ error: 'Nombre no autorizado.' }));
            }

            // Usamos UPPER(code) en el SELECT para comparar sin importar cómo se guardó
            const userRes = await pool.query(
                'SELECT code, attempts, block_until FROM users WHERE UPPER(name) = $1',
                [cleanName]
            );

            if (userRes.rows.length > 0 && userRes.rows[0].block_until) {
                if (new Date() < new Date(userRes.rows[0].block_until)) {
                    const diff = Math.ceil((new Date(userRes.rows[0].block_until) - new Date()) / 60000);
                    res.writeHead(403); return res.end(JSON.stringify({ error: `BLOQUEADO. Intenta en ${diff} min.`, locked: true }));
                }
            }

            let loginValid = false;
            if (userRes.rows.length === 0) {
                // Si el usuario no existe en la tabla (pero sí en ALLOWED_USERS), lo creamos
                await pool.query('INSERT INTO users (name, code, attempts) VALUES ($1, $2, 0)', [cleanName, cleanCode]);
                loginValid = true;
            } else if (userRes.rows[0].code.toUpperCase() === cleanCode) {
                // Comparamos el código de la base de datos en mayúsculas
                await pool.query('UPDATE users SET attempts = 0, block_until = NULL WHERE name = $1', [cleanName]);
                loginValid = true;
            }

            if (loginValid) {
                const token = jwt.sign({ name: cleanName }, JWT_SECRET, { expiresIn: '10m' });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: true, token, name: cleanName }));
            } else {
                const newAttempts = (userRes.rows[0]?.attempts || 0) + 1;
                let blockUntil = newAttempts >= 3 ? new Date(Date.now() + 2 * 60 * 1000) : null;
                await pool.query('UPDATE users SET attempts = $1, block_until = $2 WHERE name = $3', [newAttempts, blockUntil, cleanName]);
                res.writeHead(403); return res.end(JSON.stringify({ error: newAttempts >= 3 ? 'BLOQUEADO.' : `ERROR ${newAttempts}/3`, locked: newAttempts >= 3 }));
            }
        } catch (err) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Error en servidor.' })); }
    }

    // --- API: AGREGAR ---
    if (pUrl.pathname === '/api/add' && req.method === 'POST') {
        const decoded = verifyToken(req);
        if (!decoded) { res.writeHead(401); return res.end(JSON.stringify({ error: 'Sesión expirada' })); }
        let b = ''; req.on('data', c => b += c); await new Promise(r => req.on('end', r));
        try {
            const { wish } = JSON.parse(b);
            const cleanWish = cleanInput(wish, 300);
            if (!cleanWish) { res.writeHead(400); return res.end(); }
            await pool.query('INSERT INTO wishes (name, wish) VALUES ($1, $2)', [decoded.name, cleanWish]);
            res.writeHead(200).end(); return;
        } catch (e) { res.writeHead(400).end(); return; }
    }

    // --- API: ELIMINAR ---
    if (pUrl.pathname === '/api/delete' && req.method === 'POST') {
        const decoded = verifyToken(req);
        if (!decoded) { res.writeHead(401).end(); return; }
        let b = ''; req.on('data', c => b += c); await new Promise(r => req.on('end', r));
        const { id } = JSON.parse(b);
        await pool.query('DELETE FROM wishes WHERE id = $1 AND name = $2', [id, decoded.name]);
        return res.writeHead(200).end();
    }

    // --- API: LISTAR ---
    if (pUrl.pathname === '/api/wishes' && req.method === 'GET') {
        const result = await pool.query('SELECT * FROM wishes ORDER BY name ASC, created_at DESC');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result.rows));
    }

    // --- API: MUSICA ---
    if (pUrl.pathname === '/api/musica') {
        const musicPath = path.join(process.cwd(), 'public', 'music.mp3');
        if (fs.existsSync(musicPath)) {
            res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
            return fs.createReadStream(musicPath).pipe(res);
        }
        res.writeHead(404).end(); return;
    }

    if (pUrl.pathname.startsWith('/api/')) { res.writeHead(404).end(); return; }

    // --- FRONTEND ---
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <script src="https://cdn.tailwindcss.com"></script>
    <title>Intercambio 2025 🎄</title>
    <style>
        .snow-container { position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; }
        .snowflake { position: absolute; top: -10px; color: white; animation: fall linear infinite; }
        @keyframes fall { 0% { transform: translateY(0) rotate(0deg); } 100% { transform: translateY(110vh) rotate(360deg); } }
        body { background: linear-gradient(180deg, #1b342d 0%, #307b38 50%, #1b342d 100%); background-attachment: fixed; font-family: sans-serif; }
        .custom-scroll::-webkit-scrollbar { width: 4px; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #d42426; border-radius: 10px; }
    </style>
</head>
<body class="min-h-screen flex flex-col items-center p-4">
    <div class="snow-container" id="snow"></div>
    <audio id="audio-player" loop><source src="/api/musica" type="audio/mpeg"></audio>
    <button id="music-btn" onclick="handleMusic()" class="fixed bottom-6 left-6 w-12 h-12 bg-yellow-500 rounded-full shadow-2xl z-50 flex items-center justify-center text-xl hover:scale-110 transition-transform">🎵</button>

    <div class="w-full max-w-md z-10 pt-10">
        <div id="login-view" class="bg-white/90 backdrop-blur-lg rounded-[2.5rem] shadow-2xl p-8 text-center border border-white/20">
            <span class="text-6xl mb-4 block">🎄</span>
            <h1 class="text-3xl font-black text-red-600 mb-2 italic tracking-tighter uppercase">Intercambio 2025</h1>
            
            <div id="login-form" class="space-y-3 mt-6">
                <input type="text" id="userInput" placeholder="TU NOMBRE" class="w-full p-4 border rounded-2xl text-center focus:ring-2 focus:ring-red-500 outline-none uppercase font-bold text-gray-700 bg-white">
                <input type="password" id="userCode" placeholder="CÓDIGO DE ACCESO" class="w-full p-4 border rounded-2xl text-center focus:ring-2 focus:ring-red-500 outline-none font-bold text-gray-700 bg-white">
                <button onclick="login()" class="w-full bg-red-600 hover:bg-red-700 text-white font-black py-4 rounded-2xl shadow-lg transition-all active:scale-95 text-xs tracking-widest uppercase">Entrar</button>
                <a href="https://wa.me/584245834938" target="_blank" class="block text-[10px] font-bold text-green-700 uppercase tracking-tighter hover:underline mt-4">¿Olvidaste tu código? <br> <span class="text-xs">💬 Soporte</span></a>
            </div>

            <div class="text-left border-t mt-8 pt-6">
                <p class="text-[9px] font-black text-gray-400 mb-4 uppercase text-center tracking-widest italic">Deseos Actuales</p>
                <div id="preview-list" class="space-y-4 max-h-80 overflow-y-auto custom-scroll pr-1"></div>
            </div>
        </div>

        <div id="app-view" class="hidden space-y-6">
            <div class="bg-white/95 backdrop-blur-md rounded-[2.5rem] p-8 shadow-xl border border-white/20 text-center relative">
                <button onclick="logout()" class="absolute top-8 left-8 text-gray-400 text-[10px] font-black uppercase hover:text-red-600 transition-colors font-bold tracking-widest">✕ Salir</button>
                <a href="https://wa.me/584245834938" target="_blank" class="absolute top-8 right-8 text-green-600 text-[10px] font-black uppercase font-bold tracking-widest">🔑 Clave</a>
                <h2 id="welcome-msg" class="text-2xl font-black text-green-900 mb-6 italic uppercase tracking-tighter mt-4"></h2>
                <div class="space-y-3">
                    <input type="text" id="wishInput" placeholder="¿Qué quieres pedir?" class="w-full p-4 border rounded-xl bg-gray-50 outline-none mb-2 text-sm font-bold shadow-inner text-center">
                    <button onclick="addWish()" class="w-full bg-red-600 text-white font-black py-4 rounded-xl shadow-md uppercase text-[10px] tracking-[0.2em]">Añadir Deseo 🎁</button>
                </div>
            </div>
            <div id="wishes-list" class="space-y-4 pb-20"></div>
        </div>
    </div>

    <script>
        const song = document.getElementById('audio-player');
        let currentUser = localStorage.getItem('naviwish_user');

        const getColor = (n) => {
            const c = ['#d42426', '#1b342d', '#f8b229', '#2563eb', '#9333ea', '#db2777', '#059669'];
            let h = 0; for (let i = 0; i < n.length; i++) h = n.charCodeAt(i) + ((h << 5) - h);
            return c[Math.abs(h) % c.length];
        };

        async function login() {
            const name = document.getElementById('userInput').value.trim();
            const code = document.getElementById('userCode').value.trim();
            if (!name || !code) return alert("Completa los campos.");
            
            const res = await fetch('/api/login', { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify({ name, code }) 
            });
            const data = await res.json();
            
            if (res.ok) { 
                localStorage.setItem('naviwish_token', data.token);
                localStorage.setItem('naviwish_user', data.name);
                currentUser = data.name; 
                render(); 
                song.play().then(() => localStorage.setItem('playMusic', 'true')).catch(() => {});
            } else { 
                alert(data.error); 
                if (data.locked) location.reload(); 
            }
        }

        function logout() { 
            localStorage.removeItem('naviwish_user'); 
            localStorage.removeItem('naviwish_token'); 
            location.reload(); 
        }

        async function addWish() {
            const val = document.getElementById('wishInput').value.trim();
            if (!val) return;
            const res = await fetch('/api/add', { 
                method: 'POST', 
                headers: {
                    'Content-Type': 'application/json', 
                    'Authorization': 'Bearer ' + localStorage.getItem('naviwish_token')
                }, 
                body: JSON.stringify({ wish: val }) 
            });
            if (res.status === 401) return logout();
            document.getElementById('wishInput').value = ''; 
            loadWishes();
        }

        async function deleteWish(id) {
            if (confirm('¿Eliminar deseo?')) { 
                const res = await fetch('/api/delete', { 
                    method: 'POST', 
                    headers: {
                        'Content-Type': 'application/json', 
                        'Authorization': 'Bearer ' + localStorage.getItem('naviwish_token')
                    }, 
                    body: JSON.stringify({ id }) 
                }); 
                if (res.status === 401) return logout();
                loadWishes(); 
            }
        }

        async function loadWishes() {
            try {
                const res = await fetch('/api/wishes');
                const data = await res.json();
                const grouped = data.reduce((acc, i) => { 
                    (acc[i.name] = acc[i.name] || []).push(i); 
                    return acc; 
                }, {});

                const buildHTML = (isPrivate) => Object.entries(grouped).map(([name, items]) => \`
                    <div class="bg-white/90 p-5 rounded-[2rem] shadow-xl border-l-[10px]" style="border-color:\${getColor(name)}">
                        <b class="text-[11px] font-black uppercase tracking-widest block mb-3 text-left" style="color:\${getColor(name)}">👤 \${name}</b>
                        <div class="space-y-2">
                            \${items.map(i => \`
                                <div class="flex justify-between items-center bg-white p-3 rounded-2xl text-xs shadow-sm border border-gray-50">
                                    <span class="text-gray-700 font-bold text-left">\${i.wish}</span>
                                    \${isPrivate && name === currentUser ? \`<button onclick="deleteWish(\${i.id})" class="text-red-300 font-black px-2 hover:text-red-600 transition-colors">✕</button>\` : ''}
                                </div>
                            \`).join('')}
                        </div>
                    </div>
                \`).join('');

                const preview = document.getElementById('preview-list');
                if (preview) preview.innerHTML = buildHTML(false);

                const container = document.getElementById('wishes-list');
                if (container && !document.getElementById('app-view').classList.contains('hidden')) {
                    container.innerHTML = buildHTML(true);
                }
            } catch (e) { console.error("Error cargando deseos"); }
        }

        function render() {
            if (currentUser && localStorage.getItem('naviwish_token')) {
                document.getElementById('login-view').classList.add('hidden');
                document.getElementById('app-view').classList.remove('hidden');
                document.getElementById('welcome-msg').innerText = 'HOLA, ' + currentUser;
            } else {
                document.getElementById('login-view').classList.remove('hidden');
                document.getElementById('app-view').classList.add('hidden');
            }
            loadWishes();
        }

        function handleMusic() {
            if (song.paused) { song.play(); localStorage.setItem('playMusic', 'true'); }
            else { song.pause(); localStorage.setItem('playMusic', 'false'); }
        }

        window.onload = () => {
            render();
            if (localStorage.getItem('playMusic') === 'true') {
                song.play().catch(() => {});
            }
            const snow = document.getElementById('snow');
            for (let i = 0; i < 30; i++) {
                const s = document.createElement('div'); 
                s.className = 'snowflake'; 
                s.innerHTML = '❄';
                s.style.left = Math.random() * 100 + 'vw'; 
                s.style.animationDuration = (Math.random() * 5 + 5) + 's';
                s.style.opacity = Math.random();
                snow.appendChild(s);
            }
        };
    </script>
</body>
</html>
    `);
}

if (require.main === module) {
    require('http').createServer(handler).listen(3000);
}
module.exports = handler;