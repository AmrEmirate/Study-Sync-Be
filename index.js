const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const nodemailer = require('nodemailer');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config();

const app = express();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.example.com",
  port: process.env.SMTP_PORT || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});
const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// API Endpoints

// 1. User Auth / Register (Email & Password)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { nama_lengkap, email, password } = req.body;
    let user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      if (user.is_verified) return res.status(400).json({ error: "Email already exists" });
      // If not verified, we can just resend OTP and update password
    }
    
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit OTP

    if (user) {
      user = await prisma.user.update({
        where: { email },
        data: { nama_lengkap, password, otp }
      });
    } else {
      user = await prisma.user.create({
        data: { nama_lengkap, email, password, otp }
      });
    }

    // Send email
    try {
      await transporter.sendMail({
        from: '"StudySyns App" <no-reply@studysyns.com>',
        to: email,
        subject: "StudySyns - Verifikasi Akun Anda",
        text: `Halo ${nama_lengkap},\n\nKode verifikasi (OTP) Anda adalah: ${otp}\n\nTerima kasih.`,
      });
    } catch (mailErr) {
      console.log("Mail sending skipped/failed (check .env config):", mailErr.message);
    }

    res.json({ message: "OTP sent to email", user_id: user.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 1.2. Verify OTP
app.post('/api/auth/verify', async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.otp !== otp) return res.status(400).json({ error: "Invalid OTP" });
    
    const verifiedUser = await prisma.user.update({
      where: { email },
      data: { is_verified: true, otp: null }
    });
    
    res.json(verifiedUser);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 1.5. User Auth / Login (Email/Password & Social)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, google_id_token } = req.body;
    
    // Social Login (Google)
    if (google_id_token) {
      const ticket = await googleClient.verifyIdToken({
        idToken: google_id_token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      const googleEmail = payload['email'];
      const googleName = payload['name'];
      const googleId = payload['sub'];

      let user = await prisma.user.findUnique({ where: { email: googleEmail } });
      if (!user) {
        user = await prisma.user.create({
          data: { google_id: googleId, nama_lengkap: googleName, email: googleEmail, is_verified: true }
        });
      } else {
        user = await prisma.user.update({
          where: { email: googleEmail },
          data: { google_id: googleId, nama_lengkap: googleName, is_verified: true }
        });
      }
      return res.json(user);
    }

    // Email & Password Login
    if (email && password) {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || user.password !== password) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      if (!user.is_verified) {
        return res.status(403).json({ error: "Account not verified. Please register again to get a new OTP." });
      }
      return res.json(user);
    }
    
    res.status(400).json({ error: "Invalid request" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 1.8. Get User Profile
app.get('/api/user/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({ where: { id: parseInt(id) } });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Get Tasks for a User
app.get('/api/tasks/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const tasks = await prisma.task.findMany({
      where: { user_id: parseInt(userId) },
      orderBy: { batas_waktu: 'asc' }
    });
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Create Task
app.post('/api/tasks', async (req, res) => {
  try {
    const { user_id, judul_tugas, deskripsi, batas_waktu, sumber } = req.body;
    const task = await prisma.task.create({
      data: {
        user_id,
        judul_tugas,
        deskripsi,
        batas_waktu: batas_waktu ? new Date(batas_waktu) : null,
        sumber: sumber || 'manual'
      }
    });
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Update Task Status
app.put('/api/tasks/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status_selesai } = req.body;
    const task = await prisma.task.update({
      where: { id: parseInt(id) },
      data: { status_selesai }
    });
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4.1 Update Task (Full Edit)
app.put('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { judul_tugas, deskripsi, batas_waktu } = req.body;
    const task = await prisma.task.update({
      where: { id: parseInt(id) },
      data: { 
        judul_tugas, 
        deskripsi, 
        batas_waktu: batas_waktu ? new Date(batas_waktu) : null 
      }
    });
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4.2 Delete Task
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.task.delete({
      where: { id: parseInt(id) }
    });
    res.json({ message: "Task deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Create or Update School Integration
app.post('/api/school-integration', async (req, res) => {
  try {
    const { user_id, endpoint_url, auth_token } = req.body;
    let integration = await prisma.schoolIntegration.findFirst({
      where: { user_id: parseInt(user_id) }
    });
    
    if (integration) {
      integration = await prisma.schoolIntegration.update({
        where: { id: integration.id },
        data: { endpoint_url, auth_token }
      });
    } else {
      integration = await prisma.schoolIntegration.create({
        data: {
          user_id: parseInt(user_id),
          endpoint_url,
          auth_token
        }
      });
    }
    res.json(integration);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Get School Integration
app.get('/api/school-integration/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const integration = await prisma.schoolIntegration.findFirst({
      where: { user_id: parseInt(userId) }
    });
    if (!integration) return res.status(404).json({ error: "Integration not found" });
    res.json(integration);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// 7. Update User Profile (Picture, Identitas, Nama Lengkap, Password)
app.put('/api/user/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { profile_picture, identitas, nama_lengkap, password } = req.body;
    
    // Create an object with only defined fields to avoid overwriting with undefined
    const dataToUpdate = {};
    if (profile_picture !== undefined) dataToUpdate.profile_picture = profile_picture;
    if (identitas !== undefined) dataToUpdate.identitas = identitas;
    if (nama_lengkap !== undefined) dataToUpdate.nama_lengkap = nama_lengkap;
    if (password !== undefined) dataToUpdate.password = password;

    const user = await prisma.user.update({
      where: { id: parseInt(id) },
      data: dataToUpdate
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 8. Dummy School API
app.get('/api/dummy-school/tasks', (req, res) => {
  const dummyTasks = [
    {
      id: 991,
      user_id: 1, // Will be ignored by app, app uses local ID
      judul_tugas: "[VPS] Tugas Jaringan Komputer",
      deskripsi: "Tugas dummy dari VPS server sekolah",
      batas_waktu: new Date(Date.now() + 86400000 * 2).toISOString(), // +2 days
      status_selesai: false,
      sumber: "sekolah"
    },
    {
      id: 992,
      user_id: 1,
      judul_tugas: "[VPS] Makalah Sistem Operasi",
      deskripsi: "Dikumpulkan minggu depan",
      batas_waktu: new Date(Date.now() + 86400000 * 7).toISOString(), // +7 days
      status_selesai: false,
      sumber: "sekolah"
    }
  ];
  res.json(dummyTasks);
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
