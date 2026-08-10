import "server-only";

// Server-side image magic-number sniffing (audit finding M19: admin attach
// actions verified Storage metadata but never the actual bytes). Client/storage
// `mimetype` metadata is ultimately attacker-influenced; stored objects must be
// typed from their real bytes. SVG stays banned — stored-XSS vector.
//
// The IMPLEMENTATION now lives in ./imageSniffCore, which is plain and
// import-free so the browser can run the identical byte checks before uploading
// (see that file for why that matters). This module keeps the `server-only`
// guard and re-exports, so every existing server import is unchanged and no
// server module accidentally loses the guard.
export {
  EXT_BY_SNIFFED,
  sniffImageMime,
  type SniffedImageMime,
} from "./imageSniffCore";
