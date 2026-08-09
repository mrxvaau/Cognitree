/**
 * /cognitree-init implementation
 */
import * as path from 'path'
import type { LocalCommandCall } from '../types/command.js'
import { isCognitreeProject } from '../cognitree/startup.js'
import { initCognitreeDir } from '../cognitree/core/storage.js'
import { regenerateInjectMd } from '../cognitree/inject.js'
import { getCwd } from '../utils/cwd.js'

export const call: LocalCommandCall = async () => {
  const cwd = getCwd()

  if (isCognitreeProject(cwd)) {
    return {
      type: 'text',
      value: '🌳 Cognitree is already initialized in this directory. Use /cognitree-status to view state.',
    }
  }

  const projectName = path.basename(cwd)
  const cognitreeDir = path.join(cwd, '.cognitree')

  try {
    initCognitreeDir(cognitreeDir, projectName)
    regenerateInjectMd(cwd)
  } catch (err) {
    return {
      type: 'text',
      value: `Cognitree: initialization failed — ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  return {
    type: 'text',
    value:
      `🌳 Cognitree initialized for "${projectName}".\n` +
      `   Memory dir: .cognitree/\n` +
      `   Branch: main\n` +
      `   Use /cognitree-checkpoint <desc> to save your first checkpoint.`,
  }
}
