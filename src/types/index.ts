export interface Subtask {
  prompt: string;
  type: "REASON" | "WRITE" | "SEARCH";
  difficulty: number; // 1–20
  /** Only present when type === "SEARCH". "google" → serper-search, "exa" → exa-search. */
  search_type?: "google" | "exa";
}

export interface RoutedSubtask extends Subtask {
  model_id: string;
  lava_model_string: string;
  datacenter_id: string;
  datacenter_lat: number;
  datacenter_lng: number;
  grid_carbon_intensity: number;
  eco_score: number; // model_intensity × grid_carbon_intensity
}

export interface SubtaskResult extends RoutedSubtask {
  response_text: string;
  prompt_tokens: number;
  completion_tokens: number;
  carbon_cost: number; // (prompt + completion tokens) × model_intensity × grid_carbon_intensity
}

export interface CarbonReport {
  subtasks: SubtaskResult[];
  orchestration_overhead: number;
  total_carbon: number;
  naive_baseline: number;
  delta: number; // naive_baseline - total_carbon; positive = CO₂ savings
  user_location: { lat: number; lng: number };
}
