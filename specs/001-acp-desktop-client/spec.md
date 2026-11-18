# Feature Specification: Ster — ACP Desktop Client

**Feature Branch**: `001-acp-desktop-client`

**Created**: 2026-11-18

**Status**: Draft

**Input**: User description: "A desktop GUI application, published as an open-source template repository that anyone can adapt, which lets a user work with any coding agent from the Agent Client Protocol (ACP) registry using their own subscription login instead of API keys. First version: streaming chat, tool-call cards with diffs and the agent's plan, a terminal the agent can use, multiple sessions with history, switching modes and models plus slash commands, several permission modes, discovery of installed agents plus on-demand installation and custom commands, an interface in English and Polish, and installers for macOS, Windows and Linux." Extended during specification with: organization policy, security and extensibility requirements, a factory definition kept in the repository, and run records with scoring, as the desktop stage of an organizational software factory.

## User Scenarios & Testing *(mandatory)*

The product is named **Ster**. Three kinds of people use this feature. An **end user** runs the application to work with an agent on their own files. A **template adopter** takes the repository and adapts it into their own product. An **organization administrator** rolls the application out to colleagues and decides what they may use in it.

### User Story 1 - Converse with an agent in a project folder (Priority: P1)

An end user opens the application, picks an agent that is already available on their machine, chooses a working folder, and types a request. The agent's reply appears progressively as it is produced. When the agent wants to do something that needs approval, the user sees the request and decides. The user can stop the agent at any moment.

**Why this priority**: This is the core loop. Without it nothing else in the application has value, and on its own it is already a usable product.

**Independent Test**: With one agent available and logged in, start a session in a folder, send a request that makes the agent read a file and answer, and confirm the answer streams in and the turn ends cleanly.

**Acceptance Scenarios**:

1. **Given** an available, logged-in agent and a chosen working folder, **When** the user sends a message, **Then** the agent's reply appears incrementally and the conversation shows when the turn has finished.
2. **Given** an agent turn in progress, **When** the user presses stop, **Then** the agent stops working, the partial reply stays visible, and the user can send a new message.
3. **Given** an agent that asks for approval of an action, **When** the request arrives, **Then** the user sees what the agent wants to do and the choices the agent offers, and the agent proceeds according to the user's choice.
4. **Given** an agent that is installed but not logged in, **When** the user tries to start a session, **Then** the application explains that login is required and how to do it with the agent's own login flow, without asking for any credentials itself.
5. **Given** an agent process that exits unexpectedly during a turn, **When** this happens, **Then** the user sees a clear error, the conversation so far is preserved, and the user can restart the agent.

---

### User Story 2 - See what the agent is doing (Priority: P2)

While the agent works, the end user sees each action it takes as a distinct item in the conversation: what kind of action it is, its status, and its result. When the agent changes a file, the user sees the change as a before-and-after comparison. When the agent shares a plan, the user sees the steps and their progress.

**Why this priority**: Users cannot trust or supervise an agent whose work is hidden behind plain text. This turns a chat window into a tool people can safely use on real projects.

**Independent Test**: Ask the agent to make a small edit to a file and confirm the action appears with status, the file change is shown as a comparison, and any plan the agent publishes is displayed and updated.

**Acceptance Scenarios**:

1. **Given** an agent that performs an action, **When** the action starts, progresses, and ends, **Then** the conversation shows one item for it whose status moves from pending through in progress to completed or failed.
2. **Given** an agent that modifies a file, **When** the modification is reported, **Then** the user sees the affected file and a comparison of old and new content.
3. **Given** an agent that publishes a plan, **When** the plan or the status of its steps changes, **Then** the displayed plan reflects the latest state.
4. **Given** an action that refers to a file location, **When** the user selects it, **Then** the user can open that file from the application.

---

### User Story 3 - Control how much the agent may do without asking (Priority: P3)

The end user chooses a permission mode that matches how much they trust the task: being asked every time, being asked with the option to remember a decision for the rest of the session, or letting read-only actions pass automatically while still being asked about changes and commands. The user can change the mode at any time.

**Why this priority**: Approving every single action makes long tasks unusable, while approving nothing by hand is unsafe. Different users and tasks need different balances, and the default must be safe.

**Independent Test**: Run the same task under each mode and confirm that the number and kind of approval prompts match the mode's definition.

**Acceptance Scenarios**:

1. **Given** the "always ask" mode, **When** the agent requests approval, **Then** the user is prompted every time and nothing is remembered.
2. **Given** the "ask with remembered decisions" mode, **When** the user chooses to always allow a kind of action, **Then** later requests of that kind in the same session are approved without a prompt and are still shown in the conversation as approved automatically.
3. **Given** the "auto-approve reads" mode, **When** the agent requests a read-only action, **Then** it proceeds without a prompt, while requests to change files or run commands still prompt.
4. **Given** a first launch, **When** no mode has been chosen, **Then** the application uses the mode that asks for every request.
5. **Given** remembered decisions in a session, **When** the user reviews them, **Then** the user can see and revoke each one.

---

### User Story 4 - Find, install, and add agents (Priority: P4)

The end user opens the agent list and sees which agents are already on their machine and which others are available from the public agent registry. They can install an agent from the registry with one confirmation, or add an agent that is not in the registry by entering the command that starts it.

**Why this priority**: Agent choice is the reason the application is built on an open protocol. Story 1 works with a single available agent, so this comes after the core loop but before conveniences.

**Independent Test**: On a machine with one agent installed, confirm it is listed as available, install a second one from the registry, add a third by custom command, and start a session with each.

**Acceptance Scenarios**:

1. **Given** agents installed on the machine, **When** the user opens the agent list, **Then** those agents are shown as ready to use.
2. **Given** an agent in the registry that is not installed, **When** the user chooses to install it, **Then** the application shows what will be installed and from where, installs it after confirmation, and shows it as ready.
3. **Given** an agent not listed in the registry, **When** the user enters a start command for it, **Then** the agent is saved in the list and can be used for sessions.
4. **Given** no network connection, **When** the user opens the agent list, **Then** installed and custom agents remain usable and the application states that the registry could not be reached.
5. **Given** an installation that fails, **When** the failure occurs, **Then** the user sees the reason and nothing half-installed appears as ready.
6. **Given** an agent installed by the application, **When** the user removes it, **Then** it disappears from the ready list and its files are deleted.

---

### User Story 5 - Let the agent run commands (Priority: P5)

When the agent needs to run a command, such as a build or a test suite, the command runs on the user's machine in the session's working folder. The user sees the command and its output as it is produced and can stop a running command.

**Why this priority**: Running commands is what lets an agent verify its own work. It carries more risk than reading and editing files, so it follows the permission controls.

**Independent Test**: Ask the agent to run a short command and a long-running one; confirm live output for both and that the long one can be stopped by the user.

**Acceptance Scenarios**:

1. **Given** an agent that supports running commands through the application, **When** it runs a command, **Then** the user sees the command and its output appearing live, followed by its exit result.
2. **Given** a running command, **When** the user stops it, **Then** the command ends and the agent is informed of the outcome.
3. **Given** a command that produces very large output, **When** it runs, **Then** the application stays responsive and the user is told when older output has been truncated.
4. **Given** a session that ends or an application that quits, **When** commands from that session are still running, **Then** they are terminated.

---

### User Story 6 - Work in several sessions and return to earlier ones (Priority: P6)

The end user keeps several conversations at once, each with its own agent and working folder, and switches between them while agents continue working in the background. After restarting the application, the user finds earlier conversations in a list, can read them, and, where the agent supports it, can continue them.

**Why this priority**: Real work spans several tasks and several days. This is important for sustained use but not for the first successful task.

**Independent Test**: Run two sessions in different folders at the same time, restart the application, and confirm both appear in history, are readable, and one can be continued with an agent that supports resuming.

**Acceptance Scenarios**:

1. **Given** two active sessions, **When** the user switches between them, **Then** each shows its own conversation and the agent in the hidden session keeps working.
2. **Given** a hidden session whose agent needs approval or has finished, **When** that happens, **Then** the session list signals that the session needs attention.
3. **Given** earlier sessions, **When** the application is restarted, **Then** they appear in a list with their title, agent, folder, and last activity, and their conversations can be read.
4. **Given** an earlier session and an agent that supports resuming, **When** the user continues it, **Then** the agent picks up with the earlier context.
5. **Given** an earlier session and an agent that does not support resuming, **When** the user opens it, **Then** it is shown read-only with an option to start a new session in the same folder.
6. **Given** a session in history, **When** the user deletes it, **Then** it is removed from the list and its stored conversation is erased.

---

### User Story 7 - Switch modes and models, and use agent commands (Priority: P7)

Where an agent offers operating modes, a choice of models, or its own commands, the end user can pick the mode and model from the session and invoke commands by typing a slash and choosing from the offered list.

**Why this priority**: These are power features that depend on what each agent offers. They improve daily use but the application is complete without them.

**Independent Test**: With an agent that offers modes, models, and commands, change each from the session and confirm the agent acknowledges the change; with an agent that offers none, confirm the controls are absent.

**Acceptance Scenarios**:

1. **Given** an agent that offers modes, **When** the user selects another mode, **Then** the session shows the new mode and the agent operates in it.
2. **Given** an agent that changes its own mode, **When** this happens, **Then** the displayed mode updates.
3. **Given** an agent that offers a choice of models, **When** the user selects one, **Then** subsequent turns use it and the session shows which is active.
4. **Given** an agent that offers commands, **When** the user types a slash in the message box, **Then** the available commands are listed with descriptions and can be selected.
5. **Given** an agent that offers none of these, **When** the session is open, **Then** the corresponding controls are not shown.

---

### User Story 8 - Use the application in English or Polish (Priority: P8)

The end user sees the interface in their system language when it is English or Polish, and in English otherwise. They can switch language in settings at any time.

**Why this priority**: Two complete languages are a stated goal and also prove the translation mechanism for adopters, but they do not block any other story.

**Independent Test**: Switch the language in settings and walk through every screen, confirming no text remains in the other language.

**Acceptance Scenarios**:

1. **Given** a system set to Polish, **When** the application starts for the first time, **Then** the interface is in Polish.
2. **Given** a system set to a language other than English or Polish, **When** the application starts for the first time, **Then** the interface is in English.
3. **Given** any screen, **When** the user changes the language in settings, **Then** all interface text switches without restarting and the choice is remembered.

---

### User Story 9 - Adopt the repository as a starting point (Priority: P9)

A template adopter clones the repository, runs it locally with a documented short sequence of steps, changes the name, look, and default agent list, and produces installers for the three desktop platforms through the repository's automated build.

**Why this priority**: This is the stated purpose of publishing the project, but it only has value once the application itself works.

**Independent Test**: A person who has not seen the repository follows the README from a fresh clone to a running application, then triggers a release build and receives installers for all three platforms.

**Acceptance Scenarios**:

1. **Given** a fresh clone and the documented prerequisites, **When** the adopter follows the README, **Then** the application runs locally.
2. **Given** the repository, **When** the adopter publishes a release, **Then** installers for macOS, Windows, and Linux are produced automatically and attached to that release.
3. **Given** installers that are not signed, **When** an end user reads the installation instructions, **Then** they explain the operating-system warning and how to proceed, and the documentation tells adopters where to add signing credentials.
4. **Given** the documentation, **When** the adopter wants to rename the product, add a language, change the default agents, or add a panel to the interface, **Then** each of these is described.

---

### User Story 10 - Apply organization policy (Priority: P10)

An organization administrator who distributes the application inside a company decides which agents employees may use, where agents may be installed from, and how permissive the approval modes may be. They express this once as an organization policy, either built into the company's own build of the application or placed on employees' machines with the company's usual device management, and every employee's application follows it. Employees see which settings are managed by their organization and cannot change them.

**Why this priority**: The project is intended to serve later as a company-wide harness. Policy only restricts features that the earlier stories deliver, so it comes last, but it is part of the first version so that the restrictions are designed in rather than bolted on.

**Independent Test**: Place a policy on a machine that allows a single agent, turns off custom agents, and permits only the always-ask mode; confirm the application offers exactly that and marks those settings as managed. Remove the policy and confirm the unrestricted behavior returns.

**Acceptance Scenarios**:

1. **Given** a policy that lists allowed agents, **When** an employee opens the agent list, **Then** only allowed agents can be installed or started, and any other agent present on the machine is shown as blocked by the organization.
2. **Given** a policy that names an organization registry, **When** the employee browses agents to install, **Then** the list comes from that registry and the public registry is not contacted.
3. **Given** a policy that turns off installation from any registry, **When** the employee opens the agent list, **Then** no install option is offered and only agents already present and allowed are usable.
4. **Given** a policy that turns off custom agents, **When** the employee opens agent settings, **Then** adding a custom agent is unavailable and previously saved custom agents cannot be started.
5. **Given** a policy that limits the permission modes and sets the default, **When** the employee starts a session, **Then** it starts in the policy's default mode and only the permitted modes can be selected.
6. **Given** any setting controlled by policy, **When** the employee views it, **Then** it is marked as managed by the organization and cannot be changed.
7. **Given** a policy that is present but cannot be read or is invalid, **When** the application starts, **Then** it explains the problem, does not start agent sessions, and still lets the employee read past conversations.
8. **Given** no policy, **When** the application starts, **Then** it behaves as described in the other stories with no restrictions.

---

### User Story 11 - Define the factory in the repository (Priority: P11)

A team keeps a factory definition in its project repository, versioned with the code. It states which agents the project uses, the default permission mode, reusable task templates, and the criteria by which agent work on this project is judged. When a team member starts a session in that folder, the application offers to apply the definition, so that everyone on the project works with the same setup.

**Why this priority**: Defining the setup in code is the first step from individuals prompting agents towards an organizational software factory: the setup becomes reviewable, shared, and repeatable. It depends on agents, permissions, and policy already working.

**Independent Test**: Put a factory definition in a folder, start a session there, confirm the application asks whether to trust it, and after trusting confirm the declared agents, default mode, and task templates are in effect; confirm an untrusted folder changes nothing.

**Acceptance Scenarios**:

1. **Given** a folder containing a factory definition that the user has not yet trusted, **When** the user starts a session there, **Then** the application shows what the definition would change and applies nothing until the user trusts it.
2. **Given** a trusted definition, **When** the user starts a session in that folder, **Then** the declared agent, permission mode, and task templates are preselected and available.
3. **Given** a trusted definition whose content has changed since it was trusted, **When** the user starts a session, **Then** the application shows the changes and asks again before applying them.
4. **Given** a definition that asks for something organization policy forbids, **When** it is applied, **Then** the policy wins and the user is told which parts were not applied.
5. **Given** a definition that declares an agent by its start command, **When** it is applied, **Then** that agent is not started until the user has confirmed the command, as for any custom agent.
6. **Given** a task template from the definition, **When** the user selects it, **Then** its text is placed in the message box, with any blanks for the user to fill in, and is sent only when the user sends it.
7. **Given** a definition that is invalid, **When** the user starts a session, **Then** the application explains the problem and continues with the user's own settings.

---

### User Story 12 - Keep a record of every run and judge its quality (Priority: P12)

Every piece of work an agent does is kept as a run record: what was asked, which agent, model, and mode did it, what actions it took, what was approved and by whom or by which rule, how long it took, what it cost where the agent reports that, and how it ended. The user can browse and filter runs, rate each one, ask an agent to judge a run against the project's criteria, and export the records in an open format for use elsewhere.

**Why this priority**: An organization cannot improve what it cannot see. Run records and scores are the raw material for the later stages of a software factory: comparing agents and models on the organization's own work and improving the setup over time. It comes last because it observes everything the earlier stories do.

**Independent Test**: Complete three tasks with two different agents, then find all three in the run list, rate one, have one judged against the project's criteria, and export the records; confirm the export contains the same information the application shows.

**Acceptance Scenarios**:

1. **Given** an agent turn that has finished, been cancelled, or failed, **When** the user opens the run list, **Then** a run record exists for it with its request, agent, model, mode, folder, duration, actions, approvals, and outcome.
2. **Given** an agent that reports usage or cost, **When** a run completes, **Then** the record includes it; where the agent does not report it, the record says it is unknown.
3. **Given** many runs, **When** the user filters by agent, model, folder, outcome, date, or score, **Then** only matching runs are listed, with totals for count, duration, and reported cost.
4. **Given** a run, **When** the user rates it and adds a note, **Then** the rating and note are stored with the run and can be changed later.
5. **Given** a run in a folder whose factory definition declares judging criteria, **When** the user asks for it to be judged, **Then** an agent the user chooses evaluates the run against those criteria and the resulting score and reasoning are stored with the run, marked as produced by that agent.
6. **Given** selected runs, **When** the user exports them, **Then** a file in a documented open format is produced on the user's machine, and nothing is sent anywhere.
7. **Given** a session that the user deletes, **When** it is deleted, **Then** the user is asked whether its run records are deleted with it or kept without the conversation text.

---

### Edge Cases

- The agent announces a protocol version the application does not support: the session is refused with an explanation instead of failing mid-conversation.
- The working folder is deleted, moved, or becomes unreadable while a session is open: the session is marked as failed with an explanation, the conversation is kept, no further file or command operation is attempted, and the user can start a new session elsewhere.
- The agent asks to read or write a file outside the session's working folder.
- The user edits a file by hand while the agent is changing the same file: when the agent writes through the application to a file that changed since the agent last read it through the application, the user is asked before it is overwritten.
- An approval request arrives for a session the user is not looking at, or the user closes the application while a request is pending.
- The same agent is used by several sessions at once.
- The agent sends content the application cannot display (an unknown content type or a very large image): it is represented by a placeholder and the conversation continues.
- A very long conversation: scrolling and typing remain responsive.
- The registry lists an agent that has no build for the user's operating system.
- An agent installed by the application becomes outdated relative to the registry.
- A custom start command points to something that is not an ACP agent or does not start.
- The application is closed while an agent turn is in progress.
- The user's subscription limit is reached mid-turn: the agent's message about it is shown as received.
- A policy change removes an agent that has past sessions: those sessions stay readable but cannot be continued.
- A policy allows an agent that is not installed while installation is turned off: the agent is shown as allowed but unavailable, with a note to contact the administrator.
- A policy built into the application and a policy on the machine disagree.
- A policy's default permission mode is not among the modes it permits: the policy is treated as invalid.
- The policy changes while the application is running.
- A freshly cloned repository contains a factory definition designed to run a harmful command or to loosen approvals.
- A factory definition and the user's own settings disagree on a default.
- A nested folder and its parent both contain a factory definition.
- A judging run is itself an agent run: it is recorded, but is not judged in turn automatically.
- The application quits in the middle of a run: the record is kept and marked as interrupted.
- Run records grow very large over months of use: the run list stays responsive through paging, and the user removes old records by filter; there is no automatic retention limit in this version.

## Requirements *(mandatory)*

### Functional Requirements

**Conversation**

- **FR-001**: Users MUST be able to start a session by choosing an agent and a working folder.
- **FR-002**: The system MUST display agent output incrementally as it arrives, including the agent's reasoning text where the agent provides it, visually distinct from its answer.
- **FR-003**: Users MUST be able to cancel an agent turn in progress, after which the session MUST accept a new message.
- **FR-004**: Users MUST be able to attach files from the working folder and images to a message when the agent supports them.
- **FR-005**: The system MUST render formatted text in agent messages (headings, lists, code blocks, links) and MUST let users copy message text and code blocks.
- **FR-006**: The system MUST show a clear, recoverable error state when an agent fails to start, stops responding, or exits, and MUST preserve the conversation up to that point.

**Visibility of agent work**

- **FR-007**: The system MUST show each agent action as a distinct item with its title, kind, status, and result, updated as the action progresses.
- **FR-008**: The system MUST show file changes reported by the agent as a comparison of old and new content with the file's path.
- **FR-009**: The system MUST display the agent's plan and keep step statuses current.
- **FR-010**: Users MUST be able to open a file referenced by an agent action.

**Permissions and safety**

- **FR-011**: The system MUST present every approval request with the action concerned and the one-time choices the agent offers, and MUST return the user's choice to the agent. Standing-permission choices offered by an agent MUST NOT be shown or returned; where the permission mode allows remembering, the application offers its own "remember for this session" choice instead.
- **FR-012**: The system MUST offer three permission modes: always ask; ask with decisions that can be remembered for the session; and automatic approval of read-only actions with prompts for everything else.
- **FR-013**: The system MUST default to the always-ask mode and MUST let users change the mode at any time, per session.
- **FR-014**: The system MUST record automatically approved actions in the conversation and MUST let users review and revoke remembered decisions. Remembered decisions MUST be kept and applied by the application, never passed to the agent as standing permission.
- **FR-015**: File operations the application performs on behalf of an agent MUST be limited to the session's working folder unless the user explicitly approves an exception for that request. Wherever the application describes this limit (first-start confirmation, permission settings), it MUST state that it covers only operations the agent performs through the application, not actions an agent takes with its own tools.
- **FR-079**: When an agent writes through the application to a file that has changed since the agent last read it through the application in that session, the system MUST ask the user before overwriting it.
- **FR-016**: The system MUST NOT request, store, or transmit model-provider keys or subscription credentials; login is performed only through the agent's own login flow.
- **FR-017**: When an agent reports that login is required, the system MUST tell the user so and present the login methods the agent declares.

**Agents**

- **FR-018**: The system MUST detect supported agents already installed on the user's machine and list them as ready.
- **FR-019**: The system MUST list agents from the public ACP registry and MUST indicate which are installable on the user's operating system.
- **FR-020**: Users MUST be able to install a registry agent after a confirmation that states what is installed and its source, and MUST be able to remove agents the application installed.
- **FR-021**: Users MUST be able to add, edit, and remove custom agents defined by a start command, arguments, and environment settings.
- **FR-022**: The system MUST remain fully usable with installed and custom agents when the registry cannot be reached.
- **FR-023**: The system MUST work with any agent that completes the standard ACP handshake, and MUST enable optional features only when the agent declares support for them.
- **FR-024**: The system MUST indicate when a newer version of an application-installed agent is available and let the user update it.

**Terminal**

- **FR-025**: The system MUST run commands requested by an agent in the session's working folder, subject to the active permission mode, and MUST show the command, live output, and exit result.
- **FR-026**: Users MUST be able to stop a running command; the system MUST terminate a session's commands when the session ends or the application quits.
- **FR-027**: The system MUST limit retained command output and tell the user when output has been truncated.

**Sessions and history**

- **FR-028**: Users MUST be able to keep several sessions open at once, each with its own agent and working folder, and switch between them without interrupting agents.
- **FR-029**: The system MUST signal when a session that is not in view needs approval, has finished, or has failed.
- **FR-030**: The system MUST store conversations locally on the user's machine and list past sessions with title, agent, working folder, and last activity after restart.
- **FR-031**: Users MUST be able to continue a past session when its agent supports resuming, and MUST otherwise be able to read it and start a new session in the same folder.
- **FR-032**: Users MUST be able to rename and delete sessions; deleting MUST erase the stored conversation.

**Modes, models, commands**

- **FR-033**: The system MUST show the modes an agent offers, let users switch between them, and reflect mode changes initiated by the agent.
- **FR-034**: The system MUST show the models an agent offers and let users switch between them.
- **FR-035**: The system MUST list the commands an agent offers when the user types a slash, with descriptions, and send the selected command to the agent.

**Language**

- **FR-036**: The system MUST provide its entire interface in English and Polish, select the language from the system setting on first launch (English as fallback), and let users switch without restarting.
- **FR-037**: Content produced by the agent MUST be shown as received and MUST NOT be translated by the application.

**Template and distribution**

- **FR-038**: The repository MUST include documentation that takes a new adopter from a fresh clone to a running application and to building installers.
- **FR-039**: The repository MUST include an automated build that produces installers for macOS, Windows, and Linux and attaches them to a published release.
- **FR-040**: The documentation MUST describe how to rename the product, add a language, change the default agent list, add an interface panel, and add signing credentials.
- **FR-041**: The repository MUST be published under the MIT license.
- **FR-043**: The product name (Ster by default), icon, and colors MUST be changeable in a single place, and every screen, window title, and installer MUST take them from there.
- **FR-042**: The application MUST function without any server operated by the project. Its own network use is limited to: the agent registry in effect (the public one, or the one named by organization policy) and resources that registry hosts; downloads of agents the user chose to install; and downloads of verified supporting runtimes such an agent needs, named in the same install confirmation.

**Organization policy**

- **FR-044**: The system MUST accept an organization policy from two sources: defaults built into a distributed build, and a managed location on the machine that ordinary users cannot modify. Where both set the same item, the machine policy MUST take precedence.
- **FR-045**: A policy MUST be able to restrict which agents may be installed and started. Agents outside the allowed set MUST NOT be startable and MUST be shown as blocked by the organization.
- **FR-046**: A policy MUST be able to replace the public agent registry with a registry specified by the organization, or to turn off installation from any registry. When a registry is replaced or turned off, the system MUST NOT contact the public registry. This covers every registry-hosted resource, including agent icons.
- **FR-047**: A policy MUST be able to turn off custom agents, which prevents adding them and starting saved ones.
- **FR-048**: A policy MUST be able to limit which permission modes are selectable and set the default mode.
- **FR-049**: The system MUST mark every setting controlled by policy as managed by the organization and MUST prevent the user from changing it.
- **FR-050**: When a policy is present but unreadable or invalid, the system MUST explain the problem, MUST NOT start agent sessions, and MUST keep past conversations readable.
- **FR-051**: When no policy is present, the system MUST apply no restrictions.
- **FR-052**: The system MUST read policy at application start and apply it to every session started afterwards; a change made while the application is running takes effect at the next start.
- **FR-053**: The documentation MUST describe every policy item, the two ways of delivering a policy, and an example for a company that allows a fixed set of agents.

**Security**

- **FR-054**: The system MUST treat everything received from an agent as untrusted: agent content MUST NOT be able to run code in the application, load remote resources, or trigger actions without a user step.
- **FR-055**: Links in agent content MUST open outside the application, only after the user selects them, with the destination visible beforehand.
- **FR-056**: The system MUST verify a downloaded agent against the integrity information its registry provides before the agent is first started, and MUST refuse to start an agent that fails verification.
- **FR-077**: When the registry provides no integrity information for an agent, the system MUST say so in the install confirmation, MUST remember what was installed, and MUST refuse to start the agent if its installed program later changes outside an update the user confirmed.
- **FR-078**: A policy MUST be able to forbid installing agents that lack integrity information, and to forbid agents that need to run their own setup steps during installation.
- **FR-057**: Stored conversations and settings MUST be readable only by the user's own account on the machine, and the application's logs MUST NOT contain credentials.
- **FR-058**: Before the first start of any agent, the system MUST show the user what program will be run and where it came from.

**Extensibility**

- **FR-059**: Adopters MUST be able to add an interface panel, an agent source, a permission mode, a policy item, and a language through documented extension points, without modifying the parts of the application that handle agent communication.
- **FR-060**: The system MUST expose session activity (messages, agent actions, approvals, command runs, outcomes) to extensions as a stream of structured events, so that adopters can add their own recording, reporting, or automation.
- **FR-061**: The parts of the application that handle agents, sessions, permissions, and policy MUST be usable without the graphical interface, so that an organization can later drive them from another front end or from automation.
- **FR-062**: Each release MUST state any change that breaks an existing extension point.

**Factory definition**

- **FR-063**: The system MUST recognize a factory definition stored in a working folder and versioned with the project, which can declare: the agents the project uses, the default agent, the default permission mode, task templates, and judging criteria.
- **FR-064**: The system MUST NOT apply a factory definition until the user has explicitly trusted it for that folder, after seeing what it would change, and MUST ask again when the trusted definition changes.
- **FR-065**: A factory definition MUST NOT override organization policy and MUST NOT approve agent actions; an agent it declares by start command MUST be confirmed by the user before first start.
- **FR-066**: Where a factory definition and the user's settings set the same default, the definition's value MUST be preselected and the user MUST remain able to choose otherwise within what policy permits.
- **FR-067**: Users MUST be able to pick a task template from the definition, complete its blanks, and send it as a message.
- **FR-068**: When several definitions apply to a folder, the one nearest to the session's working folder MUST be used.
- **FR-069**: The documentation MUST describe every item of the factory definition with a complete example.

**Run records and scoring**

- **FR-070**: The system MUST keep a run record for every agent turn, containing the request, agent and its version, model, mode, permission mode, working folder, start and end time, actions taken, approvals with how each was decided, commands run, reported usage and cost, and the outcome (completed, cancelled, failed, interrupted).
- **FR-071**: Users MUST be able to browse runs, filter them by agent, model, folder, outcome, date, user rating, and agent score (the two kinds of score are filtered separately and never mixed), and see totals for the filtered set.
- **FR-072**: Users MUST be able to rate a run and attach a note, and to change both later.
- **FR-073**: Users MUST be able to have a run judged on demand by an agent of their choice against the judging criteria of the folder's factory definition; the score and its reasoning MUST be stored with the run and marked with the agent and model that produced them.
- **FR-074**: Judging MUST happen only on the user's request, MUST be subject to organization policy for the judging agent, and MUST NOT modify files or run commands.
- **FR-075**: Users MUST be able to export run records in a documented open format to a file on their machine; the system MUST NOT transmit run records anywhere.
- **FR-076**: Run records MUST be stored locally with the same protection as conversations, and users MUST be able to delete them individually, by filter, or together with their session.

### Key Entities

- **Agent**: A coding agent the application can start. Has a name, version, origin (found on the machine, installed from the registry, or custom), how it is started, its readiness (ready, needs login, not installed, unavailable on this system), and the optional features it declares.
- **Registry entry**: A description of an agent published in the public ACP registry: identity, description, available versions, and the operating systems it supports.
- **Session**: One conversation between the user and one agent in one working folder. Has a title, status (idle, working, waiting for approval, ended, failed), current mode and model, permission mode, and an ordered list of conversation items.
- **Conversation item**: A unit shown in a session: a user message, agent message, agent reasoning, agent action, plan, approval request, or command run.
- **Agent action**: Something the agent does, with a kind (read, edit, run, search, other), status, affected locations, and result, which may include a file change.
- **File change**: A proposed or applied modification to one file, with its path and old and new content.
- **Plan**: The agent's ordered list of steps for the current task, each with a status.
- **Approval request**: A question from the agent about one action, with the offered choices and the outcome (chosen by the user, decided by a remembered rule, or cancelled).
- **Permission rule**: A decision the user chose to remember for a session, applying to one kind of action.
- **Command run**: A command started for the agent, with its text, working folder, output, and exit result.
- **Organization policy**: A set of restrictions decided by an organization: the allowed agents, the agent source (public registry, an organization registry, or none), whether custom agents are allowed, the selectable permission modes, and the default mode. Has an origin (built into the build, or placed on the machine).
- **Factory definition**: A description, kept in a project folder and versioned with the code, of how agents are used on that project: agents, defaults, task templates, and judging criteria. Has a trust state per folder (untrusted, trusted, changed since trusted).
- **Task template**: A named, reusable request text with optional blanks, defined in a factory definition.
- **Run record**: The durable account of one agent turn: what was asked, by which agent, model, and mode, what happened, how long it took, what it cost where known, and how it ended. Belongs to a session and may outlive its conversation text.
- **Score**: A judgement of a run: either a rating and note from the user, or a score with reasoning produced by a judging agent against the project's criteria.
- **Settings**: The user's preferences: interface language, default permission mode, default agent, and the list of custom agents.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new end user with one logged-in agent goes from first launch to the first agent reply in under 2 minutes.
- **SC-002**: The first visible agent output appears within 1 second of the agent producing it, and the interface stays responsive to input during streaming.
- **SC-003**: At least three different agents from the registry complete the same reference task (read a file, edit it, run a command) in the application without any agent-specific adjustment.
- **SC-004**: 100% of approval requests are either answered by the user or resolved by a rule visible to the user; none is approved outside the selected permission mode.
- **SC-005**: Installing an agent from the registry takes one confirmation and completes without the user leaving the application or using a command line.
- **SC-006**: A user can run 5 sessions at the same time and switch between them in under 1 second each.
- **SC-007**: 100% of sessions present before a restart are listed and readable afterwards.
- **SC-008**: A conversation with 1,000 items scrolls and accepts typing without noticeable delay.
- **SC-009**: 100% of interface text is available in both English and Polish, with no untranslated text on any screen.
- **SC-010**: An adopter unfamiliar with the repository gets the application running from a fresh clone in under 10 minutes by following the README.
- **SC-011**: Publishing a release yields installers for all three platforms in under 30 minutes with no manual build steps.
- **SC-012**: The application never asks the user for a model-provider key or password, and no conversation content leaves the machine except to the agent the user selected.
- **SC-013**: An administrator restricts a machine to one allowed agent and one permission mode by delivering a single policy, without rebuilding the application, and 100% of attempts to start any other agent or select any other mode are refused.
- **SC-014**: Every setting controlled by policy is identifiable as managed by the organization from the screen where it appears.
- **SC-015**: An adopter adds a new interface panel that reacts to session activity by following the documentation, in under 1 hour, without editing the parts of the application that handle agent communication.
- **SC-016**: No content sent by an agent can cause the application to run code or open an external destination without a user action, verified by a dedicated set of hostile-content tests that all pass.
- **SC-017**: A team member who opens a project with a trusted factory definition starts a correctly configured session with no manual setup beyond confirming trust once.
- **SC-018**: No factory definition takes effect before the user has trusted it, and none can exceed organization policy, verified by tests with hostile definitions that all pass.
- **SC-019**: 100% of agent turns, including cancelled, failed, and interrupted ones, have a run record.
- **SC-020**: A user answers "how many runs did each agent complete in this project last week, and how were they rated" from the run list in under 1 minute.
- **SC-021**: Exported run records can be read by a third-party tool using only the published format description.

## Assumptions

- End users already have a subscription with the agent's vendor and can complete that vendor's login on their machine. Whether a given subscription may be used with a third-party client is governed by the vendor's terms; adopters are responsible for checking them, and the README says so.
- Organization policy can only restrict what the application offers; it never grants an agent more than an unrestricted installation would.
- Organization policy is an administrative control, not protection against a user who has administrator rights on their own machine; it relies on the operating system to keep the managed location read-only for ordinary users.
- There is no central management service in this version: no remote policy delivery by the application itself, no reporting of usage to the organization, and no audit upload. Organizations deliver policy with their existing device-management tools or by distributing their own build.
- Organizations that run their own agent registry publish it in the same format as the public registry.
- This version is the desktop stage of a larger goal: an organizational software factory. It delivers the foundations that work on one machine (factory definition in the repository, run records, scoring on request, a core usable without the interface, session events for extensions). The cloud stage is a separate, later feature and is out of scope here: unattended runs in isolated cloud environments, triggers from issues or pull requests, a self-improvement loop that proposes changes to the factory, and benchmarks built from past tasks to compare agents and models.
- Unattended and cloud runs will need an authentication arrangement suited to automation, which personal subscriptions are not; that decision belongs to the cloud stage.
- The run record and factory definition formats are designed so the cloud stage can reuse them unchanged.
- Cost and usage are recorded only as reported by the agent; the application does not estimate them.
- Judging by an agent uses the user's own agent and subscription, like any other session.
- The working-folder limit, approvals, and live command output cover what an agent does through the application. Agents that edit files or run commands with their own built-in tools are supervised only as far as they ask for approval; the application cannot confine them. The documentation and the application say so.
- On macOS the application carries only a local, ad hoc signature (required to run on Apple silicon) and is not notarized, so users see the system warning on first launch.
- Agents run locally on the user's machine. Connecting to agents hosted remotely is out of scope for this version.
- "Supported agents already installed" means agents known from the registry that can be found on the machine in their standard locations; anything else is added as a custom agent.
- On-demand installation covers the distribution forms the registry describes for the user's operating system. An agent with no installable form for that system is listed as unavailable there.
- Session history is stored only on the local machine. There is no account, sync, or sharing between machines.
- A "read-only action" is one the agent itself classifies as reading or searching. Actions the agent does not classify are treated as needing approval.
- Remembered permission decisions last for one session and are not carried into other sessions.
- Installers are unsigned in this version. Automatic updates of the application itself are out of scope until signing is configured; users update by installing a newer release.
- The application does not include its own code editor. Opening a file hands it to the user's default application for that file type.
- The interface is designed for desktop screens; mobile and web-hosted variants are out of scope.
- Interface text, documentation, and code are in English, with Polish as the second interface language. Documentation is not translated.
- Accessibility follows common desktop expectations: full keyboard operation of the main flows and readable contrast in light and dark appearance.
