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

// ⚠️ NO express.json() con multipart
// app.use(express.json());

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
  res.json({ status: "ok", time: new Date().toISOString() });
});

// =======================
// CREATE PRODUCT + IMAGES
// =======================
app.post("/products", upload.array("images", 6), async (req, res) => {
  try {
    const { name, description = "", price = 0, discount = 0 } = req.body;

    if (!name || !req.files?.length) {
      return res.status(400).json({ error: "Nombre e imágenes obligatorios" });
    }

    const uploadedUrls = [];

    for (const file of req.files) {
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

      uploadedUrls.push(data.publicUrl);
    }

    const imageMain = uploadedUrls[0];

    const [result] = await pool.query(
      `INSERT INTO products
       (name, description, price, discount, image_main, images)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        name,
        description,
        Number(price),
        Number(discount),
        imageMain,
        JSON.stringify(uploadedUrls)
      ]
    );

    res.json({
      success: true,
      id: result.insertId,
      images: uploadedUrls
    });

  } catch (err) {
    console.error("❌ CREATE PRODUCT:", err);
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
    if (p.images) p.images = JSON.parse(p.images);
  });

  res.json(rows);
});

// =======================
// UPDATE PRODUCT
// =======================
app.put("/products/:id", upload.array("images", 6), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, discount } = req.body;

    let images = [];

    if (req.files?.length) {
      for (const file of req.files) {
        const ext = file.originalname.split(".").pop();
        const fileName = `products/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}.${ext}`;

        await supabase.storage
          .from("products")
          .upload(fileName, file.buffer, {
            contentType: file.mimetype
          });

        const { data } = supabase.storage
          .from("products")
          .getPublicUrl(fileName);

        images.push(data.publicUrl);
      }
    }

    const imageMain = images.length ? images[0] : null;

    await pool.query(
      `UPDATE products SET
        name=?,
        description=?,
        price=?,
        discount=?,
        image_main=IFNULL(?, image_main),
        images=IFNULL(?, images)
       WHERE id=?`,
      [
        name,
        description,
        Number(price),
        Number(discount),
        imageMain,
        images.length ? JSON.stringify(images) : null,
        id
      ]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("❌ UPDATE PRODUCT:", err);
    res.status(500).json({ error: "server error" });
  }
});

// =======================
// DELETE PRODUCT + IMAGES
// =======================
app.delete("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [[product]] = await pool.query(
      "SELECT images FROM products WHERE id=?",
      [id]
    );

    if (!product) return res.status(404).json({ error: "Not found" });

    const images = JSON.parse(product.images || "[]");

    for (const url of images) {
      const path = url.split("/storage/v1/object/public/products/")[1];
      if (path) {
        await supabase.storage.from("products").remove([path]);
      }
    }

    await pool.query("DELETE FROM products WHERE id=?", [id]);

    res.json({ success: true });

  } catch (err) {
    console.error("❌ DELETE PRODUCT:", err);
    res.status(500).json({ error: "server error" });
  }
});

// =======================
// SERVER
// =======================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log("🚀 Server running on port", PORT)
);
