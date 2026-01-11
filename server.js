// =======================
// ENV (Node 24 + ESM)
// =======================
import "dotenv/config";

import express from "express";
import mysql from "mysql2";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json());

// =======================
// __dirname (ESM)
// =======================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =======================
// ROOT (health check)
// =======================
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "🚀 Backend funcionando correctamente",
  });
});

// =======================
// MYSQL CONNECTION
// =======================
const db = mysql.createConnection({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: Number(process.env.MYSQLPORT) || 3306,
});

db.connect(err => {
  if (err) {
    console.error("❌ MySQL error:", err.message);
  } else {
    console.log("✅ MySQL conectado correctamente");
  }
});

// =======================
// GET PRODUCTS
// =======================
app.get("/products", (req, res) => {
  db.query("SELECT * FROM products ORDER BY id DESC", (err, rows) => {
    if (err) return res.status(500).json(err);
    res.json(rows);
  });
});

// =======================
// CREATE PRODUCT
// =======================
app.post("/products", (req, res) => {
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

  db.query(sql, values, (err, result) => {
    if (err) return res.status(500).json(err);
    res.json({ success: true, id: result.insertId });
  });
});

// =======================
// UPDATE PRODUCT
// =======================
app.put("/products/:id", (req, res) => {
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

  db.query(sql, values, err => {
    if (err) return res.status(500).json(err);
    res.json({ success: true });
  });
});

// =======================
// DELETE PRODUCT
// =======================
app.delete("/products/:id", (req, res) => {
  db.query(
    "DELETE FROM products WHERE id = ?",
    [req.params.id],
    err => {
      if (err) return res.status(500).json(err);
      res.json({ success: true });
    }
  );
});

// =======================
// VISIT TRACKING (ADMIN)
// =======================
// Nota: Al usar una variable en memoria, los datos se reinician si el servidor se reinicia.
// Para guardar permanentemente, deberías crear una tabla 'visits' en MySQL.
let visits = []; 

// 1. Registrar visita
app.post("/track-visit", (req, res) => {
  const now = new Date();
  visits.push(now);
  // Opcional: Limitar el array para que no crezca infinitamente en memoria
  if (visits.length > 5000) visits.shift(); 
  
  console.log(`👀 Visita registrada: ${now.toISOString()}`);
  res.json({ status: "ok" });
});

// 2. Obtener estadísticas
app.get("/admin/stats", (req, res) => {
  const stats = {};

  visits.forEach(date => {
    // Agrupar por Año-Mes (ej: 2023-10)
    const monthKey = date.toISOString().slice(0, 7); 
    if (!stats[monthKey]) {
      stats[monthKey] = 0;
    }
    stats[monthKey]++;
  });

  // Convertir a formato lista para el frontend
  const result = Object.keys(stats).map(key => ({
    month: key,
    count: stats[key]
  })).sort((a, b) => b.month.localeCompare(a.month)); // Ordenar descendente

  res.json(result);
});

// =======================
// SERVER
// =======================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
