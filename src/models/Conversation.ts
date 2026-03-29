import { Schema, model, models, Types } from "mongoose";

export interface IConversation {
  userId: Types.ObjectId;
  title: string;
  aiModel: string;
  messageCount: number;
  totalTokens: number;
  globeState: { arcs: unknown[]; dcMarkers: unknown[] } | null;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema<IConversation>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    title: { type: String, default: "New Chat" },
    aiModel: { type: String, default: "gpt-4o" },
    messageCount: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    globeState: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

const Conversation =
  models.Conversation ?? model<IConversation>("Conversation", ConversationSchema);

export default Conversation;
