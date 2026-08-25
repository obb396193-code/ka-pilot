import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const matrixPath = "docs/frontend/takeover/functional-capability-matrix.md"
const schemaPath = "docs/frontend/takeover/functional-capability-matrix.schema.json"
const startMarker = "<!-- capability-matrix:start -->"
const endMarker = "<!-- capability-matrix:end -->"

const enumValues = (schema, property) => new Set(schema.items.properties[property].enum)

const readRecords = async () => {
  const markdown = await readFile(matrixPath, "utf8")
  const start = markdown.indexOf(startMarker)
  const end = markdown.indexOf(endMarker)

  assert.notEqual(start, -1, `${matrixPath} is missing ${startMarker}`)
  assert.notEqual(end, -1, `${matrixPath} is missing ${endMarker}`)

  const fenced = markdown.slice(start + startMarker.length, end).trim()
  assert.match(fenced, /^```json\s*[\s\S]*\s*```$/, "matrix payload must be a fenced JSON block")
  return JSON.parse(fenced.replace(/^```json\s*/, "").replace(/\s*```$/, ""))
}

test("capability matrix follows its schema and admission rules", async () => {
  const records = await readRecords()
  const schema = JSON.parse(await readFile(schemaPath, "utf8"))
  const required = schema.items.required
  const allowedPrd = enumValues(schema, "prd_status")
  const allowedContract = enumValues(schema, "contract_status")
  const allowedImplementation = enumValues(schema, "implementation_status")
  const ids = new Set()

  assert.ok(Array.isArray(records) && records.length > 0, "matrix must contain records")

  for (const record of records) {
    for (const field of required) assert.ok(Object.hasOwn(record, field), `${record.capability_id ?? "unknown"} missing ${field}`)
    assert.ok(!ids.has(record.capability_id), `duplicate capability_id: ${record.capability_id}`)
    ids.add(record.capability_id)
    assert.ok(allowedPrd.has(record.prd_status), `${record.capability_id} has invalid prd_status`)
    assert.ok(allowedContract.has(record.contract_status), `${record.capability_id} has invalid contract_status`)
    assert.ok(allowedImplementation.has(record.implementation_status), `${record.capability_id} has invalid implementation_status`)
    assert.ok(record.root_evidence.length > 0, `${record.capability_id} needs root_evidence`)
    assert.ok(Array.isArray(record.states) && record.states.length > 0, `${record.capability_id} needs states`)
    assert.ok(Array.isArray(record.old_non_visual_code), `${record.capability_id} old_non_visual_code must be an array`)
    assert.doesNotMatch(record.visual_source, /FrontendAgent|F-001|旧前端/, `${record.capability_id} points at a forbidden visual source`)

    if (record.implementation_status === "approved") {
      assert.ok(record.boss_visual_signoff, `${record.capability_id} lacks boss visual signoff`)
      assert.ok(record.root_function_signoff, `${record.capability_id} lacks root function signoff`)
    }

    if (record.contract_status === "missing") {
      assert.notEqual(record.implementation_status, "approved", `${record.capability_id} cannot be approved without a contract`)
    }
  }

  const session = records.find((record) => record.capability_id === "auth.session")
  assert.ok(session, "AUTH-001 session capability is missing")
  assert.deepEqual(session.states, ["loading", "authenticated", "unauthenticated", "forbidden"])
  assert.equal(session.contract_status, "blocked")

  const mediaWrite = records.find((record) => record.capability_id === "media.write")
  assert.ok(mediaWrite, "media.write boundary is missing")
  assert.deepEqual(mediaWrite.states, ["disabled"])
  assert.equal(mediaWrite.implementation_status, "not-started")
})
