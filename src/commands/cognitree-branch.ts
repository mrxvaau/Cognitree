/**
 * /cognitree-branch — Create a new Cognitree branch from a checkpoint
 */
import type { Command } from '../types/command.js'

const cognitreeBranch = {
  type: 'local',
  name: 'cognitree-branch',
  description: 'Create a new Cognitree branch from a checkpoint ID',
  supportsNonInteractive: true,
  argumentHint: '<checkpoint-id>',
  load: () => import('./cognitree-branch.impl.js'),
} satisfies Command

export default cognitreeBranch
