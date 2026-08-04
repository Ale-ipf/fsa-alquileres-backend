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
const mysql = require('mysql2');

// Crear el pool de conexiones a la base de datos
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',      // Tu usuario de MySQL (por defecto suele ser root)
    password: '',      // Tu contraseña de MySQL
    database: 'fsa_alquileres',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Promisificar para poder usar async/await de forma limpia
const db = pool.promise();

// ==========================================
// RUTAS DE AUTENTICACIÓN CON MYSQL
// ==========================================

// 1. Registrar nuevo usuario en la Base de Datos
app.post('/registro', async (req, res) => {
    const { email, password, rol } = req.body;
    
    if (!email || !password || !rol) {
        return res.send('<h3>Faltan campos obligatorios. <a href="/registro.html">Volver</a></h3>');
    }

    try {
        // Verificar si el email ya existe en la tabla
        const [existe] = await db.query('SELECT * FROM usuarios WHERE email = ?', [email]);
        
        if (existe.length > 0) {
            return res.send('<h3>El email ya está registrado. <a href="/registro.html">Volver</a></h3>');
        }

        // Insertar el nuevo usuario en MySQL
        await db.query('INSERT INTO usuarios (email, password, rol) VALUES (?, ?, ?)', [email, password, rol]);
        
        res.redirect('/login.html');
    } catch (error) {
        console.error("Error en el registro:", error);
        res.status(500).send('<h3>Error interno del servidor al registrar.</h3>');
    }
});

// 2. Iniciar sesión consultando la Base de Datos
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Buscar al usuario por email y contraseña
        const [usuariosEncontrados] = await db.query(
            'SELECT * FROM usuarios WHERE email = ? AND password = ?', 
            [email, password]
        );

        if (usuariosEncontrados.length === 0) {
            return res.send('<h3>Credenciales incorrectas. <a href="/login.html">Volver</a></h3>');
        }

        // El usuario existe, lo guardamos en la sesión
        const usuario = usuariosEncontrados[0];
        req.session.usuarioLogueado = {
            id: usuario.id,
            email: usuario.email,
            rol: usuario.rol
            // Nota: El array de favoritos en memoria desaparece; luego lo manejaremos con una tabla puente si hiciera falta.
        };

        res.redirect('/');
    } catch (error) {
        console.error("Error en el login:", error);
        res.status(500).send('<h3>Error interno del servidor al iniciar sesión.</h3>');
    }
});

// 3. Cerrar sesión (Se mantiene igual, limpia la cookie)
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// 4. Conocer el estado de la sesión actual
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
// RUTAS DE ALQUILERES CON MYSQL
// ==========================================

// 1. Obtener todas las publicaciones
app.get('/alquileres', async (req, res) => {
    try {
        // Hacemos un JOIN para traer el email del dueño
        const [filas] = await db.query(`
            SELECT a.id, a.titulo, a.precio, a.barrio, a.ambientes, 
                   a.tipoInmueble, a.tieneAire, a.imagen, u.email AS dueno 
            FROM alquileres a
            JOIN usuarios u ON a.usuario_id = u.id
            ORDER BY a.id DESC
        `);
        
        // Convertimos el booleano para mantener compatibilidad con el frontend
        const alquileresFormateados = filas.map(a => ({
            ...a,
            tieneAire: Boolean(a.tieneAire)
        }));

        res.json(alquileresFormateados);
    } catch (error) {
        console.error("Error al obtener alquileres:", error);
        res.status(500).json({ error: "Error al obtener las publicaciones" });
    }
});

// 2. Publicar un nuevo alquiler (Solo Dueños)
app.post('/alquileres', upload.single('foto'), async (req, res) => {
    const usuario = req.session.usuarioLogueado;
    
    if (!usuario || usuario.rol !== 'dueno') {
        return res.status(403).send('No tenés permisos para publicar. Debes ser dueño.');
    }

    const { titulo, precio, barrio, ambientes, tipoInmueble, tieneAire } = req.body;
    const rutaImagen = req.file ? `/uploads/${req.file.filename}` : "/uploads/default-depto.jpg";

    try {
        await db.query(
            `INSERT INTO alquileres 
            (titulo, precio, barrio, ambientes, tipoInmueble, tieneAire, imagen, usuario_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                titulo,
                Number(precio),
                barrio,
                Number(ambientes),
                tipoInmueble || "Directo",
                tieneAire === 'si' || tieneAire === true ? 1 : 0,
                rutaImagen,
                usuario.id
            ]
        );

        res.redirect('/');
    } catch (error) {
        console.error("Error al guardar alquiler:", error);
        res.status(500).send('<h3>Error interno al publicar el alquiler.</h3>');
    }
});

// 3. Editar precio de una publicación existente
app.post('/alquileres/editar-precio', async (req, res) => {
    const usuario = req.session.usuarioLogueado;
    const { idAlquiler, nuevoPrecio } = req.body;

    if (!usuario) return res.status(401).json({ exito: false, mensaje: "No logueado" });

    try {
        const [filas] = await db.query('SELECT * FROM alquileres WHERE id = ?', [Number(idAlquiler)]);
        if (filas.length === 0) return res.status(404).json({ exito: false, mensaje: "No se encontró el alquiler" });

        const depto = filas[0];
        if (depto.usuario_id !== usuario.id) {
            return res.status(403).json({ exito: false, mensaje: "No eres el dueño de esta publicación" });
        }

        await db.query('UPDATE alquileres SET precio = ? WHERE id = ?', [Number(nuevoPrecio), Number(idAlquiler)]);
        res.json({ exito: true });
    } catch (error) {
        console.error("Error al editar precio:", error);
        res.status(500).json({ exito: false, mensaje: "Error de servidor" });
    }
});

// 4. Borrar publicación
app.post('/alquileres/borrar', async (req, res) => {
    const usuario = req.session.usuarioLogueado;
    const { idAlquiler } = req.body;

    if (!usuario) return res.status(401).send("No autorizado");

    try {
        const [filas] = await db.query('SELECT * FROM alquileres WHERE id = ?', [Number(idAlquiler)]);
        if (filas.length === 0) return res.status(404).send("No encontrado");

        if (filas[0].usuario_id !== usuario.id) {
            return res.status(403).send("No tienes permiso");
        }

        await db.query('DELETE FROM alquileres WHERE id = ?', [Number(idAlquiler)]);
        res.redirect('/');
    } catch (error) {
        console.error("Error al borrar alquiler:", error);
        res.status(500).send("Error interno al eliminar");
    }
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