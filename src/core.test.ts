import { describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import { loginSchema, registerSchema } from "./schemas/auth.schema.js";
import {
  authenticateToken,
  requireRole,
} from "./middleware/auth.middleware.js";
import { hasCapacity, normalizePagination } from "./routes/events.js";

describe("authentication validation", () => {
  it("accepts valid credentials", () => {
    expect(
      registerSchema.safeParse({
        email: "member@example.com",
        password: "password123",
      }).success,
    ).toBe(true);
    expect(
      loginSchema.safeParse({
        email: "member@example.com",
        password: "password123",
      }).success,
    ).toBe(true);
  });

  it("rejects malformed credentials and does not accept a client role", () => {
    const result = registerSchema.safeParse({
      email: "not-an-email",
      password: "short",
      role: "admin",
    });

    expect(result.success).toBe(false);
    if (result.success) {
      expect(result.data).not.toHaveProperty("role");
    }
  });
});

describe("authorization middleware", () => {
  it("allows admins and rejects members", () => {
    const next = vi.fn();
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };

    requireRole("admin")({ user: { userId: "1", role: "admin" } } as never, response as never, next);
    expect(next).toHaveBeenCalledOnce();

    next.mockClear();
    requireRole("admin")({ user: { userId: "1", role: "member" } } as never, response as never, next);
    expect(response.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("verifies the access-token role payload", () => {
    const token = jwt.sign(
      { userId: "user-1", role: "admin" },
      process.env.JWT_ACCESS_SECRET!,
      { expiresIn: "15m" },
    );
    const request = {
      headers: { authorization: `Bearer ${token}` },
    } as { headers: Record<string, string>; user?: unknown };
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    authenticateToken(request as never, response as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(request.user).toEqual({ userId: "user-1", role: "admin", iat: expect.any(Number), exp: expect.any(Number) });
  });
});

describe("event business rules", () => {
  it("clamps pagination to safe values", () => {
    expect(normalizePagination({ limit: "500", page: "0" })).toEqual({
      limit: 100,
      page: 1,
    });
    expect(normalizePagination({ limit: "invalid", page: undefined })).toEqual({
      limit: 10,
      page: 1,
    });
  });

  it("enforces event capacity", () => {
    expect(hasCapacity(4, 5)).toBe(true);
    expect(hasCapacity(5, 5)).toBe(false);
    expect(hasCapacity(6, 5)).toBe(false);
  });
});