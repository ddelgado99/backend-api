// =======================
// ENV (compatible ESM + Node 24)
// =======================
import 'dotenv/config';

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
// STATIC FILES
// =======================
app.use(express.static(path.join(__dirname, "public")));

// =======================
// ENV DEBUG (temporal)
// =======================
console.log("ENV CHECK:");
console.log("HOST:", process.env.MYSQLHOST);
console.log("USER:", process.env.MYSQLUSER);
console.log("PASS:", process.env.MYSQLPASSWORD ? "OK" : "NO");
console.log("DB:", process.env.MYSQLDATABASE);
console.log("PORT:", process.env.MYSQLPORT);

// =======================
// MYSQL CONNECTION
// =======================
const db = mysql.createConnection({
  host: process.env.MYSQLHOST || "localhost",
  user: process.env.MYSQLUSER || "root",
  password: process.env.MYSQLPASSWORD || "",
  database: process.env.MYSQLDATABASE,
  port: Number(process.env.MYSQLPORT) || 3306
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
    image_thumb3
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
    image_thumb3 || null
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
    image_thumb3
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
    id
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
// SERVER
// =======================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});

