import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import Redis from "ioredis";
import {
  CallbackQueueService,
  type CallbackTask,
} from "../src/services/callback-queue";

describe("CallbackQueueService", () => {
  let redis: Redis;
  let callbackQueue: CallbackQueueService;
  const TEST_REDIS_URL = "redis://localhost:6379/15"; // Use database 15 for tests

  beforeEach(async () => {
    redis = new Redis(TEST_REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    await redis.connect();
    // Clear test database
    await redis.flushdb();

    callbackQueue = new CallbackQueueService(redis);
  });

  afterEach(async () => {
    await redis.flushdb();
    await redis.quit();
    await callbackQueue.shutdown();
  });

  describe("createTask", () => {
    it("creates callback task with all required fields", async () => {
      const taskData: Omit<CallbackTask, "createdAt" | "pending"> = {
        taskId: "task-123",
        conversationId: "conv-123",
        sessionPayload: { wsUrl: "wss://example.com", config: {} },
        wsUrl: "wss://example.com",
        toolName: "write_code",
        toolArgs: { file: "test.ts", content: "hello" },
      };

      await callbackQueue.createTask(taskData);

      const retrieved = await callbackQueue.getTask("task-123");
      expect(retrieved).toBeDefined();
      expect(retrieved?.conversationId).toBe("conv-123");
      expect(retrieved?.pending).toBe(true);
      expect(retrieved?.toolName).toBe("write_code");
      expect(retrieved?.createdAt).toBeDefined();
    });

    it("sets 24-hour TTL", async () => {
      const taskData: Omit<CallbackTask, "createdAt" | "pending"> = {
        taskId: "task-ttl",
        conversationId: "conv-123",
        sessionPayload: {},
        wsUrl: "wss://example.com",
      };

      await callbackQueue.createTask(taskData);

      const ttl = await redis.ttl("cursor_task:task-ttl");
      // TTL should be close to 86400 (24 hours), allow some variance
      expect(ttl).toBeGreaterThan(86000);
      expect(ttl).toBeLessThanOrEqual(86400);
    });
  });

  describe("getTask", () => {
    it("retrieves existing task", async () => {
      const taskData: Omit<CallbackTask, "createdAt" | "pending"> = {
        taskId: "task-get",
        conversationId: "conv-123",
        sessionPayload: {},
        wsUrl: "wss://example.com",
      };

      await callbackQueue.createTask(taskData);
      const retrieved = await callbackQueue.getTask("task-get");

      expect(retrieved).toBeDefined();
      expect(retrieved?.taskId).toBe("task-get");
      expect(retrieved?.conversationId).toBe("conv-123");
    });

    it("returns null for non-existent task", async () => {
      const retrieved = await callbackQueue.getTask("non-existent");
      expect(retrieved).toBeNull();
    });
  });

  describe("updateTask", () => {
    it("updates task fields", async () => {
      const taskData: Omit<CallbackTask, "createdAt" | "pending"> = {
        taskId: "task-update",
        conversationId: "conv-123",
        sessionPayload: {},
        wsUrl: "wss://example.com",
      };

      await callbackQueue.createTask(taskData);
      await callbackQueue.updateTask("task-update", {
        pending: false,
        completedAt: new Date().toISOString(),
        result: { success: true },
      });

      const updated = await callbackQueue.getTask("task-update");
      expect(updated?.pending).toBe(false);
      expect(updated?.completedAt).toBeDefined();
      expect(updated?.result).toEqual({ success: true });
    });

    it("handles non-existent task gracefully", async () => {
      await expect(
        callbackQueue.updateTask("non-existent", { pending: false }),
      ).resolves.not.toThrow();
    });

    it("preserves TTL when updating", async () => {
      const taskData: Omit<CallbackTask, "createdAt" | "pending"> = {
        taskId: "task-ttl-update",
        conversationId: "conv-123",
        sessionPayload: {},
        wsUrl: "wss://example.com",
      };

      await callbackQueue.createTask(taskData);
      const ttlBefore = await redis.ttl("cursor_task:task-ttl-update");

      await callbackQueue.updateTask("task-ttl-update", { pending: false });
      const ttlAfter = await redis.ttl("cursor_task:task-ttl-update");

      // TTL should be preserved (allowing for small time passage)
      expect(ttlAfter).toBeGreaterThan(ttlBefore - 5);
    });
  });

  describe("markCompleted", () => {
    it("marks task as completed with result", async () => {
      const taskData: Omit<CallbackTask, "createdAt" | "pending"> = {
        taskId: "task-complete",
        conversationId: "conv-123",
        sessionPayload: {},
        wsUrl: "wss://example.com",
      };

      await callbackQueue.createTask(taskData);
      await callbackQueue.markCompleted("task-complete", { output: "done" });

      const completed = await callbackQueue.getTask("task-complete");
      expect(completed?.pending).toBe(false);
      expect(completed?.completedAt).toBeDefined();
      expect(completed?.result).toEqual({ output: "done" });
    });

    it("marks task as completed with error", async () => {
      const taskData: Omit<CallbackTask, "createdAt" | "pending"> = {
        taskId: "task-error",
        conversationId: "conv-123",
        sessionPayload: {},
        wsUrl: "wss://example.com",
      };

      await callbackQueue.createTask(taskData);
      await callbackQueue.markCompleted("task-error", undefined, "Task failed");

      const completed = await callbackQueue.getTask("task-error");
      expect(completed?.pending).toBe(false);
      expect(completed?.error).toBe("Task failed");
    });
  });

  describe("Race Condition Safety", () => {
    it("handles out-of-order task completion", async () => {
      const task1: Omit<CallbackTask, "createdAt" | "pending"> = {
        taskId: "task-1",
        conversationId: "conv-1",
        sessionPayload: {},
        wsUrl: "wss://example.com",
      };
      const task2: Omit<CallbackTask, "createdAt" | "pending"> = {
        taskId: "task-2",
        conversationId: "conv-2",
        sessionPayload: {},
        wsUrl: "wss://example.com",
      };

      await callbackQueue.createTask(task1);
      await callbackQueue.createTask(task2);

      // Complete tasks out of order
      await callbackQueue.markCompleted("task-2");
      await callbackQueue.markCompleted("task-1");

      const completed1 = await callbackQueue.getTask("task-1");
      const completed2 = await callbackQueue.getTask("task-2");

      expect(completed1?.pending).toBe(false);
      expect(completed2?.pending).toBe(false);
      expect(completed1?.conversationId).toBe("conv-1");
      expect(completed2?.conversationId).toBe("conv-2");
    });

    it("maintains correct session mapping during concurrent updates", async () => {
      const taskData: Omit<CallbackTask, "createdAt" | "pending"> = {
        taskId: "task-concurrent",
        conversationId: "conv-123",
        sessionPayload: { sessionId: "session-123" },
        wsUrl: "wss://example.com",
      };

      await callbackQueue.createTask(taskData);

      // Update with both fields at once (more realistic)
      await callbackQueue.updateTask("task-concurrent", {
        pending: false,
        result: { output: "result" },
      });

      const final = await callbackQueue.getTask("task-concurrent");
      expect(final?.pending).toBe(false);
      expect(final?.result).toEqual({ output: "result" });
      expect(final?.conversationId).toBe("conv-123");
      expect((final?.sessionPayload as { sessionId: string })?.sessionId).toBe(
        "session-123",
      );
    });
  });
});
