// =======================
// ENV (Node 24 + ESM)
// =======================
import "dotenv/config";

import express from "express";
import mysql from "mysql2/promise";
import cors from "cors";

const app = express();
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

// Test inicial (no mata el server si falla)
(async () => {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    console.log("✅ MySQL pool conectado");
  } catch (err) {
    console.error("⚠️ MySQL aún no disponible:", err.message);
  }
})();

// =======================
// KEEP DB ALIVE (IMPORTANTE)
// =======================
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
// GET PRODUCTS
// =======================
app.get("/products", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM products ORDER BY id DESC"
    );
    res.json(rows);
  } catch (err) {
    console.error("❌ /products error:", err.message);
    res.status(500).json({ error: "database unavailable" });
  }
});

// =======================
// CREATE PRODUCT
// =======================
app.post("/products", async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      discount,
      image_main,
      image_thumb1,
      image_thumb2,
      image_thumb3,
    } = req.body;

    const sql = `
      INSERT INTO products
      (name, description, price, discount, image_main, image_thumb1, image_thumb2, image_thumb3)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      name,
      description,
      Number(price) || 0,
      Number(discount) || 0,
      image_main || null,
      image_thumb1 || null,
      image_thumb2 || null,
      image_thumb3 || null,
    ];

    const [result] = await pool.query(sql, values);
    res.json({ success: true, id: result.insertId });

  } catch (err) {
    console.error("❌ create product error:", err.message);
    res.status(500).json({ error: "insert failed" });
  }
});

// =======================
// UPDATE PRODUCT
// =======================
app.put("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const {
      name,
      description,
      price,
      discount,
      image_main,
      image_thumb1,
      image_thumb2,
      image_thumb3,
    } = req.body;

    const sql = `
      UPDATE products SET
        name = ?,
        description = ?,
        price = ?,
        discount = ?,
        image_main = ?,
        image_thumb1 = ?,
        image_thumb2 = ?,
        image_thumb3 = ?
      WHERE id = ?
    `;

    const values = [
      name,
      description,
      Number(price) || 0,
      Number(discount) || 0,
      image_main || null,
      image_thumb1 || null,
      image_thumb2 || null,
      image_thumb3 || null,
      id,
    ];

    await pool.query(sql, values);
    res.json({ success: true });

  } catch (err) {
    console.error("❌ update error:", err.message);
    res.status(500).json({ error: "update failed" });
  }
});

// =======================
// DELETE PRODUCT
// =======================
app.delete("/products/:id", async (req, res) => {
  try {
    await pool.query(
      "DELETE FROM products WHERE id = ?",
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("❌ delete error:", err.message);
    res.status(500).json({ error: "delete failed" });
  }
});

// =======================
// SERVER
// =======================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
