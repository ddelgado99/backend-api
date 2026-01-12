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
// APP CONFIG
// =======================
const app = express();

// Enable CORS for all origins (Fixes frontend connection issues)
app.use(cors());
app.use(express.json()); // Important to parse JSON bodies

// =======================
// SUPABASE CONFIG
// =======================
// Ensure your Bucket in Supabase is set to "Public"
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// =======================
// MULTER CONFIG
// =======================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// =======================
// MYSQL CONFIG
// =======================
const pool = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: Number(process.env.MYSQLPORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
});

// =======================
// HELPERS
// =======================
async function uploadImage(file) {
  // Sanitize filename to avoid special char issues
  const ext = file.originalname.split(".").pop();
  const fileName = `products/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabase.storage
    .from("products")
    .upload(fileName, file.buffer, {
      contentType: file.mimetype,
      upsert: false
    });

  if (error) {
    console.error("Supabase Upload Error:", error);
    throw new Error("Error uploading image");
  }

  const { data } = supabase.storage
    .from("products")
    .getPublicUrl(fileName);

  return data.publicUrl;
}

async function deleteImage(url) {
  if (!url) return;
  
  // Robust logic to extract the path from the full URL
  // Example URL: https://xyz.supabase.co/.../public/products/products/filename.jpg
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split("/products/"); 
    // Assuming bucket name is 'products', the path inside bucket is after the last segment
    if (pathParts.length > 1) {
      // Reconstruct the path inside the bucket (e.g., "products/filename.jpg")
      // We use decodeURIComponent to handle spaces/special chars in URLs
      const filePath = decodeURIComponent(`products/${pathParts[pathParts.length - 1]}`);
      
      const { error } = await supabase.storage
        .from("products")
        .remove([filePath]);
        
      if (error) console.error("Delete Error:", error);
    }
  } catch (e) {
    console.error("Error parsing URL for delete:", e);
  }
}

// =======================
// ROUTES
// =======================

// Health Check
app.get("/", (_, res) => {
  res.json({ status: "ok", timestamp: new Date() });
});

// GET Products
app.get("/products", async (_, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM products ORDER BY id DESC");
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Database error" });
  }
});

// CREATE Product
// Note: Frontend must use <input type="file" name="images" multiple>
app.post("/products", upload.array("images", 4), async (req, res) => {
  try {
    const { name, description = "", price = 0, discount = 0 } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({ error: "Nombre es requerido" });
    }

    const urls = [];
    if (req.files && req.files.length > 0) {
      for (const f of req.files) {
        const url = await uploadImage(f);
        urls.push(url);
      }
    }

    // Ensure we have 4 slots, fill empty with null
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
        urls[3] || null,
      ]
    );

    res.json({ success: true, id: result.insertId, images: urls });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error creating product" });
  }
});

// UPDATE Product
app.put("/products/:id", upload.array("images", 4), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, discount } = req.body;

    // 1. Get current product data
    const [rows] = await pool.query("SELECT * FROM products WHERE id = ?", [id]);
    if (!rows.length) return res.status(404).json({ error: "Not found" });

    const currentProduct = rows[0];

    // 2. Collect existing images (filter out nulls)
    let finalImages = [
      currentProduct.image_main,
      currentProduct.image_thumb1,
      currentProduct.image_thumb2,
      currentProduct.image_thumb3,
    ].filter(Boolean);

    // 3. Add NEW images if uploaded
    if (req.files && req.files.length > 0) {
      for (const f of req.files) {
        const url = await uploadImage(f);
        finalImages.push(url);
      }
    }

    // 4. Enforce limit of 4 images (Keep the newest ones or oldest ones? 
    // Logic here: Keep the first 4. If you want to replace, you should delete first or use a different logic)
    // To fix "only allows one": We ensure the array is sliced correctly.
    finalImages = finalImages.slice(0, 4);

    await pool.query(
      `UPDATE products SET 
       name=?, description=?, price=?, discount=?, 
       image_main=?, image_thumb1=?, image_thumb2=?, image_thumb3=?
       WHERE id=?`,
      [
        name || currentProduct.name,
        description || currentProduct.description,
        Number(price) || currentProduct.price,
        Number(discount) || currentProduct.discount,
        finalImages[0] || null,
        finalImages[1] || null,
        finalImages[2] || null,
        finalImages[3] || null,
        id,
      ]
    );

    res.json({ success: true, images: finalImages });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Update error" });
  }
});

// DELETE Product
app.delete("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query("SELECT * FROM products WHERE id=?", [id]);

    if (rows.length) {
      const p = rows[0];
      // Delete all associated images from Supabase
      await Promise.all([
        deleteImage(p.image_main),
        deleteImage(p.image_thumb1),
        deleteImage(p.image_thumb2),
        deleteImage(p.image_thumb3),
      ]);
    }

    await pool.query("DELETE FROM products WHERE id=?", [id]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Delete error" });
  }
});

// =======================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
