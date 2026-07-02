const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Memulai proses seeding data dummy...");

  // 1. Buat Akun Login Dummy
  const user = await prisma.user.upsert({
    where: { email: 'dummy@studysyns.com' },
    update: {},
    create: {
      nama_lengkap: 'Akun Dummy',
      email: 'dummy@studysyns.com',
      password: 'password123',
    },
  });

  console.log(`Berhasil membuat user dummy: ${user.email} (ID: ${user.id})`);

  // 2. Buat 10 Data Task (Tugas)
  console.log("Menghapus tugas lama (jika ada) untuk akun ini...");
  await prisma.task.deleteMany({ where: { user_id: user.id } });
  
  console.log("Memasukkan 10 tugas dummy...");
  const taskData = [];
  for (let i = 1; i <= 10; i++) {
    const batasWaktu = new Date();
    batasWaktu.setDate(batasWaktu.getDate() + (i % 5)); // Bervariasi hingga 5 hari ke depan

    taskData.push({
      user_id: user.id,
      judul_tugas: `Tugas Matematika Bab ${i}`,
      deskripsi: `Mengerjakan latihan soal halaman ${i * 10} sampai ${i * 10 + 5}`,
      batas_waktu: batasWaktu,
      status_selesai: i % 3 === 0, // Setiap tugas ke-3 akan berstatus selesai
      sumber: i % 2 === 0 ? 'sekolah' : 'manual'
    });
  }
  await prisma.task.createMany({ data: taskData });

  // 3. Buat 10 Data School Integration (Integrasi Sekolah)
  console.log("Menghapus integrasi sekolah lama (jika ada) untuk akun ini...");
  await prisma.schoolIntegration.deleteMany({ where: { user_id: user.id } });

  console.log("Memasukkan 10 integrasi sekolah dummy...");
  const integrationData = [];
  for (let i = 1; i <= 10; i++) {
    integrationData.push({
      user_id: user.id,
      endpoint_url: `https://api.sekolah${i}.edu/v1/sync`,
      auth_token: `token_dummy_sekolah_${i}_abc123`,
      waktu_sinkronisasi_terakhir: new Date()
    });
  }
  await prisma.schoolIntegration.createMany({ data: integrationData });

  console.log("Proses seeding selesai! Data dummy berhasil dimasukkan.");
}

main()
  .catch((e) => {
    console.error("Terjadi error saat seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
