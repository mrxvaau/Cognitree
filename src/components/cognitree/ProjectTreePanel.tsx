/**
 * ProjectTreePanel
 *
 * Sticky left sidebar showing the Cognitree checkpoint tree.
 * Always visible alongside the chat — does not scroll with messages.
 *
 * Features:
 *  - Full branch tree with icons and connectors
 *  - Keyboard navigation (↑↓ to move, Enter to switch, F for fallback, N for new)
 *  - Quick Actions legend at bottom
 *  - Live refresh via useCognitreeTree (polls every 500ms)
 *  - Visible-window rendering: only the rows that fit are mounted in the Yoga
 *    tree, so the sidebar's intrinsic height never exceeds the terminal height
 *    regardless of how many checkpoints exist.
 */

import React, { useEffect, useRef, useState } from 'react'
import { Box, Text } from '../../ink.js'
import { getCwd } from '../../utils/cwd.js'
import { useCognitreeTree, type TreeNodeData } from '../../hooks/useCognitreeTree.js'
import { TreeNode } from './TreeNode.js'

// ═══════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════

const PANEL_WIDTH = 34

// Fixed rows consumed by non-tree content:
//   border top(1) + header(1) + project(1) + divider(1)
//   + bottom-divider(1) + keys-header(1) + keys-rows(2) + border-bot(1) = 9
// Leave at least 1 visible tree row.
const FIXED_ROWS = 9

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

/** Flatten tree into a stable ordered list for keyboard navigation */
function flattenTree(nodes: TreeNodeData[]): TreeNodeData[] {
  const result: TreeNodeData[] = []
  function walk(list: TreeNodeData[]): void {
    for (const n of list) {
      result.push(n)
      walk(n.children)
    }
  }
  walk(nodes)
  return result
}

// ═══════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════

interface Props {
  /** Notify parent when user switches to a checkpoint */
  onNodeSwitch?: (checkpointId: string) => void
  /** Is the panel currently receiving keyboard focus? */
  isFocused?: boolean
  /** Explicit terminal row count for height lock — use integer, not '100%' */
  height?: number
}

export function ProjectTreePanel({ onNodeSwitch, isFocused = false, height }: Props): React.ReactNode {
  const treeState = useCognitreeTree()
  const flat = treeState.tree ? flattenTree(treeState.tree) : []
  const [focusedIdx, setFocusedIdx] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const msgTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Track whether we've already set the initial focus position.
  // We only auto-jump to the active node ONCE (when the tree first loads).
  // After that, only keyboard navigation moves focusedIdx — NOT background
  // checkpoint creation. This prevents the panel from visually "growing"
  // as the agent creates new checkpoints and the cursor chases the new active node.
  const initialFocusSetRef = useRef(false)

  // How many tree rows we can show given the panel height.
  // If height prop is undefined (non-fullscreen path), default to 24 rows.
  const visibleRows = Math.max(1, (height ?? 24) - FIXED_ROWS)

  // Set focusedIdx to the active node on first load only
  useEffect(() => {
    if (!treeState.isLoaded) return
    if (initialFocusSetRef.current) return   // already positioned — don't chase new checkpoints
    const activeIdx = flat.findIndex(n => n.isActive)
    if (activeIdx >= 0) {
      setFocusedIdx(activeIdx)
      // Scroll window so the active node is centered in the visible area
      setScrollTop(Math.max(0, activeIdx - Math.floor(visibleRows / 2)))
      initialFocusSetRef.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treeState.isLoaded, treeState.activeCheckpointId])

  // Keep scrollTop in sync with focusedIdx when the user navigates
  useEffect(() => {
    setScrollTop(prev => {
      if (focusedIdx < prev) return focusedIdx
      if (focusedIdx >= prev + visibleRows) return focusedIdx - visibleRows + 1
      return prev
    })
  }, [focusedIdx, visibleRows])

  function showMsg(text: string): void {
    setMessage(text)
    if (msgTimerRef.current !== undefined) clearTimeout(msgTimerRef.current)
    msgTimerRef.current = setTimeout(() => setMessage(null), 2000)
  }

  const focusedNode = flat[focusedIdx] ?? null

  // ── Keyboard handling ──────────────────────────────────────────────
  useEffect(() => {
    if (!isFocused) return

    function onData(chunk: Buffer): void {
      const key = chunk.toString()

      if (key === '\x1B[A' || key === 'k') {
        setFocusedIdx(prev => Math.max(0, prev - 1))
      } else if (key === '\x1B[B' || key === 'j') {
        setFocusedIdx(prev => Math.min(flat.length - 1, prev + 1))
      } else if (key === '\r' || key === '\n') {
        if (focusedNode) {
          onNodeSwitch?.(focusedNode.id)
          showMsg(`→ ${focusedNode.label}`)
        }
      } else if (key === 'f' || key === 'F') {
        if (focusedNode) showMsg(`fallback from ${focusedNode.label}…`)
      } else if (key === 'n' || key === 'N') {
        showMsg('new node from here…')
      } else if (key === 's' || key === 'S') {
        showMsg('session saved ✓')
      }
    }

    process.stdin.on('data', onData)
    return () => { process.stdin.off('data', onData) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, flat, focusedNode, onNodeSwitch])

  // ── Visible window of flat nodes ──────────────────────────────────
  // KEY FIX: we only RENDER the nodes that fit in the visible window.
  // Yoga therefore measures at most `visibleRows` TreeNode boxes — the
  // intrinsic height of the tree section is always bounded to visibleRows,
  // regardless of how many checkpoints exist. This eliminates the sidebar
  // stretch bug where all N nodes were rendered unconditionally and Yoga
  // used their full measured height before overflow:hidden clipped them.
  const visibleFlat = flat.slice(scrollTop, scrollTop + visibleRows)
  const scrollIndicatorTop = scrollTop > 0
  const scrollIndicatorBot = scrollTop + visibleRows < flat.length

  // ── Render: no cognitree project ──────────────────────────────────
  if (treeState.isLoaded && treeState.tree === null) {
    return (
      <Box
        width={PANEL_WIDTH}
        minWidth={PANEL_WIDTH}
        flexShrink={0}
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        borderRight
        paddingX={1}
        height={height ?? '100%'}
        overflow="hidden"
      >
        <Text color="cyan" bold>◈ PROJECT TREE</Text>
        <Box marginTop={1}>
          <Text color="gray" wrap="truncate">No .cognitree/ found.</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="yellow">/cognitree-init</Text>
        </Box>
      </Box>
    )
  }

  // ── Render: loading ───────────────────────────────────────────────
  if (!treeState.isLoaded) {
    return (
      <Box
        width={PANEL_WIDTH}
        minWidth={PANEL_WIDTH}
        flexShrink={0}
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        borderRight
        paddingX={1}
        height={height ?? '100%'}
        overflow="hidden"
      >
        <Text color="cyan" bold>◈ PROJECT TREE</Text>
        <Box marginTop={1}>
          <Text color="gray">loading…</Text>
        </Box>
      </Box>
    )
  }

  // ── Render: full panel ────────────────────────────────────────────
  const cwd = getCwd()
  const projectLabel = treeState.project ?? cwd.split(/[\\\/]/).pop() ?? 'project'

  return (
    <Box
      width={PANEL_WIDTH}
      minWidth={PANEL_WIDTH}
      flexShrink={0}
      flexDirection="column"
      borderStyle="single"
      borderRight
      borderColor={isFocused ? 'cyan' : 'gray'}
      height={height ?? '100%'}
      overflow="hidden"
    >
      {/* ── Header ── */}
      <Box paddingX={1} paddingY={0} flexDirection="row" justifyContent="space-between">
        <Text color="claude" bold>◈ PROJECT TREE</Text>
        <Text color="inactive">+ ⟳</Text>
      </Box>

      {/* ── Project label ── */}
      <Box paddingX={1}>
        <Text color="inactive" wrap="truncate">
          {projectLabel.slice(0, PANEL_WIDTH - 4)}
        </Text>
      </Box>

      {/* ── Divider ── */}
      <Box paddingX={1}>
        <Text color="subtle">{'─'.repeat(PANEL_WIDTH - 4)}</Text>
      </Box>

      {/* ── Scroll indicator (top) ── */}
      {scrollIndicatorTop && (
        <Box paddingX={1} flexShrink={0}>
          <Text color="gray">↑ {scrollTop} more</Text>
        </Box>
      )}

      {/* ── Tree nodes — WINDOWED: only visibleRows nodes are in the Yoga tree ── */}
      <Box flexDirection="column" flexShrink={0} paddingX={1}>
        {visibleFlat.map((node) => {
          // Render each flat node as a shallow TreeNode (no children) so the
          // flat list controls ordering and we avoid recursive double-rendering.
          const shallowNode = { ...node, children: [] }
          return (
            <TreeNode
              key={node.id}
              node={shallowNode}
              prefixFlags={Array(node.depth).fill(false)}
              isLast={false}
              panelWidth={PANEL_WIDTH}
              focusedId={isFocused ? (focusedNode?.id ?? null) : null}
            />
          )
        })}
      </Box>

      {/* ── Scroll indicator (bottom) ── */}
      {scrollIndicatorBot && (
        <Box paddingX={1} flexShrink={0}>
          <Text color="gray">↓ {flat.length - scrollTop - visibleRows} more</Text>
        </Box>
      )}

      {/* ── Status message ── */}
      {message && (
        <Box paddingX={1} flexShrink={0}>
          <Text color="cyan" wrap="truncate">{message}</Text>
        </Box>
      )}

      {/* ── Divider ── */}
      <Box paddingX={1} flexShrink={0}>
        <Text color="gray">{'─'.repeat(PANEL_WIDTH - 4)}</Text>
      </Box>

      {/* ── Quick Actions ── */}
      <Box flexDirection="column" paddingX={1} flexShrink={0}>
        <Text color="gray" bold>KEYS─────────────────────────</Text>
        <Box flexDirection="row">
          <Text color="gray">[↑↓] Nav   </Text>
          <Text color="gray">[↵] Jump   </Text>
          <Text color="gray">[F] Back</Text>
        </Box>
        <Box flexDirection="row">
          <Text color="gray">[N] New    </Text>
          <Text color="gray">[S] Save   </Text>
          <Text color="cyan">{treeState.totalCheckpoints} cp</Text>
        </Box>
      </Box>
    </Box>
  )
}
