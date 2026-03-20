# Simple Agent API

A pydantic_ai agent deployed as a hybrid REST + [A2A (Agent-to-Agent)](https://google.github.io/A2A/) API, with an interactive playground UI. The agent answers questions with random philosophy or science quotes using tool calls.

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Run the server
python chat_app.py --port 8888 --debug
```

When deployed as a Domino App, `app.sh` does this automatically.

Once running, visit the root URL to open the **API Playground** — it auto-detects the host/port and shows copy-paste sample code for every endpoint.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/chat` | REST API — send a message, get a response |
| `GET` | `/health` | Health check |
| `POST` | `/a2a/` | A2A protocol (`message/send`, JSON-RPC 2.0) |
| `GET` | `/a2a/.well-known/agent-card.json` | A2A Agent Card (capability discovery) |
| `GET` | `/docs` | OpenAPI / Swagger interactive docs |
| `GET` | `/` | API Playground UI |

---

## Using the REST API

The `/chat` endpoint accepts a JSON body and returns the agent's response. Any HTTP client can call it.

### curl

```bash
curl -X POST http://localhost:8888/chat \
  -H 'Content-Type: application/json' \
  -d '{"message": "What is the meaning of life?"}'
```

Response:

```json
{
  "response": "The unexamined life is not worth living. — Socrates",
  "conversation_id": "140234866205"
}
```

### Python

```python
import requests

resp = requests.post(
    "http://localhost:8888/chat",
    json={"message": "What is the meaning of life?"}
)
print(resp.json()["response"])
```

### JavaScript

```javascript
const res = await fetch('http://localhost:8888/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'What is the meaning of life?' })
});
const data = await res.json();
console.log(data.response);
```

---

## Using the A2A Protocol

The [Agent-to-Agent (A2A) Protocol](https://google.github.io/A2A/) is an open standard from Google for inter-agent communication. This agent exposes an A2A-compliant endpoint at `/a2a` so other agents — built with any framework — can discover and talk to it.

### How A2A works

1. **Discovery** — A client fetches the **Agent Card** at `/.well-known/agent-card.json` to learn the agent's name, capabilities, and supported methods.
2. **Message Send** — The client sends a JSON-RPC 2.0 request with `method: "message/send"` containing a user message.
3. **Response** — The server returns either a direct message or a task object with artifacts and conversation history.
4. **Conversation continuity** — Subsequent messages can include the same `context_id` to continue a conversation thread.

### Discover the Agent Card

```bash
curl http://localhost:8888/a2a/.well-known/agent-card.json
```

### Send a message via A2A (curl)

```bash
curl -X POST http://localhost:8888/a2a/ \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "message/send",
    "params": {
      "message": {
        "kind": "message",
        "role": "user",
        "parts": [
          { "kind": "text", "text": "What is the meaning of life?" }
        ],
        "messageId": "msg-001"
      }
    }
  }'
```

### Send a message via A2A (Python — a2a-sdk)

```bash
pip install a2a-sdk
```

```python
import asyncio
import httpx
from uuid import uuid4
from a2a.client import A2ACardResolver, A2AClient
from a2a.types import MessageSendParams, SendMessageRequest


async def main():
    base_url = "http://localhost:8888/a2a"

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
                    "kind": "message",
                    "role": "user",
                    "parts": [
                        {"kind": "text", "text": "What is the meaning of life?"}
                    ],
                    "messageId": uuid4().hex,
                }
            ),
        )
        response = await client.send_message(request)
        print(response.model_dump(mode="json", exclude_none=True))


asyncio.run(main())
```

### Multi-agent scenario

In a multi-agent system, an orchestrator agent can discover and call this agent at runtime:

```python
# An orchestrator agent discovers available agents via their A2A cards,
# then routes questions to the appropriate specialist.

resolver = A2ACardResolver(httpx_client=httpx_client, base_url="http://philosophy-agent:8888/a2a")
card = await resolver.get_agent_card()

# The card describes the agent's capabilities — the orchestrator can
# inspect card.name, card.description, card.skills, etc. to decide
# whether this agent is the right one for the current task.

client = A2AClient(httpx_client=httpx_client, agent_card=card)

# Send a task and get the result
response = await client.send_message(request)

# Use context_id from the response to continue the conversation
context_id = response.result.context_id
```

Each agent is a separate service with its own A2A endpoint. They don't need to share code, frameworks, or even languages — the A2A protocol handles the interop.

---

## Project Structure

| File | Purpose |
|------|---------|
| `simplest_agent.py` | Agent definition — model setup, tools, system prompt |
| `chat_app.py` | FastAPI server — REST API, A2A mount, playground UI |
| `app.sh` | Domino App entry point |
| `ai_system_config.yaml` | Model selection, prompts, and agent parameters |
| `evaluation_library.py` | Evaluation metrics library (toxicity, relevancy, accuracy) |
| `dev_eval_simplest_agent.py` | Dev-time batch evaluation against `sample_questions.csv` |
| `prod_eval_simplest_agent.py` | Production evaluation of deployed agent traces |
| `static/` | API Playground UI (HTML/CSS/JS) |

## Configuration

Edit `ai_system_config.yaml` to switch models. Two provider modes are supported:

**vLLM (Domino-hosted model)** — Uses a local OpenAI-compatible endpoint with rotating auth tokens. The `base_url` and `token_url` fields configure the endpoint and token refresh.

**OpenAI (external API)** — Uses the `OPENAI_API_KEY` environment variable. No `base_url` or `token_url` needed — just uncomment the OpenAI block and comment out the vLLM block.

## Evaluation

```bash
# Dev evaluation — runs agent against sample_questions.csv and logs traces
python dev_eval_simplest_agent.py

# Production evaluation — scores traces from the deployed agent
# Edit AGENT_ID and VERSION in the file first
python prod_eval_simplest_agent.py
```

## Environment Setup (Domino)

The Domino container image needs these packages:

```dockerfile
RUN pip install -r requirements.txt
```

Or manually:

```dockerfile
RUN pip install pydantic-ai fasta2a fastapi uvicorn httpx requests pydantic PyYAML
RUN pip install dominodatalab[agents]
```
