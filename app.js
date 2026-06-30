const express = require('express');
const multer = require('multer');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();

// 1. CONFIGURACIÓN DE SESIONES
app.use(session({
    secret: 'secreto-litoraleño-123',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Cambiar a true si se usa HTTPS en producción
}));

// 2. MIDDLEWARES PARA PROCESAR DATOS
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Asegurar que la carpeta 'uploads' exista
if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
}

// 3. CONFIGURACIÓN DE MULTER (Subida de fotos)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './uploads');
    },
    filename: (req, file, cb) => {
        // Guardar con timestamp para evitar nombres duplicados
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// 4. BASE DE DATOS EN MEMORIA (Simulada)
let usuarios = [
    { email: "dueno@test.com", password: "123", rol: "dueno", favoritos: [] },
    { email: "estudiante@test.com", password: "123", rol: "inquilino", favoritos: [] }
];

let alquileres = [
    {
        id: 1,
        titulo: "Monoambiente luminoso cerca de la UNaF",
        precio: 180000,
        barrio: "UNaF",
        ambientes: 1,
        tipoInmueble: "Directo",
        tieneAire: true,
        imagen: "/uploads/default-depto.jpg", // Asegurar tener una imagen base o subir una nueva
        dueno: "dueno@test.com"
    }
];

// ==========================================
// RUTAS DE AUTENTICACIÓN
// ==========================================

// Registrar nuevo usuario
app.post('/registro', (req, res) => {
    const { email, password, rol } = req.body;
    
    if (!email || !password || !rol) {
        return res.send('<h3>Faltan campos obligatorios. <a href="/registro.html">Volver</a></h3>');
    }

    const existe = usuarios.find(u => u.email === email);
    if (existe) {
        return res.send('<h3>El email ya está registrado. <a href="/registro.html">Volver</a></h3>');
    }

    usuarios.push({ email, password, rol, favoritos: [] });
    res.redirect('/login.html');
});

// Iniciar sesión
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const usuario = usuarios.find(u => u.email === email && u.password === password);

    if (!usuario) {
        return res.send('<h3>Credenciales incorrectas. <a href="/login.html">Volver</a></h3>');
    }

    req.session.usuarioLogueado = usuario;
    res.redirect('/');
});

// Cerrar sesión
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Conocer el estado de la sesión actual (Front-end consulta acá)
app.get('/quien-soy', (req, res) => {
    if (req.session.usuarioLogueado) {
        res.json({
            logueado: true,
            usuario: {
                email: req.session.usuarioLogueado.email,
                rol: req.session.usuarioLogueado.rol
            }
        });
    } else {
        res.json({ logueado: false });
    }
});

// ==========================================
// RUTAS DE ALQUILERES
// ==========================================

// Obtener todas las propiedades
app.get('/alquileres', (req, res) => {
    res.json(alquileres);
});

// Publicar un nuevo alquiler (Solo Dueños)
app.post('/alquileres', upload.single('foto'), (req, res) => {
    const usuario = req.session.usuarioLogueado;
    
    if (!usuario || usuario.rol !== 'dueno') {
        return res.status(403).send('No tenés permisos para publicar. Debes ser dueño.');
    }

    const { titulo, precio, barrio, ambientes, tipoInmueble, tieneAire } = req.body;
    const rutaImagen = req.file ? `/uploads/${req.file.filename}` : "/uploads/default-depto.jpg";

    const nuevoAlquiler = {
        id: Date.now(), // ID dinámico único
        titulo,
        precio: Number(precio),
        barrio,
        ambientes: Number(ambientes),
        tipoInmueble: tipoInmueble || "Directo",
        tieneAire: tieneAire === 'si',
        imagen: rutaImagen,
        dueno: usuario.email
    };

    alquileres.push(nuevoAlquiler);
    res.redirect('/');
});

// Editar precio de una publicación existente
app.post('/alquileres/editar-precio', (req, res) => {
    const usuario = req.session.usuarioLogueado;
    const { idAlquiler, nuevoPrecio } = req.body;

    if (!usuario) return res.status(401).json({ exito: false, mensaje: "No logueado" });

    const depto = alquileres.find(a => a.id === Number(idAlquiler));
    if (!depto) return res.status(404).json({ exito: false, mensaje: "No se encontró el alquiler" });

    if (depto.dueno !== usuario.email) {
        return res.status(403).json({ exito: false, mensaje: "No eres el dueño de esta publicación" });
    }

    depto.precio = Number(nuevoPrecio);
    res.json({ exito: true });
});

// Borrar publicación
app.post('/alquileres/borrar', (req, res) => {
    const usuario = req.session.usuarioLogueado;
    const { idAlquiler } = req.body;

    if (!usuario) return res.status(401).send("No autorizado");

    const deptoIndex = alquileres.findIndex(a => a.id === Number(idAlquiler));
    if (deptoIndex === -1) return res.status(404).send("No encontrado");

    if (alquileres[deptoIndex].dueno !== usuario.email) {
        return res.status(403).send("No tienes permiso");
    }

    alquileres.splice(deptoIndex, 1);
    res.redirect('/');
});

// ==========================================
// ⭐ SISTEMA DE FAVORITOS (Para Inquilinos) ⭐
// ==========================================

// 1. Obtener la lista de favoritos del usuario actual
app.get('/usuarios/favoritos', (req, res) => {
    if (!req.session.usuarioLogueado) return res.json([]);
    
    if (!req.session.usuarioLogueado.favoritos) {
        req.session.usuarioLogueado.favoritos = [];
    }
    
    res.json(req.session.usuarioLogueado.favoritos);
});

// 2. Agregar o quitar de favoritos (Toggle)
app.post('/usuarios/favoritos/toggle', (req, res) => {
    if (!req.session.usuarioLogueado) {
        return res.status(401).json({ exito: false, mensaje: "Debes iniciar sesión" });
    }

    const { idAlquiler } = req.body;
    if (!idAlquiler) return res.status(400).json({ exito: false });

    if (!req.session.usuarioLogueado.favoritos) {
        req.session.usuarioLogueado.favoritos = [];
    }

    const favoritos = req.session.usuarioLogueado.favoritos;
    const idNum = Number(idAlquiler);
    const index = favoritos.indexOf(idNum);

    let agregado = false;
    if (index === -1) {
        favoritos.push(idNum); // Si no estaba, lo añade
        agregado = true;
    } else {
        favoritos.splice(index, 1); // Si ya estaba, lo quita
    }

    res.json({ exito: true, agregado: agregado, favoritos: favoritos });
});

// LEVANTAR EL SERVIDOR
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});