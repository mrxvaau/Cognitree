import type { Command } from '../../commands.js'

export default {
  type: 'local-jsx',
  name: 'byok',
  description: 'Bring Your Own Key — connect an external LLM provider',
  aliases: ['provider'],
  immediate: true,
  load: () => import('./byok.js'),
} satisfies Command
