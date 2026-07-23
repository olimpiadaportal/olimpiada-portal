import { isPrivateLanIpv4, remoteBffHint, resolveDevBffHost } from "@/lib/env";

const LAN = "192.168.1.42:8081";
// Real `expo start --tunnel` hostUri shapes (the port is encoded in the
// subdomain and the frame is served over 443, so :3000 is never forwarded).
const TUNNEL = "abc123-anonymous-8081.exp.direct";
const TUNNEL_PORTED = "abc123-anonymous-8081.exp.direct:80";

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

  // The reason this round exists: under `--tunnel` the Metro host is a public
  // domain, and the old code rewrote localhost:3000 → tunnel-host:3000, which
  // the tunnel never forwards → an unreachable BFF for a remote tester.
  it("does NOT rewrite localhost to a tunnel host (unreachable :3000)", () => {
    expect(resolveDevBffHost("http://localhost:3000", TUNNEL, true)).toBe("http://localhost:3000");
    expect(resolveDevBffHost("http://localhost:3000", TUNNEL_PORTED, true)).toBe(
      "http://localhost:3000",
    );
  });

  it("does NOT rewrite to a public IPv4 host (only private LAN ranges)", () => {
    expect(resolveDevBffHost("http://localhost:3000", "8.8.8.8:8081", true)).toBe(
      "http://localhost:3000",
    );
  });

  it("leaves an already-public BFF url untouched under tunnel", () => {
    expect(resolveDevBffHost("https://olympiq.vercel.app", TUNNEL, true)).toBe(
      "https://olympiq.vercel.app",
    );
    expect(resolveDevBffHost("https://xyz.trycloudflare.com", TUNNEL, true)).toBe(
      "https://xyz.trycloudflare.com",
    );
  });

  it("still rewrites for every private-LAN range", () => {
    for (const h of ["10.0.0.5:8081", "172.16.4.9:8081", "172.31.9.1:8081", "169.254.10.2:8081"]) {
      expect(resolveDevBffHost("http://localhost:3000", h, true)).toBe(
        `http://${h.split(":")[0]}:3000`,
      );
    }
  });
});

describe("isPrivateLanIpv4", () => {
  it("accepts the private ranges and rejects everything else", () => {
    for (const h of ["10.1.2.3", "172.16.0.1", "172.31.255.254", "192.168.0.1", "169.254.1.1"]) {
      expect(isPrivateLanIpv4(h)).toBe(true);
    }
    for (const h of [
      "8.8.8.8", // public
      "172.15.0.1", // just below the 172.16-31 block
      "172.32.0.1", // just above it
      "192.169.0.1", // not 192.168
      "abc-8081.exp.direct", // tunnel domain
      "localhost",
      "256.1.1.1", // out of range octet
      "",
    ]) {
      expect(isPrivateLanIpv4(h)).toBe(false);
    }
  });
});

describe("remoteBffHint (tunnel + localhost BFF misconfig)", () => {
  it("warns when Metro is remote but the BFF is still localhost", () => {
    expect(remoteBffHint("http://localhost:3000", TUNNEL, true)).toMatch(/EXPO_PUBLIC_BFF_URL/);
    expect(remoteBffHint("http://127.0.0.1:3000", "8.8.8.8:8081", true)).toMatch(/public/i);
  });

  it("stays silent when the BFF is already a public origin", () => {
    expect(remoteBffHint("https://olympiq.vercel.app", TUNNEL, true)).toBeNull();
  });

  it("stays silent on the plain LAN case (that path already works)", () => {
    expect(remoteBffHint("http://localhost:3000", LAN, true)).toBeNull();
  });

  it("never warns outside dev", () => {
    expect(remoteBffHint("http://localhost:3000", TUNNEL, false)).toBeNull();
  });
});
