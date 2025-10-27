import { generateText } from "ai";
import { groq } from '@ai-sdk/groq';
import { Sandbox } from "@e2b/code-interpreter";
import { extractJsonFromText, diffStrings } from "../utils/helper";

export const compareFilesWithPrompt = async (
  prompt: string,
  sandbox: Awaited<ReturnType<typeof Sandbox.create>>,
  repoPath: string
) => {
  console.log("Enriching user prompt with Gemini...");

  const enrichedPromptResult = await generateText({
    model: groq("openai/gpt-oss-20b"),
    prompt: `
      You are an expert software engineer.

      The user has given the following raw instruction:
      "${prompt}"

      Rewrite this as a clear, detailed, and actionable developer instruction for modifying or extending a codebase.
      Include creation of new files if necessary.
      Return only the improved instruction.
    `,
    temperature: 0.1,
  });

  const enrichedPrompt = enrichedPromptResult.text.trim();
  console.log("Enriched Prompt:", enrichedPrompt);

  console.log("Searching repository for relevant files...");
  const keywords = enrichedPrompt
    .split(/\W+/)
    .filter((word) => word.length > 3)
    .slice(0, 10)
    .join("\\|");

  const grepCmd = `grep -rilE "${keywords}" ${repoPath} --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=build --exclude-dir=.next --exclude-dir=coverage --exclude-dir=__pycache__ --exclude="*.lock" 2>/dev/null || true`;

  const grepResult = await sandbox.commands.run(grepCmd, { timeoutMs: 60000 });

  const candidateFiles = grepResult.stdout
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean)
    .slice(0, 15); 

  console.log(`Found ${candidateFiles.length} relevant files.`);

  const fileContents = new Map<string, string>();
  for (const file of candidateFiles) {
    try {
      const content = await sandbox.files.read(file);
      fileContents.set(file, content);
    } catch {
      console.warn(`Skipped unreadable file: ${file}`);
    }
  }

  const summarizedFiles = Array.from(fileContents.entries())
    .map(([path, content]) => `File: ${path}\n---\n${content.slice(0, 4000)}`)
    .join("\n\n");

  const systemPrompt = `
You are an autonomous code analysis and modification agent working inside a sandbox.

You can:
- Analyze the provided files' content.
- Create new files if necessary.

Task:
Based on the user's request, identify what needs to change or be added.

For each file that needs modification or creation:
- "filePath": full path to the file
- "reason": reason for modification or creation
- "suggestedChanges": short summary of what’s being added or changed
- "newContent": full updated or new content

If new files are needed, include them with their complete content.

Return JSON in this exact structure:
{
  "filesToModify": [
    {
      "filePath": "path/to/file",
      "reason": "why this file needs modification or creation",
      "suggestedChanges": "summary of the change",
      "newContent": "full file content"
    }
  ],
  "analysis": "overall summary of reasoning"
}
`;

  const userMessage = `
User Request: ${enrichedPrompt}

Here are potentially relevant files from the repo:
${summarizedFiles}

You may add new files if required.
`;

  const { text } = await generateText({
    model: groq("openai/gpt-oss-20b"),
    system: systemPrompt,
    prompt: userMessage,
    temperature: 0.3,
  });

  const json = extractJsonFromText(text);


if (Array.isArray(json.filesToModify)) {
  for (const file of json.filesToModify) {
    if (file.filePath && file.newContent) {
      try {
        let fullPath = file.filePath;
        if (!fullPath.startsWith(repoPath)) {
          const relativePath = fullPath.startsWith('/') 
            ? fullPath.slice(1) 
            : fullPath;
          fullPath = `${repoPath}/${relativePath}`;
        }

        let oldContent = "";
        try {
          oldContent = await sandbox.files.read(fullPath);
        } catch {
          console.log(`Creating new file: ${fullPath}`);
          const dirPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
          if (dirPath) {
            await sandbox.commands.run(`mkdir -p "${dirPath}"`);
          }
        }

        if (oldContent !== file.newContent) {
          const diff = diffStrings(oldContent, file.newContent);
          console.log(`\nChanges for ${fullPath}:\n${diff}\n`);
          await sandbox.files.write(fullPath, file.newContent);
          console.log(`File updated or created: ${fullPath}`);
        }
      } catch (err) {
        console.error(`Failed to handle file ${file.filePath}:`, err);
      }
    }
  }
}

  return json;
};