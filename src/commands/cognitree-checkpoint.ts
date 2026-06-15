/**
 * /cognitree-checkpoint — Manually save a Cognitree checkpoint
 */
import type { Command } from '../types/command.js'

const cognitreeCheckpoint = {
  type: 'local',
  name: 'cognitree-checkpoint',
  description: 'Save a Cognitree memory checkpoint with a description',
  supportsNonInteractive: true,
  argumentHint: '<description>',
  load: () => import('./cognitree-checkpoint.impl.js'),
} satisfies Command

export default cognitreeCheckpoint
