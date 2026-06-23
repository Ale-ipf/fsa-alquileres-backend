const express = require('express');
const fs = require('fs');
const session = require('express-session');
const multer = require('multer'); // 🔥 NUEVO: Importamos multer
const path = require('path'); // Módulo nativo de Node para manejar rutas de archivos
const app = express();
const PUERTO = 3000;

// ==========================================
// 1. CONFIGURACIONES Y MIDDLEWARES
// ==========================================
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // Por si mandamos JSON

app.use(session({
    secret: 'mi-clave-secreta-de-formosa',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

app.use(express.static('public'));

// 🔥 NUEVO: Configuración de almacenamiento para Multer
const almacenamiento = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/'); // Carpeta donde se guardan las fotos
    },
    filename: function (req, file, cb) {
        // Le ponemos un nombre único usando la fecha actual + la extensión original del archivo (ej: .jpg)
        const nombreUnico = Date.now() + path.extname(file.originalname);
        cb(null, nombreUnico);
    }
});
const upload = multer({ storage: almacenamiento }); // Inicializamos el middleware


const ARCHIVO_USUARIOS = './usuarios.json';
const ARCHIVO_ALQUILERES = './alquileres.json';

// Funciones auxiliares de lectura/escritura (Se mantienen igual)
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
// 3. RUTAS DEL SERVIDOR
// ==========================================

// Registro (Igual)
app.post('/registro', (req, res) => {
    const { email, password, rol } = req.body;
    if (!email || !password || !rol) return res.status(400).send('Error: Faltan datos.');
    const usuarios = leerUsuariosDeDisco();
    if (usuarios.find(u => u.email === email)) return res.status(400).send('Error: El email ya existe.');
    usuarios.push({ email, password, rol });
    guardarUsuariosEnDisco(usuarios);
    res.redirect('/');
});

// Login (Igual)
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const usuarios = leerUsuariosDeDisco();
    const usuarioEncontrado = usuarios.find(u => u.email === email && u.password === password);
    if (!usuarioEncontrado) return res.status(401).send('Error: Credenciales incorrectas. <a href="/">Volver</a>');
    req.session.usuarioLogueado = { email: usuarioEncontrado.email, rol: usuarioEncontrado.rol };
    res.redirect('/');
});

app.get('/quien-soy', (req, res) => {
    if (req.session.usuarioLogueado) res.json({ logueado: true, usuario: req.session.usuarioLogueado });
    else res.json({ logueado: false });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// MODIFICADO: Publicar Alquiler con nuevos parámetros de ambientes y tipo de inmueble
app.post('/alquileres', upload.single('foto'), (req, res) => {
    if (!req.session.usuarioLogueado) return res.status(401).send('Error: Debes iniciar sesión.');
    
    const { email, rol } = req.session.usuarioLogueado;
    if (rol !== 'dueno') return res.status(403).send('Error: Solo dueños.');

    // 🔥 Extraemos los nuevos campos del formulario
    const { titulo, precio, barrio, tieneAire, ambientes, tipoInmueble } = req.body;
    if (!titulo || !precio || !barrio || !ambientes || !tipoInmueble) {
        return res.status(400).send('Error: Todos los campos son obligatorios.');
    }

    let rutaFoto = '/uploads/default-house.jpg'; 
    if (req.file) {
        rutaFoto = '/uploads/' + req.file.filename; 
    }

    const alquileresExistentes = leerAlquileresDeDisco();
    
    const nuevoAlquiler = {
        id: Date.now(),
        dueno: email,
        titulo,
        precio: Number(precio),
        barrio,
        tieneAire: tieneAire === 'si' ? true : false,
        ambientes: Number(ambientes), // 🔥 Guardamos como número (1, 2 o 3)
        tipoInmueble,                 // 🔥 Guardamos 'Directo' o 'Inmobiliaria'
        imagen: rutaFoto 
    };

    alquileresExistentes.push(nuevoAlquiler);
    guardarAlquileresEnDisco(alquileresExistentes);

    res.redirect('/');
});

app.get('/alquileres', (req, res) => {
    res.json(leerAlquileresDeDisco());
});

// Borrar (Igual)
app.post('/alquileres/borrar', (req, res) => {
    if (!req.session.usuarioLogueado) return res.status(401).send('Error: Inicia sesión.');
    const { idAlquiler } = req.body;
    const emailUsuarioActual = req.session.usuarioLogueado.email;
    const alquileres = leerAlquileresDeDisco();
    const alquilerEncontrado = alquileres.find(a => a.id === Number(idAlquiler));
    
    if (!alquilerEncontrado) return res.status(404).send('Error: No existe.');
    if (alquilerEncontrado.dueno !== emailUsuarioActual) return res.status(403).send('Error: No tienes permiso.');

    // OPCIONAL INTERESANTE: Borrar la foto físicamente del disco al eliminar la publicación
    if (alquilerEncontrado.imagen && alquilerEncontrado.imagen !== '/uploads/default-house.jpg') {
        const rutaFisicaFoto = path.join(__dirname, 'public', alquilerEncontrado.imagen);
        if (fs.existsSync(rutaFisicaFoto)) fs.unlinkSync(rutaFisicaFoto); // Elimina el archivo
    }

    const alquileresActualizados = alquileres.filter(a => a.id !== Number(idAlquiler));
    guardarAlquileresEnDisco(alquileresActualizados);
    res.redirect('/');
});

// Editar Precio (Se mantiene igual)
app.post('/alquileres/editar-precio', (req, res) => {
    if (!req.session.usuarioLogueado) return res.status(401).json({ error: 'Inicia sesión.' });
    const { idAlquiler, nuevoPrecio } = req.body;
    const emailUsuarioActual = req.session.usuarioLogueado.email;
    const alquileres = leerAlquileresDeDisco();
    const alquilerEncontrado = alquileres.find(a => a.id === Number(idAlquiler));
    if (!alquilerEncontrado) return res.status(404).json({ error: 'No existe.' });
    if (alquilerEncontrado.dueno !== emailUsuarioActual) return res.status(403).json({ error: 'No tienes permiso.' });

    alquilerEncontrado.precio = Number(nuevoPrecio);
    guardarAlquileresEnDisco(alquileres);
    res.json({ exito: true });
});

app.listen(PUERTO, () => {
    console.log(`Servidor de Imágenes corriendo en http://localhost:${PUERTO}`);
});