/**
 * /cognitree-checkpoint implementation
 */
import * as path from 'path'
import type { LocalCommandCall } from '../types/command.js'
import { createCheckpoint } from '../cognitree/checkpoint.js'
import { regenerateInjectMd } from '../cognitree/inject.js'
import { isCognitreeProject } from '../cognitree/startup.js'
import { getCwd } from '../utils/cwd.js'

export const call: LocalCommandCall = async (args) => {
  const cwd = getCwd()

  if (!isCognitreeProject(cwd)) {
    return { type: 'text', value: 'Cognitree: not initialized in this directory. Run /cognitree-init first.' }
  }

  const prompt = args.trim() || 'Manual checkpoint'
  const cognitreeDir = path.join(cwd, '.cognitree')

  const result = createCheckpoint({
    cognitreeDir,
    projectDir: cwd,
    prompt,
  })

  if (!result) {
    return { type: 'text', value: 'Cognitree: failed to create checkpoint.' }
  }

  // Regenerate inject.md for next session
  regenerateInjectMd(cwd)

  return {
    type: 'text',
    value: `🌳 Checkpoint saved: ${result.id} (depth ${result.depth}, ${result.isBase ? 'base' : 'delta'}, confidence ${result.confidence.toFixed(2)})`,
  }
}
