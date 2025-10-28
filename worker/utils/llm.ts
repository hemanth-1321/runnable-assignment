import { ChatOpenAI } from "@langchain/openai";

export interface LLMResponse {
  content: string;
}

export class LLMWrapper {
  private client: ChatOpenAI;

  constructor() {
    this.client = new ChatOpenAI({
      model: "gpt-5-mini",
      apiKey: process.env.OPENAI_API_KEY!,
    });
  }

  async invoke(prompt: string): Promise<LLMResponse> {
    const res = await this.client.invoke(prompt);
    return { content: res.content.toString() };
  }
}

// Singleton instance
export const llm = new LLMWrapper();
