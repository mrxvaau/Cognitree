/**
 * /cognitree-status implementation
 */
import type { LocalCommandCall } from '../types/command.js'
import { getCognitreeStatus } from '../cognitree/startup.js'
import { getCwd } from '../utils/cwd.js'

export const call: LocalCommandCall = async () => {
  const cwd = getCwd()
  const status = getCognitreeStatus(cwd)
  return { type: 'text', value: status }
}
