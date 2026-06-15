/**
 * COGNITREE — sessionLifecycle.test.ts
 * 1 test: getCognitreeInjection null-guard when .cognitree/ does not exist
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { getCognitreeInjection } from '../../../src/cognitree/manager/sessionLifecycle.js'

describe('sessionLifecycle', () => {
  it('getCognitreeInjection returns null when .cognitree/ does not exist', async () => {
    // Plain temp dir — no .cognitree/ subdirectory inside it
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-cognitree-'))
    try {
      const result = await getCognitreeInjection(tmpDir)
      expect(result).toBeNull()
    } finally {
      fs.rmdirSync(tmpDir)
    }
  })
})
