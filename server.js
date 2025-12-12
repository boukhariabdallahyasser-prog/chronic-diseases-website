const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// نموذج المستخدم
const userSchema = new mongoose.Schema({
  role: { type: String, required: true }, // 'doctor' or 'patient'
  id: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  medicalInfo: { type: String, default: 'لا توجد معلومات طبية' },
  notifications: [{ message: String, date: { type: Date, default: Date.now } }]
});

const User = mongoose.model('User', userSchema);

// اتصال بقاعدة البيانات
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dr-boukhatem-db')
  .then(() => console.log('✅ قاعدة البيانات متصلة'))
  .catch(err => console.log('خطأ:', err));

// بيانات تجريبية
async function seedData() {
  if (await User.countDocuments({ role: 'doctor' }) === 0) {
    const hashed = await bcrypt.hash('admin123', 12);
    await User.create({ role: 'doctor', id: 'admin', password: hashed, name: 'د. بوخاتم' });
  }
}
seedData();

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
  const { id, password, role } = req.body;
  try {
    const user = await User.findOne({ id, role });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ success: false, msg: 'بيانات غير صحيحة' });
    }
    const token = jwt.sign({ id: user.id, role: user.role }, 'dr_boukhatem_secret_2025', { expiresIn: '24h' });
    res.json({ success: true, token, name: user.name, role: user.role });
  } catch (err) {
    res.status(500).json({ success: false, msg: 'خطأ في الخادم' });
  }
});

// تسجيل حساب جديد (للمرضى فقط، من الطبيب أو المريض يسجل نفسه)
app.post('/api/signup', async (req, res) => {
  const { id, password, name } = req.body;
  try {
    if (await User.findOne({ id })) return res.status(400).json({ success: false, msg: 'المعرف موجود بالفعل' });
    const hashed = await bcrypt.hash(password, 12);
    await User.create({ role: 'patient', id, password: hashed, name });
    res.json({ success: true, msg: 'تم إنشاء الحساب بنجاح' });
  } catch (err) {
    res.status(500).json({ success: false, msg: 'خطأ في الخادم' });
  }
});

// حذف حساب (الطبيب فقط)
app.post('/api/delete-account', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false });
  try {
    const decoded = jwt.verify(token, 'dr_boukhatem_secret_2025');
    if (decoded.role !== 'doctor') return res.status(403).json({ success: false });
    const { patientId } = req.body;
    await User.deleteOne({ id: patientId, role: 'patient' });
    res.json({ success: true, msg: 'تم حذف الحساب' });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// باقي الـ API (patients, patient-info, update-patient) نفس السابق

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => console.log('مستخدم متصل'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Dr Boukhatem Website يعمل على ${PORT}`));
