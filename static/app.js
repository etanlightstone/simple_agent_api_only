(function () {
    'use strict';

    function getBaseUrl() {
        let path = window.location.pathname;
        if (path.endsWith('/index.html')) path = path.slice(0, -11);
        while (path.endsWith('/')) path = path.slice(0, -1);
        return `${window.location.protocol}//${window.location.host}${path}`;
    }

    const BASE = getBaseUrl();

    let IN_DOMINO = false;
    let TOKEN_URL = '';

    function escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // --- Populate endpoint list ------------------------------------------

    document.getElementById('ep-chat').textContent = `${BASE}/chat`;
    document.getElementById('ep-health').textContent = `${BASE}/health`;
    document.getElementById('ep-a2a-send').textContent = `${BASE}/a2a/`;
    document.getElementById('ep-a2a-card').textContent = `${BASE}/a2a/.well-known/agent-card.json`;
    document.getElementById('ep-docs').textContent = `${BASE}/docs`;

    // --- Code snippets (dynamically use BASE) ----------------------------

    function authCurlHeader() {
        return `  -H "Authorization: Bearer $(curl -s ${TOKEN_URL})" \\`;
    }

    function generateSnippets(message) {
        const escaped = message.replace(/'/g, "'\\''");
        const jsEscaped = message.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

        const curlAuth = IN_DOMINO ? `\n${authCurlHeader()}` : '';

        return {
            curl: `curl -X POST '${BASE}/chat' \\
  -H 'Content-Type: application/json' \\${curlAuth}
  -d '{
    "message": "${escaped}"
  }'`,

            python: IN_DOMINO
                ? `import requests

# Fetch a short-lived Domino auth token
token = requests.get("${TOKEN_URL}").text

response = requests.post(
    "${BASE}/chat",
    headers={"Authorization": f"Bearer {token}"},
    json={"message": "${message}"}
)

data = response.json()
print(data["response"])
# >>> "The unexamined life is not worth living. — Socrates"`
                : `import requests

response = requests.post(
    "${BASE}/chat",
    json={"message": "${message}"}
)

data = response.json()
print(data["response"])
# >>> "The unexamined life is not worth living. — Socrates"`,

            javascript: IN_DOMINO
                ? `// Fetch a short-lived Domino auth token
const tokenRes = await fetch('${TOKEN_URL}');
const token = await tokenRes.text();

const response = await fetch('${BASE}/chat', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': \`Bearer \${token}\`
    },
    body: JSON.stringify({ message: '${jsEscaped}' })
});

const data = await response.json();
console.log(data.response);`
                : `const response = await fetch('${BASE}/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '${jsEscaped}' })
});

const data = await response.json();
console.log(data.response);`,

            'a2a-curl': IN_DOMINO
                ? `# Step 1 — Discover the agent card
curl \\
${authCurlHeader()}
  '${BASE}/a2a/.well-known/agent-card.json'

# Step 2 — Send a message (returns a task ID immediately)
curl -X POST '${BASE}/a2a/' \\
  -H 'Content-Type: application/json' \\
${authCurlHeader()}
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "message/send",
    "params": {
      "message": {
        "kind": "message",
        "role": "user",
        "parts": [
          { "kind": "text", "text": "${escaped}" }
        ],
        "messageId": "msg-001"
      }
    }
  }'
# ↑ Response includes "result.id" — the task ID.

# Step 3 — Poll for the completed result
# Replace TASK_ID with the "result.id" value from Step 2.
curl -X POST '${BASE}/a2a/' \\
  -H 'Content-Type: application/json' \\
${authCurlHeader()}
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tasks/get",
    "params": {
      "id": "TASK_ID"
    }
  }'
# Repeat until result.status.state is "completed".
# The agent reply is in result.artifacts[0].parts[0].text`
                : `# Step 1 — Discover the agent card
curl '${BASE}/a2a/.well-known/agent-card.json'

# Step 2 — Send a message (returns a task ID immediately)
curl -X POST '${BASE}/a2a/' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "message/send",
    "params": {
      "message": {
        "kind": "message",
        "role": "user",
        "parts": [
          { "kind": "text", "text": "${escaped}" }
        ],
        "messageId": "msg-001"
      }
    }
  }'
# ↑ Response includes "result.id" — the task ID.

# Step 3 — Poll for the completed result
# Replace TASK_ID with the "result.id" value from Step 2.
curl -X POST '${BASE}/a2a/' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tasks/get",
    "params": {
      "id": "TASK_ID"
    }
  }'
# Repeat until result.status.state is "completed".
# The agent reply is in result.artifacts[0].parts[0].text`,

            'a2a-python': IN_DOMINO
                ? `# pip install a2a-sdk httpx
import asyncio, httpx, requests as req_lib
from uuid import uuid4
from a2a.client import A2ACardResolver, A2AClient
from a2a.types import (
    MessageSendParams, SendMessageRequest,
    GetTaskRequest, GetTaskParams,
)

async def main():
    base_url = "${BASE}/a2a"
    token = req_lib.get("${TOKEN_URL}").text

    async with httpx.AsyncClient(
        headers={"Authorization": f"Bearer {token}"}
    ) as httpx_client:
        # 1. Discover the agent card
        resolver = A2ACardResolver(
            httpx_client=httpx_client, base_url=base_url,
        )
        agent_card = await resolver.get_agent_card()
        print(f"Agent: {agent_card.name}")

        # 2. Send a message (returns immediately with task ID)
        client = A2AClient(
            httpx_client=httpx_client, agent_card=agent_card,
        )
        send_resp = await client.send_message(SendMessageRequest(
            id=str(uuid4()),
            params=MessageSendParams(message={
                "kind": "message",
                "role": "user",
                "parts": [{"kind": "text", "text": "${message}"}],
                "messageId": uuid4().hex,
            }),
        ))
        task = send_resp.result
        print(f"Task submitted: {task.id}  state={task.status.state}")

        # 3. Poll until the task completes
        while task.status.state in ("submitted", "working"):
            await asyncio.sleep(1)
            get_resp = await client.get_task(GetTaskRequest(
                id=str(uuid4()),
                params=GetTaskParams(id=task.id),
            ))
            task = get_resp.result
            print(f"  state={task.status.state}")

        # 4. Read the agent's answer
        if task.artifacts:
            for part in task.artifacts[0].parts:
                print(f"Agent: {part.text}")
        else:
            print(f"Task ended with state: {task.status.state}")

asyncio.run(main())`
                : `# pip install a2a-sdk httpx
import asyncio, httpx
from uuid import uuid4
from a2a.client import A2ACardResolver, A2AClient
from a2a.types import (
    MessageSendParams, SendMessageRequest,
    GetTaskRequest, GetTaskParams,
)

async def main():
    base_url = "${BASE}/a2a"

    async with httpx.AsyncClient() as httpx_client:
        # 1. Discover the agent card
        resolver = A2ACardResolver(
            httpx_client=httpx_client, base_url=base_url,
        )
        agent_card = await resolver.get_agent_card()
        print(f"Agent: {agent_card.name}")

        # 2. Send a message (returns immediately with task ID)
        client = A2AClient(
            httpx_client=httpx_client, agent_card=agent_card,
        )
        send_resp = await client.send_message(SendMessageRequest(
            id=str(uuid4()),
            params=MessageSendParams(message={
                "kind": "message",
                "role": "user",
                "parts": [{"kind": "text", "text": "${message}"}],
                "messageId": uuid4().hex,
            }),
        ))
        task = send_resp.result
        print(f"Task submitted: {task.id}  state={task.status.state}")

        # 3. Poll until the task completes
        while task.status.state in ("submitted", "working"):
            await asyncio.sleep(1)
            get_resp = await client.get_task(GetTaskRequest(
                id=str(uuid4()),
                params=GetTaskParams(id=task.id),
            ))
            task = get_resp.result
            print(f"  state={task.status.state}")

        # 4. Read the agent's answer
        if task.artifacts:
            for part in task.artifacts[0].parts:
                print(f"Agent: {part.text}")
        else:
            print(f"Task ended with state: {task.status.state}")

asyncio.run(main())`,
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

    updateSnippets();
    document.getElementById('tryInput').addEventListener('input', updateSnippets);

    // --- Agent Card code snippets ----------------------------------------

    function generateCardSnippets() {
        const curlAuth = IN_DOMINO ? ` \\\n${authCurlHeader()}\n ` : ' ';

        return {
            'card-curl': IN_DOMINO
                ? `curl \\
${authCurlHeader()}
  '${BASE}/a2a/.well-known/agent-card.json' | python -m json.tool`
                : `curl '${BASE}/a2a/.well-known/agent-card.json' | python -m json.tool`,

            'card-python': IN_DOMINO
                ? `import requests

token = requests.get("${TOKEN_URL}").text

response = requests.get(
    "${BASE}/a2a/.well-known/agent-card.json",
    headers={"Authorization": f"Bearer {token}"}
)
card = response.json()

print(f"Agent: {card['name']}")
print(f"Description: {card['description']}")
print(f"Version: {card['version']}")
print(f"Skills: {len(card.get('skills', []))}")
for skill in card.get("skills", []):
    print(f"  - {skill['name']}: {skill['description']}")`
                : `import requests

response = requests.get("${BASE}/a2a/.well-known/agent-card.json")
card = response.json()

print(f"Agent: {card['name']}")
print(f"Description: {card['description']}")
print(f"Version: {card['version']}")
print(f"Skills: {len(card.get('skills', []))}")
for skill in card.get("skills", []):
    print(f"  - {skill['name']}: {skill['description']}")`,

            'card-javascript': IN_DOMINO
                ? `const tokenRes = await fetch('${TOKEN_URL}');
const token = await tokenRes.text();

const response = await fetch('${BASE}/a2a/.well-known/agent-card.json', {
    headers: { 'Authorization': \`Bearer \${token}\` }
});
const card = await response.json();

console.log(\`Agent: \${card.name}\`);
console.log(\`Description: \${card.description}\`);
console.log(\`Version: \${card.version}\`);
for (const skill of card.skills ?? []) {
    console.log(\`  - \${skill.name}: \${skill.description}\`);
}`
                : `const response = await fetch('${BASE}/a2a/.well-known/agent-card.json');
const card = await response.json();

console.log(\`Agent: \${card.name}\`);
console.log(\`Description: \${card.description}\`);
console.log(\`Version: \${card.version}\`);
for (const skill of card.skills ?? []) {
    console.log(\`  - \${skill.name}: \${skill.description}\`);
}`,
        };
    }

    function updateCardSnippets() {
        const snippets = generateCardSnippets();
        for (const [key, code] of Object.entries(snippets)) {
            const el = document.getElementById(`code-${key}`);
            if (el) el.textContent = code;
        }
    }

    updateCardSnippets();

    // --- Fetch platform info and re-render if in Domino ------------------

    (async () => {
        try {
            const res = await fetch(`${BASE}/platform-info`);
            if (res.ok) {
                const info = await res.json();
                if (info.in_domino) {
                    IN_DOMINO = true;
                    TOKEN_URL = info.token_url;

                    const platformLabel = document.getElementById('platformLabel');
                    if (platformLabel) platformLabel.textContent = 'Domino';

                    updateSnippets();
                    updateCardSnippets();
                }
            }
        } catch { /* non-critical — snippets stay in local/no-auth mode */ }
    })();

    // --- Code panel tabs (playground) ------------------------------------

    document.querySelectorAll('.code-panel .tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const panel = tab.closest('.code-panel');
            panel.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            panel.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            panel.querySelector(`#tab-${tab.dataset.tab}`).classList.add('active');
        });
    });

    // --- Agent Card code tabs --------------------------------------------

    document.querySelectorAll('.agent-card-code-panel .tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const panel = tab.closest('.agent-card-code-panel');
            panel.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            panel.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            panel.querySelector(`#tab-${tab.dataset.cardTab}`).classList.add('active');
        });
    });

    // --- Page tab switching (Playground / Agent Card) ---------------------

    document.querySelectorAll('.page-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.pageTab;
            document.querySelectorAll('.page-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            document.querySelectorAll('.page-content').forEach(p => p.classList.remove('active'));
            const page = document.querySelector(`.page-content[data-page="${target}"]`);
            if (page) page.classList.add('active');

            if (target === 'agent-card') fetchAgentCard();
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
        tryResult.innerHTML = '<span style="color:var(--text-muted)">Waiting for response…</span>';

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

            const answer = data.response || data.result || JSON.stringify(data, null, 2);
            tryResult.innerHTML = '';

            const answerEl = document.createElement('div');
            answerEl.className = 'result-answer';
            answerEl.textContent = answer;
            tryResult.appendChild(answerEl);

            const meta = document.createElement('div');
            meta.className = 'result-meta';
            meta.innerHTML = `<details><summary>Raw JSON response</summary><pre><code>${escapeHtml(JSON.stringify(data, null, 2))}</code></pre></details>`;
            tryResult.appendChild(meta);
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
        const statusRunning = document.getElementById('statusRunning');
        try {
            const res = await fetch(`${BASE}/health`);
            if (res.ok) {
                if (statusRunning) statusRunning.textContent = 'Running';
            } else {
                throw new Error();
            }
        } catch {
            if (statusRunning) {
                statusRunning.textContent = 'Offline';
                statusRunning.style.color = '#D9534F';
            }
        }
    })();

    // --- API Docs link ------------------------------------------------------
    const apiDocsLink = document.getElementById('tryBtnTop');
    if (apiDocsLink) {
        apiDocsLink.href = `${BASE}/docs`;
        apiDocsLink.target = '_blank';
        apiDocsLink.rel = 'noopener';
    }

    // --- Agent Card fetch & render ----------------------------------------

    async function fetchAgentCard() {
        const container = document.getElementById('agentCardContent');
        container.innerHTML = '<span style="color:var(--text-muted)">Loading agent card…</span>';

        try {
            const res = await fetch(`${BASE}/a2a/.well-known/agent-card.json`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const card = await res.json();
            renderAgentCard(card, container);
        } catch (err) {
            container.innerHTML = `<div class="result-box error">Error loading agent card: ${escapeHtml(err.message)}</div>`;
        }
    }

    function renderAgentCard(card, container) {
        let html = '<div class="agent-card-pretty">';

        html += field('Name', escapeHtml(card.name || '—'));
        html += field('Description', escapeHtml(card.description || '—'));
        html += field('Version', escapeHtml(card.version || '—'));

        if (card.provider) {
            const org = escapeHtml(card.provider.organization || '');
            const url = card.provider.url || '';
            const providerHtml = url
                ? `${org} — <a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>`
                : org;
            html += field('Provider', providerHtml);
        }

        if (card.url) {
            html += field('URL', `<a href="${escapeHtml(card.url)}" target="_blank" rel="noopener">${escapeHtml(card.url)}</a>`);
        }

        if (card.skills && card.skills.length) {
            html += '<div class="agent-card-field">';
            html += '<span class="agent-card-field-label">Skills</span>';
            html += '<div class="agent-card-skills">';
            for (const skill of card.skills) {
                html += '<div class="agent-card-skill">';
                html += `<div class="agent-card-skill-name">${escapeHtml(skill.name || skill.id)}</div>`;
                if (skill.description) {
                    html += `<div class="agent-card-skill-desc">${escapeHtml(skill.description)}</div>`;
                }
                if (skill.tags && skill.tags.length) {
                    html += '<div class="agent-card-skill-tags">';
                    for (const tag of skill.tags) {
                        html += `<span class="agent-card-tag">${escapeHtml(tag)}</span>`;
                    }
                    html += '</div>';
                }
                html += '</div>';
            }
            html += '</div></div>';
        }

        if (card.capabilities) {
            const caps = Object.entries(card.capabilities)
                .filter(([, v]) => v)
                .map(([k]) => escapeHtml(k));
            if (caps.length) {
                html += field('Capabilities', caps.join(', '));
            }
        }

        html += '<div class="agent-card-raw">';
        html += `<details><summary>Raw JSON</summary><pre><code>${escapeHtml(JSON.stringify(card, null, 2))}</code></pre></details>`;
        html += '</div>';

        html += '</div>';
        container.innerHTML = html;
    }

    function field(label, valueHtml) {
        return `<div class="agent-card-field">
            <span class="agent-card-field-label">${label}</span>
            <span class="agent-card-field-value">${valueHtml}</span>
        </div>`;
    }

    document.getElementById('refreshCardBtn').addEventListener('click', fetchAgentCard);

})();
