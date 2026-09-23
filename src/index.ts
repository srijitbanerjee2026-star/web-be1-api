import express from "express";
import cors from "cors";
import * as dotenv from "dotenv";
import authRouter from "./routes/auth.js";
import eventRouter from "./routes/events.js"; // Import the event router

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", message: "API is running smoothly" });
});

// Mount Routers
app.use("/api/auth", authRouter);
app.use("/api/events", eventRouter); // Mount the event router

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

export default app;