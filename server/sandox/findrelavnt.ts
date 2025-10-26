import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { Sandbox } from "@e2b/code-interpreter";
import {
  diffStrings,
  extractJsonFromText,
  formatFilesForAI,
} from "../config/ai.cofig";

/**
 * Analyze files and safely apply modifications in the sandbox
 */
export const compareFilesWithPrompt = async (
  prompt: string,
  fileContents: Map<string, string>,
  sandbox: Awaited<ReturnType<typeof Sandbox.create>>
) => {
  const filesSummary = formatFilesForAI(fileContents);

  const systemPrompt = `You are a code analysis agent. Analyze files and modify them based on the user's request.

For each file that needs modification, return JSON with:
- "filePath": full path to the file
- "reason": why this file needs modification
- "suggestedChanges": brief description of changes
- "newContent": full updated content of the file

Return JSON in this structure:
{
  "filesToModify": [
      {
      "filePath": "path/to/file",
      "reason": "why this file needs modification",
      "suggestedChanges": "brief description of what changes are needed",
      "newContent": "full updated content here"
      }
  ],
  "analysis": "overall analysis of the request"
}`;

  const userMessage = `User Request: ${prompt}\n\nFiles to analyze:\n${filesSummary}`;

  const { text } = await generateText({
    model: google("gemini-2.0-flash-exp"),
    system: systemPrompt,
    prompt: userMessage,
    temperature: 0.3,
  });

  const json = extractJsonFromText(text);

  if (Array.isArray(json.filesToModify)) {
    for (const file of json.filesToModify) {
      if (file.filePath && file.newContent) {
        try {
          const oldContent = await sandbox.files.read(file.filePath);
          if (oldContent !== file.newContent) {
            await sandbox.files.write(`${file.filePath}.backup`, oldContent);
            const diff = diffStrings(oldContent, file.newContent);
            await sandbox.files.write(file.filePath, file.newContent);
          }
        } catch (err) {
          console.error(`Failed to update file ${file.filePath}:`, err);
        }
      }
    }
  }

  return json;
};
