# Your First Task

[简体中文](getting-started.md) · [Documentation](README_EN.md) · [Installation](upgrade_EN.md) · [Usage](usage_EN.md) · [Troubleshooting](troubleshooting_EN.md)

After installation and a complete restart, complete a small task to check the model, file tools, and delivery. If you have not installed OMD, choose [desktop](upgrade_EN.md#desktop) or [Web](usage_EN.md#install-in-existing-dsh).

## 1. Check the Version and Model

Open the version icon beside the brand at the top left and read **Current version**:

| DSH | Public OMD current version |
| --- | --- |
| `0.2.1-alpha.1` | `0.2.1-alpha.1.omd.0.10.0` |
| `0.2.0-rc.2` | `0.2.0-rc.2.omd.0.10.0` |

“Latest version” is remote release information. If the current version did not change or controls are missing, [check the running environment](troubleshooting_EN.md#check-the-running-environment).

OMD uses models and credentials already configured in DSH; it does not include an account. Choose a model with native tool calling, and image input if it needs to interpret screenshots. A file task does not require desktop permissions or a Chrome extension.

## 2. Choose a Conversation, Directory, and Scope

Create a conversation, choose **Oh My DSH**, and select a directory containing a README. Existing conversations keep their original presets.

Before sending the first message, choose **Session isolation** or **Project sharing**. Use isolation for independent work and project sharing when later conversations in the same project should use shared material. The scope locks once the conversation starts; create a new conversation to change it. Development builds also offer global scope; see [context and memory](usage_EN.md#context-and-memory).

**Installation defaults to full file and command access with execution approvals disabled. Explicit profile overrides take priority.** Check the selected directory and actual access settings before sending.

<details>
<summary>You can start without a project</summary>

Clear the selected workspace and start chatting. The first message creates a separate directory on the DSH host, normally Documents/DSH/date/first-message-name. Continuing the conversation reuses it; another conversation gets a new directory. [Projectless chat](usage_EN.md#projectless-chat).

</details>

## 3. Read a File and Deliver a Result

Try:

> Read the README in this directory. Explain the project's purpose, startup steps, and requirements. Put only what you actually find into project-start.md, list anything the README does not specify, and open the file for me to inspect.

Check that the right file was read and the tool succeeded, then inspect the delivered file. If the README omits startup instructions, the result should say so rather than invent a command. If there is no README, use a prepared file without sensitive information.

The result should be a supported explanation and an accessible Markdown file. This checks that model and file workflow; prepare other components when needed.

## 4. Follow Requirements, Actions, and Checks

Open **Workbench → Tasks and verification** for longer tasks. Ask the assistant to preserve requirements, track work, and check the output:

> Export the supplied checklist as CSV. Keep unaccepted items, check encoding, column order, and every field, then deliver the file with the check result.

The recorded fictional checklist contains eight items, including three awaiting acceptance. Its CSV uses UTF-8 with BOM and six fixed columns. The downloaded file was actually checked and passed.

[![Tasks: original requirements, two work items, and actual PASS output](site/media/launchpad-tasks.jpg)](showcase_EN.md)

*Business acceptance states are example data; the file check is an actual result. [Full example](showcase_EN.md).*

## 5. Find the Common Controls

| Control | When to use it |
| --- | --- |
| Star beside the draft | Refine unsent text and recover draft versions; each refinement makes an extra model call. |
| **Tasks and verification** | Inspect requirements, status, and evidence. BT task reminders default on; verification reminders default off. |
| **Context** | Read summaries, documents, and sources. An empty new conversation is normal. |
| **Memory · Dream** | Short-memory controls in development builds; automatic organization defaults off. |
| **Monitoring** | Inspect calls, usage, and context. Background calls also incur usage. |
| **Computer** | Inspect a browser or app. Stop or take over before manual interaction; resume afterward. |
| **Settings → Appearance** | Change theme, palette, font, or background. |
| **Base components** | Prepare CodeGraph, browser, or native desktop components as needed. |

Stopping the conversation, stopping computer control, and closing a preview are different actions. Continue with [computer operation](usage_EN.md#get-started-with-computer-use), or use the [symptom table](troubleshooting_EN.md#by-symptom).
