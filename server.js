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

// =======================
// SUPABASE
// =======================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// =======================
// MULTER
// =======================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

// =======================
// MYSQL
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
  res.json({ status: "ok" });
});

// =======================
// HELPERS
// =======================
async function uploadImage(file) {
  const ext = file.originalname.split(".").pop();
  const name = `products/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.${ext}`;

  const { error } = await supabase.storage
    .from("products")
    .upload(name, file.buffer, { contentType: file.mimetype });

  if (error) throw error;

  const { data } = supabase.storage
    .from("products")
    .getPublicUrl(name);

  return data.publicUrl;
}

async function deleteImage(url) {
  if (!url) return;
  const part = url.split("/products/")[1];
  if (!part) return;
  await supabase.storage.from("products").remove([`products/${part}`]);
}

// =======================
// CREATE PRODUCT
// =======================
app.post("/products", upload.array("images", 4), async (req, res) => {
  try {
    const { name, description = "", price = 0, discount = 0 } = req.body;

    if (!name || !req.files.length) {
      return res.status(400).json({ error: "Nombre e imágenes requeridas" });
    }

    const urls = [];
    for (const f of req.files) {
      urls.push(await uploadImage(f));
    }

    const [result] = await pool.query(
      `INSERT INTO products
       (name, description, price, discount, image_main, image_thumb1, image_thumb2, image_thumb3)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        description,
        Number(price),
        Number(discount),
        urls[0] || null,
        urls[1] || null,
        urls[2] || null,
        urls[3] || null
      ]
    );

    res.json({ success: true, id: result.insertId });

  } catch (e) {
    console.error(e);
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
  res.json(rows);
});

// =======================
// UPDATE PRODUCT
// =======================
app.put("/products/:id", upload.array("images", 4), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description = "", price = 0, discount = 0 } = req.body;

    const [rows] = await pool.query(
      "SELECT * FROM products WHERE id = ?",
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: "Not found" });

    let images = [
      rows[0].image_main,
      rows[0].image_thumb1,
      rows[0].image_thumb2,
      rows[0].image_thumb3
    ].filter(Boolean);

    if (req.files.length) {
      for (const f of req.files) {
        images.push(await uploadImage(f));
      }
    }

    await pool.query(
      `UPDATE products SET
       name=?, description=?, price=?, discount=?,
       image_main=?, image_thumb1=?, image_thumb2=?, image_thumb3=?
       WHERE id=?`,
      [
        name,
        description,
        Number(price),
        Number(discount),
        images[0] || null,
        images[1] || null,
        images[2] || null,
        images[3] || null,
        id
      ]
    );

    res.json({ success: true });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "update error" });
  }
});

// =======================
// DELETE PRODUCT
// =======================
app.delete("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      "SELECT * FROM products WHERE id=?",
      [id]
    );

    if (rows.length) {
      await deleteImage(rows[0].image_main);
      await deleteImage(rows[0].image_thumb1);
      await deleteImage(rows[0].image_thumb2);
      await deleteImage(rows[0].image_thumb3);
    }

    await pool.query("DELETE FROM products WHERE id=?", [id]);
    res.json({ success: true });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "delete error" });
  }
});

// =======================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("🚀 Server", PORT));
