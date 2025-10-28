import { llm } from "../utils/llm";
import type { GraphState } from "../utils/state";

export async function decideSearchMode(
  state: GraphState
): Promise<Partial<GraphState>> {
  const { prompt } = state;

  try {
    const { content } = await llm.invoke(`
Analyze the request: "${prompt}"
Choose ONE search mode: grep, regex, glob
Return ONLY the word (no explanation).
    `);

    const mode = content.trim().toLowerCase();
    console.log(`🔍 Selected search mode: ${mode}`);

    return {
      searchMode: mode as "grep" | "regex" | "glob",
    };
  } catch (error: any) {
    console.error("Error in decideSearchMode:", error);
    return {
      searchMode: "grep", // fallback
      error: error.message,
    };
  }
}

export async function searchFiles(
  state: GraphState
): Promise<Partial<GraphState>> {
  const { prompt, searchMode, sandbox, repoPath, attempts = 0 } = state;

  console.log(`🔎 Searching files (attempt ${attempts + 1})...`);

  try {
    let searchQuery = "";
    let result;

    if (searchMode === "grep") {
      const { content } = await llm.invoke(
        `Extract main keyword from: "${prompt}". Return ONLY keyword.`
      );
      searchQuery = content.trim();
      result = await sandbox.commands.run(
        `cd ${repoPath} && grep -rl "${searchQuery}" --include="*.ts" --include="*.js" || true`
      );
    } else if (searchMode === "glob") {
      const { content } = await llm.invoke(
        `Extract file pattern (e.g., "*.ts") from: "${prompt}". Return ONLY pattern.`
      );
      searchQuery = content.trim();
      result = await sandbox.commands.run(
        `cd ${repoPath} && find . -name "${searchQuery}" -type f || true`
      );
    } else {
      result = await sandbox.commands.run(
        `cd ${repoPath} && find . -type f \\( -name "*.ts" -o -name "*.js" \\) | head -20`
      );
    }

    const filePaths = result.stdout
      .split("\n")
      .filter(Boolean)
      .map((p) => p.trim());

    console.log(`📁 Found ${filePaths.length} files`);

    return {
      filePaths,
      attempts: attempts + 1,
    };
  } catch (error: any) {
    console.error("Error in searchFiles:", error);
    return {
      filePaths: [],
      attempts: attempts + 1,
      error: error.message,
    };
  }
}

export async function readFiles(
  state: GraphState
): Promise<Partial<GraphState>> {
  const { filePaths, sandbox, repoPath } = state;

  if (!filePaths || filePaths.length === 0) {
    console.log("⚠️ No files to read");
    return { fileContents: {} };
  }

  console.log(`📖 Reading ${Math.min(filePaths.length, 10)} files...`);

  const fileContents: Record<string, string> = {};

  for (const relativePath of filePaths.slice(0, 10)) {
    try {
      const fullPath = relativePath.startsWith("./")
        ? `${repoPath}/${relativePath.slice(2)}`
        : `${repoPath}/${relativePath}`;
      const content = await sandbox.files.read(fullPath);
      fileContents[relativePath] = content;
    } catch (err) {
      console.warn(`Failed to read ${relativePath}`);
    }
  }

  return { fileContents };
}
