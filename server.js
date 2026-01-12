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

// ⚠️ NO express.json() para multipart
// app.use(express.json());

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
  limits: { fileSize: 5 * 1024 * 1024 }
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
// CREATE PRODUCT + IMAGE
// =======================
app.post("/products", upload.single("image"), async (req, res) => {
  try {
    const { name, description = "", price = 0, discount = 0 } = req.body;

    if (!name || !req.file) {
      return res.status(400).json({ error: "Nombre e imagen obligatorios" });
    }

    // ---- upload image to supabase ----
    const ext = req.file.originalname.split(".").pop();
    const fileName = `products/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("products")
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype
      });

    if (upErr) {
      console.error(upErr);
      return res.status(500).json({ error: "Upload failed" });
    }

    const { data } = supabase.storage
      .from("products")
      .getPublicUrl(fileName);

    const imageUrl = data.publicUrl;

    // ---- insert product ----
    const [result] = await pool.query(
      `INSERT INTO products
       (name, description, price, discount, image_main)
       VALUES (?, ?, ?, ?, ?)`,
      [name, description, Number(price), Number(discount), imageUrl]
    );

    res.json({
      success: true,
      id: result.insertId,
      image: imageUrl
    });

  } catch (err) {
    console.error("❌ create product:", err.message);
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
// SERVER
// =======================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log("🚀 Server running on", PORT)
);
