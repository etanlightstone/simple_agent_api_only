import os
import yaml
import random
import httpx
import requests as req_lib
from pydantic_ai import Agent, RunContext
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider
from domino.agents.tracing import add_tracing, search_traces
from domino.agents.logging import DominoRun, log_evaluation


script_dir = os.path.dirname(os.path.abspath(__file__))
config_path = os.path.join(script_dir, 'ai_system_config.yaml')

with open(config_path, 'r') as f:
    config = yaml.safe_load(f)

retries = config['agent']['retries']
system_prompt = config['prompts']['simple_agent_system']


# ---------------------------------------------------------------------------
# Tools (defined at module level so they're registered once on the agent)
# ---------------------------------------------------------------------------

def science_quote(ctx: RunContext[str], question: str) -> str:
    """
    Use this function to answer any question with a random science quote.

    Args:
        ctx: The context of the run.
        question: The question

    Returns:
        A science quote
    """
    print("************** CALLED TOOL: science_quote")
    quotes = [
        "Imagination is more important than knowledge. — Albert Einstein",
        "If I have seen further it is by standing on the shoulders of giants. — Isaac Newton",
        "Research is what I'm doing when I don't know what I'm doing. — Wernher von Braun",
        "The important thing is to never stop questioning. — Albert Einstein",
        "Somewhere, something incredible is waiting to be known. — Carl Sagan",
        "Nothing in life is to be feared, it is only to be understood. — Marie Curie",
        "The first principle is that you must not fool yourself—and you are the easiest person to fool. — Richard Feynman",
        "However difficult life may seem, there is always something you can do and succeed at. — Stephen Hawking",
        "Science is a way of thinking much more than it is a body of knowledge. — Carl Sagan",
        "Equipped with his five senses, man explores the universe around him and calls the adventure Science. — Edwin Hubble"
    ]
    return random.choice(quotes)


def philosophy_quote(ctx: RunContext[str], question: str) -> str:
    """
    Use this function to answer any question with a random philosophy quote.

    Args:
        ctx: The context of the run.
        question: The question

    Returns:
        A philosophy quote
    """
    print("************** CALLED TOOL: philosophy_quote")
    quotes = [
        "The unexamined life is not worth living. — Socrates",
        "He who thinks great thoughts, often makes great errors. — Martin Heidegger",
        "Happiness is not an ideal of reason but of imagination. — Immanuel Kant",
        "We are what we repeatedly do. Excellence, then, is not an act, but a habit. — Aristotle",
        "Man is condemned to be free; because once thrown into the world, he is responsible for everything he does. — Jean-Paul Sartre"
    ]
    return random.choice(quotes)


# ---------------------------------------------------------------------------
# Model construction — one long-lived instance
# ---------------------------------------------------------------------------

def _build_model():
    """Build the LLM model from config. Called once at import time."""
    provider_name = config['model']['provider']

    if provider_name == 'vllm':
        base_url = config['model']['base_url']
        token_url = config['model']['token_url']

        # httpx event hook that fetches a fresh Domino auth token before
        # every outgoing request to the vLLM endpoint. This replaces the
        # old create_agent() pattern of rebuilding the entire agent per
        # request just to rotate the 5-minute token.
        async def _refresh_vllm_token(request: httpx.Request):
            token = req_lib.get(token_url).text
            request.headers["authorization"] = f"Bearer {token}"

        http_client = httpx.AsyncClient(
            event_hooks={"request": [_refresh_vllm_token]}
        )

        provider = OpenAIProvider(
            base_url=base_url,
            api_key="refreshed-per-request",
            http_client=http_client,
        )
        return OpenAIChatModel("", provider=provider)

    # OpenAI (or any provider whose full_name pydantic_ai can resolve)
    # uses OPENAI_API_KEY from env automatically — no token rotation needed.
    return config['model']['full_name']


# ---------------------------------------------------------------------------
# Single long-lived agent — safe for use with .to_a2a() and FastAPI
# ---------------------------------------------------------------------------

agent = Agent(
    _build_model(),
    retries=retries,
    instructions=system_prompt,
    instrument=True,
)
agent.tool(science_quote)
agent.tool(philosophy_quote)


def create_agent():
    """Backwards-compatible factory. Returns the shared long-lived agent."""
    return agent
