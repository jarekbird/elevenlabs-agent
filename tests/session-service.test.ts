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
  SessionService,
  type AgentSession,
} from "../src/services/session-service";

describe("SessionService", () => {
  let sessionService: SessionService;
  let mockRedis: {
    setex: jest.Mock;
    get: jest.Mock;
    del: jest.Mock;
    keys: jest.Mock;
    on: jest.Mock;
    status: string;
  };

  beforeEach(() => {
    // Create mock Redis instance with proper typing
    const mockSetex: any = jest.fn();
    const mockGet: any = jest.fn();
    const mockDel: any = jest.fn();
    const mockKeys: any = jest.fn();

    mockSetex.mockResolvedValue("OK");
    mockGet.mockResolvedValue(null);
    mockDel.mockResolvedValue(1);
    mockKeys.mockResolvedValue([]);

    mockRedis = {
      setex: mockSetex,
      get: mockGet,
      del: mockDel,
      keys: mockKeys,
      on: jest.fn(),
      status: "ready",
    } as any;

    sessionService = new SessionService(mockRedis as unknown as Redis);
    // Set redisAvailable to true for tests
    (sessionService as any).redisAvailable = true;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Session Store TTL and Schema", () => {
    it("should set TTL when creating a session", async () => {
      const session: AgentSession = {
        sessionId: "test-session-1",
        agentId: "test-agent",
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
      };

      await sessionService.createOrUpdateSession(session);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        "elevenlabs:session:test-session-1",
        3600, // SESSION_TTL
        expect.stringContaining('"sessionId":"test-session-1"'),
      );
    });

    it("should store session with correct schema", async () => {
      const session: AgentSession = {
        sessionId: "test-session-2",
        agentId: "test-agent",
        conversationId: "conv-123",
        agentConversationId: "agent-conv-456",
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        metadata: { custom: "data" },
      };

      await sessionService.createOrUpdateSession(session);

      const setexCall = mockRedis.setex as jest.Mock;
      const storedValue = JSON.parse(setexCall.mock.calls[0][2] as string);

      expect(storedValue).toMatchObject({
        sessionId: "test-session-2",
        agentId: "test-agent",
        conversationId: "conv-123",
        agentConversationId: "agent-conv-456",
        metadata: { custom: "data" },
      });
      expect(storedValue).toHaveProperty("lastAccessedAt");
      expect(typeof storedValue.lastAccessedAt).toBe("string");
    });

    it("should update lastAccessedAt when updating session", async () => {
      const session: AgentSession = {
        sessionId: "test-session-3",
        agentId: "test-agent",
        createdAt: "2025-01-01T00:00:00Z",
        lastAccessedAt: "2025-01-01T00:00:00Z",
      };

      await sessionService.createOrUpdateSession(session);

      const setexCall = mockRedis.setex as jest.Mock;
      const storedValue = JSON.parse(setexCall.mock.calls[0][2] as string);

      expect(new Date(storedValue.lastAccessedAt).getTime()).toBeGreaterThan(
        new Date("2025-01-01T00:00:00Z").getTime(),
      );
    });

    it("should handle Redis unavailability gracefully", async () => {
      // Simulate Redis unavailable
      (sessionService as any).redisAvailable = false;

      const session: AgentSession = {
        sessionId: "test-session-4",
        agentId: "test-agent",
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
      };

      await sessionService.createOrUpdateSession(session);

      expect(mockRedis.setex).not.toHaveBeenCalled();
    });
  });

  describe("Session Retrieval", () => {
    it("should retrieve session by ID", async () => {
      const session: AgentSession = {
        sessionId: "test-session-5",
        agentId: "test-agent",
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
      };

      const mockGetSession: any = jest.fn();
      mockGetSession.mockResolvedValue(JSON.stringify(session));
      mockRedis.get = mockGetSession;

      const result = await sessionService.getSession("test-session-5");

      expect(result).toEqual(session);
      expect(mockRedis.get).toHaveBeenCalledWith(
        "elevenlabs:session:test-session-5",
      );
    });

    it("should return null when session does not exist", async () => {
      const mockGetNull: any = jest.fn();
      mockGetNull.mockResolvedValue(null);
      mockRedis.get = mockGetNull;

      const result = await sessionService.getSession("non-existent");

      expect(result).toBeNull();
    });

    it("should handle JSON parse errors gracefully", async () => {
      const mockGetInvalid: any = jest.fn();
      mockGetInvalid.mockResolvedValue("invalid json");
      mockRedis.get = mockGetInvalid;

      const result = await sessionService.getSession("test-session-6");

      expect(result).toBeNull();
    });
  });

  describe("Session Deletion", () => {
    it("should delete session by ID", async () => {
      await sessionService.deleteSession("test-session-7");

      expect(mockRedis.del).toHaveBeenCalledWith(
        "elevenlabs:session:test-session-7",
      );
    });
  });

  describe("Session Updates", () => {
    it("should update session conversation ID", async () => {
      const existingSession: AgentSession = {
        sessionId: "test-session-8",
        agentId: "test-agent",
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
      };

      const mockGetExisting: any = jest.fn();
      mockGetExisting.mockResolvedValue(JSON.stringify(existingSession));
      mockRedis.get = mockGetExisting;

      await sessionService.updateSessionConversation(
        "test-session-8",
        "new-conv-id",
      );

      expect(mockRedis.setex).toHaveBeenCalled();
      const setexCall = mockRedis.setex as jest.Mock;
      const storedValue = JSON.parse(setexCall.mock.calls[0][2] as string);
      expect(storedValue.conversationId).toBe("new-conv-id");
    });
  });

  describe("Session Search", () => {
    it("should find session by conversation ID", async () => {
      const session1: AgentSession = {
        sessionId: "session-1",
        agentId: "agent-1",
        conversationId: "conv-1",
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
      };

      const session2: AgentSession = {
        sessionId: "session-2",
        agentId: "agent-1",
        conversationId: "conv-2",
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
      };

      const mockKeys1: any = jest.fn();
      mockKeys1.mockResolvedValue([
        "elevenlabs:session:session-1",
        "elevenlabs:session:session-2",
      ]);
      mockRedis.keys = mockKeys1;

      const mockGet2: any = jest.fn();
      mockGet2.mockResolvedValueOnce(JSON.stringify(session1));
      mockGet2.mockResolvedValueOnce(JSON.stringify(session2));
      mockRedis.get = mockGet2;

      const result = await sessionService.findSessionByConversationId("conv-2");

      expect(result).toEqual(session2);
    });

    it("should list all sessions for an agent", async () => {
      const session1: AgentSession = {
        sessionId: "session-1",
        agentId: "agent-1",
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
      };

      const session2: AgentSession = {
        sessionId: "session-2",
        agentId: "agent-2",
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
      };

      const mockKeys2: any = jest.fn();
      mockKeys2.mockResolvedValue([
        "elevenlabs:session:session-1",
        "elevenlabs:session:session-2",
      ]);
      mockRedis.keys = mockKeys2;

      const mockGet: any = jest.fn();
      mockGet.mockResolvedValueOnce(JSON.stringify(session1));
      mockGet.mockResolvedValueOnce(JSON.stringify(session2));
      mockRedis.get = mockGet;

      const result = await sessionService.listAgentSessions("agent-1");

      expect(result).toEqual([session1]);
    });
  });
});
