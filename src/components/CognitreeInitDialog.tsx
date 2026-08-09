/**
 * CognitreeInitDialog — Auto-init prompt shown after workspace trust dialog.
 *
 * Offers to initialize Cognitree memory for the current project.
 * "Yes" creates .cognitree/ directory; "No" persists cognitreeInitDeclined
 * in project config so the prompt never appears again.
 */
import * as path from 'path'
import React from 'react'
import { Box, Text } from '../ink.js'
import { Select } from './CustomSelect/index.js'
import { isCognitreeProject } from '../cognitree/startup.js'
import { initCognitreeDir } from '../cognitree/core/storage.js'
import { regenerateInjectMd } from '../cognitree/inject.js'
import { saveCurrentProjectConfig } from '../utils/config.js'
import { getCwd } from '../utils/cwd.js'

type Props = {
  onDone(): void
}

export function CognitreeInitDialog({ onDone }: Props): React.ReactNode {
  const cwd = getCwd()

  // Already initialized — skip silently
  if (isCognitreeProject(cwd)) {
    setTimeout(onDone)
    return null
  }

  function onChange(value: 'yes' | 'no') {
    if (value === 'yes') {
      try {
        const projectName = path.basename(cwd)
        const cognitreeDir = path.join(cwd, '.cognitree')
        initCognitreeDir(cognitreeDir, projectName)
        regenerateInjectMd(cwd)
      } catch {
        // Initialization failed — don't block startup
      }
    } else {
      // Persist decline so prompt never shows again for this project
      saveCurrentProjectConfig(current => ({
        ...current,
        cognitreeInitDeclined: true,
      }))
    }
    onDone()
  }

  return (
    <Box flexDirection="column" gap={1} paddingTop={1}>
      <Text bold color="green">🌳 Cognitree Memory Engine</Text>
      <Text>
        Enable Cognitree for this project? Cognitree tracks context across
        sessions so Claude remembers your project state, checkpoints, and
        progress.
      </Text>
      <Select
        options={[
          { label: 'Yes, enable Cognitree', value: 'yes' },
          { label: 'No, skip for now', value: 'no' },
        ]}
        onChange={value => onChange(value as 'yes' | 'no')}
        onCancel={() => onChange('no')}
      />
      <Text dimColor>Enter to confirm · Esc to skip</Text>
    </Box>
  )
}
