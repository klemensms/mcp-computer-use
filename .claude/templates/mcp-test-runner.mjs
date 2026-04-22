/**
 * SOURCE OF TRUTH: ~/Repo/github-klemensms/mcp-consultant-tools/.claude/templates/mcp-test-runner.mjs
 * Keep in sync. Changes here MUST be mirrored there, or a deliberate divergence
 * recorded in both CLAUDE.md "Files that must stay in sync across repos" sections.
 *
 * Repo-specific note: in this single-package repo, use
 *   MCP_TEST_PACKAGE=./build/index.js
 * (rather than ./packages/<pkg>/build/index.js as in the monorepo).
 */

/**
 * MCP Local Test Runner
 *
 * Tests an MCP server by spawning it as a subprocess and calling tools directly.
 * Used by the mcp-local-tester agent to validate changes before user reconnection.
 *
 * Environment Variables:
 *   MCP_TEST_PACKAGE - Path to the MCP server entry point (required)
 *   MCP_TEST_TOOL    - Name of the tool to test (required)
 *   MCP_TEST_ARGS    - JSON string of tool arguments (optional, default: {})
 *   MCP_TEST_ENV_*   - Additional env vars to pass to the server (optional)
 *
 * Usage:
 *   MCP_TEST_PACKAGE="./packages/powerplatform-data/build/index.js" \
 *   MCP_TEST_TOOL="query-records" \
 *   MCP_TEST_ARGS='{"entityNamePlural":"accounts","filter":"name ne null","maxRecords":1}' \
 *   node .claude/templates/mcp-test-runner.mjs
 *
 * Exit Codes:
 *   0 - Test passed
 *   1 - Test failed (tool error, connection error, or validation failure)
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Configuration from environment
const PACKAGE_PATH = process.env.MCP_TEST_PACKAGE;
const TOOL_NAME = process.env.MCP_TEST_TOOL;
const TOOL_ARGS = process.env.MCP_TEST_ARGS ? JSON.parse(process.env.MCP_TEST_ARGS) : {};
const TIMEOUT_MS = parseInt(process.env.MCP_TEST_TIMEOUT || '30000', 10);

// Validation
if (!PACKAGE_PATH) {
  console.error('[ERROR] MCP_TEST_PACKAGE environment variable is required');
  console.error('[USAGE] MCP_TEST_PACKAGE="./packages/pkg/build/index.js" MCP_TEST_TOOL="tool-name" node mcp-test-runner.mjs');
  process.exit(1);
}

if (!TOOL_NAME) {
  console.error('[ERROR] MCP_TEST_TOOL environment variable is required');
  process.exit(1);
}

// Collect additional env vars to pass to server (MCP_TEST_ENV_*)
const serverEnv = { ...process.env };
delete serverEnv.MCP_TEST_PACKAGE;
delete serverEnv.MCP_TEST_TOOL;
delete serverEnv.MCP_TEST_ARGS;
delete serverEnv.MCP_TEST_TIMEOUT;

async function runTest() {
  console.error('═'.repeat(60));
  console.error('[MCP LOCAL TESTER]');
  console.error('═'.repeat(60));
  console.error(`Package:  ${PACKAGE_PATH}`);
  console.error(`Tool:     ${TOOL_NAME}`);
  console.error(`Args:     ${JSON.stringify(TOOL_ARGS)}`);
  console.error(`Timeout:  ${TIMEOUT_MS}ms`);
  console.error('─'.repeat(60));

  const transport = new StdioClientTransport({
    command: 'node',
    args: [PACKAGE_PATH],
    env: serverEnv
  });

  const client = new Client({
    name: 'mcp-local-tester',
    version: '1.0.0'
  }, {
    capabilities: {}
  });

  // Timeout handler
  const timeoutId = setTimeout(() => {
    console.error(`[FAIL] Test timed out after ${TIMEOUT_MS}ms`);
    process.exit(1);
  }, TIMEOUT_MS);

  let exitCode = 0;

  try {
    // Connect
    console.error('[STEP 1/4] Connecting to MCP server...');
    await client.connect(transport);
    console.error('[STEP 1/4] ✓ Connected');

    // List tools
    console.error('[STEP 2/4] Fetching tool list...');
    const tools = await client.listTools();
    console.error(`[STEP 2/4] ✓ Server has ${tools.tools.length} tools`);

    // Verify tool exists
    console.error(`[STEP 3/4] Verifying tool '${TOOL_NAME}' exists...`);
    const tool = tools.tools.find(t => t.name === TOOL_NAME);
    if (!tool) {
      console.error(`[STEP 3/4] ✗ Tool '${TOOL_NAME}' NOT FOUND`);
      console.error('[INFO] Available tools:');
      tools.tools.forEach(t => console.error(`  - ${t.name}`));
      process.exit(1);
    }
    console.error(`[STEP 3/4] ✓ Tool found: ${tool.description?.substring(0, 80) || '(no description)'}`);

    // Call tool
    console.error(`[STEP 4/4] Calling tool...`);
    const startTime = Date.now();
    const result = await client.callTool({
      name: TOOL_NAME,
      arguments: TOOL_ARGS
    });
    const duration = Date.now() - startTime;

    // Process result
    if (result.isError) {
      console.error(`[STEP 4/4] ✗ Tool returned error (${duration}ms)`);
      console.error('─'.repeat(60));
      console.error('[ERROR RESPONSE]');
      console.error(JSON.stringify(result, null, 2));
      exitCode = 1;
    } else {
      console.error(`[STEP 4/4] ✓ Tool call succeeded (${duration}ms)`);
      console.error('─'.repeat(60));
      console.error('[RESPONSE PREVIEW]');

      // Extract and display response
      const content = result.content?.[0]?.text || JSON.stringify(result.content, null, 2);
      const preview = content.length > 1000
        ? content.substring(0, 1000) + `\n... (${content.length - 1000} more chars)`
        : content;
      console.error(preview);
    }

  } catch (error) {
    console.error(`[FAIL] Test error: ${error.message}`);
    if (error.cause) {
      console.error(`[CAUSE] ${error.cause}`);
    }
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    exitCode = 1;
  } finally {
    clearTimeout(timeoutId);
    try {
      await client.close();
    } catch (e) {
      // Ignore close errors
    }
  }

  console.error('═'.repeat(60));
  if (exitCode === 0) {
    console.error('[RESULT] ✓ TEST PASSED');
  } else {
    console.error('[RESULT] ✗ TEST FAILED');
  }
  console.error('═'.repeat(60));

  process.exit(exitCode);
}

runTest();
