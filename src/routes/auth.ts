import { Router } from "express";
import { db } from "../db/index.js";
import users, { refreshTokens } from "../db/schema.js";
import { and, eq, isNull } from "drizzle-orm";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { loginSchema, registerSchema } from "../schemas/auth.schema.js";

const router = Router();
const jwtSecret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;

if (!jwtSecret) {
  throw new Error("JWT_ACCESS_SECRET is required");
}
const refreshTokenLifetimeMs = 30 * 24 * 60 * 60 * 1000;

const createRefreshToken = () => crypto.randomBytes(48).toString("base64url");

const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

const createAccessToken = (user: { id: string; role: string }) =>
  jwt.sign({ userId: user.id, role: user.role }, jwtSecret, {
    expiresIn: "15m",
  });

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const validation = registerSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.format() });
    }

    const { email, password } = validation.data;

    const [existingUser] = await db.select().from(users).where(eq(users.email, email));
    if (existingUser) {
      return res.status(400).json({ error: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [newUser] = await db
      .insert(users)
      .values({
        email,
        password: hashedPassword,
        role: "member",
      })
      .returning();

    return res.status(201).json({
      message: "User registered successfully",
      user: { id: newUser.id, email: newUser.email, role: newUser.role },
    });
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const validation = loginSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.format() });
    }

    const { email, password } = validation.data;

    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    const token = createAccessToken(user);
    const refreshToken = createRefreshToken();

    await db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + refreshTokenLifetimeMs),
    });

    return res.status(200).json({
      message: "Login successful",
      token,
      refreshToken,
      user: { id: user.id, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (!refreshToken) {
      return res.status(401).json({ error: "Refresh token is required" });
    }

    const replacementToken = createRefreshToken();
    const user = await db.transaction(async (tx) => {
      const [storedToken] = await tx
        .select()
        .from(refreshTokens)
        .where(
          and(
            eq(refreshTokens.tokenHash, hashToken(refreshToken)),
            isNull(refreshTokens.revokedAt),
          ),
        )
        .for("update");

      if (!storedToken || storedToken.expiresAt <= new Date()) {
        return null;
      }

      const [user] = await tx.select().from(users).where(eq(users.id, storedToken.userId));
      if (!user) {
        return null;
      }

      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.id, storedToken.id));
      await tx.insert(refreshTokens).values({
        userId: user.id,
        tokenHash: hashToken(replacementToken),
        expiresAt: new Date(Date.now() + refreshTokenLifetimeMs),
      });
      return user;
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid or expired refresh token" });
    }

    return res.status(200).json({
      token: createAccessToken(user),
      refreshToken: replacementToken,
    });
  } catch (err) {
    console.error("Refresh token error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/logout", async (req, res) => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (refreshToken) {
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(
          and(eq(refreshTokens.tokenHash, hashToken(refreshToken)), isNull(refreshTokens.revokedAt)),
        );
    }
    return res.status(204).send();
  } catch (err) {
    console.error("Logout error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;