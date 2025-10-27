import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { Sandbox } from "@e2b/code-interpreter";
import {
  extractJsonFromText,
  formatFilesForAI,
  diffStrings,
} from "../utils/helper";

export const compareFilesWithPrompt = async (
  prompt: string,
  fileContents: Map<string, string>,
  sandbox: Awaited<ReturnType<typeof Sandbox.create>>
) => {
  const filesSummary = formatFilesForAI(fileContents);

  console.log("Enriching user prompt with Gemini...");
  const enrichedPromptResult = await generateText({
    model: google("gemini-2.0-flash-exp"),
    prompt: `
You are an expert software engineer.

The user has given the following raw instruction:
"${prompt}"

Rewrite this as a clear, detailed, and actionable developer instruction for modifying a codebase.
Focus on:
- The user's intent
- What needs to be added, changed, or optimized
- Technical clarity and completeness

Return only the improved version of the instruction.
    `,
    temperature: 0.4,
  });

  const enrichedPrompt = enrichedPromptResult.text.trim();
  console.log("Enriched Prompt:", enrichedPrompt);

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

  const userMessage = `User Request: ${enrichedPrompt}\n\nFiles to analyze:\n${filesSummary}`;

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
            const diff = diffStrings(oldContent, file.newContent);
            console.log(`\n Changes for ${file.filePath}:\n${diff}\n`);

            await sandbox.files.write(file.filePath, file.newContent);

            console.log(` File updated: ${file.filePath}`);
          }
        } catch (err) {
          console.error(`Failed to update file ${file.filePath}:`, err);
        }
      }
    }
  }

  return json;
};
