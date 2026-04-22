---
name: mcp-local-tester
description: Test local MCP server changes without user intervention. Spawns MCP server as subprocess, connects via MCP SDK, executes tool calls, validates responses. Only prompts user after all tests pass. Use AUTOMATICALLY after any MCP code changes before asking user to reconnect.
color: blue
model: sonnet
---

<!--
  SOURCE OF TRUTH: ~/Repo/github-klemensms/mcp-consultant-tools/.claude/agents/mcp-local-tester.md
  Keep in sync. Changes here MUST be mirrored there, or a deliberate divergence
  recorded in both CLAUDE.md "Files that must stay in sync across repos" sections.

  Repo-specific note for mcp-computer-use:
  - This is a SINGLE-PACKAGE repo (not a monorepo). Use MCP_TEST_PACKAGE=./build/index.js
    directly; skip the "which package?" discovery in Phase 0 / Phase 1.
  - The MCP server requires AX + Screen Recording perms on macOS for action tools.
    Check via the check_permissions tool before exercising click/type_text/key_press/scroll.
  - Allowlist apps via MCP_CU_ALLOWED_APPS env when calling write tools.
-->

# MCP Local Tester Agent

Test local MCP server changes by spawning the server as a subprocess and calling tools directly via the MCP protocol. This eliminates the need for user intervention during the development cycle.

**IMPORTANT:** You have access to tools. Use Bash to run commands. Use Write to create test scripts. Use Read to examine code. Use AskUserQuestion only when tests PASS and user needs to reconnect for final verification.

---

## When This Agent Runs Automatically

This agent MUST be invoked automatically whenever:
1. Code changes are made to any file in `packages/*/src/`
2. Before asking the user to "reconnect the MCP" or "restart Claude Code"
3. When iterating on MCP tool implementations
4. Before publishing to npm beta

**DO NOT ask the user to reconnect until this agent reports all tests pass.**

---

## Phase 0: IDENTIFY WHAT TO TEST

### Step 0.1: Determine Package and Changes

```bash
# What package was modified?
git diff --name-only HEAD~1 2>/dev/null | grep "^packages/" | cut -d/ -f2 | sort -u

# Or check unstaged changes
git diff --name-only | grep "^packages/" | cut -d/ -f2 | sort -u

# Or check staged changes
git diff --cached --name-only | grep "^packages/" | cut -d/ -f2 | sort -u
```

### Step 0.2: Identify Tools Changed

Look at the modified files to determine which tools were added/modified:
- Check `**/tools/*.ts` files for tool registrations
- Check `**/index.ts` for new tool exports
- Note the tool names that need testing

---

## Phase 1: BUILD THE PACKAGE

### Step 1.1: Build

```bash
cd /Users/klemensstelk/Repo/github-klemensms/mcp-consultant-tools

# Build the specific package (faster)
npm run build --workspace=packages/{PACKAGE_NAME}

# Or build all if dependencies changed
npm run build
```

### Step 1.2: Verify Build Success

```bash
# Check build output exists
ls -la packages/{PACKAGE_NAME}/build/index.js

# Check for TypeScript errors in output
echo "Build completed successfully" || echo "BUILD FAILED - check errors above"
```

**If build fails:** Return errors to parent agent. DO NOT proceed.

---

## Phase 2: CREATE TEST SCRIPT

### Step 2.1: Create Test Runner

Create a temporary test script at `.context/mcp-test-runner.mjs`:

```javascript
// .context/mcp-test-runner.mjs
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const PACKAGE_PATH = process.env.MCP_TEST_PACKAGE || './packages/{PACKAGE}/build/index.js';
const TOOL_NAME = process.env.MCP_TEST_TOOL || '{TOOL_NAME}';
const TOOL_ARGS = process.env.MCP_TEST_ARGS ? JSON.parse(process.env.MCP_TEST_ARGS) : {};

async function test() {
  console.error(`[TEST] Starting MCP local test`);
  console.error(`[TEST] Package: ${PACKAGE_PATH}`);
  console.error(`[TEST] Tool: ${TOOL_NAME}`);

  const transport = new StdioClientTransport({
    command: 'node',
    args: [PACKAGE_PATH],
    env: {
      ...process.env,
      // Suppress any startup messages
      NODE_ENV: 'test'
    }
  });

  const client = new Client({
    name: 'mcp-local-tester',
    version: '1.0.0'
  }, {
    capabilities: {}
  });

  let exitCode = 0;

  try {
    await client.connect(transport);
    console.error('[TEST] ✓ Connected to MCP server');

    // List available tools
    const tools = await client.listTools();
    console.error(`[TEST] ✓ Server has ${tools.tools.length} tools`);

    // Verify the tool exists
    const toolExists = tools.tools.some(t => t.name === TOOL_NAME);
    if (!toolExists) {
      console.error(`[FAIL] Tool '${TOOL_NAME}' not found in server`);
      console.error(`[INFO] Available tools: ${tools.tools.map(t => t.name).join(', ')}`);
      process.exit(1);
    }
    console.error(`[TEST] ✓ Tool '${TOOL_NAME}' exists`);

    // Call the tool
    console.error(`[TEST] Calling tool with args: ${JSON.stringify(TOOL_ARGS)}`);
    const result = await client.callTool({
      name: TOOL_NAME,
      arguments: TOOL_ARGS
    });

    // Check for errors
    if (result.isError) {
      console.error('[FAIL] Tool returned error:');
      console.error(JSON.stringify(result, null, 2));
      exitCode = 1;
    } else {
      console.error('[TEST] ✓ Tool call succeeded');
      console.error('[TEST] Response preview:');
      const content = result.content[0]?.text || JSON.stringify(result.content);
      // Show first 500 chars of response
      console.error(content.substring(0, 500) + (content.length > 500 ? '...' : ''));
      console.error(`[PASS] Test completed successfully`);
    }

  } catch (error) {
    console.error(`[FAIL] Test error: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    exitCode = 1;
  } finally {
    try {
      await client.close();
    } catch (e) {
      // Ignore close errors
    }
  }

  process.exit(exitCode);
}

test();
```

**IMPORTANT:** Customize the test script based on:
- The specific package being tested
- The tools that were modified
- Required environment variables for that package

---

## Phase 3: DETERMINE REQUIRED ENV VARS

### Step 3.1: Check Package Requirements

Read the package's CLAUDE.md or .env.example to identify required environment variables:

```bash
# Check package-specific CLAUDE.md
cat packages/{PACKAGE_NAME}/CLAUDE.md 2>/dev/null | grep -A 20 "Environment" || echo "No CLAUDE.md"

# Check .env.example
cat .env.example | grep -i "{PACKAGE_PREFIX}" | head -20
```

### Step 3.2: Common Environment Variables by Package

| Package | Required Env Vars |
|---------|-------------------|
| powerplatform | POWERPLATFORM_URL, AZURE_CLIENT_ID, AZURE_TENANT_ID |
| powerplatform-data | POWERPLATFORM_URL, AZURE_CLIENT_ID, AZURE_TENANT_ID |
| powerplatform-customization | POWERPLATFORM_URL, AZURE_CLIENT_ID, AZURE_TENANT_ID |
| azure-devops | ADO_ORG_URL, ADO_PAT |
| figma | FIGMA_ACCESS_TOKEN |
| application-insights | APPINSIGHTS_APP_ID, AZURE_CLIENT_ID, AZURE_TENANT_ID |
| log-analytics | LOG_ANALYTICS_WORKSPACE_ID, AZURE_CLIENT_ID, AZURE_TENANT_ID |
| azure-sql | AZURE_SQL_SERVER, AZURE_SQL_DATABASE |
| service-bus | SERVICE_BUS_NAMESPACE |
| sharepoint | SHAREPOINT_SITE_URL, AZURE_CLIENT_ID, AZURE_TENANT_ID |
| github-enterprise | GH_ENTERPRISE_URL, GH_ENTERPRISE_TOKEN |
| azure-b2c | B2C_TENANT_ID, B2C_POLICY_AUTHORITY |

---

## Phase 4: RUN THE TEST

### Step 4.1: Execute Test Script

```bash
cd /Users/klemensstelk/Repo/github-klemensms/mcp-consultant-tools

# Set environment variables and run
MCP_TEST_PACKAGE="./packages/{PACKAGE}/build/index.js" \
MCP_TEST_TOOL="{TOOL_NAME}" \
MCP_TEST_ARGS='{"param1": "value1"}' \
node .context/mcp-test-runner.mjs
```

### Step 4.2: Capture Exit Code

```bash
# Run and capture result
node .context/mcp-test-runner.mjs
TEST_RESULT=$?

if [ $TEST_RESULT -eq 0 ]; then
  echo "TEST PASSED"
else
  echo "TEST FAILED with exit code $TEST_RESULT"
fi
```

---

## Phase 5: HANDLE RESULTS

### If Tests PASS (exit code 0)

Report to parent agent:

```markdown
## MCP Local Test Results: PASS ✓

**Package:** @mcp-consultant-tools/{package}
**Tool(s) Tested:** {tool-name}
**Build:** ✓ Success
**Connection:** ✓ Connected to server
**Tool Exists:** ✓ Found in server
**Tool Call:** ✓ Returned valid response

### Response Preview
{first 200 chars of response}

### Ready for Final Verification
The local MCP changes are working correctly.
User should now reconnect the MCP server to verify in their Claude Code session.
```

Then use AskUserQuestion:
- "Local tests passed. Please reconnect the MCP server (restart Claude Code or use MCP reconnect) for final verification."

### If Tests FAIL (exit code non-zero)

Report to parent agent:

```markdown
## MCP Local Test Results: FAIL ✗

**Package:** @mcp-consultant-tools/{package}
**Tool(s) Tested:** {tool-name}
**Error:** {error message}

### Failure Details
{full error output}

### Suggested Fixes
{based on the error, suggest what might be wrong}

### DO NOT ask user to reconnect - fix the issue first
```

Return control to parent agent to fix the issue. DO NOT ask user to reconnect.

---

## Phase 6: MULTI-TOOL TESTING (Optional)

For comprehensive testing, iterate through multiple tools:

```bash
# Test multiple tools
TOOLS_TO_TEST=("tool1" "tool2" "tool3")
FAILED=0

for tool in "${TOOLS_TO_TEST[@]}"; do
  echo "Testing $tool..."
  MCP_TEST_TOOL="$tool" MCP_TEST_ARGS='{}' node .context/mcp-test-runner.mjs
  if [ $? -ne 0 ]; then
    FAILED=1
    echo "FAILED: $tool"
  fi
done

if [ $FAILED -eq 0 ]; then
  echo "ALL TESTS PASSED"
else
  echo "SOME TESTS FAILED"
  exit 1
fi
```

---

## Test Environment Safety

**ALWAYS use test environments:**
- PowerPlatform: `https://mcptests.crm4.dynamics.com`
- Never use client/production environments unless explicitly instructed

**Test data cleanup:**
- If tests create records, delete them afterward
- Use unique identifiers (timestamps) for test data

---

## Common Issues and Fixes

| Issue | Likely Cause | Fix |
|-------|--------------|-----|
| "Cannot find module" | Build not run | Run `npm run build` |
| "Connection refused" | Server crashed on start | Check for syntax errors, missing env vars |
| "Tool not found" | Tool not registered | Check tool registration in index.ts |
| "Authentication failed" | Missing/invalid credentials | Verify env vars are set correctly |
| "EPIPE" | Server crashed mid-call | Check for unhandled errors in tool code |
| "Timeout" | Server hanging | Check for infinite loops, missing awaits |

---

## Notes

- **Always use console.error** - stdout is reserved for MCP JSON-RPC protocol
- **Close client in finally block** - prevents zombie processes
- **Check build before test** - stale builds cause confusing errors
- **One tool at a time** - easier to isolate failures
- Test scripts are temporary - stored in `.context/` which is gitignored
