import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import request from "supertest";
import { Server } from "../src/server.js";

describe("Server", () => {
  let server: Server;

  beforeEach(() => {
    server = new Server();
  });

  afterEach(async () => {
    await server.stop();
  });

  describe("Health check endpoint", () => {
    it("should return 200 OK with service status", async () => {
      await server.start();

      const response = await request(server.app).get("/health");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("status", "ok");
      expect(response.body).toHaveProperty("service", "elevenlabs-agent");
      expect(response.body).toHaveProperty("redis");
    });

    it("should include Redis connectivity status", async () => {
      await server.start();

      const response = await request(server.app).get("/health");

      expect(response.status).toBe(200);
      expect(["connected", "disconnected", "error", "unknown"]).toContain(
        response.body.redis,
      );
    });
  });

  describe("Server lifecycle", () => {
    it("should start and stop gracefully", async () => {
      await server.start();
      expect(server.server).toBeDefined();

      await server.stop();
      // Server should be stopped (we can't easily verify this without trying to start again)
    });
  });
});
