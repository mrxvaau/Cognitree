/**
 * /cognitree-branch implementation
 */
import * as path from 'path'
import type { LocalCommandCall } from '../types/command.js'
import { createBranch } from '../cognitree/branch.js'
import { isCognitreeProject } from '../cognitree/startup.js'
import { getCwd } from '../utils/cwd.js'

export const call: LocalCommandCall = async (args) => {
  const cwd = getCwd()

  if (!isCognitreeProject(cwd)) {
    return { type: 'text', value: 'Cognitree: not initialized in this directory. Run cognitree init first.' }
  }

  const checkpointId = args.trim()
  if (!checkpointId) {
    return { type: 'text', value: 'Usage: /cognitree-branch <checkpoint-id>' }
  }

  const cognitreeDir = path.join(cwd, '.cognitree')

  const result = createBranch({
    cognitreeDir,
    projectDir: cwd,
    forkCheckpointId: checkpointId,
  })

  if (!result) {
    return { type: 'text', value: `Cognitree: failed to create branch from ${checkpointId}. Checkpoint may not exist.` }
  }

  return {
    type: 'text',
    value: `🌿 Branch created: ${result.branchName} (from ${checkpointId})\n   New checkpoint: ${result.checkpointId}\n   Inherited: ${result.inheritedWarnings} warnings, ${result.inheritedMistakes} critical mistakes`,
  }
}
