/**
 * Convert Map of files to formatted string for AI input
 */
export const formatFilesForAI = (fileContents: Map<string, string>) => {
  return Array.from(fileContents.entries())
    .map(
      ([path, content], index) =>
        `File ${index + 1}: ${path}\n\`\`\`\n${content}\n\`\`\``
    )
    .join("\n\n");
};

/**
 * Safely extract JSON from AI response
 */
export const extractJsonFromText = (text: string) => {
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
 * Simple diff function for logging
 */
export const diffStrings = (oldStr: string, newStr: string) => {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");
  return newLines
    .map((line, i) =>
      line !== oldLines[i] ? `- ${oldLines[i] ?? ""}\n+ ${line}` : null
    )
    .filter(Boolean)
    .join("\n");
};
