export const compareFilesWithPrompt = async (
  prompt: string,
  fileContents: Map<string, string>
) => {
  console.log(`User prompt: ${prompt}`);
  console.log("Files received:");

  for (const [filePath, content] of fileContents.entries()) {
    console.log(`\n--- ${filePath} ---`);
    console.log(content); // Prints the full file content
  }
};
