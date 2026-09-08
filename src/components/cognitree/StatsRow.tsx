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
	// Minute resolution: the row re-renders every 30s, not every second
	// (A12 chrome-flicker fix), so seconds would visibly skip.
	const elapsed = Math.floor((Date.now() - startMs) / 60_000)
	const h = Math.floor(elapsed / 60).toString().padStart(2, '0')
	const m = (elapsed % 60).toString().padStart(2, '0')
	return `${h}:${m}`
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
	// 30s tick for the minute-resolution uptime (A12: no more 1s chrome repaints)
	const [, setTick] = useState(0)

	useEffect(() => {
		const t = setInterval(() => setTick((n) => n + 1), 30_000)
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
			<StatCard icon="◈" label="Model" value={modelShort} valueColor="claude" />
			<StatCard icon="▸" label="Working Dir" value={dirShort} valueColor="text" />
			<StatCard icon="●" label="Active Node" value={activeLabel} valueColor="claude" />
			<StatCard icon="∑" label="Tokens Used" value={tokensStr} valueColor="text" />
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
					<Text color="suggestion">◷ </Text>
					<Text color="inactive">Uptime</Text>
				</Box>
				<Text color="text" bold>
					{uptime}
				</Text>
			</ThemedBox>
		</Box>
	)
}
