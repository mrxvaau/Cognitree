/**
 * StatsRow
 *
 * A row of 5 stat cards below the TopStatusBar:
 *   Model | Working Dir | Active Node | Tokens Used | Uptime
 *
 * Styled to match the mockup — each card is a bordered box with
 * a label header and a value underneath.
 */

import type React from 'react'
import { useEffect, useState } from 'react'
import { getTotalInputTokens, getTotalOutputTokens } from '../../cost-tracker.js'
import { useCognitreeTree } from '../../hooks/useCognitreeTree.js'
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js'
import { Box, Text } from '../../ink.js'
import { getCwd } from '../../utils/cwd.js'
import ThemedBox from '../design-system/ThemedBox.js'

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

function formatTokens(n: number): string {
	if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
	return String(n)
}

function formatUptime(startMs: number): string {
	const elapsed = Math.floor((Date.now() - startMs) / 1000)
	const h = Math.floor(elapsed / 3600)
		.toString()
		.padStart(2, '0')
	const m = Math.floor((elapsed % 3600) / 60)
		.toString()
		.padStart(2, '0')
	const s = (elapsed % 60).toString().padStart(2, '0')
	return `${h}:${m}:${s}`
}

function truncatePath(p: string, maxLen: number): string {
	if (p.length <= maxLen) return p
	const parts = p.split(/[\\/]/)
	if (parts.length <= 2) return `…${p.slice(-(maxLen - 1))}`
	return `…\\${parts.slice(-2).join('\\')}`
}

// ═══════════════════════════════════════════════════════════════════════
// STAT CARD
// ═══════════════════════════════════════════════════════════════════════

interface CardProps {
	icon: string
	label: string
	value: string
	valueColor?: 'claude' | 'text' | 'warning' | 'inactive' | 'success'
	flexGrow?: number
}

function StatCard({
	icon,
	label,
	value,
	valueColor = 'text',
	flexGrow = 1,
}: CardProps): React.ReactNode {
	return (
		<ThemedBox
			flexDirection="column"
			borderStyle="single"
			borderColor="subtle"
			paddingX={1}
			paddingY={0}
			flexGrow={flexGrow}
			marginRight={1}
		>
			{/* Label row */}
			<Box flexDirection="row">
				<Text color="suggestion">{icon} </Text>
				<Text color="inactive">{label}</Text>
			</Box>
			{/* Value row */}
			<Text color={valueColor} bold wrap="truncate">
				{value}
			</Text>
		</ThemedBox>
	)
}

// ═══════════════════════════════════════════════════════════════════════
// STATS ROW
// ═══════════════════════════════════════════════════════════════════════

const SESSION_START = Date.now()

export function StatsRow(): React.ReactNode {
	const model = useMainLoopModel()
	const { activeBranch, activeCheckpointId } = useCognitreeTree()
	const [, setTick] = useState(0)

	// Re-render every second for uptime counter
	useEffect(() => {
		const t = setInterval(() => setTick((n) => n + 1), 1000)
		return () => clearInterval(t)
	}, [])

	const cwd = getCwd()
	const totalTokens = getTotalInputTokens() + getTotalOutputTokens()
	const tokensStr = formatTokens(totalTokens)
	const uptime = formatUptime(SESSION_START)
	const activeLabel = activeCheckpointId ?? activeBranch ?? 'main'
	const dirShort = truncatePath(cwd, 16)
	const modelShort = model.length > 16 ? `${model.slice(0, 14)}…` : model

	return (
		<Box flexDirection="row" paddingX={1} paddingY={0}>
			<StatCard icon="🤖" label="Model" value={modelShort} valueColor="claude" />
			<StatCard icon="📁" label="Working Dir" value={dirShort} valueColor="text" />
			<StatCard icon="◈" label="Active Node" value={activeLabel} valueColor="claude" />
			<StatCard icon="📊" label="Tokens Used" value={tokensStr} valueColor="text" />
			{/* Last card — no marginRight */}
			<ThemedBox
				flexDirection="column"
				borderStyle="single"
				borderColor="subtle"
				paddingX={1}
				paddingY={0}
				flexGrow={1}
			>
				<Box flexDirection="row">
					<Text color="suggestion">⏱ </Text>
					<Text color="inactive">Uptime</Text>
				</Box>
				<Text color="text" bold>
					{uptime}
				</Text>
			</ThemedBox>
		</Box>
	)
}
