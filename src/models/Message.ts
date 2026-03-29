import { Schema, model, models, Document, Types } from "mongoose";

export interface IMessage extends Document {
  conversationId: Types.ObjectId;
  userId: Types.ObjectId;
  role: "user" | "assistant" | "system";
  content: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  carbonCost: number;
  naiveBaseline: number;
  carbonDelta: number;
  searchProviders: string[];
  createdAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    role: { type: String, enum: ["user", "assistant", "system"], required: true },
    content: { type: String, required: true },
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    carbonCost: { type: Number, default: 0 },
    naiveBaseline: { type: Number, default: 0 },
    carbonDelta: { type: Number, default: 0 },
    searchProviders: { type: [String], default: [] },
  },
  { timestamps: true }
);

const Message = models.Message ?? model<IMessage>("Message", MessageSchema);

export default Message;
