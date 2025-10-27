import path from "path";
import { Sandbox } from "@e2b/code-interpreter";

export async function writeFileSafe(
  sandbox: Awaited<ReturnType<typeof Sandbox.create>>,
  filePath: string,
  content: string
) {
  const dir = path.dirname(filePath);
  // Ensure directory exists
  await sandbox.commands.run(`mkdir -p ${dir}`);
  // Write the file
  await sandbox.files.write(filePath, content);
}
