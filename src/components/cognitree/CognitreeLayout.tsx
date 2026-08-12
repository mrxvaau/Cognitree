/**
 * CognitreeLayout
 *
 * Root two-pane layout for the Cognitree TUI redesign.
 *
 * ┌─────────────────┬──────────────────────────────────────────────────┐
 * │                 │  TopStatusBar                                     │
 * │  ProjectTree    │  StatsRow                                         │
 * │  Panel          │  WelcomeBanner (hides after first message)        │
 * │  (sticky,       │  ChatArea (scrollable messages)                   │
 * │  28 cols)       │  [PromptInput / children from REPL]               │
 * └─────────────────┴──────────────────────────────────────────────────┘
 *
 * Usage in REPL.tsx:
 *
 *   import { CognitreeLayout } from '../components/cognitree/CognitreeLayout.js'
 *
 *   // Wrap the existing content:
 *   return (
 *     <CognitreeLayout
 *       messages={messages}
 *       MessagesComponent={Messages}
 *     >
 *       {promptInput}
 *     </CognitreeLayout>
 *   )
 */

import React, { type ReactNode } from 'react'
import { Box } from '../../ink.js'
import type { Message } from '../../types/message.js'

import { ProjectTreePanel } from './ProjectTreePanel.js'
import { TopStatusBar } from './TopStatusBar.js'
import { StatsRow } from './StatsRow.js'
import { WelcomeBanner } from './WelcomeBanner.js'
import { ChatArea } from './ChatArea.js'

// ═══════════════════════════════════════════════════════════════════════
// PROPS
// ═══════════════════════════════════════════════════════════════════════

interface Props {
  /** The conversation messages — passed to ChatArea + WelcomeBanner */
  messages: Message[]

  /**
   * The Messages component from REPL.tsx.
   * Passed as a prop to avoid circular imports (ChatArea renders it).
   */
  MessagesComponent: React.ComponentType<{ messages: Message[] }>

  /**
   * Children = everything below the chat (PromptInput, footer, etc.)
   * Rendered at the bottom of the main panel, below ChatArea.
   */
  children?: ReactNode

  /**
   * Whether to show the left tree panel. Can be toggled via keybinding.
   * Defaults to true.
   */
  showTree?: boolean

  /**
   * Optional callback when user switches to a different checkpoint
   * from the tree panel navigation.
   */
  onNodeSwitch?: (checkpointId: string) => void
}

// ═══════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════

export function CognitreeLayout({
  messages,
  MessagesComponent,
  children,
  showTree = true,
  onNodeSwitch,
}: Props): React.ReactNode {
  return (
    <Box flexDirection="row" height="100%">

      {/* ── LEFT: Sticky Project Tree Panel ── */}
      {showTree && (
        <ProjectTreePanel
          onNodeSwitch={onNodeSwitch}
          isFocused={false}
        />
      )}

      {/* ── RIGHT: Main Panel ── */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden">

        {/* Top single-line status bar */}
        <TopStatusBar />

        {/* Stats cards row */}
        <StatsRow />

        {/* Welcome banner — auto-hides after first message */}
        <WelcomeBanner messageCount={messages.length} />

        {/* Scrollable chat area */}
        <ChatArea
          messages={messages}
          MessagesComponent={MessagesComponent}
        />

        {/* PromptInput + footer passed from REPL */}
        {children}

      </Box>
    </Box>
  )
}
