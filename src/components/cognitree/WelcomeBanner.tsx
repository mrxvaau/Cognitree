/**
 * WelcomeBanner
 *
 * Full-width welcome section shown on fresh session start.
 * Contains: the Cognitree tree ASCII art, welcome message,
 * SESSION INFO panel, SYSTEM INFO panel, auto-hides after first
 * user message is sent.
 *
 * Auto-hides once messages.length > 0.
 */

import React from 'react'
import { Box, Text } from '../../ink.js'
import ThemedBox from '../design-system/ThemedBox.js'
import { useAppState } from '../../state/AppState.js'
import { useCognitreeTree } from '../../hooks/useCognitreeTree.js'
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js'
import { getCwd } from '../../utils/cwd.js'
import { getSystemContext } from '../../context.js'

// ═══════════════════════════════════════════════════════════════════════
// ASCII TREE — compact, works in terminals
// ═══════════════════════════════════════════════════════════════════════

const TREE_ART = [
  '    ╭───────╮    ',
  '   ╭╯ ╭─╮  ╰╮   ',
  '  ╭╯ ╭╯  ╰╮ ╰╮  ',
  ' ╭╯╭─╯    ╰─╮╰╮ ',
  '╭╯╭╯          ╰╮╰╮',
  '╰─╯            ╰─╯',
  '      ┃┃┃┃┃      ',
  '   ───┴──┴───    ',
]

// ═══════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════

interface Props {
  /** Pass message count — banner hides once > 0 */
  messageCount: number
}

export function WelcomeBanner({ messageCount }: Props): React.ReactNode {
  // Hide once there are messages
  if (messageCount > 0) return null

  return <WelcomeBannerInner />
}

function WelcomeBannerInner(): React.ReactNode {
  const model = useMainLoopModel()
  const cwd = getCwd()
  const { activeBranch, activeCheckpointId, project } = useCognitreeTree()

  // System info (best-effort, reads from context cache)
  const sysCtx = (() => {
    try {
      // getSystemContext() is async but we read cached sync value from module state
      // This is intentionally fire-and-forget; if not cached we show placeholders
      return null
    } catch {
      return null
    }
  })()

  const now = new Date()
  const timeStr = now.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  }) + ' • ' + now.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })

  const hasTree = activeBranch !== null

  return (
    <ThemedBox
      flexDirection="column"
      borderStyle="single"
      borderColor="subtle"
      borderBottom
      paddingX={2}
      paddingY={1}
    >
      {/* ── Top row: ASCII tree + info panels ── */}
      <Box flexDirection="row">

        {/* ASCII tree + title */}
        <Box flexDirection="column" width={22} marginRight={2}>
          {TREE_ART.map((line, i) => (
            <Text key={i} color="claude">{line}</Text>
          ))}
          <Box marginTop={1} justifyContent="center">
            <Text color="claude" bold>◆◆◆ COGNITREE ◆◆◆</Text>
          </Box>
        </Box>

        {/* SESSION INFO panel */}
        <ThemedBox
          flexDirection="column"
          borderStyle="single"
          borderColor="subtle"
          paddingX={1}
          paddingY={0}
          flexGrow={1}
          marginRight={2}
        >
          <Box marginBottom={1}>
            <Text color="claude" bold>◉ SESSION INFO ──────</Text>
          </Box>

          <Box flexDirection="row">
            <Text color="suggestion">🗓 </Text>
            <Text color="inactive" bold>Time    </Text>
            <Text color="text">: {timeStr}</Text>
          </Box>

          <Box flexDirection="row">
            <Text color="suggestion">🤖 </Text>
            <Text color="inactive" bold>Model   </Text>
            <Text color="text">: </Text>
            <Text color="claude">{model}</Text>
          </Box>

          <Box flexDirection="row">
            <Text color="suggestion">📁 </Text>
            <Text color="inactive" bold>Dir     </Text>
            <Text color="text">: {cwd}</Text>
          </Box>

          <Box flexDirection="row">
            <Text color="suggestion">📄 </Text>
            <Text color="inactive" bold>Branch  </Text>
            {hasTree ? (
              <Text color="text">: <Text color="claude">{activeBranch}</Text></Text>
            ) : (
              <>
                <Text color="text">: </Text>
                <Text color="warning">✗ No .cognitree/ found</Text>
              </>
            )}
          </Box>

          {hasTree && activeCheckpointId && (
            <Box flexDirection="row">
              <Text color="suggestion">◈ </Text>
              <Text color="inactive" bold>Node    </Text>
              <Text color="text">: {activeCheckpointId}</Text>
            </Box>
          )}
        </ThemedBox>

        {/* SYSTEM INFO panel */}
        <ThemedBox
          flexDirection="column"
          borderStyle="single"
          borderColor="subtle"
          paddingX={1}
          paddingY={0}
          width={36}
        >
          <Box marginBottom={1}>
            <Text color="suggestion" bold>💻 SYSTEM INFO ──────</Text>
          </Box>

          <Box flexDirection="row">
            <Text color="suggestion">⚡ </Text>
            <Text color="inactive">CPU  </Text>
            <Text color="text">: {process.env.PROCESSOR_IDENTIFIER?.slice(0, 22) ?? 'Unknown CPU'}</Text>
          </Box>

          <Box flexDirection="row">
            <Text color="suggestion">🎮 </Text>
            <Text color="inactive">GPU  </Text>
            <Text color="text">: {'Unknown GPU'}</Text>
          </Box>

          <Box flexDirection="row">
            <Text color="suggestion">🧠 </Text>
            <Text color="inactive">RAM  </Text>
            <Text color="text">: {formatMemory()}</Text>
          </Box>

          <Box flexDirection="row">
            <Text color="suggestion">🌐 </Text>
            <Text color="inactive">Node </Text>
            <Text color="text">: {process.version}</Text>
          </Box>

          <Box flexDirection="row">
            <Text color="suggestion">🖥 </Text>
            <Text color="inactive">OS   </Text>
            <Text color="text">: {process.platform}</Text>
          </Box>
        </ThemedBox>
      </Box>

      {/* ── Welcome message ── */}
      <Box marginTop={1} flexDirection="row">
        <Text color="claude">🌱 </Text>
        <Text color="text" bold>Welcome back! Let's build something amazing.</Text>
      </Box>
      <Box>
        <Text color="inactive">   Your AI workspace is ready.</Text>
      </Box>
    </ThemedBox>
  )
}

function formatMemory(): string {
  try {
    const mem = process.memoryUsage()
    const totalMb = Math.round(mem.rss / 1024 / 1024)
    return `${totalMb} MB RSS`
  } catch {
    return 'Unknown'
  }
}
