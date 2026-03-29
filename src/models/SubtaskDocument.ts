import mongoose, { Document, Schema } from "mongoose";

export interface ISubtaskDocument extends Document {
  messageId: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  prompt: string;
  type: "REASON" | "WRITE" | "SEARCH";
  difficulty: number;
  model_id: string;
  datacenter_id: string;
  datacenter_lat: number;
  datacenter_lng: number;
  grid_carbon_intensity: number;
  eco_score: number;
  response_text: string;
  prompt_tokens: number;
  completion_tokens: number;
  carbon_cost: number;
  createdAt: Date;
  updatedAt: Date;
}

const SubtaskDocumentSchema = new Schema<ISubtaskDocument>(
  {
    messageId: { type: Schema.Types.ObjectId, ref: "Message", required: true, index: true },
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    prompt: { type: String, required: true },
    type: { type: String, enum: ["REASON", "WRITE", "SEARCH"], required: true },
    difficulty: { type: Number, required: true },
    model_id: { type: String, required: true },
    datacenter_id: { type: String, default: "" },
    datacenter_lat: { type: Number, default: 0 },
    datacenter_lng: { type: Number, default: 0 },
    grid_carbon_intensity: { type: Number, default: 0 },
    eco_score: { type: Number, default: 0 },
    response_text: { type: String, default: "" },
    prompt_tokens: { type: Number, default: 0 },
    completion_tokens: { type: Number, default: 0 },
    carbon_cost: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const SubtaskDocumentModel =
  mongoose.models.SubtaskDocument ||
  mongoose.model<ISubtaskDocument>("SubtaskDocument", SubtaskDocumentSchema);

export default SubtaskDocumentModel;
