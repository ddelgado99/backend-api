// =======================
// ENV (Node 24 + ESM)
// =======================
import "dotenv/config";

import express from "express";
import mysql from "mysql2/promise";
import cors from "cors";

const app = express();

// Configuración CORS permisiva
app.use(cors());
app.use(express.json());

// =======================
// HEALTH (Render ping)
// =======================
app.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "🚀 Backend activo",
    time: new Date().toISOString()
  });
});

app.get("/health", (req, res) => {
  res.status(200).send("ok");
});

// =======================
// MYSQL POOL (ANTI SLEEP)
// =======================
if (!process.env.MYSQLHOST || !process.env.MYSQLUSER) {
  console.warn("⚠️ ADVERTENCIA: Variables de entorno de MySQL no detectadas completamente.");
}

const pool = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: Number(process.env.MYSQLPORT) || 3306,

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,

  enableKeepAlive: true,
  keepAliveInitialDelay: 10000
});

(async () => {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    console.log("✅ MySQL pool conectado exitosamente");
  } catch (err) {
    console.error("⚠️ Error conectando a MySQL:", err.message);
  }
})();

app.get("/keep-db-alive", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).send("db alive");
  } catch (err) {
    console.error("❌ keep-db-alive error:", err.message);
    res.status(500).send("db error");
  }
});

// =======================
// PRODUCT ROUTES
// =======================
app.get("/products", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM products ORDER BY id DESC");
    res.json(rows);
  } catch (err) {
    console.error("❌ /products error:", err.message);
    res.status(500).json({ error: "database unavailable" });
  }
});

app.post("/products", async (req, res) => {
  try {
    console.log("📥 Recibiendo nuevo producto:", req.body);
    const { name, description, price, discount, image_main, image_thumb1, image_thumb2, image_thumb3 } = req.body;
    
    const sql = `INSERT INTO products (name, description, price, discount, image_main, image_thumb1, image_thumb2, image_thumb3) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    const values = [name, description, Number(price)||0, Number(discount)||0, image_main||null, image_thumb1||null, image_thumb2||null, image_thumb3||null];

    const [result] = await pool.query(sql, values);
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    console.error("❌ Error creando producto:", err.message);
    res.status(500).json({ error: "insert failed" });
  }
});

app.put("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📥 Actualizando producto ID ${id}:`, req.body);
    const { name, description, price, discount, image_main, image_thumb1, image_thumb2, image_thumb3 } = req.body;

    const sql = `UPDATE products SET name=?, description=?, price=?, discount=?, image_main=?, image_thumb1=?, image_thumb2=?, image_thumb3=? WHERE id=?`;
    const values = [name, description, Number(price)||0, Number(discount)||0, image_main||null, image_thumb1||null, image_thumb2||null, image_thumb3||null, id];

    await pool.query(sql, values);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Error actualizando producto:", err.message);
    res.status(500).json({ error: "update failed" });
  }
});

app.delete("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM products WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Error eliminando producto:", err.message);
    res.status(500).json({ error: "delete failed" });
  }
});

// =======================
// SERVER START
// =======================
const PORT = process.env.PORT || 10000;
const server = app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log('Puerto ocupado, reintentando...');
    setTimeout(() => { server.close(); server.listen(PORT); }, 1000);
  }
});
