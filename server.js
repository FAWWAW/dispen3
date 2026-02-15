const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const serverless = require('serverless-http');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== Configuration =====
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || 'https://discord.com/api/webhooks/1471112198368526659/jJwmHAtBOkDjrMoOLTY3QmxJsMFK4NfFTvNc_m8mpGBNo45LfYuQEV8p0Uutbd2VbigJ';

// ===== Middleware =====
app.use(cors());
app.use(express.json());

// Initialize Router
const router = express.Router();

// Mount Router at /api
app.use('/api', router);

// Serve static files from public/ only (jangan serve root agar server.js, db.json, dll tidak terekspos)
app.use(express.static(path.join(__dirname, 'public')));

// Create uploads directory if not exists
const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL;
const uploadsDir = isProduction ? path.join('/tmp', 'uploads') : path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `dispen_${Date.now()}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|pdf/;
        const ok = allowedTypes.test(path.extname(file.originalname).toLowerCase()) && allowedTypes.test(file.mimetype);
        cb(null, ok ? true : new Error('Hanya file gambar (JPEG, PNG, GIF) atau PDF yang diizinkan'));
    }
});

// ===== Anti-Spam =====
const recentSubmissions = new Map();
setInterval(() => {
    const now = Date.now();
    for (const [ip, ts] of recentSubmissions) {
        if (now - ts > 60000) recentSubmissions.delete(ip);
    }
}, 30000);

// ===== Firebase / Database =====
let db = null; // 'firebase' | 'file'
let firestore = null;
const DB_PATH = path.join(__dirname, 'db.json');

function initFirebase() {
    if (firestore) return true;
    try {
        // Opsi 1: Langsung baca file serviceAccountKey.json
        const keyFilePath = path.join(__dirname, 'serviceAccountKey.json');
        if (fs.existsSync(keyFilePath)) {
            const key = JSON.parse(fs.readFileSync(keyFilePath, 'utf8'));
            const admin = require('firebase-admin');
            if (!admin.apps.length) {
                admin.initializeApp({ credential: admin.credential.cert(key) });
            }
            firestore = admin.firestore();
            return true;
        }
        // Opsi 2: Env var JSON lengkap
        const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
        if (serviceAccountJson) {
            const key = JSON.parse(serviceAccountJson);
            const admin = require('firebase-admin');
            if (!admin.apps.length) {
                admin.initializeApp({ credential: admin.credential.cert(key) });
            }
            firestore = admin.firestore();
            return true;
        }
        // Opsi 3: Env var terpisah
        const projectId = process.env.FIREBASE_PROJECT_ID;
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        const privateKey = process.env.FIREBASE_PRIVATE_KEY;
        if (projectId && clientEmail && privateKey) {
            const admin = require('firebase-admin');
            if (!admin.apps.length) {
                admin.initializeApp({
                    credential: admin.credential.cert({
                        projectId,
                        clientEmail,
                        privateKey: privateKey.replace(/\\n/g, '\n')
                    })
                });
            }
            firestore = admin.firestore();
            return true;
        }
    } catch (e) {
        console.error('Firebase init error:', e.message);
    }
    return false;
}

if (initFirebase()) {
    db = 'firebase';
    console.log('📦 Database: Firebase Firestore');
} else {
    db = 'file';
    if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, JSON.stringify({ teachers: [], dispensations: [], photoDispensations: [] }, null, 2));
    }
    console.log('📦 Database: file (db.json)');
}

async function getTeachers() {
    if (db === 'firebase') {
        const snap = await firestore.collection('teachers').get();
        return snap.docs.map(d => {
            const data = d.data();
            const id = typeof data.id === 'number' ? data.id : parseInt(d.id, 10);
            return { ...data, id };
        });
    }
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    return data.teachers || [];
}

async function getDispensations() {
    if (db === 'firebase') {
        const snap = await firestore.collection('dispensations').get();
        return snap.docs
            .map(d => {
                const data = d.data();
                const id = typeof data.id === 'number' ? data.id : parseInt(d.id, 10);
                return { ...data, id };
            })
            .sort((a, b) => (new Date(b.createdAt) || 0) - (new Date(a.createdAt) || 0));
    }
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    return data.dispensations || [];
}

async function getDispensationById(id) {
    const numId = parseInt(id, 10);
    if (Number.isNaN(numId)) return null;
    if (db === 'firebase') {
        const snap = await firestore.collection('dispensations').doc(String(numId)).get();
        if (!snap.exists) return null;
        return { id: numId, ...snap.data() };
    }
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    return (data.dispensations || []).find(d => d.id === numId) || null;
}

async function addDispensation(d) {
    if (db === 'firebase') {
        await firestore.collection('dispensations').doc(String(d.id)).set(d);
        return d;
    }
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    data.dispensations = data.dispensations || [];
    data.dispensations.push(d);
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    return d;
}

async function updateDispensationById(id, updates) {
    const numId = parseInt(id, 10);
    if (Number.isNaN(numId)) return null;
    if (db === 'firebase') {
        const ref = firestore.collection('dispensations').doc(String(numId));
        await ref.update(updates);
        const snap = await ref.get();
        return snap.exists ? { id: numId, ...snap.data() } : null;
    }
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    const idx = (data.dispensations || []).findIndex(d => d.id === numId);
    if (idx === -1) return null;
    data.dispensations[idx] = { ...data.dispensations[idx], ...updates };
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    return data.dispensations[idx];
}

// Seed teachers from db.json into Firestore (once) if Firebase is empty
async function seedTeachersIfNeeded() {
    if (db !== 'firebase') return;
    const snap = await firestore.collection('teachers').limit(1).get();
    if (!snap.empty) return;
    if (!fs.existsSync(DB_PATH)) return;
    try {
        const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
        const teachers = data.teachers || [];
        for (const t of teachers) {
            await firestore.collection('teachers').doc(String(t.id)).set(t);
        }
        if (teachers.length) console.log('📦 Seeded', teachers.length, 'teachers from db.json to Firestore');
    } catch (e) {
        console.error('Seed teachers error:', e.message);
    }
}

function generateTrackingCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'DSP-';
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

function formatDateTime(dateString) {
    return new Date(dateString).toLocaleString('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

// ===== Discord Webhook =====
async function sendDiscordWebhook(dispensation) {
    const embed = {
        title: '🔔 Permintaan Dispensasi Baru',
        color: 0xf59e0b,
        fields: [
            { name: '👤 Siswa', value: dispensation.studentName, inline: true },
            { name: '🏫 Kelas', value: dispensation.studentClass, inline: true },
            { name: '📋 Alasan', value: dispensation.reason, inline: false },
            { name: '📍 Tujuan', value: dispensation.destination || '-', inline: true },
            { name: '🕐 Waktu Keluar', value: formatDateTime(dispensation.departureTime), inline: true },
            { name: '🕑 Waktu Kembali', value: formatDateTime(dispensation.returnTime), inline: true },
            { name: '🎫 Kode Tracking', value: `\`${dispensation.trackingCode}\``, inline: true },
        ],
        footer: { text: '⏳ Menunggu persetujuan' },
        timestamp: new Date().toISOString()
    };
    try {
        const res = await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: null, embeds: [embed] })
        });
        return res.ok;
    } catch (e) {
        console.error('Discord webhook:', e.message);
        return false;
    }
}

async function sendDiscordUpdate(dispensation, status, approverName) {
    const color = status === 'approved' ? 0x22c55e : 0xef4444;
    const emoji = status === 'approved' ? '✅' : '❌';
    const text = status === 'approved' ? 'DISETUJUI' : 'DITOLAK';
    const embed = {
        title: `${emoji} Dispensasi ${text}`,
        color,
        fields: [
            { name: '👤 Siswa', value: dispensation.studentName, inline: true },
            { name: '🏫 Kelas', value: dispensation.studentClass, inline: true },
            { name: '📋 Alasan', value: dispensation.reason, inline: false },
            { name: '🎫 Kode Tracking', value: `\`${dispensation.trackingCode}\``, inline: true },
            { name: `${emoji} Diproses oleh`, value: approverName, inline: true },
        ],
        timestamp: new Date().toISOString()
    };
    try {
        await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] })
        });
    } catch (e) {
        console.error('Discord update:', e.message);
    }
}

// ===== API Routes =====

router.get('/dispensations', async (req, res) => {
    try {
        let list = await getDispensations();
        if (req.query.trackingCode) {
            list = list.filter(d => d.trackingCode === req.query.trackingCode);
        }
        res.json(list);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Gagal mengambil data.' });
    }
});

router.get('/dispensations/:id', async (req, res) => {
    try {
        const d = await getDispensationById(req.params.id);
        if (d) res.json(d);
        else res.status(404).json({ error: 'Not found' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Gagal mengambil data.' });
    }
});

router.post('/dispensations', upload.single('photo'), async (req, res) => {
    try {
        const clientIP = req.ip || req.connection?.remoteAddress || 'unknown';
        const last = recentSubmissions.get(clientIP);
        if (last && (Date.now() - last) < 30000) {
            if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            return res.status(429).json({ error: 'Jangan Iseng Atuhh :(' });
        }
        recentSubmissions.set(clientIP, Date.now());

        const id = Date.now();
        const newDispensation = {
            id,
            studentName: req.body.studentName,
            studentClass: req.body.studentClass,
            reason: req.body.reason,
            destination: req.body.destination || '',
            departureTime: req.body.departureTime,
            returnTime: req.body.returnTime,
            photoPath: req.file ? `/uploads/${req.file.filename}` : null,
            photoOriginalName: req.file ? req.file.originalname : null,
            trackingCode: generateTrackingCode(),
            status: 'pending',
            approvedBy: null,
            createdAt: new Date().toISOString(),
            returnedAt: null
        };

        await addDispensation(newDispensation);
        sendDiscordWebhook(newDispensation).catch(() => { });
        res.status(201).json(newDispensation);
    } catch (e) {
        console.error('Error creating dispensation:', e);
        res.status(500).json({ error: 'Gagal membuat dispensasi. Silakan coba lagi.' });
    }
});

router.patch('/dispensations/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const existing = await getDispensationById(id);
        if (!existing) return res.status(404).json({ error: 'Not found' });

        const oldStatus = existing.status;
        const updated = await updateDispensationById(id, req.body);
        if (oldStatus === 'pending' && (updated.status === 'approved' || updated.status === 'rejected')) {
            sendDiscordUpdate(updated, updated.status, req.body.approvedBy || 'Guru').catch(() => { });
        }
        res.json(updated);
    } catch (e) {
        console.error('Error updating dispensation:', e);
        res.status(500).json({ error: 'Gagal mengupdate dispensasi.' });
    }
});

router.get('/teachers', async (req, res) => {
    try {
        await seedTeachersIfNeeded();
        let teachers = await getTeachers();
        if (req.query.username && req.query.password) {
            teachers = teachers.filter(t =>
                t.username === req.query.username && t.password === req.query.password
            );
        }
        const safe = teachers.map(t => ({ id: t.id, username: t.username, name: t.name, role: t.role }));
        res.json(safe);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Gagal mengambil data guru.' });
    }
});

app.use('/uploads', express.static(uploadsDir));

// ===== Start Server =====
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`\n🚀 Server berjalan di port ${PORT}`);
        console.log(`💬 Discord Webhook aktif`);
        console.log(`\n✅ Sistem siap digunakan!\n`);
    });
}

module.exports = app;
module.exports.handler = serverless(app);
