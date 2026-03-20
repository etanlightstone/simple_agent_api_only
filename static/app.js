(function () {
    'use strict';

    // Detect the base URL from the current browser location so all sample
    // code shows the correct host, port, and path prefix automatically.
    function getBaseUrl() {
        let path = window.location.pathname;
        if (path.endsWith('/index.html')) path = path.slice(0, -11);
        while (path.endsWith('/')) path = path.slice(0, -1);
        return `${window.location.protocol}//${window.location.host}${path}`;
    }

    const BASE = getBaseUrl();

    // --- Populate endpoint list ------------------------------------------

    document.getElementById('ep-chat').textContent = `${BASE}/chat`;
    document.getElementById('ep-health').textContent = `${BASE}/health`;
    document.getElementById('ep-a2a-send').textContent = `${BASE}/a2a`;
    document.getElementById('ep-a2a-card').textContent = `${BASE}/a2a/.well-known/agent-card.json`;
    document.getElementById('ep-docs').textContent = `${BASE}/docs`;

    // --- Code snippets (dynamically use BASE) ----------------------------

    function generateSnippets(message) {
        const escaped = message.replace(/'/g, "'\\''");
        const jsEscaped = message.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

        return {
            curl: `curl -X POST '${BASE}/chat' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "message": "${escaped}"
  }'`,

            python: `import requests

response = requests.post(
    "${BASE}/chat",
    json={"message": "${message}"}
)

data = response.json()
print(data["response"])
# >>> "The unexamined life is not worth living. — Socrates"`,

            javascript: `const response = await fetch('${BASE}/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '${jsEscaped}' })
});

const data = await response.json();
console.log(data.response);`,

            'a2a-curl': `# Discover the agent card
curl '${BASE}/a2a/.well-known/agent-card.json'

# Send a message via the A2A protocol (JSON-RPC 2.0)
curl -X POST '${BASE}/a2a' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "message/send",
    "params": {
      "message": {
        "role": "user",
        "parts": [
          { "kind": "text", "text": "${escaped}" }
        ],
        "messageId": "msg-001"
      }
    }
  }'`,

            'a2a-python': `# Using the official a2a-sdk client
#   pip install a2a-sdk
import httpx
from uuid import uuid4
from a2a.client import A2ACardResolver, A2AClient
from a2a.types import (
    MessageSendParams,
    SendMessageRequest,
)

async def main():
    base_url = "${BASE}/a2a"

    async with httpx.AsyncClient() as httpx_client:
        # 1. Discover the agent card
        resolver = A2ACardResolver(
            httpx_client=httpx_client,
            base_url=base_url,
        )
        agent_card = await resolver.get_agent_card()
        print(f"Agent: {agent_card.name}")

        # 2. Create the A2A client
        client = A2AClient(
            httpx_client=httpx_client,
            agent_card=agent_card,
        )

        # 3. Send a message
        request = SendMessageRequest(
            id=str(uuid4()),
            params=MessageSendParams(
                message={
                    "role": "user",
                    "parts": [
                        {"kind": "text", "text": "${message}"}
                    ],
                    "messageId": uuid4().hex,
                }
            ),
        )
        response = await client.send_message(request)
        print(response.model_dump(mode="json", exclude_none=True))

# Run with: asyncio.run(main())`,
        };
    }

    function updateSnippets() {
        const message = document.getElementById('tryInput').value || 'What is the meaning of life?';
        const snippets = generateSnippets(message);
        for (const [key, code] of Object.entries(snippets)) {
            const el = document.getElementById(`code-${key}`);
            if (el) el.textContent = code;
        }
    }

    // Initial render + update on input change
    updateSnippets();
    document.getElementById('tryInput').addEventListener('input', updateSnippets);

    // --- Tabs -------------------------------------------------------------

    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
        });
    });

    // --- Copy buttons -----------------------------------------------------

    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const target = document.getElementById(btn.dataset.target);
            if (!target) return;
            try {
                await navigator.clipboard.writeText(target.textContent);
                btn.textContent = 'Copied!';
                btn.classList.add('copied');
                setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1500);
            } catch { /* clipboard may fail in some contexts */ }
        });
    });

    // --- Try It -----------------------------------------------------------

    const tryBtn = document.getElementById('tryBtn');
    const tryInput = document.getElementById('tryInput');
    const tryResult = document.getElementById('tryResult');

    tryBtn.addEventListener('click', async () => {
        const message = tryInput.value.trim();
        if (!message) return;

        tryBtn.disabled = true;
        tryBtn.textContent = 'Sending...';
        tryResult.className = 'result-box';
        tryResult.textContent = 'Waiting for response...';

        try {
            const res = await fetch(`${BASE}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: res.statusText }));
                throw new Error(err.detail || `HTTP ${res.status}`);
            }

            const data = await res.json();
            tryResult.className = 'result-box success';
            tryResult.textContent = JSON.stringify(data, null, 2);
        } catch (err) {
            tryResult.className = 'result-box error';
            tryResult.textContent = `Error: ${err.message}`;
        } finally {
            tryBtn.disabled = false;
            tryBtn.textContent = 'Send Request';
        }
    });

    tryInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') tryBtn.click();
    });

    // --- Health check on load ---------------------------------------------

    (async () => {
        const dot = document.getElementById('statusDot');
        const text = document.getElementById('statusText');
        const statusRunning = document.getElementById('statusRunning');
        try {
            const res = await fetch(`${BASE}/health`);
            if (res.ok) {
                dot.className = 'status-dot online';
                text.textContent = 'Online';
                if (statusRunning) statusRunning.textContent = 'Running';
            } else {
                throw new Error();
            }
        } catch {
            dot.className = 'status-dot offline';
            text.textContent = 'Offline';
            if (statusRunning) {
                statusRunning.textContent = 'Offline';
                statusRunning.style.color = '#D9534F';
            }
        }
    })();

    // --- "View App" top button triggers the Try It send -------------------
    const tryBtnTop = document.getElementById('tryBtnTop');
    if (tryBtnTop) {
        tryBtnTop.addEventListener('click', () => {
            window.open(`${BASE}/docs`, '_blank');
        });
    }

})();
