const express = require("express");
const { WebSocketServer } = require("ws");
const { MongoClient } = require("mongodb");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;

// --- MONGO ---
const uri = process.env.MONGO_URI; // ⚠️ défini dans Render
const client = new MongoClient(uri);
let pixelsCollection;

// Connexion MongoDB
async function connectDB() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB Atlas");

    const db = client.db("cdgplace"); // nom exact de la base
    pixelsCollection = db.collection("pixels");
    console.log("🔹 Collection ready:", pixelsCollection ? "yes" : "no");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  }
}
connectDB();

// --- SERVEUR ---
app.use(express.static(path.join(__dirname, "public")));

const server = app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});

// --- WEBSOCKET ---
const wss = new WebSocketServer({ server });

wss.on("connection", async (ws) => {
  console.log("🟢 New client connected");

  // Envoyer pixels existants
  if (!pixelsCollection) {
    console.log("❌ pixelsCollection non dispo !");
  } else {
    try {
      const allPixels = await pixelsCollection.find().toArray();
      console.log(`🔹 Sending ${allPixels.length} existing pixels`);
      ws.send(JSON.stringify({ type: "init", pixels: allPixels }));
    } catch (err) {
      console.error("❌ Failed to fetch pixels:", err);
    }
  }

  ws.on("message", async (msg) => {
    console.log("📥 Message reçu du client :", msg);

    try {
      const data = JSON.parse(msg);

      if (data.type === "place") {
        const { x, y, color } = data;
        console.log(`🎨 Pixel reçu: x=${x}, y=${y}, color=${color}`);

        if (!pixelsCollection) {
          console.log("❌ pixelsCollection non dispo pour sauvegarde !");
          return;
        }

        // Upsert pixel dans MongoDB
        const result = await pixelsCollection.updateOne(
          { x, y },
          { $set: { x, y, color } },
          { upsert: true }
        );
        console.log("✅ Pixel sauvegardé:", result.upsertedId || "updated");

        // Broadcast à tous les clients
        wss.clients.forEach((client) => {
          if (client.readyState === 1) {
            client.send(JSON.stringify({ type: "pixel", x, y, color }));
          }
        });
        console.log("📡 Pixel broadcasté à tous les clients");
      }
    } catch (err) {
      console.error("❌ Error handling message:", err);
    }
  });

  ws.on("close", () => {
    console.log("🔴 Client disconnected");
  });
});
