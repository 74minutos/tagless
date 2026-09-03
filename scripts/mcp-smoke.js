/**
 * End-to-end smoke of the MCP server over real stdio: list tools, then
 * plan → simulate → apply against examples/demo.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const client = new Client({ name: 'smoke', version: '0.0.1' })
await client.connect(
  new StdioClientTransport({ command: process.execPath, args: ['packages/mcp/src/index.js'] })
)

const text = (r) => JSON.parse(r.content[0].text)

const tools = await client.listTools()
console.log('tools:', tools.tools.map((t) => t.name).join(', '))

const plan = text(await client.callTool({ name: 'plan', arguments: { config: 'examples/demo/tracking.config.yaml' } }))
console.log('plan:', plan.plan_id, '| gzip', plan.size.gzip, 'B | within budget:', plan.size.within_budget)

const sim = text(
  await client.callTool({
    name: 'simulate',
    arguments: {
      config: 'examples/demo/tracking.config.yaml',
      events: [{ name: 'purchase', data: { value: 49.9, currency: 'EUR' } }],
      consent: { analytics: true, marketing: true },
    },
  })
)
console.log('simulate:', sim.requests.length, 'requests →', [...new Set(sim.requests.map((r) => r.url))].join(' | '))

const stale = await client.callTool({ name: 'apply', arguments: { config: 'examples/demo/tracking.config.yaml', plan_id: 'deadbeef0000' } })
console.log('stale plan rejected:', stale.isError === true)

const applied = text(await client.callTool({ name: 'apply', arguments: { config: 'examples/demo/tracking.config.yaml', plan_id: plan.plan_id } }))
console.log('apply:', applied.outfile, '| gzip', applied.size.gzip, 'B')

await client.close()
