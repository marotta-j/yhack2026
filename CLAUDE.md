# CLAUDE.md — EcoPrompt Implementation Guide

## What This Project Is

EcoPrompt is a sustainability-focused LLM middleware built on Next.js. It sits on top of the Lava API and does the following:

1. Scores prompt difficulty (1–10)
2. Optionally decomposes complex prompts into subtasks
3. Routes each task to the right-sized model at the greenest datacenter for the user's location
4. Reconstructs multi-subtask outputs into a coherent response
5. Reports the carbon cost of the computation

The frontend is React (inside Next.js). The backend is Next.js API routes. Data lives in MongoDB. The Lava API is the LLM gateway.

## How to Work Through This File

This file is divided into **implementation steps**. Complete one step at a time. After each step, stop and tell me so I can test it. Do not start the next step until I confirm the previous one works.

---

## What's Already Built

The following are already implemented and should not be modified:

- **MongoDB connection** (`src/lib/mongodb.ts`): Cached connection singleton, reads from `MONGODB_URI`
- **Datacenter registry** (`src/lib/datacenterLocations.ts`): 250+ datacenters across 7 providers (GCP, AWS, Azure, OCI, SoftBank, Nvidia, xAI), Haversine distance function, `resolveClosestDataCenter(modelName, userLat, userLng)`
- **Difficulty scoring + model routing + streaming dispatch** (`src/app/api/chat/route.ts`): Scores prompts 1–10 using Gemini 2.0 Flash, routes to one of 5 models, streams NDJSON back to client:
  - 1–2: Gemini 2.0 Flash (GCP)
  - 3–4: GPT-4o Mini (Azure)
  - 5–6: Grok 3 Fast (xAI)
  - 7–8: Claude Sonnet 4.6 (AWS)
  - 9–10: Claude Opus 4.6 (AWS)
- **Conversation persistence**: MongoDB `Conversation` and `Message` collections with token tracking
- **Globe visualization** (`src/components/Globe/GlobeView.tsx`): Interactive globe with datacenter markers, routing arcs, and user location pin
- **Geolocation** (`src/app/api/geolocate/route.ts` + `src/lib/locationOverrideStorage.ts`): IP-based geolocation with localStorage override/spoofing
- **Location override UI** (`src/components/LocationOverride/LocationOverridePanel.tsx`): Panel for testing different user locations

---

## Project Structure (Current)

```
src/
├── app/
│   ├── api/
│   │   ├── chat/route.ts                    # Core pipeline (scoring + routing + streaming)
│   │   ├── conversations/route.ts           # GET/POST conversations
│   │   ├── conversations/[id]/messages/route.ts
│   │   ├── geolocate/route.ts               # IP → lat/lng
│   │   └── users/route.ts                   # Defined, unused
│   ├── chat/page.tsx                        # Main chat UI with globe
│   ├── stats/page.tsx                       # PLACEHOLDER — not implemented
│   └── page.tsx                             # Redirects to /chat
├── components/
│   ├── Globe/GlobeView.tsx
│   ├── LocationOverride/LocationOverridePanel.tsx
│   └── ui/                                  # shadcn components
├── lib/
│   ├── mongodb.ts
│   ├── datacenterLocations.ts               # Hardcoded DC registry + Haversine
│   ├── lava.ts
│   ├── locationOverrideStorage.ts
│   └── utils.ts
└── models/
    ├── Conversation.ts
    ├── Message.ts
    └── User.ts                              # Defined, unused
```

Files to be created in upcoming steps:

```
src/
├── lib/
│   ├── decomposer.ts
│   ├── reconstructor.ts
│   └── carbon.ts
└── types/
    └── index.ts
```

---

## Shared Types

Create `src/types/index.ts`. All new modules import from here.

```typescript
export interface Subtask {
  prompt: string;
  type: "REASON" | "WRITE" | "SEARCH";
  difficulty: number; // 1–10
}

export interface RoutedSubtask extends Subtask {
  model_id: string;
  lava_model_string: string;
  datacenter_id: string;
  datacenter_lat: number;
  datacenter_lng: number;
  grid_carbon_intensity: number;
  eco_score: number; // model_intensity × grid_carbon_intensity (lower = greener)
}

export interface SubtaskResult extends RoutedSubtask {
  response_text: string;
  prompt_tokens: number;
  completion_tokens: number;
  carbon_cost: number; // (prompt_tokens + completion_tokens) × model_intensity × grid_carbon_intensity
}

export interface CarbonReport {
  subtasks: SubtaskResult[];
  orchestration_overhead: number;
  total_carbon: number;
  naive_baseline: number;
  delta: number; // naive - total; positive = savings
  user_location: { lat: number; lng: number };
}
```

Note: `Model` and `Datacenter` interfaces are not needed — that data lives as hardcoded TypeScript in `src/lib/datacenterLocations.ts`. Model intensity values belong in `src/lib/carbon.ts` (see Step 7).

---

## STEP 6: Decomposer

### What to build

`src/lib/decomposer.ts` exporting:

```typescript
import { Subtask } from "@/types";

export async function decomposePrompt(
  prompt: string,
  originalScore: number
): Promise<{
  subtasks: Subtask[];
  decomposer_tokens: { prompt_tokens: number; completion_tokens: number };
  was_decomposed: boolean;
}>
```

### Logic

1. **Score gate:** If `originalScore <= 4`, skip decomposition. Return the original prompt as a single subtask with `type: "WRITE"` and `difficulty: originalScore`. Set `was_decomposed: false`, decomposer_tokens both 0.

2. **Decompose:** Send the prompt to Gemini 2.0 Flash via Lava with the meta-agent prompt below. Use the same Lava API pattern already established in `src/app/api/chat/route.ts`.

3. **Parse:** Extract the JSON array from the response. Strip any markdown code fences before parsing.

4. **Validate:**
   - Must be a valid JSON array
   - Length must be 1–4
   - Each element must have `prompt` (non-empty string), `type` ("REASON", "WRITE", or "SEARCH"), `difficulty` (integer 1–10)
   - Sum of all subtask difficulties must be ≤ `originalScore × 1.2` (20% buffer)

5. **Fallback:** If any validation fails, return the original prompt as a single subtask (same as score-gate). Log the validation failure reason.

### Meta-agent prompt

**System prompt:**
```
You are a task decomposer for an LLM orchestration system. Your job is to decide whether a prompt needs to be broken into subtasks, and if so, produce the minimal set of subtasks needed.

RULES:
- Use the FEWEST subtasks possible. Returning 1 subtask (the original prompt, rephrased if needed) is ideal for most prompts.
- NEVER return more than 4 subtasks.
- Only decompose when the prompt genuinely contains multiple independent pieces of work.
- Each subtask prompt must be COMPLETELY SELF-CONTAINED. A different AI agent will execute each subtask with NO knowledge of the original prompt or other subtasks. Include all necessary context in each subtask prompt.
- Each subtask must produce a specific, concrete output.

TASK TYPES:
- REASON: Analysis, evaluation, comparison, logical reasoning, or decision-making.
- WRITE: Producing prose, code, documentation, or any text output.
- SEARCH: Finding current information (prices, news, recent events). Will be routed as REASON for now.

For each subtask, provide:
- prompt: The exact self-contained prompt to send to a sub-agent.
- type: "REASON", "WRITE", or "SEARCH"
- difficulty: A difficulty score from 1–10 using the same scale as the original scoring.

Return ONLY a JSON array with no other text. Example:
[{"prompt": "...", "type": "WRITE", "difficulty": 5}]
```

**User message:** The user's original prompt, verbatim.

### How to test
- `"What is 2+2?"` with score 2 → skip decomposition, 1 subtask, `was_decomposed: false`
- `"Write a paragraph about dogs"` with score 4 → skip decomposition
- `"Research the pros and cons of electric vehicles, write a 500-word essay summarizing your findings, and then write a Python script that visualizes EV adoption rates from a CSV file"` with score 8 → decompose into 2–3 subtasks; confirm difficulties sum to ≤ 9.6; confirm each subtask prompt is self-contained

### Stop here and tell me the results before moving to Step 7.

---

## STEP 7: Carbon Reporting

### What to build

`src/lib/carbon.ts` exporting:

```typescript
import { SubtaskResult, CarbonReport } from "@/types";

export const MODEL_INTENSITY: Record<string, number> = {
  "gemini-2.0-flash": 1.0,
  "gpt-4o-mini": 1.5,
  "grok-3-fast": 2.0,
  "claude-sonnet-4-6": 3.0,
  "claude-opus-4-6": 8.0,
};

export function calculateSubtaskCarbon(
  tokens: number,
  modelId: string,
  gridCarbonIntensity: number
): number

export async function calculateNaiveBaseline(
  totalTokens: number,
  userLat: number,
  userLng: number
): Promise<number>

export function buildCarbonReport(
  results: SubtaskResult[],
  orchestrationTokens: number,
  orchestrationModelId: string,
  orchestrationGridCarbon: number,
  naiveBaseline: number,
  userLat: number,
  userLng: number
): CarbonReport
```

### Carbon logic

`calculateSubtaskCarbon`: `tokens × MODEL_INTENSITY[modelId] × gridCarbonIntensity`

`calculateNaiveBaseline`: What would it cost to send the full prompt to Claude Opus 4.6 (heaviest model) as a single call? Use `resolveClosestDataCenter("claude-opus-4-6", userLat, userLng)` from `datacenterLocations.ts` to get the nearest datacenter's `gridCarbonIntensity`. Return `totalTokens × MODEL_INTENSITY["claude-opus-4-6"] × gridCarbonIntensity`.

`buildCarbonReport`: Sum subtask carbon costs + orchestration overhead. `delta = naive_baseline - total_carbon`. Positive delta = savings.

### `gridCarbonIntensity` values

The `datacenterLocations.ts` file has datacenter data but may not include `gridCarbonIntensity` yet. Add it to the datacenter entries in that file using these approximate annual averages (gCO₂/kWh):
- Oregon / US West (GCP, AWS): 120
- Virginia / US East (GCP, AWS, Azure): 310
- Iowa / US Central: 440
- Ireland / EU West (AWS, Azure): 280
- Belgium / EU West (GCP): 160
- Tokyo: 500
- Sydney: 680

Use these as defaults for new regions; refine later.

### How to test
Verify:
- `calculateSubtaskCarbon(1000, "gemini-2.0-flash", 120)` = 120,000
- `calculateSubtaskCarbon(1000, "claude-opus-4-6", 120)` = 960,000 (8× more)
- `calculateNaiveBaseline` returns a non-zero value for a SF user

### Stop here and tell me the results before moving to Step 8.

---

## STEP 8: Multi-Task Dispatch + Reconstruction

### What to build

`src/lib/reconstructor.ts` exporting:

```typescript
import { SubtaskResult } from "@/types";

export async function reconstructResponse(
  subtaskResults: SubtaskResult[]
): Promise<{
  response: string;
  reconstructor_tokens: { prompt_tokens: number; completion_tokens: number };
}>
```

Update `src/app/api/chat/route.ts` to handle the full pipeline.

### Reconstruction logic

1. If there is only 1 subtask result, return its `response_text` as-is with zero reconstructor tokens.
2. If there are multiple, send all outputs to Gemini 2.0 Flash via Lava:

**System prompt:**
```
You are a response assembler. You will receive the outputs of several subtasks completed by different AI agents. Combine them into a single, coherent, well-structured response.

RULES:
- Preserve ALL content from every subtask output. Do not drop information.
- Make transitions between sections smooth and natural.
- Do not add new information that wasn't in the subtask outputs.
- If a subtask output contains code, preserve it exactly with proper formatting.
- Keep the combined response as concise as the content allows.
```

**User message:**
```
Combine the following subtask outputs into one coherent response:

--- Subtask 1 ---
{subtaskResults[0].response_text}

--- Subtask 2 ---
{subtaskResults[1].response_text}

(etc.)
```

### Updated pipeline in `src/app/api/chat/route.ts`

The chat route accepts `{ message, conversationId }`. It needs to also accept `userLat` and `userLng` from the request body (already sent by the frontend via the geolocate hook) for carbon and routing purposes.

Update the pipeline to:

```
1. scorePrompt(prompt)                      — already inline, keep it
2. decomposePrompt(prompt, score)
3. For each subtask:
   a. Use existing difficulty → model mapping to select model
   b. Call resolveClosestDataCenter(modelId, userLat, userLng) for datacenter
   c. Dispatch to Lava (non-streaming for subtasks)
4. reconstructResponse(subtaskResults)      — skipped if single subtask
5. buildCarbonReport(...)
6. Stream the final response back to the client (same NDJSON pattern)
7. In the "done" event, include carbon_report alongside the saved message
```

For single-subtask prompts (no decomposition), the current behavior is unchanged except for the addition of `carbon_report` in the done event.

### How to test

Test 1 — Simple (no decomposition):
- `"What is the capital of France?"` → identical to current behavior + carbon_report in done event

Test 2 — Complex (decomposition + reconstruction):
- `"Research the pros and cons of electric vehicles, write a 500-word essay summarizing your findings, and then write a Python script that visualizes EV adoption rates from a CSV file"` → multiple subtasks, reconstructed response, carbon_report showing multiple entries

Test 3 — Borderline:
- `"Write a detailed comparison of React vs Vue for building large-scale SPAs"` → may or may not decompose; confirm no crash either way

### Stop here and tell me the results before moving to Step 9.

---

## STEP 9: Search Routing (STUB)

In `src/app/api/chat/route.ts`, when dispatching subtasks, add a check: if a subtask's type is `"SEARCH"`, log `"SEARCH type not yet implemented, routing as REASON"` and treat it as `"REASON"`.

### How to test

```json
{
  "message": "Look up the current stock price of Tesla, then write a brief analysis of whether it's a good buy based on recent performance",
  "conversationId": null,
  "userLat": 37.77,
  "userLng": -122.42
}
```

Confirm no errors and the warning appears in logs if a SEARCH subtask is returned.

### Stop here before moving to Step 10.

---

## STEP 10: Frontend Carbon Display + Stats Page

### What to build

1. **Carbon summary in chat UI** (`src/app/chat/page.tsx`): The `"done"` NDJSON event now includes `carbon_report`. Parse it and display below each assistant message:
   - Total carbon cost (in mgCO₂e)
   - Savings vs naive baseline (e.g., "47% greener than using Opus alone")
   - Models used (if decomposed into multiple subtasks)

2. **Stats page** (`src/app/stats/page.tsx`): Replace the placeholder. Add a `GET /api/stats` route that aggregates from MongoDB and display:
   - Total carbon saved across all conversations
   - Average difficulty score
   - Model usage breakdown (bar or pie chart)
   - Carbon over time (line chart)

### Notes
- The globe already shows routing arcs — the carbon display is the numeric complement to the visual
- For charts, add `recharts` or use whatever is already available
- The stats page should pull real data from MongoDB, not mock data

### Stop here and tell me the results.

---

## Adding New Models (Future Reference)

When adding a new model:

1. Add it to `MODEL_PROVIDERS` in `src/lib/datacenterLocations.ts` with its fulfillment company (so datacenter routing works)
2. Add its intensity to `MODEL_INTENSITY` in `src/lib/carbon.ts` (estimate: use price ratio vs Gemini Flash as a proxy — if it costs 3× as much per token, set intensity to 3.0)
3. Add it to the difficulty → model routing tiers in `src/app/api/chat/route.ts`

No database changes needed — all model and datacenter data is hardcoded in TypeScript.
