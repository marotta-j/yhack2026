import { Schema, model, models } from "mongoose";

export interface IConversation {
  title: string;
  aiModel: string;
  messageCount: number;
  totalTokens: number;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema<IConversation>(
  {
    title: { type: String, default: "New Chat" },
    aiModel: { type: String, default: "gpt-4o" },
    messageCount: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const Conversation =
  models.Conversation ?? model<IConversation>("Conversation", ConversationSchema);

export default Conversation;
