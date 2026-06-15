/**
 * /cognitree-status — Show Cognitree memory engine status
 */
import type { Command } from '../types/command.js'

const cognitreeStatus = {
  type: 'local',
  name: 'cognitree-status',
  description: 'Show Cognitree memory engine status (branch, checkpoint, confidence)',
  supportsNonInteractive: true,
  load: () => import('./cognitree-status.impl.js'),
} satisfies Command

export default cognitreeStatus
