import { exec } from "child_process";

export interface LocalToolResult {
  success: boolean;
  message: string;
  output?: string;
}

export function isLocalSystemTool(toolName: string): boolean {
  return ["open_application", "control_system", "open_url"].includes(toolName);
}

function runCommand(command: string): Promise<LocalToolResult> {
  return new Promise((resolve) => {
    exec(command, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        resolve({
          success: false,
          message: `Failed to execute command: ${err.message}`,
          output: stderr || err.message,
        });
      } else {
        resolve({
          success: true,
          message: "Command executed successfully",
          output: stdout.trim(),
        });
      }
    });
  });
}

export async function executeLocalSystemTool(
  name: string,
  args: any
): Promise<LocalToolResult> {
  try {
    if (name === "open_application") {
      const app = (args.app_name || "").toLowerCase().trim();
      const target = (args.target || "").trim();

      switch (app) {
        case "notepad":
          return await runCommand(target ? `cmd /c start notepad "${target}"` : "cmd /c start notepad");

        case "settings":
        case "setting":
        case "windows settings":
          return await runCommand("cmd /c start ms-settings:");

        case "my pc":
        case "this pc":
        case "my computer":
        case "computer":
          return await runCommand("cmd /c start explorer.exe shell:MyComputerFolder");

        case "explorer":
        case "file explorer":
        case "files":
          return await runCommand(target ? `cmd /c start explorer.exe "${target}"` : "cmd /c start explorer");

        case "calculator":
        case "calc":
          return await runCommand("cmd /c start calc");

        case "task manager":
        case "taskmgr":
          return await runCommand("cmd /c start taskmgr");

        case "paint":
        case "mspaint":
          return await runCommand("cmd /c start mspaint");

        case "cmd":
        case "terminal":
        case "command prompt":
          return await runCommand("cmd /c start cmd");

        case "powershell":
          return await runCommand("cmd /c start powershell");

        case "browser":
        case "chrome":
        case "edge":
          return await runCommand(target ? `cmd /c start "" "${target}"` : 'cmd /c start "" "https://www.google.com"');

        default: {
          // Attempt generic start for known windows executable or store protocol
          const sanitized = app.replace(/[^a-zA-Z0-9_\-.:/ ]/g, "");
          if (target) {
            return await runCommand(`cmd /c start ${sanitized} "${target}"`);
          }
          return await runCommand(`cmd /c start ${sanitized}`);
        }
      }
    }

    if (name === "control_system") {
      const action = (args.action || "").toLowerCase().trim().replace(/[\s\-]+/g, "_");
      const steps = Math.min(Math.max(Number(args.steps) || 5, 1), 20);

      switch (action) {
        case "volume_up": {
          const script = `$w=New-Object -ComObject WScript.Shell; 1..${steps} | ForEach-Object { $w.SendKeys([char]175) }`;
          return await runCommand(`powershell -NoProfile -Command "${script}"`);
        }

        case "volume_down": {
          const script = `$w=New-Object -ComObject WScript.Shell; 1..${steps} | ForEach-Object { $w.SendKeys([char]174) }`;
          return await runCommand(`powershell -NoProfile -Command "${script}"`);
        }

        case "mute":
        case "unmute": {
          const script = `(New-Object -ComObject WScript.Shell).SendKeys([char]173)`;
          return await runCommand(`powershell -NoProfile -Command "${script}"`);
        }

        case "lock": {
          return await runCommand("rundll32.exe user32.dll,LockWorkStation");
        }

        case "screenshot":
        case "snipping_tool": {
          return await runCommand("cmd /c start ms-screenclip:");
        }

        case "task_manager": {
          return await runCommand("cmd /c start taskmgr");
        }

        default:
          return {
            success: false,
            message: `Unknown system action: ${action}. Available: volume_up, volume_down, mute, lock, screenshot, task_manager`,
          };
      }
    }

    if (name === "open_url") {
      let url = (args.url || "").trim();
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = `https://${url}`;
      }
      return await runCommand(`cmd /c start "" "${url}"`);
    }

    return {
      success: false,
      message: `Unknown local tool: ${name}`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Local tool execution error: ${err.message}`,
    };
  }
}
