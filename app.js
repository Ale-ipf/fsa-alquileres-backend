const express = require('express');
const fs = require('fs');
const session = require('express-session'); // 🔥 NUEVO: Importamos el gestor de sesiones
const app = express();
const PUERTO = 3000;

// ==========================================
// 1. CONFIGURACIONES Y MIDDLEWARES
// ==========================================
app.use(express.urlencoded({ extended: true }));

// 🔥 NUEVO: Configuramos la fábrica de "pulseritas" (sesiones)
app.use(session({
    secret: 'mi-clave-secreta-de-formosa', // Una frase clave para firmar las cookies de forma segura
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Ponemos false porque estamos en localhost. En producción va true.
}));

app.use(express.static('public'));

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

// Registrar un usuario (Se mantiene igual)
app.post('/registro', (req, res) => {
    const { email, password, rol } = req.body;
    if (!email || !password || !rol) return res.status(400).send('Error: Faltan datos.');

    const usuarios = leerUsuariosDeDisco();
    if (usuarios.find(u => u.email === email)) return res.status(400).send('Error: El email ya existe.');

    usuarios.push({ email, password, rol });
    guardarUsuariosEnDisco(usuarios);
    res.redirect('/');
});


// 🔥 NUEVA RUTA: Iniciar Sesión (Login)
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const usuarios = leerUsuariosDeDisco();

    // Buscamos si existe el usuario con ese mail y contraseña
    const usuarioEncontrado = usuarios.find(u => u.email === email && u.password === password);

    if (!usuarioEncontrado) {
        return res.status(401).send('Error: Email o contraseña incorrectos ❌ <a href="/">Volver</a>');
    }

    // ¡Si coincide, le ponemos la pulserita guardando sus datos en la sesión!
    req.session.usuarioLogueado = {
        email: usuarioEncontrado.email,
        rol: usuarioEncontrado.rol
    };

    res.redirect('/'); // Volvemos al inicio, pero ahora ya está logueado
});


// 🔥 NUEVA RUTA: Saber quién está logueado (Para que el Frontend la consulte)
app.get('/quien-soy', (req, res) => {
    if (req.session.usuarioLogueado) {
        res.json({ logueado: true, usuario: req.session.usuarioLogueado });
    } else {
        res.json({ logueado: false });
    }
});


// 🔥 NUEVA RUTA: Cerrar Sesión (Logout)
app.get('/logout', (req, res) => {
    req.session.destroy(); // Destruimos la pulserita/sesión
    res.redirect('/');
});


// Publicar un Alquiler (PROTEGIDA CON SESIÓN)
app.post('/alquileres', (req, res) => {
    // 🔥 CAMBIO CLAVE: Ya no le pedimos el mail en el formulario. Lo sacamos de su sesión segura.
    if (!req.session.usuarioLogueado) {
        return res.status(401).send('Error: Debes iniciar sesión para publicar.');
    }

    const { email, rol } = req.session.usuarioLogueado;

    // Verificamos por seguridad que sea dueño
    if (rol !== 'dueno') {
        return res.status(403).send('Error: Solo los perfiles de tipo "dueño" pueden publicar.');
    }

    const { titulo, precio, barrio, tieneAire } = req.body;

    if (!titulo || !precio || !barrio) {
        return res.status(400).send('Error: Campos obligatorios incompletos.');
    }

    const alquileresExistentes = leerAlquileresDeDisco();
    
    const nuevoAlquiler = {
        id: Date.now(),
        dueno: email, // Usamos el mail de la sesión
        titulo,
        precio: Number(precio),
        barrio,
        tieneAire: tieneAire === 'si' ? true : false
    };

    alquileresExistentes.push(nuevoAlquiler);
    guardarAlquileresEnDisco(alquileresExistentes);

    res.redirect('/');
});

// Ver todos los alquileres (Se mantiene igual)
app.get('/alquileres', (req, res) => {
    const alquileres = leerAlquileresDeDisco();
    res.json(alquileres);
});

// 🔥 NUEVA RUTA: Borrar un alquiler específico
app.post('/alquileres/borrar', (req, res) => {
    // 1. Verificamos que haya alguien logueado
    if (!req.session.usuarioLogueado) {
        return res.status(401).send('Error: Debes iniciar sesión.');
    }

    const { idAlquiler } = req.body;
    const emailUsuarioActual = req.session.usuarioLogueado.email;

    const alquileres = leerAlquileresDeDisco();
    
    // 2. Buscamos el alquiler que queremos borrar
    const alquilerEncontrado = alquileres.find(a => a.id === Number(idAlquiler));

    if (!alquilerEncontrado) {
        return res.status(404).send('Error: El alquiler no existe.');
    }

    // 3. SEGURIDAD: Validamos que el usuario logueado sea el MISMO dueño que publicó el aviso
    if (alquilerEncontrado.dueno !== emailUsuarioActual) {
        return res.status(403).send('Error: No tienes permiso para borrar este alquiler ❌');
    }

    // 4. Lo filtramos para sacarlo de la lista (nos quedamos con todos los que NO tengan ese ID)
    const alquileresActualizados = alquileres.filter(a => a.id !== Number(idAlquiler));
    
    // 5. Guardamos la nueva lista limpia en el disco
    guardarAlquileresEnDisco(alquileresActualizados);

    // 6. Redirigimos al inicio para que vea el cambio al toque
    res.redirect('/');
});

// 🔥 NUEVA RUTA: Editar el precio de un alquiler específico
app.post('/alquileres/editar-precio', (req, res) => {
    // 1. Validación de sesión
    if (!req.session.usuarioLogueado) {
        return res.status(401).json({ error: 'Debes iniciar sesión.' });
    }

    const { idAlquiler, nuevoPrecio } = req.body;
    const emailUsuarioActual = req.session.usuarioLogueado.email;

    if (!nuevoPrecio || isNaN(nuevoPrecio) || Number(nuevoPrecio) <= 0) {
        return res.status(400).json({ error: 'Precio inválido.' });
    }

    const alquileres = leerAlquileresDeDisco();
    
    // 2. Buscamos el alquiler a editar
    const alquilerEncontrado = alquileres.find(a => a.id === Number(idAlquiler));

    if (!alquilerEncontrado) {
        return res.status(404).json({ error: 'El alquiler no existe.' });
    }

    // 3. SEGURIDAD: Validamos que el que edita sea el dueño real
    if (alquilerEncontrado.dueno !== emailUsuarioActual) {
        return res.status(403).json({ error: 'No tienes permiso para editar este alquiler ❌' });
    }

    // 4. Modificamos el precio en la lista
    alquilerEncontrado.precio = Number(nuevoPrecio);
    
    // 5. Guardamos los cambios en el archivo JSON
    guardarAlquileresEnDisco(alquileres);

    // 6. Respondemos con un OK en formato JSON (ya que esta petición se hace "en silencio" desde el frontend)
    res.json({ exito: true });
});

app.listen(PUERTO, () => {
    console.log(`Servidor con Login corriendo en http://localhost:${PUERTO}`);
});