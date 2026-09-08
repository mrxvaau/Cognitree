/**
 * TreeNode
 *
 * Renders a single node in the left-panel project tree.
 * Handles indentation, branch connectors, status icons, and label.
 */

import type React from 'react'
import type { TreeNodeData } from '../../hooks/useCognitreeTree.js'
import { Box, Text } from '../../ink.js'

// ═══════════════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════════════

const ICON_ACTIVE = '◈' // active checkpoint — cyan
const ICON_BRANCH = '◆' // branch base — amber or suggestion
const ICON_NODE = '○' // regular checkpoint — dim
const ICON_ROOT = '●' // root node — text color
const ICON_FALLBACK = '◇' // fallback branch — amber

const CONNECTOR_LAST = '└─'
const CONNECTOR_MID = '├─'
const CONNECTOR_VERT = '│ ' // 2 chars — was '│  ' (3), saves 1 char per ancestor level
const CONNECTOR_EMPTY = '  ' // 2 chars — was '   ' (3)

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

interface Props {
	node: TreeNodeData
	/** Array of booleans: for each ancestor level, is there a next sibling? */
	prefixFlags: boolean[]
	isLast: boolean
	panelWidth: number
	focusedId: string | null
	onSelect?: (id: string) => void
}

// ═══════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════

function nodeIcon(node: TreeNodeData): { icon: string; iconColor: string } {
	if (node.isActive) return { icon: ICON_ACTIVE, iconColor: 'claude' }
	if (node.isFallback) return { icon: ICON_FALLBACK, iconColor: 'warning' }
	if (node.parentId === null) return { icon: ICON_ROOT, iconColor: 'text' }
	if (node.isBase) {
		return { icon: ICON_BRANCH, iconColor: node.isFallback ? 'warning' : 'suggestion' }
	}
	return { icon: ICON_NODE, iconColor: 'inactive' }
}

function indentPrefix(prefixFlags: boolean[]): string {
	let prefix = ''
	for (const flag of prefixFlags) {
		prefix += flag ? CONNECTOR_VERT : CONNECTOR_EMPTY
	}
	return prefix
}

function labelColor(node: TreeNodeData, isActive: boolean, isFocused: boolean): string {
	if (isActive) return 'claude'
	if (node.isFallback) return 'warning'
	// 'text' — NOT 'inverseText': inverseText matches the background in both
	// stock themes, making the focused row invisible.
	if (isFocused) return 'text'
	return 'subtle'
}

export function TreeNode({
	node,
	prefixFlags,
	isLast,
	panelWidth,
	focusedId,
	onSelect,
}: Props): React.ReactNode {
	// Colors
	const isActive = node.isActive
	const isFocused = node.id === focusedId

	const { icon, iconColor } = nodeIcon(node)
	const prefix = indentPrefix(prefixFlags)

	// Connector for this node
	const connector = prefixFlags.length === 0 ? '' : isLast ? CONNECTOR_LAST : CONNECTOR_MID

	// Label truncation — room for: prefix(depth×2) + connector(2) + icon+space(2)
	// No cursor column: panel is never interactively focused in this release
	const usedChars = prefixFlags.length * 2 + connector.length + 2
	const maxLabel = Math.max(4, panelWidth - usedChars - 2)
	const rawLabel = node.label
	const label = rawLabel.length > maxLabel ? `${rawLabel.slice(0, maxLabel - 1)}…` : rawLabel

	// Confidence badge for low confidence (<0.6)
	const showLowConf = node.confidence !== null && node.confidence < 0.6
	const confBadge = showLowConf ? ` ⚠ ${Math.round((node.confidence ?? 1) * 100)}%` : ''

	return (
		<Box flexDirection="column">
			{/* This node's row — clickable when mouse tracking is active (fullscreen
			    alt-screen); renders identically otherwise. */}
			<Box flexDirection="row" onClick={onSelect ? () => onSelect(node.id) : undefined}>
				{/* Prefix indent */}
				<Text color="subtle">{prefix}</Text>

				{/* Branch connector */}
				{connector.length > 0 && <Text color="subtle">{connector}</Text>}

				{/* Icon */}
				<Text color={iconColor}>{icon} </Text>

				{/* Label */}
				<Text color={labelColor(node, isActive, isFocused)} bold={isActive || isFocused}>
					{label}
				</Text>

				{/* Low confidence badge */}
				{showLowConf && <Text color="warning">{confBadge}</Text>}
			</Box>

			{/* Children */}
			{node.children.map((child, idx) => (
				<TreeNode
					key={child.id}
					node={child}
					prefixFlags={[
						...prefixFlags,
						!isLast, // parent still has siblings? keep vertical bar
					]}
					isLast={idx === node.children.length - 1}
					panelWidth={panelWidth}
					focusedId={focusedId}
					onSelect={onSelect}
				/>
			))}
		</Box>
	)
}
