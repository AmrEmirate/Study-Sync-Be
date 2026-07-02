const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const targetEmail = "amremirate03@gmail.com";
  const targetPassword = "Itawanezila03)";
  
  // 1. Delete all tasks and integrations first due to foreign key constraints
  await prisma.task.deleteMany({});
  await prisma.schoolIntegration.deleteMany({});
  console.log("Deleted all old tasks and integrations.");

  // 2. Find or create the target user
  let targetUser = await prisma.user.findUnique({ where: { email: targetEmail } });
  
  if (!targetUser) {
    targetUser = await prisma.user.create({
      data: {
        nama_lengkap: "Amr Emirate",
        email: targetEmail,
        password: targetPassword,
        is_verified: true
      }
    });
    console.log("Created target user.");
  } else {
    targetUser = await prisma.user.update({
      where: { email: targetEmail },
      data: { password: targetPassword, is_verified: true }
    });
    console.log("Updated target user.");
  }

  // 3. Delete all other users
  const deletedUsers = await prisma.user.deleteMany({
    where: {
      email: {
        not: targetEmail
      }
    }
  });
  console.log(`Deleted ${deletedUsers.count} other users.`);

  // 4. Create 10 dummy tasks
  const tasks = [];
  for (let i = 1; i <= 10; i++) {
    tasks.push({
      user_id: targetUser.id,
      judul_tugas: `Tugas Contoh ${i} - Matematika`,
      deskripsi: `Selesaikan halaman ${i * 10} dari buku paket.`,
      batas_waktu: new Date(Date.now() + (86400000 * i)), // i days from now
      status_selesai: i % 3 === 0, // Every 3rd task is completed
      sumber: i % 2 === 0 ? "manual" : "sekolah"
    });
  }
  await prisma.task.createMany({ data: tasks });
  console.log("Inserted 10 dummy tasks.");

  // 5. Create 10 dummy integrations
  const integrations = [];
  for (let i = 1; i <= 10; i++) {
    integrations.push({
      user_id: targetUser.id,
      endpoint_url: `https://api.sekolah-contoh-${i}.com/sync`,
      auth_token: `dummy_token_abc123_${i}`,
      waktu_sinkronisasi_terakhir: new Date()
    });
  }
  await prisma.schoolIntegration.createMany({ data: integrations });
  console.log("Inserted 10 dummy school integrations.");

  console.log("\n==================================");
  console.log("Berhasil menyiapkan data akun!");
  console.log("Email: " + targetEmail);
  console.log("Password: " + targetPassword);
  console.log("Total Task: 10");
  console.log("Total Integrasi API: 10");
  console.log("==================================");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
