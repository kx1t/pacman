# app-agent-template

A GitHub template repository for starting new projects with the **Project Framework Template** custom agent.

When you clone this repo into a project, VS Code Copilot Chat can discover the agent from `.github/agents/project-framework-template.agent.md`.

## What is included

- `.github/agents/project-framework-template.agent.md` - the custom agent definition.
- This README - a simple guide for beginners.

## How to use it

### Option 1: Create a new project from this template

1. On GitHub, open this repository and choose **Use this template**.
2. Create your new project repository from it.
3. Clone the new repository to your computer.
4. Open the cloned folder in VS Code.
5. Sign in to GitHub and enable Copilot Chat if prompted.
6. Open Copilot Chat and select the **Project Framework Template** agent from the agent picker.
7. Ask it to scaffold your new project.

### Option 2: Clone it into an existing project repository

1. Clone this template repository into your project repository.
2. Keep the `.github/agents/project-framework-template.agent.md` file in the repo.
3. Open the repo in VS Code.
4. In Copilot Chat, pick the **Project Framework Template** agent.
5. Use the agent to create or refine the project.

## What the agent is for

This agent is designed for Python-first, container-ready project setup. It expects:

- GitHub hosting
- Docker and Docker Compose files
- Multi-arch container delivery to GHCR
- Web apps that can live behind a reverse proxy

## Beginner tips

- If VS Code asks you to sign in, complete the GitHub login first.
- If the agent asks for a repository name or description, give it one before continuing.
- If you are not sure what to type, use a short project description like "Task tracker web app" or "Internal dashboard".

## For project owners

This repository is meant to be used as a starter template, not as a collaboration target.
If you build a project from it, commit your project changes in your own repository.