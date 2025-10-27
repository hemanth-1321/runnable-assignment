# AI Code Agent

An automated system that takes a **GitHub repo URL** and a **prompt** as input, then finds and edits code files using an **AI model**.  
It runs everything safely inside an **E2B sandbox**, powered by **BullMQ** workers.

---

## How It Works

1. **Client Input**

   - User sends a GitHub repo URL and a natural language prompt.
   - Example:  
     “Add logging to all API routes”

2. **Queueing**

   - The request is added to a **BullMQ queue** for background processing.

3. **Worker Process**

   - The worker receives the job.
   - Spins up an **E2B sandbox**.
   - **Clones** the GitHub repo inside the sandbox.

4. **File Selection**

   - The system extracts **keywords** from the user prompt.
   - Runs a `grep` search in the repo.
   - Picks the **top K relevant files**.

5. **AI Editing**

   - Each file is passed to the **LLM**.
   - The model compares the file content with the user prompt.
   - Makes code changes directly inside the sandbox.

6. **GitHub Update**
   - Once done, it can **commit and push** the changes.
   - Optionally, it **creates a Pull Request** automatically.

---

## 🧩 Components

| Component       | Description                           |
| --------------- | ------------------------------------- |
| **Client**      | Sends repo URL + prompt               |
| **BullMQ**      | Handles background job queue          |
| **Worker**      | Processes queued jobs                 |
| **E2B Sandbox** | Isolated environment for code editing |
| **LLM**         | Analyzes and updates code             |
| **GitHub API**  | For commits and pull requests         |

---

## ⚙️ Setup

### 1. Environment Variables

Create a `.env` file:

```bash
E2B_API_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
REDIS_URL=
GITHUB_USERNAME=
GITHUB_TOKEN=
GITHUB_EMAIL=
```
