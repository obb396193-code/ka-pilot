import assert from "node:assert/strict"
import { access, readFile, readdir } from "node:fs/promises"
import path from "node:path"
import test from "node:test"

const manifestPath = "docs/frontend/takeover/source-import-manifest.json"
const schemaPath = "docs/frontend/takeover/source-import-manifest.schema.json"
const markerPattern = /SOURCE_IMPORT_ID:\s*([^\s*]+)/g

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(target)))
    else if (/\.(css|js|jsx|ts|tsx)$/.test(entry.name)) files.push(target)
  }
  return files
}

test("official and ContentRadar source copies are complete and traceable", async () => {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
  const schema = JSON.parse(await readFile(schemaPath, "utf8"))
  const required = schema.properties.imports.items.required
  const ids = new Set()

  assert.equal(manifest.version, 1)
  assert.ok(Array.isArray(manifest.imports))

  for (const item of manifest.imports) {
    for (const field of required) assert.ok(Object.hasOwn(item, field), `${item.id ?? "unknown"} missing ${field}`)
    assert.ok(!ids.has(item.id), `duplicate source import: ${item.id}`)
    ids.add(item.id)
    assert.match(item.source_commit, /^[0-9a-f]{40}$/i, `${item.id} needs a full source commit SHA`)
    assert.ok(item.source_files.length > 0, `${item.id} needs source_files`)
    assert.ok(item.destination_files.length > 0, `${item.id} needs destination_files`)
    assert.ok(item.modifications.length > 0, `${item.id} needs an explicit modifications list, including "none" when unchanged`)
    assert.doesNotMatch(JSON.stringify(item), /参考截图|看图仿写|screenshot only/i, `${item.id} cannot use a screenshot as source evidence`)

    if (item.source_kind === "contentradar") {
      assert.ok(path.isAbsolute(item.source_repo), `${item.id} must record the absolute ContentRadar repository path`)
      assert.ok(item.license_or_internal_authority.length > 0, `${item.id} needs internal reuse authority`)
    }

    for (const destination of item.destination_files) {
      await access(destination)
      const destinationSource = await readFile(destination, "utf8")
      assert.match(destinationSource, new RegExp(`SOURCE_IMPORT_ID:\\s*${item.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`))
    }
  }

  const markedIds = new Set()
  for (const file of await walk("apps/web")) {
    const source = await readFile(file, "utf8")
    for (const match of source.matchAll(markerPattern)) markedIds.add(match[1])
  }

  for (const markedId of markedIds) assert.ok(ids.has(markedId), `${markedId} appears in apps/web but is missing from the manifest`)
})
