// src/shims/bunBundlePlugin.ts
// Runtime shim for bun:bundle — feature() always returns false
// In production builds, Bun's bundler replaces these at compile time.

import { plugin } from 'bun'

plugin({
  name: 'bun-bundle-shim',
  setup(build) {
    build.module('bun:bundle', () => ({
      exports: {
        feature: (_name: string) => false,
      },
      loader: 'object',
    }))
  },
})
