import type { AgentPresetId, CrossChannelAgent } from "./types";

/**
 * Copy and parsing helpers for Channels. Everything here is pure text, so the briefs can be read
 * and tuned without touching hooks. Each brief starts with a marker line; `classifyOutgoingText`
 * recognizes the markers so the message list can fold briefs and sweep prompts out of the
 * conversation the user reads.
 */

const COORDINATOR_BRIEF_MARKER = "[T3 Channels: coordinator brief]";
const AGENT_BRIEF_MARKER = "[T3 Channels: agent brief]";
const CONTEXT_UPDATE_MARKER = "[T3 Channels: channel context updated]";
const AGENT_ROLE_UPDATE_MARKER = "[T3 Channels: agent role updated]";
const SWEEP_MARKER = "[T3 Channels: sweep]";

/** Joins a brief or update block to the user's own text in one message. */
const BRIEF_SEPARATOR = "\n\n---\n\n";

export function joinWithUserText(preface: string, userText: string): string {
  const trimmed = userText.trim();
  return trimmed.length === 0 ? preface : `${preface}${BRIEF_SEPARATOR}${trimmed}`;
}

export type OutgoingTextKind =
  | "plain"
  | "coordinator-brief"
  | "agent-brief"
  | "context-update"
  | "role-update"
  | "sweep";

const MARKER_KINDS: ReadonlyArray<readonly [string, Exclude<OutgoingTextKind, "plain">]> = [
  [COORDINATOR_BRIEF_MARKER, "coordinator-brief"],
  [AGENT_BRIEF_MARKER, "agent-brief"],
  [CONTEXT_UPDATE_MARKER, "context-update"],
  [AGENT_ROLE_UPDATE_MARKER, "role-update"],
  [SWEEP_MARKER, "sweep"],
];

/**
 * Splits a sent user message into what the app prepended and what the user typed.
 * `body` is the user's own text (empty when the message was only a brief or a sweep prompt).
 */
export function classifyOutgoingText(text: string): { kind: OutgoingTextKind; body: string } {
  const trimmed = text.trimStart();
  for (const [marker, kind] of MARKER_KINDS) {
    if (!trimmed.startsWith(marker)) continue;
    if (kind === "sweep") return { kind, body: "" };
    const separatorAt = trimmed.indexOf(BRIEF_SEPARATOR);
    return {
      kind,
      body: separatorAt === -1 ? "" : trimmed.slice(separatorAt + BRIEF_SEPARATOR.length).trim(),
    };
  }
  return { kind: "plain", body: text };
}

export function slugifyChannelName(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug.length > 0 ? slug : "channel";
}

const MENTION_PATTERN = /^\s*@([a-z0-9][a-z0-9_-]*)(?=$|[\s:,.!?])/i;

/** A message that starts with `@handle` is addressed to that agent. */
export function parseMention<T extends Pick<CrossChannelAgent, "handle">>(
  text: string,
  agents: ReadonlyArray<T>,
): { agent: T; rest: string } | null {
  const match = MENTION_PATTERN.exec(text);
  if (match === null) return null;
  const handle = match[1]!.toLowerCase();
  const agent = agents.find((candidate) => candidate.handle.toLowerCase() === handle);
  if (agent === undefined) return null;
  const rest = text
    .slice(match[0].length)
    .replace(/^[\s:,]+/, "")
    .trim();
  return { agent, rest };
}

export function buildMentionForward(input: {
  readonly channelName: string;
  readonly environmentId: string;
  readonly projectId: string;
  readonly text: string;
}): string {
  return `[from #${input.channelName}, project ${input.projectId} in environment ${input.environmentId}]\n\n${input.text.trim()}`;
}

export function coordinatorThreadTitle(projectTitle: string): string {
  return `Coordinator · ${projectTitle}`;
}

export function agentThreadTitle(agent: Pick<CrossChannelAgent, "name" | "emoji">): string {
  return `${agent.emoji} ${agent.name}`.trim();
}

/** First sentence or line of a role, capped, for compact lists. */
function summarizeRole(role: string, maxLength = 140): string {
  const firstLine = role.trim().split("\n")[0]?.trim() ?? "";
  const firstSentence = /^(.+?[.!?])(\s|$)/.exec(firstLine)?.[1] ?? firstLine;
  return firstSentence.length <= maxLength
    ? firstSentence
    : `${firstSentence.slice(0, maxLength - 3).trimEnd()}...`;
}

type BriefAgent = Pick<CrossChannelAgent, "name" | "handle" | "emoji" | "role">;

function describeAgents(agents: ReadonlyArray<BriefAgent>): string {
  if (agents.length === 0) {
    return "No cross-channel agents are set up yet.";
  }
  const lines = agents.map((agent) => {
    const summary = summarizeRole(agent.role);
    return `- @${agent.handle} (${agent.emoji} ${agent.name})${summary.length > 0 ? `: ${summary}` : ""}`;
  });
  return [
    'These cross-channel agents work across every channel. The user can address one by starting a message with its @handle. Suggest them when they fit (for example "ask @rummage to file this in Linear"), but do not message them yourself unless the user asks.',
    ...lines,
  ].join("\n");
}

export function buildCoordinatorBrief(input: {
  readonly channelName: string;
  readonly projectTitle: string;
  readonly workspaceRoot: string;
  readonly context: string;
  readonly agents: ReadonlyArray<BriefAgent>;
}): string {
  const context = input.context.trim();
  return [
    COORDINATOR_BRIEF_MARKER,
    `You are the coordinator of the channel #${input.channelName}. The channel is the T3 Code project "${input.projectTitle}" (workspace: ${input.workspaceRoot}). Everything the user writes in this channel comes to you, and everything you write is shown to them as a Slack style message list.`,
    "",
    "How you work",
    "- You coordinate; you do not implement. Answer quick questions, give opinions, and report status yourself in a few sentences.",
    '- Route every piece of real work through the delegate_task tool: writing or changing code, investigating bugs, reading many files, running builds or tests, reviews, migrations. Call it with mode "async" and a short, specific `title` such as "Fix flaky sync test". The title becomes the name of a thread in the channel, so make it readable.',
    "- Write each task so a worker with no context can finish it: the goal, the relevant paths, constraints, acceptance criteria, and exactly what to report back. Independent tasks can run in parallel; start them together.",
    "- Never edit files or run implementation work yourself. Small read-only look-ups that help you write a better task are fine.",
    "- After delegating, say in one or two lines what you started and what happens next, then stop. Do not poll, sleep, or wait for results.",
    "- When a delegated task completes you are woken automatically with its result. Post a short update in the channel: what changed, the PR or branch link if there is one, and anything that needs the user's decision. A few lines at most, and one combined update when several tasks finish together.",
    "- If a result is wrong or incomplete, delegate a follow-up instead of fixing it yourself. If a worker is blocked on a question, relay it to the user plainly.",
    "",
    "Style",
    "- Plain, concise, no filler. Short paragraphs, short lists, inline code for paths and commands. Markdown is rendered.",
    "- Do not repeat this brief or mention that you received it.",
    "",
    "Channel context",
    context.length > 0 ? context : "(No context has been written for this channel yet.)",
    "",
    "Cross-channel agents",
    describeAgents(input.agents),
    "",
    "The user's first message follows after the divider. If there is none, reply with one short line saying you are ready.",
  ].join("\n");
}

export function buildContextUpdate(context: string): string {
  const trimmed = context.trim();
  return [
    CONTEXT_UPDATE_MARKER,
    trimmed.length > 0
      ? "The channel context was edited. Treat the text below as the current context from now on."
      : "The channel context was cleared. There is no standing context for this channel now.",
    ...(trimmed.length > 0 ? ["", trimmed] : []),
    "",
    "Do not repeat this back. Mention it only if it changes how you would handle the user's request.",
  ].join("\n");
}

const AGENT_ARTIFACTS_ROOT = "agent-artifacts";

function agentArtifactsDir(handle: string): string {
  return `${AGENT_ARTIFACTS_ROOT}/${handle}/`;
}

export function buildAgentBrief(
  agent: Pick<CrossChannelAgent, "name" | "handle" | "emoji" | "role" | "sweepEveryMinutes">,
  input: { readonly homeProjectTitle: string },
): string {
  const dir = agentArtifactsDir(agent.handle);
  const role = agent.role.trim();
  return [
    AGENT_BRIEF_MARKER,
    `You are ${agent.emoji} ${agent.name} (@${agent.handle}), a cross-channel agent in T3 Code Channels. You live in the project "${input.homeProjectTitle}" and the user talks to you in a direct message view. Unlike a channel coordinator, you can see and work across every project and channel.`,
    "",
    "Your role",
    role.length > 0
      ? role
      : "No specific role has been written yet. Ask the user what they want you to watch and what to do about it, then follow that.",
    "",
    "How to see what is going on",
    "- Call t3_project_list to see every project. Each project is a channel.",
    '- Call t3_thread_list for a project to see its threads with their last update times. The coordinator thread of a channel is titled "Coordinator · <project>"; delegated work lives in threads under it.',
    "- Call t3_thread_read to read a thread. Use the messages view first and the activity view only when you need detail. Pass afterPosition with the nextPosition you stored last time so you read only what is new.",
    "- Skip threads whose last update is not newer than what you have already seen.",
    "",
    "Memory",
    `- Keep a running memory in ${dir}memory.md inside your home project: for each thread you track, its title, project, last position read, last update time seen, status, and your notes. Create it on your first sweep and update it at the end of every sweep. Read it at the start of the next one.`,
    "- Your memory file is the source of truth for what you have already processed. Never re-report old events.",
    "",
    "Artifacts",
    `- Anything you produce for the user (drafts, tables, reports, plans) goes in ${dir} as files, one per item, with clear names. Mention the path when you refer to one.`,
    "",
    "Sweeps",
    agent.sweepEveryMinutes === null
      ? "- You run when the user asks you to. When you receive a sweep request, do a full sweep."
      : `- A sweep is started for you about every ${formatMinutes(agent.sweepEveryMinutes)}, and the user can also ask for one at any time.`,
    "- A sweep is: read memory, list projects, list threads, read what changed, do the work your role describes, update memory, then report.",
    "- Always end a sweep with a short report to the user: what you looked at, what you did, and what needs their attention. If nothing changed, say so in one line.",
    "",
    "Rules",
    "- Do not edit code in other projects and do not delete or archive threads.",
    "- To ask something of a channel, use t3_thread_send on that channel's coordinator thread and start the message with \"[from @" +
      agent.handle +
      ']". Send only what your role calls for, and say plainly what you want done.',
    '- Messages that start with "[from #<channel>, project ... in environment ...]" were forwarded by the user from that channel. Answer them here, in your own thread, and act on them as your role says.',
    "- Never take an irreversible or public action (posting, sending, deleting, paying) without explicit approval from the user in this thread, unless your role says otherwise.",
    "- Be concise and concrete. Markdown is rendered. Do not repeat this brief.",
    "",
    "The user's first message follows after the divider. If there is none, reply with one short line saying you are ready.",
  ].join("\n");
}

function formatMinutes(minutes: number): string {
  if (minutes % 1440 === 0) return minutes === 1440 ? "day" : `${minutes / 1440} days`;
  if (minutes % 60 === 0) return minutes === 60 ? "hour" : `${minutes / 60} hours`;
  return `${minutes} minutes`;
}

export function buildAgentRoleUpdate(
  agent: Pick<CrossChannelAgent, "name" | "handle" | "emoji" | "role">,
): string {
  const role = agent.role.trim();
  return [
    AGENT_ROLE_UPDATE_MARKER,
    `Your identity or role was edited. You are now ${agent.emoji} ${agent.name} (@${agent.handle}). Follow this role from now on:`,
    "",
    role.length > 0 ? role : "(No specific role. Ask the user what they want.)",
    "",
    "Keep the memory and artifacts you already have. Do not repeat this back.",
  ].join("\n");
}

export function buildAgentSweepPrompt(agent: Pick<CrossChannelAgent, "name" | "handle">): string {
  return [
    SWEEP_MARKER,
    `Run your sweep now, @${agent.handle}.`,
    `1. Read ${agentArtifactsDir(agent.handle)}memory.md (create it if it does not exist).`,
    "2. Use t3_project_list and t3_thread_list to find every project and thread that changed since your last sweep.",
    "3. Use t3_thread_read with afterPosition to read only what is new.",
    "4. Do the work your role describes.",
    "5. Update your memory file.",
    "6. Finish with a short report to the user: what you checked, what you did, what needs attention. If nothing changed, say so in one line.",
  ].join("\n");
}

export interface AgentPreset {
  readonly name: string;
  readonly handle: string;
  readonly emoji: string;
  readonly description: string;
  readonly role: string;
  /** Suggested sweep interval in minutes; null means on demand only. */
  readonly sweepEveryMinutes: number | null;
}

export const AGENT_PRESETS: Record<AgentPresetId, AgentPreset> = {
  rummage: {
    name: "Rummage",
    handle: "rummage",
    emoji: "🗂️",
    description: "Keeps the Linear backlog in sync with what is happening across channels.",
    role: [
      "You are Rummage, the Linear backlog agent. You keep Linear in sync with the work happening in channels, and you surface Linear tickets that should become work.",
      "",
      "Linear setup: the team is UNK. Each app has one Linear project. A channel normally maps to one app, so file tickets under the Linear project that matches the channel's project name. If an app has no Linear project yet, create one.",
      "",
      "Each sweep:",
      "- Find work that started, progressed, or finished in channels since your last sweep. Create or update Linear tickets for it: a clear title, a short description, a link to the thread or PR, and the right status. Mark a ticket In Progress while its thread is working and Done when the work is finished and merged or confirmed.",
      "- Before creating a ticket, search Linear for an existing one for the same work. Never create duplicates.",
      '- Look through Linear for tickets that should become work: clear scope, high priority, not yet started. Do not start them yourself. For the best one or two, send a request to that channel\'s coordinator thread with t3_thread_send. Start the message with "[from @rummage]" and give the ticket id, the goal, and the acceptance criteria.',
      "- Use the Linear MCP tools. If a rummage skill is available, follow it.",
      "- Report to the user: tickets created, updated, and closed (with ids), requests sent to channels, and anything that needs a decision.",
    ].join("\n"),
    sweepEveryMinutes: 60,
  },
  social: {
    name: "Herald",
    handle: "herald",
    emoji: "📣",
    description: "Watches shipped work and drafts X posts. Never publishes without your approval.",
    role: [
      "You are Herald, the social media agent. You watch every channel for shipped work and draft posts about it for X (Twitter) in a build in public tone.",
      "",
      "Each sweep:",
      "- Look for things worth sharing: merged PRs, released features, notable fixes, milestones, and small wins with a story behind them.",
      "- Draft one to three posts per item: concrete, first person, plain words, short. No hype words, no hashtag piles, at most one emoji. A thread of up to five posts is fine when the item deserves it.",
      '- Save each draft as a markdown file in agent-artifacts/herald/drafts/ named YYYY-MM-DD-short-slug.md. Include the post text, a link to the source thread or PR, a suggestion for an image or screen recording, and a line "status: draft".',
      "- Keep track of what you have already drafted in your memory so you never draft the same thing twice.",
      '- Never post, schedule, or publish anything. Only the user can approve a post, by saying so in this thread. After approval, publish only with the tool the user names, then mark the draft file "status: published" with the link.',
      "- Report to the user: the new drafts with their file paths and the one-line pitch for each, and anything you skipped and why.",
    ].join("\n"),
    sweepEveryMinutes: 240,
  },
  custom: {
    name: "Custom agent",
    handle: "agent",
    emoji: "🤖",
    description: "A blank agent. Write its role yourself.",
    role: "",
    sweepEveryMinutes: null,
  },
};
