/**
 * /cognitree-init — Initialize Cognitree memory engine for this project
 */
import type { Command } from '../types/command.js'

const cognitreeInit = {
  type: 'local',
  name: 'cognitree-init',
  description: 'Initialize Cognitree memory engine for this project',
  supportsNonInteractive: true,
  load: () => import('./cognitree-init.impl.js'),
} satisfies Command

export default cognitreeInit
