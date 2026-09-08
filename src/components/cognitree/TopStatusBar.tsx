/**
 * TopStatusBar
 *
 * Single-line status bar at the top of the main panel showing:
 *   Session: <model>  │  <tokens> tokens  │  Active: <branch>  │  <time>  ● Online
 *
 * Reads from AppState (model, tokens) and useCognitreeTree (active branch).
 */

import type React from 'react'
import { useEffect, useState } from 'react'
import { getTotalInputTokens, getTotalOutputTokens } from '../../cost-tracker.js'
import { useCognitreeTree } from '../../hooks/useCognitreeTree.js'
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js'
import { Box, Text } from '../../ink.js'

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

function formatTokens(n: number): string {
	if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
	return String(n)
}

function formatTime(date: Date): string {
	return date.toLocaleTimeString('en-US', {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	})
}

// ═══════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════

export function TopStatusBar(): React.ReactNode {
	const model = useMainLoopModel()
	const { activeBranch } = useCognitreeTree()
	const [now, setNow] = useState(() => new Date())

	// Update clock every second
	useEffect(() => {
		const timer = setInterval(() => setNow(new Date()), 1000)
		return () => clearInterval(timer)
	}, [])

	const totalTokens = getTotalInputTokens() + getTotalOutputTokens()
	const tokensStr = formatTokens(totalTokens)
	const timeStr = formatTime(now)
	const activeLabel = activeBranch ?? 'main'

	// Short model display name
	const modelShort = model.length > 20 ? `${model.slice(0, 18)}…` : model

	return (
		<Box
			flexDirection="row"
			paddingX={1}
			paddingY={0}
			borderStyle="single"
			borderBottom
			borderColor="subtle"
		>
			{/* Model */}
			<Text color="inactive">Model: </Text>
			<Text color="claude" bold>
				{modelShort}
			</Text>

			{/* Divider */}
			<Text color="subtle"> │ </Text>

			{/* Tokens */}
			<Text color="inactive">{tokensStr} tokens</Text>

			{/* Divider */}
			<Text color="subtle"> │ </Text>

			{/* Active node */}
			<Text color="inactive">Active: </Text>
			<Text color="claude" bold>
				{activeLabel}
			</Text>

			{/* Push right */}
			<Box flexGrow={1} />

			{/* Clock */}
			<Text color="inactive">⏰ {timeStr} </Text>
		</Box>
	)
}
