import { cognitreeEventBus } from '../events/eventBus.js'
import { collectFile } from '../events/collectors/fileCollector.js'
import { captureGoal } from '../events/collectors/goalCollector.js'
import { collectTodo } from '../events/collectors/todoCollector.js'
import { collectMistake } from '../events/collectors/mistakeCollector.js'
import { collectDecisions } from '../events/collectors/decisionCollector.js'

export class MemoryManager {
  private cognitreeDir: string
  private activeCheckpointId: string

  constructor(cognitreeDir: string, activeCheckpointId: string) {
    this.cognitreeDir = cognitreeDir
    this.activeCheckpointId = activeCheckpointId
  }

  init() {
    cognitreeEventBus.on('first_prompt', (event) => {
      captureGoal(event.content, this.cognitreeDir, this.activeCheckpointId)
    })
    
    cognitreeEventBus.on('file_changed', (event) => {
      collectFile(event.path, this.cognitreeDir, this.activeCheckpointId, event.tool)
    })
    
    cognitreeEventBus.on('todo_completed', (event) => {
      collectTodo(event.text, this.cognitreeDir, this.activeCheckpointId)
    })
    
    cognitreeEventBus.on('stuck_detected', (event) => {
      collectMistake(event.pattern, event.evidence, event.hint, this.cognitreeDir, this.activeCheckpointId)
    })
    
    cognitreeEventBus.on('decision_made', (event) => {
      collectDecisions(event.text, this.cognitreeDir, this.activeCheckpointId)
    })
  }

  destroy() {
    cognitreeEventBus.removeAllListeners()
  }
}
