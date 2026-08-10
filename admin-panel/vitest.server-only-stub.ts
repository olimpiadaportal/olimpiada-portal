// Test-only stand-in for the `server-only` package.
//
// `server-only` throws at BUILD time when a server module is pulled into a
// client bundle. That guard belongs to the Next build; under Vitest the import
// simply does not resolve, so it is aliased here (vitest.config.ts) to an empty
// module. Never remove `import "server-only"` from a production file to make a
// spec pass — that deletes the guard instead of stubbing it.
export {};
