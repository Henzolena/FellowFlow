import { describe, it, expect, vi, beforeEach } from "vitest";
import { confirmSoloRegistration, confirmGroupRegistrations } from "./registration-confirmer";
import type { Logger } from "@/lib/logger";

function mockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
}

describe("confirmSoloRegistration", () => {
  let log: Logger;

  beforeEach(() => {
    log = mockLogger();
  });

  it("returns true and logs on successful confirmation", async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      }),
    } as any;

    const result = await confirmSoloRegistration(supabase, "reg-1", log);

    expect(result).toBe(true);
    expect(supabase.from).toHaveBeenCalledWith("registrations");
    expect(log.info).toHaveBeenCalledWith("Solo registration confirmed", { registrationId: "reg-1" });
  });

  it("returns false and logs error on DB failure", async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: { message: "DB connection lost" } }),
          }),
        }),
      }),
    } as any;

    const result = await confirmSoloRegistration(supabase, "reg-1", log);

    expect(result).toBe(false);
    expect(log.error).toHaveBeenCalledWith("Registration update failed", {
      registrationId: "reg-1",
      error: "DB connection lost",
    });
  });
});

describe("confirmGroupRegistrations", () => {
  let log: Logger;

  beforeEach(() => {
    log = mockLogger();
  });

  it("returns true on successful group confirmation", async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      }),
    } as any;

    const result = await confirmGroupRegistrations(supabase, "group-abc", log);

    expect(result).toBe(true);
    expect(supabase.from).toHaveBeenCalledWith("registrations");
  });

  it("returns false and logs error on DB failure", async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: { message: "Timeout" } }),
          }),
        }),
      }),
    } as any;

    const result = await confirmGroupRegistrations(supabase, "group-abc", log);

    expect(result).toBe(false);
    expect(log.error).toHaveBeenCalledWith("Group registration update failed", {
      groupId: "group-abc",
      error: "Timeout",
    });
  });
});
