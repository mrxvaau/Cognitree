/**
 * ChatArea
 *
 * Wrapper around the existing Messages component that:
 *  - Fills remaining vertical space between StatsRow and InputBar
 *  - Adds auto-save indicator in top-right corner
 *  - Passes all props through to Messages unchanged
 *
 * This is a thin presentational wrapper — no business logic.
 */

import React from 'react'
import { Box, Text } from '../../ink.js'
import { useAppState } from '../../state/AppState.js'
import type { Message } from '../../types/message.js'

// ═══════════════════════════════════════════════════════════════════════
// PROPS
// ═══════════════════════════════════════════════════════════════════════

interface Props {
  messages: Message[]
  /** The full Messages component passed down from REPL — avoids circular imports */
  MessagesComponent: React.ComponentType<{ messages: Message[] }>
}

// ═══════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════

export function ChatArea({ messages, MessagesComponent }: Props): React.ReactNode {
  // Auto-save state (read from AppState if available)
  const autoSave = true // default on — tie to settings when available

  return (
    <Box flexDirection="column" flexGrow={1} overflow="hidden">
      {/* ── Auto-save indicator ── */}
      <Box
        flexDirection="row"
        justifyContent="flex-end"
        paddingX={1}
        paddingY={0}
      >
        <Text color="inactive">Auto-save: </Text>
        {autoSave ? (
          <Text color="success">ON ●</Text>
        ) : (
          <Text color="inactive">OFF ○</Text>
        )}
      </Box>

      {/* ── Messages ── */}
      <Box flexGrow={1} overflow="hidden">
        <MessagesComponent messages={messages} />
      </Box>
    </Box>
  )
}
