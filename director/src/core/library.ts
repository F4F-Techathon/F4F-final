import { reactive } from 'vue'
import { fromStudioAgent, type LibraryAgent } from './studioAgents.ts'

// The agents the asset library keeps besides the phone's own hosts: agent-studio's brand agents shipped with
// the console, agent-studio files imported later, and agents made here with 「+」. The browser keeps the last two.
const CREATED_KEY = 'director-agents-v1'
const IMPORTED_KEY = 'director-imports-v1'
const MAX = 24

const files = import.meta.glob('../data/studio-agents/*.json', { eager: true, import: 'default' })
export const STUDIO_AGENTS: LibraryAgent[] = Object.values(files).map((raw) => fromStudioAgent(raw)).sort((a, b) => a.created.localeCompare(b.created))

function load(key: string): LibraryAgent[] {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(saved) ? saved.filter((agent) => agent && typeof agent.id === 'string' && agent.rig) : []
  } catch { return [] }
}
function save(key: string, agents: LibraryAgent[]) {
  try { localStorage.setItem(key, JSON.stringify(agents)) } catch { /* The library then lasts until a reload. */ }
}

export const library = reactive({ created: load(CREATED_KEY), imported: load(IMPORTED_KEY) })

// The newest version of an agent replaces the older one; the list keeps the most recent MAX.
function put(list: LibraryAgent[], agent: LibraryAgent) {
  const index = list.findIndex((item) => item.id === agent.id)
  if (index >= 0) list.splice(index, 1)
  list.unshift(agent)
  if (list.length > MAX) list.length = MAX
}

export function addCreated(agent: LibraryAgent) {
  put(library.created, agent)
  save(CREATED_KEY, library.created)
}

export function removeAgent(id: string) {
  library.created = library.created.filter((agent) => agent.id !== id)
  library.imported = library.imported.filter((agent) => agent.id !== id)
  save(CREATED_KEY, library.created)
  save(IMPORTED_KEY, library.imported)
}

/** An agent-studio contract (agents/<id>.json) as text; throws with the reason when it is not one. */
export function importStudioText(text: string): LibraryAgent {
  const agent = fromStudioAgent(JSON.parse(text))
  put(library.imported, agent)
  save(IMPORTED_KEY, library.imported)
  return agent
}
