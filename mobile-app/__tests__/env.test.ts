import { resolveDevBffHost } from "@/lib/env";

const LAN = "192.168.1.42:8081";

describe("resolveDevBffHost (dev-device localhost → LAN host)", () => {
  it("rewrites localhost to the Metro LAN host, keeping the port", () => {
    expect(resolveDevBffHost("http://localhost:3000", LAN, true)).toBe(
      "http://192.168.1.42:3000",
    );
  });

  it("rewrites 127.0.0.1 the same way", () => {
    expect(resolveDevBffHost("http://127.0.0.1:3000", LAN, true)).toBe(
      "http://192.168.1.42:3000",
    );
  });

  it("leaves non-localhost origins untouched", () => {
    expect(resolveDevBffHost("http://192.168.1.7:3000", LAN, true)).toBe(
      "http://192.168.1.7:3000",
    );
    expect(resolveDevBffHost("https://bff.olympiq.ai", LAN, true)).toBe("https://bff.olympiq.ai");
  });

  it("never rewrites outside dev builds", () => {
    expect(resolveDevBffHost("http://localhost:3000", LAN, false)).toBe("http://localhost:3000");
  });

  it("keeps the url when the hostUri is empty or itself localhost", () => {
    expect(resolveDevBffHost("http://localhost:3000", "", true)).toBe("http://localhost:3000");
    expect(resolveDevBffHost("http://localhost:3000", "localhost:8081", true)).toBe(
      "http://localhost:3000",
    );
    expect(resolveDevBffHost("http://localhost:3000", "127.0.0.1:8081", true)).toBe(
      "http://localhost:3000",
    );
  });

  it("does not touch hostnames merely starting with 'localhost'", () => {
    expect(resolveDevBffHost("https://localhost.example.com", LAN, true)).toBe(
      "https://localhost.example.com",
    );
  });
});
