# Testing the domino agentic features

## Note, this is the env config needed:
```
RUN pip install --no-cache-dir dominodatalab[agents]
RUN pip install scipy
RUN pip install pydantic pydantic_ai pandas python-dotenv openai openai-agents PyYAML
```
***

## Run as a Domino job to evaluate the agent across a dataset of sample inputs (defined in sample_questions.csv), and will log an experiment run with traces.
python dev_eval_simplest_agent.py
### Use the experiment run UI in Domino to deploy the agent

***

## Production run script:
app.sh

***

## Production evals (edit the file and modify the agent ID / version ID based on info provided on the agent overview in the Domino UI).
### This should as a scheduled job (every day, or every week).
python prod_eval_simplest_agent.py

***

## How to change model and config
### simplest_agent.py
simplest_agent.py is the agent code itself
### ai_system_config.yaml
ai_system_config.yaml are settings / params that configure the agent with different LLMs etc..  Use this to point to an LLM hosted within the domino platform or externally (to Domino) hosted model (open AI / Anthropic / Bedrock etc).

***

## Other info:
### chat_app.py
chat_app.py is the production chat app and UI wrapping the agent when deployed.
### evaluation_library.py
evaluation_library.py is the eval library used to decorate traces (in both dev and production) based on our eval methodology (this is currently applies eval metrics randomly, but can be modified to be real using LLM judging and other evaluation techniques).

<!-- ## prompts for this toy agent:

```
query the user database to find the richest person and use the location query system to figure out what city they live in.
``` -->

