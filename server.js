// =======================
// ENV (Node 24 + ESM)
// =======================
import "dotenv/config";

import express from "express";
import mysql from "mysql2/promise";
import cors from "cors";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";

// =======================
// APP
// =======================
const app = express();
app.use(cors());

// ⚠️ NO express.json() porque usamos multipart/form-data

// =======================
// SUPABASE
// =======================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// =======================
// MULTER (MEMORY)
// =======================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB por imagen
});

// =======================
// MYSQL POOL
// =======================
const pool = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: Number(process.env.MYSQLPORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10
});

// =======================
// HEALTH
// =======================
app.get("/", (_, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// =======================
// HELPERS
// =======================
async function uploadToSupabase(file) {
  const ext = file.originalname.split(".").pop();
  const fileName = `products/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.${ext}`;

  const { error } = await supabase.storage
    .from("products")
    .upload(fileName, file.buffer, {
      contentType: file.mimetype
    });

  if (error) throw error;

  const { data } = supabase.storage
    .from("products")
    .getPublicUrl(fileName);

  return data.publicUrl;
}

async function deleteFromSupabase(url) {
  if (!url) return;
  const idx = url.indexOf("/products/");
  if (idx === -1) return;

  const path = url.slice(idx + 1);
  await supabase.storage.from("products").remove([path]);
}

// =======================
// CREATE PRODUCT + IMAGES
// =======================
app.post("/products", upload.array("images", 5), async (req, res) => {
  try {
    const {
      name,
      description = "",
      price = 0,
      discount = 0
    } = req.body;

    if (!name || !req.files || !req.files.length) {
      return res.status(400).json({
        error: "Nombre e imágenes obligatorias"
      });
    }

    const images = [];
    for (const file of req.files) {
      const url = await uploadToSupabase(file);
      images.push(url);
    }

    const image_main = images[0];

    const [result] = await pool.query(
      `INSERT INTO products
       (name, description, price, discount, image_main, images)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        name,
        description,
        Number(price),
        Number(discount),
        image_main,
        JSON.stringify(images)
      ]
    );

    res.json({
      success: true,
      id: result.insertId,
      image_main,
      images
    });

  } catch (err) {
    console.error("❌ create product:", err);
    res.status(500).json({ error: "server error" });
  }
});

// =======================
// GET PRODUCTS
// =======================
app.get("/products", async (_, res) => {
  const [rows] = await pool.query(
    "SELECT * FROM products ORDER BY id DESC"
  );

  rows.forEach(p => {
    p.images = p.images ? JSON.parse(p.images) : [];
  });

  res.json(rows);
});

// =======================
// UPDATE PRODUCT
// =======================
app.put("/products/:id", upload.array("images", 5), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description = "",
      price = 0,
      discount = 0
    } = req.body;

    const [rows] = await pool.query(
      "SELECT * FROM products WHERE id = ?",
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    let images = rows[0].images ? JSON.parse(rows[0].images) : [];

    if (req.files && req.files.length) {
      for (const file of req.files) {
        const url = await uploadToSupabase(file);
        images.push(url);
      }
    }

    const image_main = images[0] || null;

    await pool.query(
      `UPDATE products SET
        name = ?,
        description = ?,
        price = ?,
        discount = ?,
        image_main = ?,
        images = ?
       WHERE id = ?`,
      [
        name,
        description,
        Number(price),
        Number(discount),
        image_main,
        JSON.stringify(images),
        id
      ]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("❌ update product:", err);
    res.status(500).json({ error: "update failed" });
  }
});

// =======================
// DELETE PRODUCT + IMAGES
// =======================
app.delete("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      "SELECT images FROM products WHERE id = ?",
      [id]
    );

    if (rows.length && rows[0].images) {
      const images = JSON.parse(rows[0].images);
      for (const url of images) {
        await deleteFromSupabase(url);
      }
    }

    await pool.query(
      "DELETE FROM products WHERE id = ?",
      [id]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("❌ delete product:", err);
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
