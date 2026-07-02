const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
require('dotenv').config();

const app = express();
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
      return res.status(400).json({ error: "Email already exists" });
    }
    // In production, hash password with bcrypt!
    user = await prisma.user.create({
      data: { nama_lengkap, email, password }
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 1.5. User Auth / Login (Email/Password & Social)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, google_id, nama_lengkap } = req.body;
    
    // Social Login (Google)
    if (google_id) {
      let user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        user = await prisma.user.create({
          data: { google_id, nama_lengkap, email }
        });
      } else if (!user.google_id) {
        user = await prisma.user.update({
          where: { email },
          data: { google_id, nama_lengkap }
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


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
