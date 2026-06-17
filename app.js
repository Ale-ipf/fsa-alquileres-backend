const express = require('express');
const fs = require('fs');
const app = express();
const PUERTO = 3000;

// ==========================================
// 1. CONFIGURACIONES Y MIDDLEWARES
// ==========================================
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); // Busca automáticamente el index.html en la carpeta public

// RUTAS DE NUESTRAS BASES DE DATOS FÍSICAS 📁
const ARCHIVO_USUARIOS = './usuarios.json';
const ARCHIVO_ALQUILERES = './alquileres.json';

// ==========================================
// 2. FUNCIONES AUXILIARES (USUARIOS Y ALQUILERES)
// ==========================================
function leerUsuariosDeDisco() {
    if (!fs.existsSync(ARCHIVO_USUARIOS)) return [];
    const datos = fs.readFileSync(ARCHIVO_USUARIOS, 'utf-8');
    return JSON.parse(datos || '[]');
}

function guardarUsuariosEnDisco(usuarios) {
    fs.writeFileSync(ARCHIVO_USUARIOS, JSON.stringify(usuarios, null, 2), 'utf-8');
}

function leerAlquileresDeDisco() {
    if (!fs.existsSync(ARCHIVO_ALQUILERES)) return [];
    const datos = fs.readFileSync(ARCHIVO_ALQUILERES, 'utf-8');
    return JSON.parse(datos || '[]');
}

function guardarAlquileresEnDisco(alquileres) {
    fs.writeFileSync(ARCHIVO_ALQUILERES, JSON.stringify(alquileres, null, 2), 'utf-8');
}

// ==========================================
// 3. RUTAS DEL SERVIDOR (ENDPOINTs)
// ==========================================

// Registrar un usuario
app.post('/registro', (req, res) => {
    const { email, password, rol } = req.body;
    if (!email || !password || !rol) return res.status(400).send('Error: Faltan datos.');

    const usuarios = leerUsuariosDeDisco();
    if (usuarios.find(u => u.email === email)) return res.status(400).send('Error: El email ya existe.');

    usuarios.push({ email, password, rol });
    guardarUsuariosEnDisco(usuarios);
    
    // 🔥 CAMBIO AQUÍ: En vez de .send(), redirigimos al inicio
    res.redirect('/');
});

// Publicar un Alquiler
app.post('/alquileres', (req, res) => {
    const { emailDueno, titulo, precio, barrio, tieneAire } = req.body;

    const usuarios = leerUsuariosDeDisco();
    const duenoEncontrado = usuarios.find(u => u.email === emailDueno && u.rol === 'dueno');

    if (!duenoEncontrado) {
        return res.status(403).send('Error: Solo los usuarios registrados como "dueno" pueden publicar alquileres ❌');
    }

    if (!titulo || !precio || !barrio) {
        return res.status(400).send('Error: Título, precio y barrio son obligatorios.');
    }

    const alquileresExistentes = leerAlquileresDeDisco();
    
    const nuevoAlquiler = {
        id: Date.now(),
        dueno: emailDueno,
        titulo,
        precio: Number(precio),
        barrio,
        tieneAire: tieneAire === 'si' ? true : false
    };

    alquileresExistentes.push(nuevoAlquiler);
    guardarAlquileresEnDisco(alquileresExistentes);

    // 🔥 CAMBIO AQUÍ: En vez de .send(), redirigimos al inicio
    res.redirect('/');
});

// Ver todos los alquileres en JSON
app.get('/alquileres', (req, res) => {
    const alquileres = leerAlquileresDeDisco();
    res.json(alquileres);
});

// ==========================================
// 4. ENCENDER EL SERVIDOR
// ==========================================
app.listen(PUERTO, () => {
    console.log(`Servidor Inmobiliario corriendo en http://localhost:${PUERTO}`);
});