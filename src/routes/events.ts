import { Router } from "express";
import { db } from "../db/index.js";
import { events, registrations } from "../db/schema.js";
import { createEventSchema } from "../schemas/event.schema.js";
import { authenticateToken, requireRole } from "../middleware/auth.middleware.js";
import { and, eq } from "drizzle-orm";

const router = Router();

export const normalizePagination = (query: { limit?: unknown; page?: unknown }) => {
  const requestedLimit = Number(query.limit);
  const requestedPage = Number(query.page);

  return {
    limit: Number.isInteger(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 100)
      : 10,
    page: Number.isInteger(requestedPage)
      ? Math.max(requestedPage, 1)
      : 1,
  };
};

export const hasCapacity = (currentRegistrations: number, capacity: number) =>
  currentRegistrations < capacity;

// GET /api/events - List all events with pagination (Public)
router.get("/", async (req, res) => {
  try {
    const { limit, page } = normalizePagination(req.query);
    const offset = (page - 1) * limit;

    const allEvents = await db
      .select()
      .from(events)
      .limit(limit)
      .offset(offset);

    return res.status(200).json({
      page,
      limit,
      data: allEvents,
    });
  } catch (err) {
    console.error("Fetch events error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/events - Create a new event (Protected)
router.post("/", authenticateToken, requireRole("admin"), async (req, res) => {
  try {
    const validation = createEventSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.format() });
    }

    const { title, description, date, capacity } = validation.data;

    const [newEvent] = await db.insert(events).values({
      title,
      description: description ?? "",
      date: new Date(date),
      capacity: Number(capacity),
    } as any).returning();

    return res.status(201).json({
      message: "Event created successfully",
      event: newEvent,
    });
  } catch (err) {
    console.error("Create event error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/events/:id/register - Register authenticated user with concurrency-safe row locking
router.post("/:id/register", authenticateToken, async (req, res) => {
  const eventId = req.params.id as string;
  const userId = req.user?.userId;

  if (!userId || !eventId) {
    return res.status(401).json({ error: "Unauthorized or missing event ID" });
  }

  try {
    const result = await db.transaction(async (tx) => {
      // 1. Fetch event with exclusive row lock to prevent race conditions
      const [event] = await tx
        .select()
        .from(events)
        .where(eq(events.id, eventId))
        .for("update");

      if (!event) {
        return { status: 404, body: { error: "Event not found" } };
      }

      if (!hasCapacity(event.currentRegistrations, event.capacity)) {
        return { status: 400, body: { error: "Event is fully booked" } };
      }

      // 2. Check if user is already registered within transaction scope
      const [existingRegistration] = await tx
        .select()
        .from(registrations)
        .where(and(eq(registrations.eventId, eventId), eq(registrations.userId, userId)));

      if (existingRegistration) {
        return { status: 409, body: { error: "User is already registered for this event" } };
      }

      // 3. Insert registration and increment counter atomically inside transaction
      const [newRegistration] = await tx
        .insert(registrations)
        .values({ eventId, userId })
        .returning();

      await tx
        .update(events)
        .set({ currentRegistrations: event.currentRegistrations + 1 })
        .where(eq(events.id, eventId));

      return {
        status: 201,
        body: {
          message: "Successfully registered for event",
          registration: newRegistration,
        },
      };
    });

    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error("Concurrency transaction error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;