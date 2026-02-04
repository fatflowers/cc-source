import { Command } from "commander";

export function createProgram() {
  const program = new Command();
  program
    .name("claude")
    .description(
      "Claude Code - starts an interactive session by default, use -p/--print for\n" +
        "non-interactive output"
    )
    .argument("[prompt]", "Your prompt")
    .option("--add-dir <directories...>", "Additional directories to allow tool access to")
    .option("--agent <agent>", "Agent for the current session. Overrides the 'agent' setting.")
    .option(
      "--agents <json>",
      "JSON object defining custom agents (e.g. '{\"reviewer\": {\"description\": \"Reviews code\", \"prompt\": \"You are a code reviewer\"}}')"
    )
    .option(
      "--allow-dangerously-skip-permissions",
      "Enable bypassing all permission checks as an option, without it being enabled by default. Recommended only for sandboxes with no internet access."
    )
    .option(
      "--allowedTools, --allowed-tools <tools...>",
      "Comma or space-separated list of tool names to allow (e.g. \"Bash(git:*) Edit\")"
    )
    .option("--append-system-prompt <prompt>", "Append a system prompt to the default system prompt")
    .option("--betas <betas...>", "Beta headers to include in API requests (API key users only)")
    .option("--chrome", "Enable Claude in Chrome integration")
    .option("-c, --continue", "Continue the most recent conversation in the current directory")
    .option(
      "--dangerously-skip-permissions",
      "Bypass all permission checks. Recommended only for sandboxes with no internet access."
    )
    .option(
      "-d, --debug [filter]",
      "Enable debug mode with optional category filtering (e.g., \"api,hooks\" or \"!statsig,!file\")"
    )
    .option("--debug-file <path>", "Write debug logs to a specific file path (implicitly enables debug mode)")
    .option("--disable-slash-commands", "Disable all skills")
    .option(
      "--disallowedTools, --disallowed-tools <tools...>",
      "Comma or space-separated list of tool names to deny (e.g. \"Bash(git:*) Edit\")"
    )
    .option(
      "--fallback-model <model>",
      "Enable automatic fallback to specified model when default model is overloaded (only works with --print)"
    )
    .option(
      "--file <specs...>",
      "File resources to download at startup. Format: file_id:relative_path (e.g., --file file_abc:doc.txt file_def:img.png)"
    )
    .option(
      "--fork-session",
      "When resuming, create a new session ID instead of reusing the original (use with --resume or --continue)"
    )
    .option(
      "--from-pr [value]",
      "Resume a session linked to a PR by PR number/URL, or open interactive picker with optional search term"
    )
    .option("-h, --help", "Display help for command")
    .option("--ide", "Automatically connect to IDE on startup if exactly one valid IDE is available")
    .option(
      "--include-partial-messages",
      "Include partial message chunks as they arrive (only works with --print and --output-format=stream-json)"
    )
    .option(
      "--input-format <format>",
      "Input format (only works with --print): \"text\" (default), or \"stream-json\" (realtime streaming input)"
    )
    .option(
      "--json-schema <schema>",
      "JSON Schema for structured output validation. Example: {\"type\":\"object\",\"properties\":{\"name\":{\"type\":\"string\"}},\"required\":[\"name\"]}"
    )
    .option("--max-budget-usd <amount>", "Maximum dollar amount to spend on API calls (only works with --print)")
    .option("--mcp-config <configs...>", "Load MCP servers from JSON files or strings (space-separated)")
    .option("--mcp-debug", "[DEPRECATED. Use --debug instead] Enable MCP debug mode (shows MCP server errors)")
    .option(
      "--model <model>",
      "Model for the current session. Provide an alias for the latest model (e.g. 'sonnet' or 'opus') or a model's full name (e.g. 'claude-sonnet-4-5-20250929')."
    )
    .option("--no-chrome", "Disable Claude in Chrome integration")
    .option(
      "--no-session-persistence",
      "Disable session persistence - sessions will not be saved to disk and cannot be resumed (only works with --print)"
    )
    .option(
      "--output-format <format>",
      "Output format (only works with --print): \"text\" (default), \"json\" (single result), or \"stream-json\" (realtime streaming)"
    )
    .option(
      "--permission-mode <mode>",
      "Permission mode to use for the session (choices: \"acceptEdits\", \"bypassPermissions\", \"default\", \"delegate\", \"dontAsk\", \"plan\")"
    )
    .option("--plugin-dir <paths...>", "Load plugins from directories for this session only (repeatable)")
    .option(
      "-p, --print",
      "Print response and exit (useful for pipes). Note: The workspace trust dialog is skipped when Claude is run with the -p mode. Only use this flag in directories you trust."
    )
    .option(
      "--replay-user-messages",
      "Re-emit user messages from stdin back on stdout for acknowledgment (only works with --input-format=stream-json and --output-format=stream-json)"
    )
    .option(
      "-r, --resume [value]",
      "Resume a conversation by session ID, or open interactive picker with optional search term"
    )
    .option("--session-id <uuid>", "Use a specific session ID for the conversation (must be a valid UUID)")
    .option(
      "--setting-sources <sources>",
      "Comma-separated list of setting sources to load (user, project, local)."
    )
    .option("--settings <file-or-json>", "Path to a settings JSON file or a JSON string to load additional settings from")
    .option(
      "--strict-mcp-config",
      "Only use MCP servers from --mcp-config, ignoring all other MCP configurations"
    )
    .option("--system-prompt <prompt>", "System prompt to use for the session")
    .option(
      "--tools <tools...>",
      "Specify the list of available tools from the built-in set. Use \"\" to disable all tools, \"default\" to use all tools, or specify tool names (e.g. \"Bash,Edit,Read\")."
    )
    .option("--verbose", "Override verbose mode setting from config")
    .option("-v, --version", "Output the version number");

  program
    .command("doctor")
    .description("Check the health of your Claude Code auto-updater");
  program
    .command("install [target]")
    .description("Install Claude Code native build. Use [target] to specify version (stable, latest, or specific version)");
  program.command("mcp").description("Configure and manage MCP servers");
  program.command("plugin").description("Manage Claude Code plugins");
  program
    .command("setup-token")
    .description("Set up a long-lived authentication token (requires Claude subscription)");
  program.command("update").description("Check for updates and install if available");
  program.hook("preAction", () => undefined);

  return program;
}
