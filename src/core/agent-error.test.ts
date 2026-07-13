import { describe, expect, it } from "vitest";
import { agentErrorMessage } from "./agent-error";

describe("agentErrorMessage", () => {
  it("unwraps electron IPC nested error", () => {
    const err = new Error(
      "Error invoking remote method 'agent:pair-usb': Error: Port COM4 sudah dipakai scanner \"Meja 1\"",
    );
    expect(agentErrorMessage(err, "fallback")).toBe(
      'Port COM4 sudah dipakai scanner "Meja 1"',
    );
  });

  it("returns message for plain Error", () => {
    expect(agentErrorMessage(new Error("Scanner tidak ditemukan"), "x")).toBe(
      "Scanner tidak ditemukan",
    );
  });

  it("uses fallback for bare AxiosError", () => {
    expect(
      agentErrorMessage(new Error("AxiosError: Request failed with status code 400"), "Pair USB gagal"),
    ).toBe("Pair USB gagal");
  });
});
