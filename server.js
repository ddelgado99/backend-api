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
// HEALTH & DB POOL (Sin cambios)
// =======================
app.get("/", (req, res) => res.status(200).json({ status: "ok", message: "🚀 Backend activo - DOMBET", time: new Date().toISOString() }));
app.get("/health", (req, res) => res.status(200).send("ok"));

if (!process.env.MYSQLHOST || !process.env.MYSQLUSER) {
  console.warn("⚠️ ADVERTENCIA: Variables de entorno de MySQL no detectadas.");
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
(async () => { try { const c = await pool.getConnection(); await c.ping(); c.release(); console.log("✅ MySQL pool conectado"); } catch (e) { console.error("⚠️ Error conectando a MySQL:", e.message); } })();
app.get("/keep-db-alive", async (req, res) => { try { await pool.query("SELECT 1"); res.status(200).send("db alive"); } catch (e) { res.status(500).send("db error"); } });


// =======================
// PRODUCT ROUTES (ACTUALIZADO)
// =======================

// GET: Obtener productos (AHORA ORDENADOS POR display_order)
app.get("/products", async (req, res) => {
  try {
    // CAMBIO: Ahora se ordena por 'display_order' para respetar el orden manual.
    const sql = `
      SELECT *, 
      (price - (price * discount / 100)) AS final_price 
      FROM products 
      ORDER BY display_order ASC, id DESC
    `;
    const [rows] = await pool.query(sql);
    res.json(rows);
  } catch (err) {
    console.error("❌ /products error:", err.message);
    res.status(500).json({ error: "database unavailable" });
  }
});

// POST: Crear producto (Sin cambios mayores)
app.post("/products", async (req, res) => {
  try {
    const { name, description, price, discount, image_main, image_thumb1, image_thumb2, image_thumb3 } = req.body;
    let safeDiscount = Math.max(0, Math.min(100, Number(discount) || 0));
    const sql = `INSERT INTO products (name, description, price, discount, image_main, image_thumb1, image_thumb2, image_thumb3) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    const values = [name, description, Number(price) || 0, safeDiscount, image_main||null, image_thumb1||null, image_thumb2||null, image_thumb3||null];
    const [result] = await pool.query(sql, values);
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    console.error("❌ Error creando producto:", err.message);
    res.status(500).json({ error: "insert failed" });
  }
});

// PUT: Actualizar producto (Sin cambios mayores)
app.put("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, discount, image_main, image_thumb1, image_thumb2, image_thumb3 } = req.body;
    let safeDiscount = Math.max(0, Math.min(100, Number(discount) || 0));
    const sql = `UPDATE products SET name=?, description=?, price=?, discount=?, image_main=?, image_thumb1=?, image_thumb2=?, image_thumb3=? WHERE id=?`;
    const values = [name, description, Number(price) || 0, safeDiscount, image_main||null, image_thumb1||null, image_thumb2||null, image_thumb3||null, id];
    await pool.query(sql, values);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Error actualizando producto:", err.message);
    res.status(500).json({ error: "update failed" });
  }
});

// DELETE: Eliminar producto (Sin cambios)
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

// --- NUEVA RUTA PARA GUARDAR EL ORDEN ---
app.post("/products/reorder", async (req, res) => {
  try {
    const { orderedIds } = req.body; // Recibe un array de IDs en el nuevo orden

    if (!orderedIds || !Array.isArray(orderedIds) || orderedIds.length === 0) {
      return res.status(400).json({ error: "Datos de ordenamiento inválidos." });
    }

    // Creamos una consulta SQL eficiente para actualizar todos los productos de una vez
    let sql = "UPDATE products SET display_order = CASE id ";
    const values = [];
    orderedIds.forEach((id, index) => {
      sql += "WHEN ? THEN ? ";
      values.push(id, index); // Para cada ID, asignamos su nueva posición (index)
    });
    sql += "END WHERE id IN (?)";
    values.push(orderedIds);

    await pool.query(sql, values);
    console.log("✅ Orden de productos actualizado.");
    res.json({ success: true, message: "Orden guardado." });

  } catch (err) {
    console.error("❌ Error reordenando productos:", err.message);
    res.status(500).json({ error: "reorder failed" });
  }
});


// =======================
// SERVER START
// =======================
const PORT = process.env.PORT || 10000;
const server = app.listen(PORT, () => console.log("🚀 Server running on port", PORT));
server.on('error', (e) => { if (e.code === 'EADDRINUSE') { console.log('Puerto ocupado, reintentando...'); setTimeout(() => { server.close(); server.listen(PORT); }, 1000); } });
