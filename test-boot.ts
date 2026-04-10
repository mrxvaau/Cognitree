// test-boot.ts — Minimal boot test to check if Bun itself hangs
console.error('[TEST] Script started at', new Date().toISOString())
console.log('Hello from test-boot.ts')
console.error('[TEST] Script completed at', new Date().toISOString())
process.exit(0)
