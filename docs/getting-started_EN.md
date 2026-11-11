# Getting started

[中文](getting-started.md) · [Docs](README_EN.md) · [Usage guide](usage_EN.md) · [Troubleshooting](troubleshooting_EN.md)

This page assumes you installed OMD following the [installation guide](install_EN.md) and fully restarted DSH.

## 1. Check the version and model

Open **Settings → Oh My DSH → About** and check that the current version is 1.3.14 and DSH is 0.2.2-rc.2. The desktop and web versions use different profiles, so make sure OMD is in the one you are using.

OMD uses the models configured in DSH and comes with no account. Working with files needs a model that supports tool calls; reading screenshots needs image input.

## 2. Create a session

Create a session and pick the **Oh My DSH** preset. Choose an existing workspace, or without a project use the global **New Session** and OMD creates a folder for the chat.

Before the first message, choose a memory scope in **Permissions → Memory scope** under the input box. It is fixed once you send:

| Scope | Good for |
| --- | --- |
| **Session isolation** | One-off work you do not want to share with other sessions |
| **Project sharing** | A project you will work on over several sessions |
| **Global sharing** | Habits you want the AI to remember everywhere |

> By default OMD lets the AI read and write files and run commands without asking each time. Permissions you set in your profile take precedence. Memory scope only affects memory, not file permissions.

## 3. Try a small task

In a directory that has a README, enter:

```text
Read the README in this directory and explain what the project does, how to start it and what it needs. Only write what you actually read, mark anything missing as "not stated", save it as project-start.md and open it for me.
```

Check three things: the right file was read, the answer quotes the README, and project-start.md opens. If the README does not say how to start the project, the AI should mark it "not stated" rather than make it up.

## 4. Common controls

| Control | What it does |
| --- | --- |
| **OMD Console** (right sidebar) | Tokens, context, memory, call log and background log |
| Info bar under the input box | This turn's stats, with a jump into the console |
| **BT** | To-do reminders and task verification |
| Model panel | Normal levels and Ultra (Workflow, Agent Team, Free) |
| **✨** | Polish, structure or break down your message before sending |
| **View original** on a tool card | Page through a tool's raw result |
| **Session personality** in the permissions menu | Change the personality for this session |
| `/btw`, `/侧栏` | Ask a side question or open a temporary chat without interrupting the main task |
| **Plugins → Skills / MCP / Instructions / Commands / Hooks** | Manage extensions and project instructions |

Details for each are in the [usage guide](usage_EN.md).

## 5. Web chat and computer use

- **DeepSeek Workbench**: open DeepSeek web chat inside DSH and import web history as DSH sessions; you send the next message yourself. See [DeepSeek Workbench](deepseek-workbench.md) (Chinese).
- **Computer and browser**: open **Settings → Computer & Browser** and follow the prompts to grant system permissions, set up a browser or connect the Chrome or Edge extension. Start with a small task that involves no personal data. See [computer and browser](computer-use.md) (Chinese).

If something goes wrong, start with [troubleshooting](troubleshooting_EN.md) and note the full versions and the first error. Do not clear your data to fix problems.
