import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { Sandbox } from "@e2b/code-interpreter";

/**
 * Utility to convert Map of files to formatted string for AI input
 */
const formatFilesForAI = (fileContents: Map<string, string>) => {
  return Array.from(fileContents.entries())
    .map(
      ([path, content], index) =>
        `File ${index + 1}: ${path}\n\`\`\`\n${content}\n\`\`\``
    )
    .join("\n\n");
};

/**
 * Utility to safely extract JSON from AI response
 */
const extractJsonFromText = (text: string) => {
  const jsonMatch =
    text.match(/```json\n([\s\S]*?)\n```/) ||
    text.match(/```\n([\s\S]*?)\n```/);
  const jsonText: string = jsonMatch?.[1] ?? text;
  try {
    return JSON.parse(jsonText);
  } catch {
    return {
      filesToModify: [],
      analysis: text,
      rawResponse: text,
    };
  }
};

/**
 * Analyze files and optionally modify them in the sandbox
 */
export const compareFilesWithPrompt = async (
  prompt: string,
  fileContents: Map<string, string>,
  sandbox: Awaited<ReturnType<typeof Sandbox.create>>
) => {
  console.log(`User prompt: ${prompt}`);
  console.log("Files received:");
  console.log("sandbox", sandbox.sandboxId);

  const filesSummary = formatFilesForAI(fileContents);

  const systemPrompt = `You are a code analysis agent. Analyze files and modify them based on the user's request.

For each file that needs modification, return JSON with:
- "filePath": full path to the file
- "reason": why this file needs modification
- "suggestedChanges": brief description of changes
- "newContent": full updated content of the file after applying changes

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

  try {
    const { text } = await generateText({
      model: google("gemini-2.0-flash-exp"),
      system: systemPrompt,
      prompt: userMessage,
      temperature: 0.3,
    });

    console.log("\n--- AI Analysis ---");
    console.log(text);

    const json = extractJsonFromText(text);

    // Apply changes in sandbox
    if (Array.isArray(json.filesToModify)) {
      for (const file of json.filesToModify) {
        if (file.filePath && file.newContent) {
          try {
            console.log(`✏️  Writing updated file: ${file.filePath}`);
            await sandbox.files.write(file.filePath, file.newContent);
            console.log(`✅ File updated: ${file.filePath}`);
          } catch (err) {
            console.error(`⚠️  Failed to write file ${file.filePath}:`, err);
          }
        }
      }
    }

    return json;
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new Error(
      `Failed to analyze files: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
};
