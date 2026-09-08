/**
 * ProjectTreePanel
 *
 * Sticky left sidebar showing the Cognitree checkpoint tree.
 * Always visible alongside the chat — does not scroll with messages.
 *
 * Features:
 *  - Full branch tree with icons and connectors
 *  - Keyboard navigation (↑↓ to move, Enter to switch, F for fallback, N for new)
 *  - Focus toggle: ctrl+shift+T grabs focus for the panel, escape releases it
 *  - Quick Actions legend at bottom
 *  - Live refresh via useCognitreeTree (shared 500ms poller)
 *  - Visible-window rendering: only the rows that fit are mounted in the Yoga
 *    tree, so the sidebar's intrinsic height never exceeds the terminal height
 *    regardless of how many checkpoints exist.
 */

import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { type TreeNodeData, useCognitreeTree } from '../../hooks/useCognitreeTree.js'
import { Box, type Key, Text, useInput } from '../../ink.js'
import { createCheckpoint } from '../../cognitree/checkpoint.js'
import { getCwd } from '../../utils/cwd.js'
import { TreeNode } from './TreeNode.js'
import * as path from 'node:path'

// ═══════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════

const PANEL_WIDTH = 34

// Fixed rows consumed by non-tree content:
//   border top(1) + header(1) + project(1) + divider(1)
//   + bottom-divider(1) + keys-header(1) + keys-rows(2) + border-bot(1) = 9
// (keys-rows is 2 after the honest-actions legend rework). The transient
// status message row renders only while a message is showing — it may
// overlap the last visible tree row for 2s, which is accepted.
// Leave at least 1 visible tree row.
const FIXED_ROWS = 9

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

/** A flattened tree row: the node plus the branch metadata needed to draw
 *  true tree connectors (└─/├─/│) in the windowed flat render. */
export interface FlatTreeRow {
	node: TreeNodeData
	/** Per ancestor level: does that ancestor have a following sibling? (│ rail) */
	prefixFlags: boolean[]
	/** Is this node the last child of its parent? (└─ vs ├─) */
	isLast: boolean
}

/** Flatten tree into a stable ordered list for keyboard navigation,
 *  deriving real connector flags so branch glyphs render correctly. */
function flattenTree(nodes: TreeNodeData[]): FlatTreeRow[] {
	const result: FlatTreeRow[] = []
	function walk(list: TreeNodeData[], prefixFlags: boolean[]): void {
		for (let i = 0; i < list.length; i++) {
			const isLast = i === list.length - 1
			result.push({ node: list[i], prefixFlags, isLast })
			// Children see a │ rail at this level while this node has siblings below it.
			walk(list[i].children, [...prefixFlags, !isLast])
		}
	}
	walk(nodes, [])
	return result
}

// ═══════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════

interface Props {
	/** Explicit terminal row count for height lock — use integer, not '100%' */
	height?: number
}

export function ProjectTreePanel({ height }: Props): React.ReactNode {
	const treeState = useCognitreeTree()
	const flat = treeState.tree ? flattenTree(treeState.tree) : []
	const [focusedIdx, setFocusedIdx] = useState(0)
	const [scrollTop, setScrollTop] = useState(0)
	const [message, setMessage] = useState<string | null>(null)
	// Focused = the panel owns keyboard input. Toggled ON by ctrl+shift+T,
	// OFF by escape. While ON, the PromptInput never sees keystrokes.
	const [isFocused, setIsFocused] = useState(false)
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

	// Set focusedIdx to the active node on first load only. activeCheckpointId
	// is in the deps so the initial position retried until the tree loads;
	// after that initialFocusSetRef freezes it (background checkpoint creation
	// never moves the cursor).
	useEffect(() => {
		if (!treeState.isLoaded) return
		if (initialFocusSetRef.current) return // already positioned — don't chase new checkpoints
		const activeIdx = flat.findIndex((row) => row.node.isActive)
		if (activeIdx >= 0) {
			setFocusedIdx(activeIdx)
			// Scroll window so the active node is centered in the visible area
			setScrollTop(Math.max(0, activeIdx - Math.floor(visibleRows / 2)))
			initialFocusSetRef.current = true
		}
	}, [flat, treeState.isLoaded, visibleRows])

	// Keep scrollTop in sync with focusedIdx when the user navigates
	useEffect(() => {
		setScrollTop((prev) => {
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

	const focusedNode = flat[focusedIdx]?.node ?? null

	// Move focus up/down with bounds clamping.
	function moveFocus(delta: 1 | -1): void {
		setFocusedIdx((prev) => Math.min(flat.length - 1, Math.max(0, prev + delta)))
	}

	// Real checkpoint actions (create) — same API /cognitree-checkpoint uses.
	// Both N and S create a manual checkpoint (a save IS a new checkpoint in
	// the Cognitree model); N seeds it from the focused node's label.
	function createFromFocused(label: string | null): void {
		const cwd = getCwd()
		const cognitreeDir = path.join(cwd, '.cognitree')
		try {
			const result = createCheckpoint({
				cognitreeDir,
				projectDir: cwd,
				prompt: label ? `Manual checkpoint from ${label}` : 'Manual checkpoint (tree panel)',
			})
			showMsg(result ? `✓ saved ${result.id}` : '✗ checkpoint failed')
		} catch {
			showMsg('✗ checkpoint failed')
		}
	}

	// Non-navigational actions while focused.
	function dispatchTreeAction(lower: string): void {
		if (lower === 'n') {
			createFromFocused(focusedNode?.label ?? null)
		} else if (lower === 's') {
			createFromFocused(null)
		}
	}

	// Tree-panel key dispatch while the panel is focused. Returns after each
	// handled branch; unhandled keys are simply swallowed (panel owns the
	// keyboard while focused).
	function dispatchTreeKey(input: string, key: Key): void {
		if (key.escape) {
			setIsFocused(false)
			showMsg('panel unfocused')
			return
		}
		if (key.upArrow || input === 'k') {
			moveFocus(-1)
			return
		}
		if (key.downArrow || input === 'j') {
			moveFocus(1)
			return
		}
		if (key.return) {
			// No in-UI checkpoint switch exists yet — point users at the
			// command instead of pretending the jump happened.
			showMsg('switch: use /cognitree-branch <name>')
			return
		}
		dispatchTreeAction(input.toLowerCase())
	}

	// ── Keyboard handling ──────────────────────────────────────────────
	// All input flows through Ink's useInput (shared stdin pipeline) — never a
	// direct process.stdin listener, which would double-handle keystrokes with
	// Ink's own input dispatch. While focused, keys are swallowed via
	// stopImmediatePropagation so PromptInput never sees them (panel mounts
	// before the prompt in the tree, so its listener runs first).
	useInput((input, key, event) => {
		if (!isFocused) {
			// Grab combo: ctrl+shift+T. Only observe while unfocused — never
			// swallow, so the key still reaches its normal destination.
			if (key.ctrl && key.shift && input.toLowerCase() === 't') {
				event.stopImmediatePropagation()
				setIsFocused(true)
				showMsg('panel focused — esc to release')
			}
			return
		}

		// Focused: the panel owns the keyboard. Swallow everything so the
		// prompt never sees keystrokes while the user navigates the tree.
		event.stopImmediatePropagation()
		dispatchTreeKey(input, key)
	})

	// Clicking a tree row (fullscreen mouse tracking) moves focus to it.
	// Clicking the already-focused row shows the switch hint — same as Enter.
	function handleNodeClick(id: string): void {
		const idx = flat.findIndex((row) => row.node.id === id)
		if (idx < 0) return
		if (idx === focusedIdx && focusedNode) {
			showMsg('switch: use /cognitree-branch <name>')
			return
		}
		setIsFocused(true)
		setFocusedIdx(idx)
	}

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
				borderColor="subtle"
				borderRight
				paddingX={1}
				height={height ?? '100%'}
				overflow="hidden"
			>
				<Text color="claude" bold>
					◈ PROJECT TREE
				</Text>
				<Box marginTop={1}>
					<Text color="subtle" wrap="truncate">
						No .cognitree/ found.
					</Text>
				</Box>
				<Box marginTop={1}>
					<Text color="suggestion">/cognitree-init</Text>
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
				borderColor="subtle"
				borderRight
				paddingX={1}
				height={height ?? '100%'}
				overflow="hidden"
			>
				<Text color="claude" bold>
					◈ PROJECT TREE
				</Text>
				<Box marginTop={1}>
					<Text color="subtle">loading…</Text>
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
			borderColor={isFocused ? 'claude' : 'subtle'}
			height={height ?? '100%'}
			overflow="hidden"
		>
			{/* ── Header ── */}
			<Box paddingX={1} paddingY={0} flexDirection="row" justifyContent="space-between">
				<Text color="claude" bold>
					◈ PROJECT TREE
				</Text>
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
					<Text color="subtle">↑ {scrollTop} more</Text>
				</Box>
			)}

			{/* ── Tree nodes — WINDOWED: only visibleRows nodes are in the Yoga tree ── */}
			<Box flexDirection="column" flexShrink={0} paddingX={1}>
				{visibleFlat.map((row) => {
					// Shallow node (children stripped): the flat list controls
					// ordering, and real prefixFlags/isLast restore └─/├─/│ glyphs.
					const shallowNode = { ...row.node, children: [] }
					return (
						<TreeNode
							key={row.node.id}
							node={shallowNode}
							prefixFlags={row.prefixFlags}
							isLast={row.isLast}
							panelWidth={PANEL_WIDTH}
							focusedId={isFocused ? (focusedNode?.id ?? null) : null}
							onSelect={handleNodeClick}
						/>
					)
				})}
			</Box>

			{/* ── Scroll indicator (bottom) ── */}
			{scrollIndicatorBot && (
				<Box paddingX={1} flexShrink={0}>
					<Text color="subtle">↓ {flat.length - scrollTop - visibleRows} more</Text>
				</Box>
			)}

			{/* ── Status message ── */}
			{message && (
				<Box paddingX={1} flexShrink={0}>
					<Text color="suggestion" wrap="truncate">
						{message}
					</Text>
				</Box>
			)}

			{/* ── Divider ── */}
			<Box paddingX={1} flexShrink={0}>
				<Text color="subtle">{'─'.repeat(PANEL_WIDTH - 4)}</Text>
			</Box>

			{/* ── Quick Actions ── */}
			<Box flexDirection="column" paddingX={1} flexShrink={0}>
				<Text color="subtle" bold>
					KEYS─────────────────────────
				</Text>
				<Box flexDirection="row">
					<Text color="subtle">[^T] Focus </Text>
					<Text color="subtle">[↑↓] Nav </Text>
					<Text color="subtle">[Esc] Exit</Text>
				</Box>
				<Box flexDirection="row">
					<Text color="subtle">[N] New cp </Text>
					<Text color="subtle">[S] Save </Text>
					<Text color="claude">{treeState.totalCheckpoints} cp</Text>
				</Box>
			</Box>
		</Box>
	)
}
