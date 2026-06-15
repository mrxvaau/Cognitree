/**
 * COGNITREE — Memory Updater
 *
 * Port of cognitree_engine/src/memory.js
 *
 * Writes delta data to the correct layer file of the active checkpoint.
 * Validates data structure against the schema before writing.
 *
 * Layer behaviors:
 *   - goal, next:                   value replacement
 *   - progress, changed, decisions: append-only (added array)
 *   - mistakes, blockers, warnings: hybrid (added + updated arrays)
 *   - prompt_state:                 full replacement
 *
 * Confidence adjustments:
 *   - mistakes added:   -0.15 (critical), -0.08 (medium), -0.03 (low)
 *   - blockers added:   -0.10 per active blocker
 *   - blockers resolved: +0.05
 *   - clamped to [0.0, 1.0]
 */

import * as fs from 'fs'
import * as path from 'path'
import {
  VALID_LAYERS,
  VALUE_LAYERS,
  APPEND_LAYERS,
  HYBRID_LAYERS,
  VALID_SEVERITIES,
  type ValidLayer,
} from './types.js'
import type {
  ActiveJson,
  CheckpointMeta,
  HybridItem,
} from './types.js'

// ═══════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════

const ID_PREFIXES: Record<string, string> = {
  progress: 'p_',
  changed: 'ch_',
  decisions: 'd_',
  mistakes: 'm_',
  blockers: 'bl_',
  warnings: 'w_',
}

const MISTAKE_PENALTIES: Record<string, number> = {
  critical: 0.15,
  medium: 0.08,
  low: 0.03,
}

const BLOCKER_PENALTY = 0.10
const BLOCKER_RESOLVE_BONUS = 0.05

// ═══════════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════════

function validateLayerData(layer: ValidLayer, data: Record<string, unknown>): void {
  if (!data || typeof data !== 'object') {
    throw new Error(`Data for layer "${layer}" must be a non-null object.`)
  }

  if (VALUE_LAYERS.includes(layer)) {
    if (!('value' in data)) {
      throw new Error(`Layer "${layer}" requires a "value" field.`)
    }
    return
  }

  if (layer === 'prompt_state') {
    const required = ['active_file', 'active_function', 'current_approach', 'assumptions']
    for (const field of required) {
      if (!(field in data)) {
        throw new Error(`Layer "prompt_state" requires field "${field}".`)
      }
    }
    if (!Array.isArray(data.assumptions)) {
      throw new Error('prompt_state.assumptions must be an array.')
    }
    return
  }

  if (APPEND_LAYERS.includes(layer)) {
    if (!('added' in data) || !Array.isArray(data.added)) {
      throw new Error(`Layer "${layer}" requires an "added" array.`)
    }
    validateAppendItems(layer, data.added as Record<string, unknown>[])
    return
  }

  if (HYBRID_LAYERS.includes(layer)) {
    if ('added' in data && !Array.isArray(data.added)) {
      throw new Error(`Layer "${layer}": "added" must be an array.`)
    }
    if ('updated' in data && !Array.isArray(data.updated)) {
      throw new Error(`Layer "${layer}": "updated" must be an array.`)
    }
    if (data.added) {
      validateHybridItems(layer, data.added as Record<string, unknown>[])
    }
    if (data.updated) {
      validateStatusUpdates(data.updated as Record<string, unknown>[])
    }
    return
  }
}

function validateAppendItems(layer: string, items: Record<string, unknown>[]): void {
  for (const item of items) {
    if (layer === 'decisions') {
      if (!item.decision || typeof item.decision !== 'string') {
        throw new Error('Decisions require a "decision" string field.')
      }
    } else if (layer === 'changed') {
      if (!item.file || typeof item.file !== 'string') {
        throw new Error('Changed items require a "file" string field.')
      }
    } else {
      if (!item.text || typeof item.text !== 'string') {
        throw new Error(`${layer} items require a "text" string field.`)
      }
    }
  }
}

function validateHybridItems(layer: string, items: Record<string, unknown>[]): void {
  for (const item of items) {
    if (!item.text || typeof item.text !== 'string') {
      throw new Error(`${layer} items require a "text" string field.`)
    }
    if (item.severity && !VALID_SEVERITIES.includes(item.severity as typeof VALID_SEVERITIES[number])) {
      throw new Error(`Invalid severity "${item.severity}". Must be: ${VALID_SEVERITIES.join(', ')}`)
    }
  }
}

function validateStatusUpdates(updates: Record<string, unknown>[]): void {
  for (const update of updates) {
    if (!update.id || typeof update.id !== 'string') {
      throw new Error('Status updates require an "id" string.')
    }
    if (!update.status || !['active', 'resolved'].includes(update.status as string)) {
      throw new Error(`Invalid status "${update.status}". Must be: active, resolved`)
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// ID GENERATION
// ═══════════════════════════════════════════════════════════════════════

function generateItemId(layer: string, checkpointId: string, index: number): string {
  const prefix = ID_PREFIXES[layer] ?? 'x_'
  return `${prefix}${checkpointId}_${index}`
}

// ═══════════════════════════════════════════════════════════════════════
// CONFIDENCE ADJUSTMENT
// ═══════════════════════════════════════════════════════════════════════

function adjustConfidence(
  currentConfidence: number,
  layer: string,
  data: Record<string, unknown>,
): number {
  let conf = currentConfidence

  if (layer === 'mistakes' && Array.isArray(data.added)) {
    for (const item of data.added as HybridItem[]) {
      const severity = item.severity ?? 'low'
      conf -= MISTAKE_PENALTIES[severity] ?? MISTAKE_PENALTIES.low
    }
  }

  if (layer === 'blockers') {
    if (Array.isArray(data.added)) {
      conf -= data.added.length * BLOCKER_PENALTY
    }
    if (Array.isArray(data.updated)) {
      for (const update of data.updated as { status?: string }[]) {
        if (update.status === 'resolved') {
          conf += BLOCKER_RESOLVE_BONUS
        }
      }
    }
  }

  // Clamp to [0.0, 1.0]
  return Math.max(0, Math.min(1, conf))
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN UPDATE FUNCTION
// ═══════════════════════════════════════════════════════════════════════

export interface UpdateMemoryOptions {
  cognitreeDir: string
  layer: ValidLayer
  data: Record<string, unknown>
}

/**
 * Update a memory layer in the active checkpoint.
 *
 * @returns The updated confidence score, or null on failure.
 */
export function updateMemory(options: UpdateMemoryOptions): number | null {
  const { cognitreeDir, layer, data } = options

  try {
    // Validate layer name
    if (!VALID_LAYERS.includes(layer)) {
      throw new Error(`Invalid layer "${layer}". Valid: ${VALID_LAYERS.join(', ')}`)
    }

    // Validate data structure
    validateLayerData(layer, data)

    // Read active checkpoint
    const activePath = path.join(cognitreeDir, 'active.json')
    const activeRaw = fs.readFileSync(activePath, 'utf8')
    const active = JSON.parse(activeRaw) as ActiveJson
    if (!active.checkpoint_id) {
      throw new Error('No active checkpoint.')
    }

    const cpDir = path.join(cognitreeDir, 'checkpoints', active.checkpoint_id)
    if (!fs.existsSync(cpDir)) {
      throw new Error(`Checkpoint directory not found: ${cpDir}`)
    }

    // Read the current layer file
    const layerPath = path.join(cpDir, `${layer}.json`)
    let layerData: Record<string, unknown> = { delta: true }
    if (fs.existsSync(layerPath)) {
      layerData = JSON.parse(fs.readFileSync(layerPath, 'utf8')) as Record<string, unknown>
    }

    // Apply update based on layer type
    if (VALUE_LAYERS.includes(layer)) {
      // Value replacement
      layerData.value = data.value
    } else if (layer === 'prompt_state') {
      // Full replacement
      layerData = { delta: layerData.delta ?? true, ...data, checkpoint: active.checkpoint_id }
    } else if (APPEND_LAYERS.includes(layer)) {
      // Append items with generated IDs
      const existing = (layerData.added as unknown[]) ?? []
      const newItems = (data.added as Record<string, unknown>[]).map(
        (item: Record<string, unknown>, idx: number) => ({
          ...item,
          id: item.id ?? generateItemId(layer, active.checkpoint_id!, existing.length + idx),
          checkpoint: active.checkpoint_id,
        }),
      )
      layerData.added = [...existing, ...newItems]
    } else if (HYBRID_LAYERS.includes(layer)) {
      // Hybrid: add new items + apply status updates
      const existingAdded = (layerData.added as unknown[]) ?? []
      const existingUpdated = (layerData.updated as unknown[]) ?? []

      if (Array.isArray(data.added)) {
        const newItems = (data.added as Record<string, unknown>[]).map(
          (item: Record<string, unknown>, idx: number) => ({
            ...item,
            id: item.id ?? generateItemId(layer, active.checkpoint_id!, existingAdded.length + idx),
            status: item.status ?? 'active',
            checkpoint: active.checkpoint_id,
          }),
        )
        layerData.added = [...existingAdded, ...newItems]
      }

      if (Array.isArray(data.updated)) {
        layerData.updated = [...existingUpdated, ...data.updated]
      }
    }

    // Write updated layer
    fs.writeFileSync(layerPath, JSON.stringify(layerData, null, 2), 'utf8')

    // Adjust confidence
    const metaPath = path.join(cpDir, 'meta.json')
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as CheckpointMeta
    meta.confidence = adjustConfidence(meta.confidence, layer, data)
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8')

    return meta.confidence
  } catch {
    return null
  }
}
