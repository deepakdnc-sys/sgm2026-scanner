const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure folders
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');
if (!fs.existsSync('./data')) fs.mkdirSync('./data');

// DB
const db = new sqlite3.Database('./data/bookings.db');
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    name TEXT,
    mobile TEXT,
    utr TEXT,
    screenshot TEXT,
    status TEXT,
    entries_used INTEGER DEFAULT 0,
    max_entries INTEGER DEFAULT 4,
    created_at TEXT
  )`);
});

// Multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './uploads/');
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + ext);
  }
});
const upload = multer({ storage });

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(session({ secret: 'sgm2026-secret', resave: false, saveUninitialized: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// Booking endpoint
app.post('/api/book', upload.single('screenshot'), (req, res) => {
  const { name, mobile, utr } = req.body;
  if (!name || !mobile || !utr) return res.status(400).json({ error: 'Missing required fields' });
  const id = uuidv4();
  const screenshot = req.file ? req.file.filename : null;
  const created_at = new Date().toISOString();
  const status = 'pending';
  db.run(`INSERT INTO bookings (id,name,mobile,utr,screenshot,status,created_at) VALUES (?,?,?,?,?,?,?)`,
    [id, name, mobile, utr, screenshot, status, created_at], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id, message: 'Booking received. Admin will verify payment to activate QR.' });
    });
});

// Find by UTR
app.get('/api/find', (req, res) => {
  const utr = req.query.utr;
  if (!utr) return res.status(400).json({ error: 'utr required' });
  db.get(`SELECT * FROM bookings WHERE utr = ?`, [utr], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  });
});

// Download ticket (generate QR PNG on the fly)
app.get('/api/ticket/:id/download', async (req, res) => {
  const id = req.params.id;
  db.get(`SELECT * FROM bookings WHERE id = ?`, [id], async (err, row) => {
    if (err) return res.status(500).send(err.message);
    if (!row) return res.status(404).send('Not found');
    const payload = JSON.stringify({ id: row.id, name: row.name, max_entries: row.max_entries });
    try {
      const dataUrl = await QRCode.toDataURL(payload, { errorCorrectionLevel: 'H', margin: 2 });
      // Build a simple HTML ticket and send as image/png using canvas on client; here send JSON with dataUrl
      res.json({ ticket: { id: row.id, name: row.name, mobile: row.mobile, utr: row.utr, qr: dataUrl, max_entries: row.max_entries, status: row.status } });
    } catch (e) {
      res.status(500).send(e.message);
    }
  });
});

// Admin login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  // Admin password as requested: ADMIN
  if (password === 'ADMIN') {
    req.session.admin = true;
    res.json({ ok: true });
  } else {
    res.status(401).json({ ok: false });
  }
});

// Admin list
app.get('/api/admin/list', (req, res) => {
  if (!req.session.admin) return res.status(401).json({ error: 'unauthorized' });
  db.all(`SELECT * FROM bookings ORDER BY created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => ({ ...r, screenshot_url: r.screenshot ? '/uploads/' + r.screenshot : null })));
  });
});

// Admin approve
app.post('/api/admin/approve', (req, res) => {
  if (!req.session.admin) return res.status(401).json({ error: 'unauthorized' });
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'id required' });
  db.run(`UPDATE bookings SET status = 'active' WHERE id = ?`, [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
});

// Admin disable
app.post('/api/admin/disable', (req, res) => {
  if (!req.session.admin) return res.status(401).json({ error: 'unauthorized' });
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'id required' });
  db.run(`UPDATE bookings SET status = 'pending' WHERE id = ?`, [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
});

// Admin delete
app.post('/api/admin/delete', (req, res) => {
  if (!req.session.admin) return res.status(401).json({ error: 'unauthorized' });
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'id required' });
  db.get(`SELECT screenshot FROM bookings WHERE id = ?`, [id], (err, row) => {
    if (row && row.screenshot) {
      const p = path.join(__dirname, 'uploads', row.screenshot);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    db.run(`DELETE FROM bookings WHERE id = ?`, [id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ ok: true });
    });
  });
});

// Admin create quick QR by name
app.post('/api/admin/create-quick', (req, res) => {
  if (!req.session.admin) return res.status(401).json({ error: 'unauthorized' });
  const { name, mobile } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = uuidv4();
  const created_at = new Date().toISOString();
  db.run(`INSERT INTO bookings (id,name,mobile,utr,screenshot,status,created_at) VALUES (?,?,?,?,?,?,?)`,
    [id, name, mobile || '', null, null, 'active', created_at], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id, ok: true });
    });
});

// Scanner endpoint (gate): password required each time (scanner password: 'admin')
app.post('/api/scan', (req, res) => {
  const { scannerPassword, id, count } = req.body;
  if (scannerPassword !== 'admin') return res.status(401).json({ error: 'invalid scanner password' });
  if (!id || !count) return res.status(400).json({ error: 'id and count required' });
  const cnt = parseInt(count, 10);
  if (isNaN(cnt) || cnt <= 0) return res.status(400).json({ error: 'count invalid' });
  db.get(`SELECT * FROM bookings WHERE id = ?`, [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'not found' });
    if (row.status !== 'active') return res.status(403).json({ error: 'qr not active' });
    const newUsed = (row.entries_used || 0) + cnt;
    if (newUsed > row.max_entries) return res.status(400).json({ error: 'exceeds max entries' });
    db.run(`UPDATE bookings SET entries_used = ? WHERE id = ?`, [newUsed, id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ ok: true, remaining: row.max_entries - newUsed });
    });
  });
});

// Simple route to get ticket data including QR dataUrl
app.get('/api/ticket/:id', async (req, res) => {
  const id = req.params.id;
  db.get(`SELECT * FROM bookings WHERE id = ?`, [id], async (err, row) => {
    if (err) return res.status(500).send(err.message);
    if (!row) return res.status(404).send('Not found');
    const payload = JSON.stringify({ id: row.id });
    try {
      const dataUrl = await QRCode.toDataURL(payload, { errorCorrectionLevel: 'H', margin: 2 });
      res.json({ ...row, qr: dataUrl, screenshot_url: row.screenshot ? '/uploads/' + row.screenshot : null });
    } catch (e) {
      res.status(500).send(e.message);
    }
  });
});

// Admin logout
app.post('/api/admin/logout', (req, res) => {
  req.session.admin = false;
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
