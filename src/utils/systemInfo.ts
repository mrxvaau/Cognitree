import * as os from 'os'
import { execSync } from 'child_process'

interface SystemInfo {
  cpu: string
  cpuCores: number
  gpu: string
  storageTotal: number
  storageFree: number
  ip: string
}

let _cached: SystemInfo | null = null

export function getSystemInfoSync(): SystemInfo {
  if (_cached) return _cached

  const cpus = os.cpus()
  const cpu = cpus[0]?.model?.replace(/\(R\)|\(TM\)/g, '').replace(/\s+/g, ' ').trim() || 'Unknown'
  const cpuCores = cpus.length

  let gpu = 'N/A'
  try {
    if (process.platform === 'win32') {
      const out = execSync('wmic path win32_VideoController get name', { encoding: 'utf8', timeout: 3000 })
      gpu = out.split('\n').map(l => l.trim()).filter(l => l && l !== 'Name')[0] || 'N/A'
    } else if (process.platform === 'darwin') {
      const out = execSync('system_profiler SPDisplaysDataType 2>/dev/null | grep "Chipset Model"', { encoding: 'utf8', timeout: 3000 })
      gpu = out.split(': ')[1]?.trim() || 'N/A'
    } else {
      const out = execSync('lspci 2>/dev/null | grep -i vga', { encoding: 'utf8', timeout: 3000 })
      gpu = out.split(': ').slice(1).join(': ').trim() || 'N/A'
    }
  } catch { gpu = 'N/A' }

  let storageTotal = 0, storageFree = 0
  try {
    if (process.platform === 'win32') {
      const out = execSync('wmic logicaldisk where "DeviceID=\'C:\'" get FreeSpace,Size /format:list', { encoding: 'utf8', timeout: 3000 })
      const free = out.match(/FreeSpace=(\d+)/)
      const total = out.match(/Size=(\d+)/)
      if (free) storageFree = Math.round(parseInt(free[1]!) / (1024 ** 3))
      if (total) storageTotal = Math.round(parseInt(total[1]!) / (1024 ** 3))
    }
  } catch {}

  let ip = '127.0.0.1'
  const nets = os.networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]!) {
      if (net.family === 'IPv4' && !net.internal) {
        ip = net.address
        break
      }
    }
    if (ip !== '127.0.0.1') break
  }

  _cached = { cpu, cpuCores, gpu, storageTotal, storageFree, ip }
  return _cached
}
