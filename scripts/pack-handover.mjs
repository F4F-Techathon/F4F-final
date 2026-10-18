#!/usr/bin/env node
// Builds the handover zip (npm run handover): the project's source without node_modules, keys or local settings,
// a fresh build of the phone app (dist/) and the test console (director/dist/), the start scripts and the docs,
// all under one top-level folder. Unzipped, `start.sh` / `start.bat` runs it with nothing but Node.js.
//
//   node scripts/pack-handover.mjs [--name what-to-eat-YYYYMMDD] [--out release] [--skip-checks] [--keep-stage] [--with-backend]
//
// --with-backend also packs the multi-agent backend (../Backend) as backend/: its source, the 66 shops' data, the
// CosyVoice source and the Windows GPU launchers (docs/windows-gpu.md), never its Python environments, model weights,
// caches, session database or .env.local.
//
// The build runs in a clean copy in the system's temp folder (outside the project, so running dev servers do not
// see it change) that holds no .env file, so nothing secret can be built in. The copy is type-checked and tested (proving it is complete), then every file is searched for the values of
// this checkout's keys and for key-shaped strings; any hit stops the zip, naming the variable and file, never the value.

import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
const option = (flag, fallback) => { const index = args.indexOf(flag); return index >= 0 && args[index + 1] ? args[index + 1] : fallback }
const now = new Date()
const stamp = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((part) => String(part).padStart(2, '0')).join('')
const name = option('--name', `what-to-eat-${stamp}`)
const out = resolve(root, option('--out', 'release'))
const stageRoot = mkdtempSync(join(tmpdir(), 'what-to-eat-pack-')), stage = join(stageRoot, name)
const zipPath = join(out, `${name}.zip`)
const checks = !args.includes('--skip-checks')
const withBackend = args.includes('--with-backend')
const backendRoot = resolve(root, '..', 'Backend')

// Never packed: dependencies, version control, earlier builds, local keys and settings, certificates.
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'dist-ssr', 'release', 'coverage', 'logs', '.idea', '.vite', 'certs', '__screenshots__'])
const PRIVATE_FILE = /\.(pem|key|p12|pfx|crt|cer)$/i
function skipFile(rel, base) {
  if (base === '.DS_Store' || /\.(log|tsbuildinfo|local|suo|njsproj|sln|sw.)$/.test(base) || /\.timestamp-.*\.mjs$/.test(base)) return true
  if (base === '.env' || (base.startsWith('.env.') && base !== '.env.example')) return true
  if (PRIVATE_FILE.test(base)) return true
  return rel.startsWith(`.vscode${sep}`) && base !== 'extensions.json'
}

// Files under `folder`, relative to it; `builds` lets the two dist/ folders through (the stage's fresh build).
function collect(folder, { builds = false } = {}, at = folder, files = []) {
  for (const entry of readdirSync(at, { withFileTypes: true })) {
    const path = join(at, entry.name), rel = relative(folder, path)
    if (entry.isDirectory()) {
      const build = builds && (rel === 'dist' || rel === join('director', 'dist'))
      if (build || !SKIP_DIRS.has(entry.name)) collect(folder, { builds }, path, files)
    } else if (entry.isFile() && !skipFile(rel, entry.name)) files.push(rel)
  }
  return files
}

function step(title) { console.log(`\n▸ ${title}`) }
function fail(message) { console.error(`\n✖ ${message}`); process.exit(1) }

// Child processes never see VITE_ variables from this shell: those are what Vite builds into a page.
function run(command, commandArgs, cwd) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('VITE_')))
  const result = spawnSync(command, commandArgs, { cwd, env, stdio: 'inherit' })
  if (result.status !== 0) fail(`${[command, ...commandArgs].join(' ')} failed`)
}

function git(...gitArgs) {
  const result = spawnSync('git', gitArgs, { cwd: root, encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : null
}

// 1. A clean copy of the source.
step(`复制源码到 ${stage}`)
const sources = collect(root)
for (const rel of sources) {
  mkdirSync(dirname(join(stage, rel)), { recursive: true })
  cpSync(join(root, rel), join(stage, rel), { preserveTimestamps: true })
}
for (const script of ['start.sh', 'start.command']) if (existsSync(join(stage, script))) chmodSync(join(stage, script), 0o755)
console.log(`  ${sources.length} 个文件`)
if (!existsSync(join(root, 'node_modules'))) fail('node_modules 不存在：先运行 npm ci')
symlinkSync(join(root, 'node_modules'), join(stage, 'node_modules'), 'junction')

// 2. Build both pages in the copy; 3. prove the copy is whole.
const vite = join('node_modules', 'vite', 'bin', 'vite.js')
step('构建手机界面（dist/）与导演台（director/dist/）')
run(process.execPath, [vite, 'build', '--logLevel', 'warn'], stage)
run(process.execPath, [vite, 'build', '--config', join('director', 'vite.config.ts'), '--logLevel', 'warn'], stage)
let testSummary = 'skipped'
if (checks) {
  step('类型检查')
  run(process.execPath, [join('node_modules', 'vue-tsc', 'bin', 'vue-tsc.js'), '--build'], stage)
  step('测试')
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=spec', 'scripts/*.test.mjs'], { cwd: stage, encoding: 'utf8', env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('VITE_'))) })
  process.stdout.write(result.stdout.split('\n').filter((line) => /^ℹ (tests|pass|fail)/.test(line)).map((line) => `  ${line}\n`).join(''))
  if (result.status !== 0) { process.stdout.write(result.stdout.slice(-4000)); process.stderr.write(result.stderr.slice(-4000)); fail('测试没有全部通过') }
  testSummary = `passed (${/ℹ pass (\d+)/.exec(result.stdout)?.[1] ?? '?'} tests)`
}

// 3b. The multi-agent backend beside the app, without anything a machine builds or downloads for itself.
const BACKEND_SKIP_DIRS = new Set(['.venv', '__pycache__', 'cosyvoice-env', 'pretrained_models', 'cache', 'logs', 'tmp', 'node_modules', '.pytest_cache', '.git'])
function backendFiles(at = backendRoot, files = []) {
  for (const entry of readdirSync(at, { withFileTypes: true })) {
    const path = join(at, entry.name), rel = relative(backendRoot, path)
    if (entry.isDirectory()) { if (!BACKEND_SKIP_DIRS.has(entry.name)) backendFiles(path, files) }
    else if (entry.isFile() && !/\.(pyc|sqlite3|sqlite3-journal|log)$/.test(entry.name) && !['.DS_Store', 'voice-status.json'].includes(entry.name) && !skipFile(rel, entry.name)) files.push(rel)
  }
  return files
}
if (withBackend) {
  step('加入多智能体后端（backend/）')
  if (!existsSync(join(backendRoot, 'eat-what-backend', 'scripts', 'run_backend.py'))) fail(`找不到后端：${backendRoot}`)
  const files = backendFiles()
  for (const rel of files) {
    mkdirSync(dirname(join(stage, 'backend', rel)), { recursive: true })
    cpSync(join(backendRoot, rel), join(stage, 'backend', rel), { preserveTimestamps: true })
  }
  console.log(`  ${files.length} 个文件`)
}

// 4. Build information, written into the package.
const shops = JSON.parse(readFileSync(join(stage, 'src', 'data', 'dianping', 'shops.json'), 'utf8'))
const info = {
  name,
  builtAt: now.toISOString(),
  source: { branch: git('rev-parse', '--abbrev-ref', 'HEAD'), commit: git('rev-parse', '--short', 'HEAD'), uncommittedChanges: !!git('status', '--porcelain') },
  node: process.version,
  data: { dataset: 'dianping', source: shops.source, imported: shops.imported, shops: shops.shops.length },
  run: { app: '/', console: '/director/', defaultPort: 3000, node: '^22.18.0 || >=24.12.0' },
  checks: { typeCheck: checks ? 'passed' : 'skipped', tests: testSummary, secretScan: 'clean' },
  ...(withBackend ? { backend: { folder: 'backend/eat-what-backend', api: 'http://127.0.0.1:8771', voice: 'http://127.0.0.1:8772 (CosyVoice 3, NVIDIA GPU)', shopsData: 'data/full (the same shops as the app)', tests: 'skipped', windows: 'start-windows-gpu.cmd, docs/windows-gpu.md' } } : {}),
}
writeFileSync(join(stage, 'BUILD-INFO.json'), JSON.stringify(info, null, 2) + '\n')

// 5. Nothing secret inside: this checkout's own key values, and anything shaped like a key.
step('检查密钥')
const files = collect(stage, { builds: true })
const secrets = []
for (const base of readdirSync(root)) {
  if (base !== '.env' && !base.startsWith('.env.')) continue
  if (base === '.env.example') continue
  for (const line of readFileSync(join(root, base), 'utf8').split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    const value = match?.[2].trim().replace(/^(['"])(.*)\1$/, '$2')
    if (match && value && value.length >= 8 && /KEY|SECRET|TOKEN|PASSWORD|CODE/i.test(match[1])) secrets.push({ variable: match[1], file: base, value })
  }
}
const SHAPES = [['Google API key', /AIza[0-9A-Za-z_-]{35}/], ['sk- key', /\bsk-[A-Za-z0-9_-]{20,}/], ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/]]
const hits = []
for (const rel of files) {
  const text = readFileSync(join(stage, rel)).toString('latin1')
  for (const secret of secrets) if (text.includes(Buffer.from(secret.value, 'utf8').toString('latin1'))) hits.push(`${rel}: ${secret.file} 里 ${secret.variable} 的值`)
  for (const [label, shape] of SHAPES) if (shape.test(text)) hits.push(`${rel}: 疑似 ${label}`)
}
if (hits.length) fail(`包里发现密钥，已停止：\n  ${hits.join('\n  ')}`)
console.log(`  ${files.length} 个文件，对照了 ${secrets.length} 个本机密钥值，未发现`)

// 6. Zip what was checked, under one folder.
step(`打包 ${relative(root, zipPath)}`)
mkdirSync(out, { recursive: true })
rmSync(zipPath, { force: true })
const list = files.map((rel) => join(name, rel).split(sep).join('/')).join('\n') + '\n'
// Python's zipfile marks non-ASCII names as UTF-8 (general purpose bit 11), so Windows Explorer shows 商户基础信息.csv
// and the backend finds its data; Info-ZIP's zip on macOS leaves the flag off and the names come out garbled there.
// Timestamps and the executable bit of start.sh / start.command are kept.
const PY_ZIP = [
  'import sys, zipfile, os',
  'out, base = sys.argv[1], sys.argv[2]',
  'with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:',
  '    for name in sys.stdin.read().splitlines():',
  '        if name: z.write(os.path.join(base, name), name)',
].join('\n')
let zip = spawnSync('python3', ['-I', '-c', PY_ZIP, zipPath, stageRoot], { input: list, stdio: ['pipe', 'inherit', 'inherit'] })
if (zip.error || zip.status !== 0) {
  console.warn('  没有可用的 python3，改用 zip 命令：压缩包里的中文文件名在 Windows 上可能显示为乱码')
  rmSync(zipPath, { force: true })
  zip = spawnSync('zip', ['-X', '-q', '-9', zipPath, '-@'], { cwd: stageRoot, input: list, stdio: ['pipe', 'inherit', 'inherit'] })
}
if (zip.error || zip.status !== 0) fail('zip 失败（需要 python3 或 zip 命令：macOS / Linux 自带，Windows 可在 WSL 或 Git Bash 里运行）')
const test = spawnSync('unzip', ['-tq', zipPath], { encoding: 'utf8' })
if (test.status !== 0) fail(`压缩包校验失败：${test.stdout}${test.stderr}`)
if (args.includes('--keep-stage')) console.log(`  副本保留在 ${stage}`)
else rmSync(stageRoot, { recursive: true, force: true })
console.log(`\n✔ ${zipPath}\n  ${files.length} 个文件，${(statSync(zipPath).size / 1024 / 1024).toFixed(1)} MB；解压后运行 start.sh（macOS / Linux）或 start.bat（Windows）`)
