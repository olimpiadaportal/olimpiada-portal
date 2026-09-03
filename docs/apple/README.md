# Apple root CA certificates

`apple-roots.pem` is the value of the **`APPLE_IAP_ROOT_CERTIFICATES`**
environment variable on the web-app Vercel project.

## What it is

Four of Apple's public root CA certificates, concatenated as PEM:

| Certificate | Subject |
|---|---|
| `AppleRootCA-G3.cer` | CN=Apple Root CA - G3 |
| `AppleRootCA-G2.cer` | CN=Apple Root CA - G2 |
| `AppleIncRootCertificate.cer` | Apple Inc. Root |
| `AppleComputerRootCertificate.cer` | Apple Computer, Inc. Root |

They are how the server proves a signed transaction genuinely came from Apple
rather than from someone imitating it. **They are not secret** — Apple publishes
them openly — which is why this file is committed rather than hidden. What they
must be is *correct*: a truncated or wrong-root bundle means either every
purchase fails to verify, or worse, that forged data verifies.

## Regenerating it

Nothing here is hand-edited. To rebuild from Apple:

```bash
for u in \
  https://www.apple.com/certificateauthority/AppleRootCA-G3.cer \
  https://www.apple.com/certificateauthority/AppleRootCA-G2.cer \
  https://www.apple.com/appleca/AppleIncRootCertificate.cer \
  https://www.apple.com/certificateauthority/AppleComputerRootCertificate.cer
do curl -fsSLO "$u"; done

node -e '
const {readFileSync}=require("fs"); const {X509Certificate}=require("crypto");
const out=[];
for (const f of ["AppleRootCA-G3.cer","AppleRootCA-G2.cer",
                 "AppleIncRootCertificate.cer","AppleComputerRootCertificate.cer"]) {
  const der=readFileSync(f); new X509Certificate(der);   // proves it parses
  out.push("-----BEGIN CERTIFICATE-----\n"
    + der.toString("base64").match(/.{1,64}/g).join("\n")
    + "\n-----END CERTIFICATE-----");
}
process.stdout.write(out.join("\n"));
' > apple-roots.pem
```

Each certificate is parsed with `X509Certificate` before being written, so a
failed download or an HTML error page cannot silently become part of the bundle.

## When to regenerate

Apple root CAs are long-lived (G3 runs to 2039), so this is close to static. It
needs revisiting only if Apple publishes a new root that signs App Store data —
the symptom would be verification failing for transactions that are genuinely
valid. `web-app/src/lib/payments/apple/config.ts` validates the value at
startup and reports only the variable NAME on a problem, never its contents.
